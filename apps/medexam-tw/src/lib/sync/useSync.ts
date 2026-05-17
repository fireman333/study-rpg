// React hook to start / stop sync engine based on auth status (M4 cloud sync).
//
// Adds sign-in migration / conflict gate (Task 6):
// - On first authed transition, compute gate state by inspecting local +
//   cloud rows for this user.
// - Render appropriate modal (or none) based on state.
// - Engine starts in paused mode for migration-upload / conflict-chooser /
//   paused states so dirty writes don't race ahead before user decides.

import { useCallback, useEffect, useRef, useState } from 'react'
import { getDB } from '@study-rpg/core'
import { getSupabase } from '../auth/client'
import { useAuth } from '../auth/AuthContext'
import { createSyncEngine } from './engine'
import { ONE_STAGE_ADAPTERS } from './tables'
import {
  computeGateState,
  setMigrationChoice,
  setPausedForUser,
  snapshotLocalToBackup,
  wipeLocalSyncedTables,
  type GateSnapshot,
  type MigrationGateState,
} from './migration'
import type { SyncEngine, SyncStatus } from './types'

const DEBOUNCE_MS = Number(import.meta.env.VITE_SYNC_DEBOUNCE_MS) || 3000

export type UploadChoice = 'upload' | 'keep-separate' | 'later'
export type ConflictChoice = 'use-cloud' | 'use-local' | 'later'

export interface UseSyncReturn {
  status: SyncStatus
  lastPushAt: number | null
  lastPullAt: number | null
  /** Current migration gate state (drives modal rendering in App.tsx). */
  gateState: MigrationGateState
  /** Cloud + local timestamps for the conflict chooser modal. */
  gateSnapshot: GateSnapshot | null
  /** Handler invoked by MigrationUploadPrompt. */
  resolveUploadPrompt: (choice: UploadChoice) => Promise<void>
  /** Handler invoked by ConflictChooserModal. */
  resolveConflictChooser: (choice: ConflictChoice) => Promise<void>
  /**
   * Settings UI entry: re-render the conflict chooser with fresh timestamps.
   * Only meaningful when current state is `paused`. Engine stays paused.
   */
  reopenConflictChooser: () => Promise<void>
  /**
   * Settings UI entry: clear all persisted migration preferences for current
   * user (choice + paused flag) and re-run gate detection. Useful when user
   * regrets keep-separate or wants to re-evaluate from scratch.
   */
  resetMigrationPreference: () => Promise<void>
}

