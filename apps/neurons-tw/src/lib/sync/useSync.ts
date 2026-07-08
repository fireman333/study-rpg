// React hook — mounts the SyncEngine only when the user is signed in.
//
// Side effects:
// - Subscribes to Dexie write events (best-effort via mutating-hook
//   `db.on('changes')`); when any participating table mutates, schedule a
//   debounced push.
// - Listens for `visibilitychange` to opportunistically pull on tab-focus.
// - On mount, runs an initial pull (force=true the first time per device
//   so the bundle definitely lands before the first push overwrites it).
// - On unmount or sign-out, disposes the engine.
//
// Account-switch gate (fix-neurons-account-switch-guard): before mounting the
// engine, the local-data ownership marker is checked against the signing-in
// user. A mismatch blocks the mount entirely (no hooks, no pull, no push —
// zero pollution window) until the user confirms a local wipe or cancels
// (sign-out). neurons merges are monotonic, so a cross-account merge would be
// irreversible — the gate is the only line of defense.

import { useCallback, useEffect, useRef, useState } from 'react'
import { db, type NeuronsDB } from '../db'
import { useAuth } from '../auth/AuthContext'
import { getSupabase } from '../auth/client'
import { createSyncEngine, type SyncEngine, type SyncStatus } from './engine'
import { runOnPullComplete } from './backfill'
import { autoPushLeaderboardOnSync } from '../services/neurons-leaderboard'
import { NEURONS_ADAPTERS } from './tables'
import { adoptAccount, evaluateAccountGate, readLastSyncedUserId, writeLastSyncedUserId } from './account-guard'
import { consumeRescueMigrationPush } from '../services/rescue/rescue-store'

// Phase 1 (eliminate-cross-device-r2-412-storm): 3s → 12s (matches 二階's ~10s)
// so concurrent devices push less often → fewer cross-device ETag collisions.
// schedulePush adds ±jitter on top so two devices de-synchronize. Cost: cloud
// durability / cross-device visibility lag up to the debounce window; data is
// never lost (stays in Dexie, flushed on beforeunload / next session).
const DEBOUNCE_MS = Number(import.meta.env.VITE_SYNC_DEBOUNCE_MS) || 12000

// Push-trigger hook coverage derives from the adapter registry — every synced
// table schedules a push on write. A hand-maintained literal drifted to 7/20
// tables once already (bookmarks / flags / nicknames silently missed pushes);
// the derivation + the registry lock test prevent a recurrence.
const SYNCED_TABLES: ReadonlySet<string> = new Set(NEURONS_ADAPTERS.map((a) => a.name))

export interface AccountSwitchState {
  /** True while local data belongs to a different account — engine is NOT mounted. */
  pending: boolean
  /** Last wipe failure message (繁中), shown in the confirm dialog. */
  error: string | null
  /** Wipe local data, adopt the new account, then mount the engine. */
  confirm: () => Promise<void>
  /** Keep local data untouched and sign out. */
  cancel: () => Promise<void>
}

