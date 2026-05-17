// Cloud-sync engine for study-rpg (M4 milestone).
//
// Architecture (per design.md D1-D5):
// - Install Dexie hooks → mark dirty PKs in memory, debounce push
// - Push: snapshot dirty rows, batch UPSERT via upsert_lww RPC (server LWW)
// - Pull on tab focus (visibilitychange === 'visible'), apply LWW client-side
// - IndexedDB remains source of truth; cloud failures never mutate local
// - Offline = queue lives implicitly in IndexedDB (rows still there, dirty markers re-built on reconnect)

import type { TableAdapter } from './tables'
import type {
  CloudRow,
  CreateSyncEngineOptions,
  RowPayload,
  SyncEngine,
  SyncStatus,
} from './types'

const DEFAULT_DEBOUNCE_MS = 3000
const DEFAULT_APP_VERSION = '0.2.0'
const LAST_PULL_KEY = 'study-rpg.sync.lastPullAt'

interface DirtySet {
  /** Per-table dirty PK sets. Keyed by Dexie table name. */
  perTable: Map<string, Set<string>>
}

export function createSyncEngine(opts: CreateSyncEngineOptions): SyncEngine {
  const { supabase, db } = opts
  const debounceMs = opts.debounceMs ?? DEFAULT_DEBOUNCE_MS
  const appVersion = opts.appVersion ?? DEFAULT_APP_VERSION
  const onError =
    opts.onError ?? ((err: unknown, ctx: string) => console.error(`[sync:${ctx}]`, err))

  let userId: string | null = null
  let status: SyncStatus = 'unauthed'
  let paused = false
  /**
   * Set to true while applying cloud → local writes; hooks check this and
   * skip both `_updatedAt = Date.now()` stamping and dirty-marker bookkeeping
   * so pulled rows don't immediately push back to cloud (echo loop).
   */
  let applyingFromCloud = false
  let _lastPushAt: number | null = null
  let _lastPullAt: number | null = readLastPullAt()
  let pushTimer: ReturnType<typeof setTimeout> | null = null
  let visibilityHandler: (() => void) | null = null
  let installedHooks: Array<{ table: any; event: string; fn: any }> = [] // for teardown
  const dirty: DirtySet = { perTable: new Map() }

  const adapters: ReadonlyArray<TableAdapter> = opts.adapters

  function markDirty(dexieTable: string, pk: string): void {
    let set = dirty.perTable.get(dexieTable)
    if (!set) {
      set = new Set()
      dirty.perTable.set(dexieTable, set)
    }
    set.add(pk)
    scheduleDebouncedPush()
  }

  function scheduleDebouncedPush(): void {
    if (status === 'unauthed' || status === 'disabled') return
    if (paused) return
    if (pushTimer) clearTimeout(pushTimer)
    pushTimer = setTimeout(() => {
      pushTimer = null
      pushNow().catch((err) => onError(err, 'debouncedPush'))
    }, debounceMs)
  }

  function installHooks(): void {
    for (const adapter of adapters) {
      const table = (db as any)[adapter.dexieTable]
      if (!table || typeof table.hook !== 'function') continue
      const tableName = adapter.dexieTable

      // Dexie hook signatures:
      //   creating(primKey, obj, trans) — obj is mutable
      //   updating(mods, primKey, obj, trans) — returns object of additional mods
      //   deleting(primKey, obj, trans)
      const creatingFn = (primKey: any, obj: any) => {
        if (applyingFromCloud) return // cloud → local apply path: keep cloud's _updatedAt, no dirty mark
        obj._updatedAt = Date.now()
        const pk = stringifyPk(primKey, adapter.shape)
        markDirty(tableName, pk)
      }
      const updatingFn = (mods: any, primKey: any) => {
        if (applyingFromCloud) return // see creatingFn note
        const pk = stringifyPk(primKey, adapter.shape)
        markDirty(tableName, pk)
        return { ...mods, _updatedAt: Date.now() }
      }
      const deletingFn = (primKey: any) => {
        const pk = stringifyPk(primKey, adapter.shape)
        // Deletes aren't synced yet (Postgres would need a tombstone column).
        // Just clear dirty marker so we don't push a deleted row.
        dirty.perTable.get(tableName)?.delete(pk)
      }

      table.hook('creating', creatingFn)
      table.hook('updating', updatingFn)
      table.hook('deleting', deletingFn)
      installedHooks.push({ table, event: 'creating', fn: creatingFn })
      installedHooks.push({ table, event: 'updating', fn: updatingFn })
      installedHooks.push({ table, event: 'deleting', fn: deletingFn })
    }
  }

  function uninstallHooks(): void {
    for (const { table, event, fn } of installedHooks) {
      try {
        table.hook(event).unsubscribe(fn)
      } catch {
        // Dexie removes hooks via `.hook('creating').unsubscribe(fn)` API; tolerate failure on teardown.
      }
    }
    installedHooks = []
  }

  function installVisibilityListener(): void {
    visibilityHandler = () => {
      if (document.visibilityState === 'visible') {
        pullNow().catch((err) => onError(err, 'visibilityPull'))
      }
    }
    document.addEventListener('visibilitychange', visibilityHandler)
  }

  function uninstallVisibilityListener(): void {
    if (visibilityHandler) {
      document.removeEventListener('visibilitychange', visibilityHandler)
      visibilityHandler = null
    }
  }

  async function pushNow(): Promise<void> {
    if (!userId) return
    if (status === 'disabled') return
    if (paused) return
    const totalDirty = Array.from(dirty.perTable.values()).reduce((s, set) => s + set.size, 0)
    if (totalDirty === 0) return

    status = 'pushing'
    const updatedAt = new Date().toISOString()
    let anyOffline = false

    // Snapshot + flush per table.
    for (const adapter of adapters) {
      const dirtyPks = dirty.perTable.get(adapter.dexieTable)
      if (!dirtyPks || !dirtyPks.size) continue
      try {
        const payloads = await adapter.snapshotDirty(db, dirtyPks, userId, updatedAt, appVersion)
        if (!payloads.length) {
          // Snapshot empty (row deleted in Dexie before snapshot). Clear markers.
          dirtyPks.clear()
          continue
        }
        await pushBatch(adapter.postgresTable, payloads)
        // Successful push → clear markers
        dirtyPks.clear()
      } catch (err) {
        const isNetwork = isLikelyNetworkError(err)
        anyOffline ||= isNetwork
        onError(err, `push:${adapter.postgresTable}`)
        // Network errors: keep dirty markers for retry on next dirty event / pull
        // Non-network errors: log + still keep markers (might be transient)
      }
    }

    if (anyOffline) {
      status = 'offline'
    } else {
      _lastPushAt = Date.now()
      status = 'idle'
    }
  }

  async function pushBatch(tableName: string, rows: RowPayload[]): Promise<void> {
    const { error } = await supabase.rpc('upsert_lww', { table_name: tableName, rows })
    if (error) throw error
  }

  async function pullNow(opts?: { sinceIso?: string; force?: boolean }): Promise<void> {
    if (!userId) return
    if (status === 'disabled') return
    if (paused && !opts?.force) return

    status = 'pulling'
    const sinceIso = opts?.sinceIso ?? new Date(_lastPullAt ?? 0).toISOString()
    let anyOffline = false

    applyingFromCloud = true
    try {
      for (const adapter of adapters) {
        try {
          let q = supabase.from(adapter.postgresTable).select('*').eq('user_id', userId)
          if (sinceIso !== undefined && !opts?.force) {
            q = q.gt('updated_at', sinceIso)
          }
          const { data, error } = await q
          if (error) throw error
          if (!data) continue
          for (const cloudRow of data as CloudRow[]) {
            await adapter.applyToLocal(db, cloudRow, { force: opts?.force })
          }
        } catch (err) {
          const isNetwork = isLikelyNetworkError(err)
          anyOffline ||= isNetwork
          onError(err, `pull:${adapter.postgresTable}`)
        }
      }
    } finally {
      applyingFromCloud = false
    }

    if (anyOffline) {
      status = 'offline'
    } else {
      _lastPullAt = Date.now()
      writeLastPullAt(_lastPullAt)
      status = paused ? 'paused' : 'idle'
    }
  }

  async function pushAllNow(updatedAtOverride?: string): Promise<void> {
    if (!userId) return
    if (status === 'disabled') return
    // Note: pushAllNow intentionally ignores `paused` because it's called
    // explicitly by the migration UI ("Upload local" / "Use local") which
    // are user-initiated unpause actions.

    status = 'pushing'
    const updatedAt = updatedAtOverride ?? new Date().toISOString()
    let anyOffline = false

    for (const adapter of adapters) {
      try {
        const payloads = await adapter.snapshotAll(db, userId, updatedAt, appVersion)
        if (!payloads.length) continue
        await pushBatch(adapter.postgresTable, payloads)
      } catch (err) {
        const isNetwork = isLikelyNetworkError(err)
        anyOffline ||= isNetwork
        onError(err, `pushAll:${adapter.postgresTable}`)
      }
    }

    // Clear dirty markers — pushAll covers everything pending.
    for (const set of dirty.perTable.values()) set.clear()

    if (anyOffline) {
      status = 'offline'
    } else {
      _lastPushAt = Date.now()
      status = paused ? 'paused' : 'idle'
    }
  }

  async function pullAllNow(opts?: { force?: boolean }): Promise<void> {
    return pullNow({ sinceIso: new Date(0).toISOString(), force: opts?.force })
  }

  function pause(): void {
    paused = true
    if (pushTimer) {
      clearTimeout(pushTimer)
      pushTimer = null
    }
    status = 'paused'
  }

  function resume(): void {
    if (!paused) return
    paused = false
    status = 'idle'
    // Kick off a pull on resume so any cross-device changes during pause land.
    pullNow().catch((err) => onError(err, 'resumePull'))
    // If there's any in-memory dirty work, flush it.
    const totalDirty = Array.from(dirty.perTable.values()).reduce((s, set) => s + set.size, 0)
    if (totalDirty > 0) scheduleDebouncedPush()
  }

  return {
    start(uid: string) {
      if (userId === uid) return
      userId = uid
      status = paused ? 'paused' : 'idle'
      installHooks()
      installVisibilityListener()
      if (!paused) {
        // Kick off first pull so cross-device updates land immediately.
        pullNow().catch((err) => onError(err, 'startupPull'))
      }
    },
    stop() {
      if (pushTimer) {
        clearTimeout(pushTimer)
        pushTimer = null
      }
      uninstallHooks()
      uninstallVisibilityListener()
      dirty.perTable.clear()
      userId = null
      paused = false
      status = 'unauthed'
    },
    pushNow,
    pullNow: () => pullNow(),
    pushAllNow,
    pullAllNow,
    pause,
    resume,
    getStatus() {
      return status
    },
    lastPushAt() {
      return _lastPushAt
    },
    lastPullAt() {
      return _lastPullAt
    },
  }
}

function stringifyPk(primKey: unknown, _shape: 'singleton' | 'collection'): string {
  if (primKey == null) return 'singleton'
  return typeof primKey === 'string' ? primKey : String(primKey)
}

function isLikelyNetworkError(err: unknown): boolean {
  if (!err) return false
  const e = err as { message?: string; name?: string; code?: string }
  const msg = (e.message ?? '').toLowerCase()
  if (msg.includes('failed to fetch')) return true
  if (msg.includes('network')) return true
  if (msg.includes('timeout')) return true
  if (e.name === 'TypeError' && msg.includes('fetch')) return true
  return false
}

function readLastPullAt(): number | null {
  if (typeof localStorage === 'undefined') return null
  const v = localStorage.getItem(LAST_PULL_KEY)
  if (!v) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function writeLastPullAt(ms: number): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(LAST_PULL_KEY, String(ms))
  } catch {
    // ignore quota errors
  }
}