export function useSync(): UseSyncReturn {
  const { status: authStatus, user } = useAuth()
  const engineRef = useRef<SyncEngine | null>(null)
  const [, setTick] = useState(0)
  const [gateState, setGateState] = useState<MigrationGateState>('pending')
  const [gateSnapshot, setGateSnapshot] = useState<GateSnapshot | null>(null)

  // Engine lifecycle + gate computation
  useEffect(() => {
    const supabase = getSupabase()
    if (!supabase) {
      setGateState('fresh-start') // auth disabled → no modal needed
      return
    }

    if (authStatus !== 'authed' || !user) {
      // Not authed: stop engine, reset gate so next sign-in re-runs detection.
      engineRef.current?.stop()
      setGateState('pending')
      setGateSnapshot(null)
      return
    }

    let cancelled = false
    setGateState('pending')

    ;(async () => {
      try {
        const snapshot = await computeGateState(supabase, user.id)
        if (cancelled) return
        setGateSnapshot(snapshot)
        setGateState(snapshot.state)

        // Decide whether to start the engine, and in what mode.
        const needsModal =
          snapshot.state === 'migration-upload' ||
          snapshot.state === 'conflict-chooser' ||
          snapshot.state === 'paused'
        const skipsEngine = snapshot.state === 'keep-separate'

        if (skipsEngine) {
          // Engine stays uninitialized for this user.
          return
        }

        if (!engineRef.current) {
          engineRef.current = createSyncEngine({
            supabase,
            db: getDB(),
            adapters: ONE_STAGE_ADAPTERS,
            debounceMs: DEBOUNCE_MS,
          })
        }
        if (needsModal) {
          // Install hooks so writes during decision get queued, but block push/pull.
          engineRef.current.pause()
        }
        engineRef.current.start(user.id)

        if (import.meta.env.DEV) {
          ;(globalThis as any).__sync = engineRef.current
          ;(globalThis as any).__db = getDB()
        }
      } catch (err) {
        console.error('[sync] gate computation failed', err)
        if (!cancelled) setGateState('pending')
      }
    })()

    // Periodic re-render so status reflects current engine state.
    const poll = setInterval(() => setTick((t) => t + 1), 2000)

    return () => {
      cancelled = true
      clearInterval(poll)
    }
  }, [authStatus, user])

  // Hard stop on unmount.
  useEffect(() => {
    return () => {
      engineRef.current?.stop()
      engineRef.current = null
    }
  }, [])

  /** Handle MigrationUploadPrompt user choice. */
  const resolveUploadPrompt = useCallback(
    async (choice: UploadChoice): Promise<void> => {
      const supabase = getSupabase()
      const engine = engineRef.current
      if (!supabase || !user) return

      const db = getDB()
      if (choice === 'later') {
        // No-op; modal stays dismissed until next sign-in re-evaluates.
        // We mark gateState='resolved' to dismiss the modal in this session
        // only — no persisted choice, so next sign-in will re-prompt.
        setGateState('resolved')
        if (engine) {
          engine.resume()
        }
        return
      }
      if (choice === 'keep-separate') {
        await setMigrationChoice(db, user.id, 'keep-separate')
        engine?.stop()
        engineRef.current = null
        setGateState('keep-separate')
        return
      }
      // choice === 'upload'
      if (!engine) return
      await engine.pushAllNow()
      await setMigrationChoice(db, user.id, 'uploaded')
      engine.resume()
      setGateState('resolved')
    },
    [user],
  )

  /** Handle ConflictChooserModal user choice. */
  const resolveConflictChooser = useCallback(
    async (choice: ConflictChoice): Promise<void> => {
      const supabase = getSupabase()
      const engine = engineRef.current
      if (!supabase || !user) return

      const db = getDB()
      if (choice === 'later') {
        await setPausedForUser(db, user.id, true)
        engine?.pause()
        setGateState('paused')
        return
      }
      if (!engine) return
      if (choice === 'use-cloud') {
        await snapshotLocalToBackup(db, user.id, 'use-cloud-overwrite-local')
        await wipeLocalSyncedTables(db)
        await engine.pullAllNow({ force: true })
        await setMigrationChoice(db, user.id, 'cloud-chosen')
        await setPausedForUser(db, user.id, false)
        engine.resume()
        setGateState('resolved')
        return
      }
      // choice === 'use-local'
      await engine.pushAllNow(new Date().toISOString())
      await setMigrationChoice(db, user.id, 'local-chosen')
      await setPausedForUser(db, user.id, false)
      engine.resume()
      setGateState('resolved')
    },
    [user],
  )

  const reopenConflictChooser = useCallback(async (): Promise<void> => {
    const supabase = getSupabase()
    if (!supabase || !user) return
    const snapshot = await computeGateState(supabase, user.id)
    setGateSnapshot(snapshot)
    // Always re-show conflict chooser even if computed state was 'resolved',
    // because the user explicitly clicked from settings.
    setGateState('conflict-chooser')
    engineRef.current?.pause()
  }, [user])

  const resetMigrationPreference = useCallback(async (): Promise<void> => {
    if (!user) return
    const db = getDB()
    await db.meta.delete('migration_choice:' + user.id)
    await db.meta.delete('migration_paused:' + user.id)
    const supabase = getSupabase()
    if (!supabase) return
    const snapshot = await computeGateState(supabase, user.id)
    setGateSnapshot(snapshot)
    setGateState(snapshot.state)
    // Engine lifecycle is driven by useEffect, but we may need to re-pause
    // if state transitioned to a needs-modal one.
    const needsModal =
      snapshot.state === 'migration-upload' ||
      snapshot.state === 'conflict-chooser' ||
      snapshot.state === 'paused'
    if (needsModal) engineRef.current?.pause()
    else engineRef.current?.resume()
  }, [user])

  const engine = engineRef.current
  return {
    status: engine?.getStatus() ?? (authStatus === 'disabled' ? 'disabled' : 'unauthed'),
    lastPushAt: engine?.lastPushAt() ?? null,
    lastPullAt: engine?.lastPullAt() ?? null,
    gateState,
    gateSnapshot,
    resolveUploadPrompt,
    resolveConflictChooser,
    reopenConflictChooser,
    resetMigrationPreference,
  }
}