export function useSync(): {
  engine: SyncEngine | null
  status: SyncStatus | null
  accountSwitch: AccountSwitchState
  /** Manual sync (status-light click): force pull, then push. No-op when unmounted. */
  syncNow: () => Promise<void>
} {
  const { status: authStatus, user, signOut } = useAuth()
  const engineRef = useRef<SyncEngine | null>(null)
  const [snapshot, setSnapshot] = useState<SyncStatus | null>(null)
  const [switchPending, setSwitchPending] = useState(false)
  const [switchError, setSwitchError] = useState<string | null>(null)
  // Bumped after a confirmed wipe so the effect re-evaluates the gate and mounts.
  const [gateTick, setGateTick] = useState(0)

  useEffect(() => {
    if (authStatus !== 'authed' || !user) {
      engineRef.current?.dispose()
      engineRef.current = null
      setSnapshot(null)
      setSwitchPending(false)
      setSwitchError(null)
      return
    }
    const supabase = getSupabase()
    if (!supabase) return

    const decision = evaluateAccountGate(readLastSyncedUserId(), user.id)
    if (decision === 'prompt') {
      setSwitchPending(true)
      return // no engine, no hooks — resolved via confirm()/cancel()
    }
    if (decision === 'proceed-and-write') writeLastSyncedUserId(user.id)
    setSwitchPending(false)

    const engine = createSyncEngine({
      supabase,
      db,
      user,
      debounceMs: DEBOUNCE_MS,
      onPullComplete: async (result) => {
        await runOnPullComplete(db, result)
      },
      // After every successful push, refresh the leaderboard row for opted-in
      // players so rank tracks gameplay without manual 同步. Best-effort: a
      // failure here never breaks the sync cycle. NOTE: the helper deliberately
      // writes NO synced Dexie table (no last_pushed_at) — otherwise it would
      // re-trigger schedulePush and loop forever. See autoPushLeaderboardOnSync.
      onPushComplete: async () => {
        try {
          await autoPushLeaderboardOnSync({
            userId: user.id,
            getAccessToken: async () => {
              const { data } = await supabase.auth.getSession()
              return data.session?.access_token ?? null
            },
          })
        } catch (err) {
          console.warn('[leaderboard] auto-upsert on push failed', err)
        }
      },
    })
    engineRef.current = engine

    // Initial pull on mount — retained on the engine (S3) so the first push
    // awaits it (bounded) and sends If-Match with a warm ETag instead of the
    // guaranteed cold-start If-None-Match:* 412.
    engine.beginStartupForcePull()

    // Subscribe to Dexie changes via the `on('versionchange'|'populate'|...)` API
    // is not granular enough — use polling via setInterval (single low-cost timer)
    // OR use Dexie's `on('changes')` (Observable API). For simplicity we just
    // hook each table's `creating/updating/deleting` callbacks via Dexie hooks.
    attachTableHooks(db, () => engine.schedulePush())

    // If the boot-time rescue localStorage→meta migration seeded synced rows
    // BEFORE these hooks attached, its writes never fired schedulePush — flush
    // them now so a migrated plan doesn't linger local until the next unrelated
    // write (add-neurons-rescue-r2-sync review quick-fix). One-shot consume.
    if (consumeRescueMigrationPush()) engine.schedulePush()

    // Tab focus → pull
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        void engine.pullNow()
      }
    }
    document.addEventListener('visibilitychange', onVisibility)

    // beforeunload → flush pending push
    const onBeforeUnload = () => {
      if (engine.getStatus().state === 'pushing') return
      // Best-effort sync flush — fire and forget (browser may not wait).
      void engine.pushNow()
    }
    window.addEventListener('beforeunload', onBeforeUnload)

    // Status poll for UI binding. Seed immediately (the light shouldn't wait a
    // tick), then only swap state when a field actually changed — the provider
    // wraps the whole tree, so identity-stable snapshots keep consumers quiet.
    setSnapshot(engine.getStatus())
    const poll = setInterval(() => {
      setSnapshot((prev) => {
        const next = engine.getStatus()
        return prev &&
          prev.state === next.state &&
          prev.lastError === next.lastError &&
          prev.lastPushAt === next.lastPushAt &&
          prev.lastPullAt === next.lastPullAt
          ? prev
          : next
      })
    }, 1000)

    if (import.meta.env.DEV) {
      ;(globalThis as Record<string, unknown>).__sync = engine
      ;(globalThis as Record<string, unknown>).__db = db
    }

    return () => {
      clearInterval(poll)
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('beforeunload', onBeforeUnload)
      detachTableHooks(db)
      engine.dispose()
      engineRef.current = null
      if (import.meta.env.DEV) {
        delete (globalThis as Record<string, unknown>).__sync
      }
    }
  }, [authStatus, user, gateTick])

  const confirm = useCallback(async () => {
    if (!user) return
    try {
      await adoptAccount(db, user.id)
      setSwitchError(null)
      setSwitchPending(false)
      setGateTick((t) => t + 1) // re-run effect → gate now passes → mount engine
    } catch (err) {
      console.warn('[sync] account-switch wipe failed', err)
      setSwitchError('清除本機資料失敗，請再試一次')
    }
  }, [user])

  const cancel = useCallback(async () => {
    // Sign-out flips authStatus → effect re-runs → pending resets there. If
    // sign-out fails the dialog stays up so the user can retry either way.
    await signOut()
  }, [signOut])

  const syncNow = useCallback(async () => {
    const engine = engineRef.current
    if (!engine) return
    await engine.pullNow({ force: true })
    await engine.pushNow()
  }, [])

  return {
    engine: engineRef.current,
    status: snapshot,
    accountSwitch: { pending: switchPending, error: switchError, confirm, cancel },
    syncNow,
  }
}

// ---- Dexie hook attach/detach ---------------------------------------------
// Exported for tests (push-trigger regression lock) — not part of the app API.

type HookKind = 'creating' | 'updating' | 'deleting'
const ATTACHED_HOOKS: Array<{ table: string; kind: HookKind; fn: (...args: unknown[]) => void }> = []

export function attachTableHooks(db: NeuronsDB, onChange: () => void): void {
  for (const tableName of SYNCED_TABLES) {
    const table = (db as unknown as Record<string, { hook: (kind: HookKind, fn: (...args: unknown[]) => void) => void }>)[
      tableName
    ]
    if (!table) continue
    const kinds: HookKind[] = ['creating', 'updating', 'deleting']
    for (const kind of kinds) {
      const fn = () => onChange()
      table.hook(kind, fn)
      ATTACHED_HOOKS.push({ table: tableName, kind, fn })
    }
  }
}

export function detachTableHooks(db: NeuronsDB): void {
  for (const { table: tableName, kind, fn } of ATTACHED_HOOKS) {
    const table = (db as unknown as Record<string, { hook: { unsubscribe?: (kind: HookKind, fn: (...args: unknown[]) => void) => void } }>)[
      tableName
    ]
    if (table?.hook && typeof table.hook.unsubscribe === 'function') {
      table.hook.unsubscribe(kind, fn)
    }
  }
  ATTACHED_HOOKS.length = 0
}

export { SYNCED_TABLES }
