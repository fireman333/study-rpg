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

import { useEffect, useRef, useState } from 'react'
import { db, type NeuronsDB } from '../db'
import { useAuth } from '../auth/AuthContext'
import { getSupabase } from '../auth/client'
import { createSyncEngine, type SyncEngine, type SyncStatus } from './engine'
import { runOnPullComplete } from './backfill'
import { autoPushLeaderboardOnSync } from '../services/neurons-leaderboard'

const DEBOUNCE_MS = Number(import.meta.env.VITE_SYNC_DEBOUNCE_MS) || 3000
const SYNCED_TABLES = new Set([
  'synapses',
  'familyAccrual',
  'familyMastery',
  'neuronVariants',
  'achievements',
  'leaderboardProfile',
  'meta',
])

export function useSync(): { engine: SyncEngine | null; status: SyncStatus | null } {
  const { status: authStatus, user } = useAuth()
  const engineRef = useRef<SyncEngine | null>(null)
  const [snapshot, setSnapshot] = useState<SyncStatus | null>(null)

  useEffect(() => {
    if (authStatus !== 'authed' || !user) {
      engineRef.current?.dispose()
      engineRef.current = null
      setSnapshot(null)
      return
    }
    const supabase = getSupabase()
    if (!supabase) return

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

    // Initial pull on mount.
    void engine.pullNow({ force: true })

    // Subscribe to Dexie changes via the `on('versionchange'|'populate'|...)` API
    // is not granular enough — use polling via setInterval (single low-cost timer)
    // OR use Dexie's `on('changes')` (Observable API). For simplicity we just
    // hook each table's `creating/updating/deleting` callbacks via Dexie hooks.
    attachTableHooks(db, () => engine.schedulePush())

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

    // Status poll for UI binding.
    const poll = setInterval(() => {
      setSnapshot(engine.getStatus())
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
  }, [authStatus, user])

  return { engine: engineRef.current, status: snapshot }
}

// ---- Dexie hook attach/detach ---------------------------------------------

type HookKind = 'creating' | 'updating' | 'deleting'
const ATTACHED_HOOKS: Array<{ table: string; kind: HookKind; fn: (...args: unknown[]) => void }> = []

function attachTableHooks(db: NeuronsDB, onChange: () => void): void {
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

function detachTableHooks(db: NeuronsDB): void {
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
