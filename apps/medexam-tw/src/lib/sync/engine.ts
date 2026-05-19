// Cloud-sync engine for study-rpg (M4 milestone).
//
// Architecture (per design.md D1-D5):
// - Install Dexie hooks → mark dirty PKs in memory, debounce push
// - Push: snapshot dirty rows, batch UPSERT via upsert_lww RPC (server LWW)
// - Pull on tab focus (visibilitychange === 'visible'), apply LWW client-side
// - IndexedDB remains source of truth; cloud failures never mutate local
// - Offline = queue lives implicitly in IndexedDB (rows still there, dirty markers re-built on reconnect)

import { getBackendConfig } from './backend-config'
import { pushBundle } from './r2/engine-r2'
import type { TableAdapter } from './tables'
import type {
  CloudRow,
  CreateSyncEngineOptions,
  EngineDiagnosticSnapshot,
  RowPayload,
  SyncEngine,
  SyncErrorRecord,
  SyncOp,
  SyncStatus,
} from './types'

const DEFAULT_DEBOUNCE_MS = 3000
const DEFAULT_APP_VERSION = '0.2.0'
const LAST_PULL_KEY = 'study-rpg.sync.lastPullAt'
const MAX_RECENT_ERRORS = 5

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
  const onConsecutiveFailure = opts.onConsecutiveFailure
  const r2Bundles = opts.r2Bundles ?? []
  // Cache backend config once per engine. Reads env at construction; throws on
  // invalid combinations so misconfigured deploys surface immediately.
  const backendConfig = getBackendConfig()

  let userId: string | null = null
  let status: SyncStatus = 'unauthed'
  let paused = false

  // Observability state (fix-sync-sign-in-lifecycle M3) — ring buffer of last
  // N errors + per-op consecutive failure count. Drives sync_metadata
  // snapshot in bug reports + the sync:error toast.
  const recentErrors: SyncErrorRecord[] = []
  const consecutiveErrors: Record<SyncOp, number> = { push: 0, pull: 0 }

  function recordError(op: SyncOp, table: string, err: unknown): SyncErrorRecord {
    const message = (err as { message?: string })?.message ?? String(err)
    const record: SyncErrorRecord = { at: Date.now(), op, table, message }
    recentErrors.push(record)
    if (recentErrors.length > MAX_RECENT_ERRORS) recentErrors.shift()
    return record
  }

  function endOp(op: SyncOp, anyError: boolean, firstError: SyncErrorRecord | null): void {
    if (anyError) {
      consecutiveErrors[op] += 1
      if (consecutiveErrors[op] >= 2 && firstError && onConsecutiveFailure) {
        try {
          onConsecutiveFailure(firstError, consecutiveErrors[op])
        } catch (err) {
          console.warn('[sync] onConsecutiveFailure handler threw', err)
        }
      }
    } else {
      consecutiveErrors[op] = 0
    }
  }
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
    let firstError: SyncErrorRecord | null = null

    // Legacy Supabase write path. Skipped entirely when backend=r2 (Phase 4+).
    if (backendConfig.writeSupabase) {
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
          const rec = recordError('push', adapter.postgresTable, err)
          if (!firstError) firstError = rec
          onError(err, `push:${adapter.postgresTable}`)
          // Network errors: keep dirty markers for retry on next dirty event / pull
          // Non-network errors: log + still keep markers (might be transient)
        }
      }
    }

    // R2 write path. Active when backend ∈ {dual, r2} AND engine has at least
    // one bundle binding. Each binding pushes its own bundle using its declared
    // adapter subset (一階: 1 binding; 二階: 2 bindings — M2 + bookmarks).
    // Whole-bundle push reuses adapter.snapshotAll, so dirty markers are
    // cleared on success across the union of bound adapters.
    if (backendConfig.writeR2 && r2Bundles.length) {
      let allBundlesOk = true
      for (const binding of r2Bundles) {
        try {
          await pushBundle(supabase, db, binding.adapters, binding.bundle, userId)
        } catch (err) {
          allBundlesOk = false
          const isNetwork = isLikelyNetworkError(err)
          anyOffline ||= isNetwork
          const rec = recordError('push', `r2:${binding.bundle}`, err)
          if (!firstError) firstError = rec
          onError(err, `pushR2:${binding.bundle}`)
        }
      }
      if (allBundlesOk) {
        for (const set of dirty.perTable.values()) set.clear()
      }
    }

    endOp('push', firstError !== null, firstError)

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
    let firstError: SyncErrorRecord | null = null

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
          const rec = recordError('pull', adapter.postgresTable, err)
          if (!firstError) firstError = rec
          onError(err, `pull:${adapter.postgresTable}`)
        }
      }
    } finally {
      applyingFromCloud = false
    }

    endOp('pull', firstError !== null, firstError)

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
    let firstError: SyncErrorRecord | null = null

    if (backendConfig.writeSupabase) {
      for (const adapter of adapters) {
        try {
          const payloads = await adapter.snapshotAll(db, userId, updatedAt, appVersion)
          if (!payloads.length) continue
          await pushBatch(adapter.postgresTable, payloads)
        } catch (err) {
          const isNetwork = isLikelyNetworkError(err)
          anyOffline ||= isNetwork
          const rec = recordError('push', adapter.postgresTable, err)
          if (!firstError) firstError = rec
          onError(err, `pushAll:${adapter.postgresTable}`)
        }
      }
    }

    if (backendConfig.writeR2 && r2Bundles.length) {
      for (const binding of r2Bundles) {
        try {
          await pushBundle(supabase, db, binding.adapters, binding.bundle, userId)
        } catch (err) {
          const isNetwork = isLikelyNetworkError(err)
          anyOffline ||= isNetwork
          const rec = recordError('push', `r2:${binding.bundle}`, err)
          if (!firstError) firstError = rec
          onError(err, `pushAllR2:${binding.bundle}`)
        }
      }
    }

    // Clear dirty markers — pushAll covers everything pending.
    for (const set of dirty.perTable.values()) set.clear()

    endOp('push', firstError !== null, firstError)

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

  async function getDiagnosticSnapshot(): Promise<EngineDiagnosticSnapshot> {
    const queueDepth = Array.from(dirty.perTable.values()).reduce(
      (s, set) => s + set.size,
      0,
    )
    const dbRowCounts: Record<string, number> = {}
    for (const adapter of adapters) {
      try {
        const table = (db as unknown as Record<string, { count?: () => Promise<number> }>)[
          adapter.dexieTable
        ]
        if (table?.count) {
          dbRowCounts[adapter.dexieTable] = await table.count()
        }
      } catch (err) {
        // Best-effort — diagnostic snapshot shouldn't throw.
        console.warn(`[sync] count ${adapter.dexieTable} failed`, err)
      }
    }
    return {
      lastPushAt: _lastPushAt,
      lastPullAt: _lastPullAt,
      queueDepth,
      recentErrors: recentErrors.slice(),  // defensive copy
      dbRowCounts,
      consecutiveErrors: { ...consecutiveErrors },
    }
  }

  return {
    start(uid: string) {
      if (userId === uid) return
      userId = uid
      status = paused ? 'paused' : 'idle'
      installHooks()
      installVisibilityListener()
      if (!paused) {
        // Cold-start ALWAYS force-pulls (fix-account-switch-data-loss C1).
        // The incremental cursor is only safe within a single live engine
        // session; across sessions (page reload, sign-out + sign-in,
        // browser restart, PWA wake-up) it may be newer than legitimate
        // cloud rows for the same user and silently filter them out.
        // The visibilitychange handler keeps using incremental pullNow()
        // for in-session refresh, which is the only safe use of the cursor.
        if (import.meta.env.DEV) {
          // eslint-disable-next-line no-console
          console.log('[sync.start]', { phase: 'force-pull-on-cold-start', userId: uid })
        }
        pullAllNow({ force: true }).catch((err) => onError(err, 'startupPullForce'))
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
    getDiagnosticSnapshot,
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
