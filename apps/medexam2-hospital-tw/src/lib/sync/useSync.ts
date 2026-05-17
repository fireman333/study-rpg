// React hook to start / stop sync engine based on auth status + handle
// sign-in migration / conflict resolution (M4 — 二階 mirror).
//
// Mirrors apps/medexam-tw/src/lib/sync/useSync.ts but uses HospitalDB
// + HOSPITAL_ADAPTERS. Exposes the same UseSyncReturn surface so App.tsx
// renders the same migration modals (copied verbatim from 一階).

import { useCallback, useEffect, useRef, useState } from 'react'
import { getHospitalDB } from '../../db/schema'
import { getSupabase } from '../auth/client'
import { useAuth } from '../auth/AuthContext'
import { createSyncEngine } from './engine'
import { HOSPITAL_ADAPTERS } from './tables'
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
  gateState: MigrationGateState
  gateSnapshot: GateSnapshot | null
  resolveUploadPrompt: (choice: UploadChoice) => Promise<void>
  resolveConflictChooser: (choice: ConflictChoice) => Promise<void>
  reopenConflictChooser: () => Promise<void>
  resetMigrationPreference: () => Promise<void>
}

export function useSync(): UseSyncReturn {
  const { status: authStatus, user } = useAuth()
  const engineRef = useRef<SyncEngine | null>(null)
  const [, setTick] = useState(0)
  const [gateState, setGateState] = useState<MigrationGateState>('pending')
  const [gateSnapshot, setGateSnapshot] = useState<GateSnapshot | null>(null)

  useEffect(() => {
    const supabase = getSupabase()
    if (!supabase) {
      setGateState('fresh-start')
      return
    }

    if (authStatus !== 'authed' || !user) {
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

        const needsModal =
          snapshot.state === 'migration-upload' ||
          snapshot.state === 'conflict-chooser' ||
          snapshot.state === 'paused'
        const skipsEngine = snapshot.state === 'keep-separate'

        if (skipsEngine) return

        if (!engineRef.current) {
          engineRef.current = createSyncEngine({
            supabase,
            db: getHospitalDB(),
            adapters: HOSPITAL_ADAPTERS,
            debounceMs: DEBOUNCE_MS,
          })
        }
        if (needsModal) engineRef.current.pause()
        engineRef.current.start(user.id)

        if (import.meta.env.DEV) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ;(globalThis as any).__hospitalSync = engineRef.current
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ;(globalThis as any).__hospitalDb = getHospitalDB()
        }
      } catch (err) {
        console.error('[hospital-sync] gate computation failed', err)
        if (!cancelled) setGateState('pending')
      }
    })()

    const poll = setInterval(() => setTick((t) => t + 1), 2000)
    return () => {
      cancelled = true
      clearInterval(poll)
    }
  }, [authStatus, user])

  useEffect(() => {
    return () => {
      engineRef.current?.stop()
      engineRef.current = null
    }
  }, [])

  const resolveUploadPrompt = useCallback(
    async (choice: UploadChoice): Promise<void> => {
      const supabase = getSupabase()
      const engine = engineRef.current
      if (!supabase || !user) return

      const db = getHospitalDB()
      if (choice === 'later') {
        setGateState('resolved')
        if (engine) engine.resume()
        return
      }
      if (choice === 'keep-separate') {
        await setMigrationChoice(db, user.id, 'keep-separate')
        engine?.stop()
        engineRef.current = null
        setGateState('keep-separate')
        return
      }
      if (!engine) return
      await engine.pushAllNow()
      await setMigrationChoice(db, user.id, 'uploaded')
      engine.resume()
      setGateState('resolved')
    },
    [user],
  )

  const resolveConflictChooser = useCallback(
    async (choice: ConflictChoice): Promise<void> => {
      const supabase = getSupabase()
      const engine = engineRef.current
      if (!supabase || !user) return

      const db = getHospitalDB()
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
      // use-local
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
    setGateState('conflict-chooser')
    engineRef.current?.pause()
  }, [user])

  const resetMigrationPreference = useCallback(async (): Promise<void> => {
    if (!user) return
    const db = getHospitalDB()
    await db.meta.delete('migration_choice:' + user.id)
    await db.meta.delete('migration_paused:' + user.id)
    const supabase = getSupabase()
    if (!supabase) return
    const snapshot = await computeGateState(supabase, user.id)
    setGateSnapshot(snapshot)
    setGateState(snapshot.state)
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
