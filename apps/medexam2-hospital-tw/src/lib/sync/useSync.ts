// React hook to start / stop sync engine + handle sign-in resolution (M4 — 二階 mirror).
// Mirrors apps/medexam-tw/src/lib/sync/useSync.ts; see that file for design.
// Differences: HospitalDB instead of StudyRpgDB, canonical-row table is
// db.gameCounters (key 'singleton') instead of db.players ('p1').

import { useCallback, useEffect, useRef, useState } from 'react'
import { getHospitalDB } from '../../db/schema'
import { getSupabase } from '../auth/client'
import { useAuth } from '../auth/AuthContext'
import { createSyncEngine } from './engine'
import { HOSPITAL_ADAPTERS } from './tables'
import {
  cloudHasAnyRows,
  computeGateState,
  getMaxLocalUpdatedAt,
  hasNonDefaultHospitalState,
  setMigrationChoice,
  setPausedForUser,
  snapshotLocalToBackup,
  wipeLocalSyncedTables,
  type GateSnapshot,
  type MigrationGateState,
} from './migration'
import {
  clearLocalSyncTables,
  getLastSignedInUserId,
  setLastSignedInUserId,
} from './account-switch'
import { registerSyncMetadataGetter } from '../../services/sync-metadata'
import type {
  EngineDiagnosticSnapshot,
  SyncEngine,
  SyncErrorRecord,
  SyncStatus,
} from './types'

const DEBOUNCE_MS = Number(import.meta.env.VITE_SYNC_DEBOUNCE_MS) || 3000

const ACCOUNT_SWITCH_DETECTOR_ENABLED =
  String(import.meta.env.VITE_ACCOUNT_SWITCH_DETECTOR ?? 'true').toLowerCase() !== 'false'

const RE_EVAL_WINDOW_MS = 5000
const RE_EVAL_DEBOUNCE_MS = 200
const DEV = import.meta.env.DEV
const devLog = (...args: unknown[]): void => {
  if (DEV) console.log(...(args as [unknown, ...unknown[]]))
}

export type UploadChoice = 'upload' | 'keep-separate' | 'later'
export type ConflictChoice = 'use-cloud' | 'use-local' | 'later'
export type AccountSwitchChoice = 'clear-local' | 'keep-local' | 'signout'

export interface AccountSwitchInfo {
  previousUserId: string
  currentEmail: string | null
  localMaxUpdatedAt: number | null
  cloudHasRows: boolean | null
  online: boolean
}

export interface SyncErrorToastInfo {
  record: SyncErrorRecord
  consecutive: number
  id: string
}

export interface UseSyncReturn {
  status: SyncStatus
  lastPushAt: number | null
  lastPullAt: number | null
  gateState: MigrationGateState
  gateSnapshot: GateSnapshot | null
  accountSwitch: AccountSwitchInfo | null
  syncError: SyncErrorToastInfo | null
  resolveUploadPrompt: (choice: UploadChoice) => Promise<void>
  resolveConflictChooser: (choice: ConflictChoice) => Promise<void>
  resolveAccountSwitch: (choice: AccountSwitchChoice) => Promise<void>
  reopenConflictChooser: () => Promise<void>
  resetMigrationPreference: () => Promise<void>
  forcePush: () => Promise<void>
  forcePull: () => Promise<void>
  getEngineDiagnostic: () => Promise<EngineDiagnosticSnapshot | null>
  dismissSyncError: () => void
  retrySyncError: () => Promise<void>
  /** Sign out after awaiting pending push (fix-account-switch-data-loss C2a). */
  signOutWithFlush: () => Promise<void>
  /** 「切換帳號」 menu: flush + snapshot + clear + signOut + signIn (C2b). */
  safeAccountSwitch: () => Promise<void>
  /**
   * 「重置此帳號進度」 action. Aborts and leaves local intact if the
   * cloud-delete RPC fails. Caller owns the confirmation gate.
   */
  safeResetAccountData: () => Promise<void>
}

const SYNC_ERROR_TOAST_DEBOUNCE_MS = 60_000

export function useSync(): UseSyncReturn {
  const { status: authStatus, user, signOut: authSignOut, signInWithGoogle } = useAuth()
  const engineRef = useRef<SyncEngine | null>(null)
  const [, setTick] = useState(0)
  const [gateState, setGateState] = useState<MigrationGateState>('pending')
  const [gateSnapshot, setGateSnapshot] = useState<GateSnapshot | null>(null)
  const [accountSwitch, setAccountSwitch] = useState<AccountSwitchInfo | null>(null)
  const [syncError, setSyncError] = useState<SyncErrorToastInfo | null>(null)
  const [resolveTick, setResolveTick] = useState(0)
  const recentErrorSeenRef = useRef<Map<string, number>>(new Map())

  const handleConsecutiveFailure = useCallback(
    (record: SyncErrorRecord, count: number) => {
      const now = Date.now()
      const seen = recentErrorSeenRef.current.get(record.message)
      if (seen && now - seen < SYNC_ERROR_TOAST_DEBOUNCE_MS) return
      recentErrorSeenRef.current.set(record.message, now)
      setSyncError({
        record,
        consecutive: count,
        id: `${record.at}-${Math.random().toString(36).slice(2, 8)}`,
      })
    },
    [],
  )

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
      setAccountSwitch(null)
      return
    }

    let cancelled = false
    setGateState('pending')

    let reEvalWatchActive = false
    let reEvalDebounceTimer: ReturnType<typeof setTimeout> | null = null
    let reEvalWindowTimer: ReturnType<typeof setTimeout> | null = null
    let reEvalHookFn: ((primKey: unknown, obj: unknown) => void) | null = null

    function cancelReEval(): void {
      reEvalWatchActive = false
      if (reEvalDebounceTimer) clearTimeout(reEvalDebounceTimer)
      if (reEvalWindowTimer) clearTimeout(reEvalWindowTimer)
      const db = getHospitalDB()
      if (reEvalHookFn) {
        try {
          ;(db.gameCounters.hook('creating') as {
            unsubscribe: (fn: unknown) => void
          }).unsubscribe(reEvalHookFn)
        } catch {
          // ignore
        }
        reEvalHookFn = null
      }
    }

    ;(async () => {
      try {
        const db = getHospitalDB()
        devLog('[sync.gate]', { phase: 'compute-start', userId: user.id })

        if (ACCOUNT_SWITCH_DETECTOR_ENABLED) {
          const lastUid = await getLastSignedInUserId(db)
          if (lastUid && lastUid !== user.id) {
            const hasLocal = await hasNonDefaultHospitalState(db)
            if (hasLocal) {
              const [localMax, cloudHasRows] = await Promise.all([
                getMaxLocalUpdatedAt(db),
                cloudHasAnyRows(supabase, user.id).catch(() => null),
              ])
              if (cancelled) return
              const online = typeof navigator !== 'undefined' ? navigator.onLine : true
              devLog('[sync.gate]', {
                phase: 'account-switch-detected',
                previousUserId: lastUid,
                currentUserId: user.id,
              })
              setAccountSwitch({
                previousUserId: lastUid,
                currentEmail: user.email ?? null,
                localMaxUpdatedAt: localMax,
                cloudHasRows,
                online,
              })
              return
            }
          }
        }

        await setLastSignedInUserId(db, user.id)
        setAccountSwitch(null)

        const snapshot = await computeGateState(supabase, user.id)
        if (cancelled) return
        setGateSnapshot(snapshot)
        setGateState(snapshot.state)
        devLog('[sync.gate]', { phase: 'decision', state: snapshot.state })

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
            onConsecutiveFailure: handleConsecutiveFailure,
          })
        }
        if (needsModal) engineRef.current.pause()
        engineRef.current.start(user.id)

        if (DEV) {
          ;(globalThis as { __hospitalSync?: SyncEngine }).__hospitalSync =
            engineRef.current
          ;(globalThis as { __hospitalDb?: unknown }).__hospitalDb = getHospitalDB()
        }

        if (snapshot.state === 'fresh-start' || snapshot.state === 'silent-pull') {
          reEvalWatchActive = true
          reEvalHookFn = () => {
            if (!reEvalWatchActive) return
            if (reEvalDebounceTimer) clearTimeout(reEvalDebounceTimer)
            reEvalDebounceTimer = setTimeout(async () => {
              if (!reEvalWatchActive || cancelled) return
              reEvalWatchActive = false
              devLog('[sync.gate]', { phase: 're-eval-fired' })
              try {
                const snap2 = await computeGateState(supabase, user.id)
                if (cancelled) return
                if (snap2.state !== snapshot.state) {
                  setGateSnapshot(snap2)
                  setGateState(snap2.state)
                  const needsModal2 =
                    snap2.state === 'migration-upload' ||
                    snap2.state === 'conflict-chooser' ||
                    snap2.state === 'paused'
                  if (needsModal2) engineRef.current?.pause()
                  devLog('[sync.gate]', {
                    phase: 're-eval-state-changed',
                    from: snapshot.state,
                    to: snap2.state,
                  })
                }
              } catch (err) {
                console.warn('[hospital-sync] re-eval failed', err)
              }
              cancelReEval()
            }, RE_EVAL_DEBOUNCE_MS)
          }
          db.gameCounters.hook('creating', reEvalHookFn)
          reEvalWindowTimer = setTimeout(() => {
            if (reEvalWatchActive) {
              devLog('[sync.gate]', { phase: 're-eval-window-elapsed' })
            }
            cancelReEval()
          }, RE_EVAL_WINDOW_MS)
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
      cancelReEval()
    }
  }, [authStatus, user, resolveTick])

  useEffect(() => {
    return () => {
      engineRef.current?.stop()
      engineRef.current = null
    }
  }, [])

  // Register a metadata getter so services/bug-report.ts can grab the
  // engine snapshot at submit time without re-running useSync.
  useEffect(() => {
    registerSyncMetadataGetter(async () => {
      const eng = engineRef.current
      const engSnap = eng ? await eng.getDiagnosticSnapshot() : null
      const lastSignedInUserId = await getLastSignedInUserId(getHospitalDB()).catch(
        () => null,
      )
      return {
        gateState,
        authStatus,
        currentUserId: user?.id ?? null,
        lastSignedInUserId,
        lastPushAt: engSnap?.lastPushAt ?? null,
        lastPullAt: engSnap?.lastPullAt ?? null,
        queueDepth: engSnap?.queueDepth ?? 0,
        recentErrors: engSnap?.recentErrors ?? [],
        dbRowCounts: engSnap?.dbRowCounts ?? {},
        consecutiveErrors: engSnap?.consecutiveErrors ?? { push: 0, pull: 0 },
        online: typeof navigator !== 'undefined' ? navigator.onLine : true,
      }
    })
    return () => registerSyncMetadataGetter(null)
  }, [authStatus, gateState, user])

  const resolveAccountSwitch = useCallback(
    async (choice: AccountSwitchChoice): Promise<void> => {
      const supabase = getSupabase()
      if (!supabase || !user) return
      const db = getHospitalDB()

      if (choice === 'signout') {
        await supabase.auth.signOut()
        setAccountSwitch(null)
        return
      }
      if (choice === 'clear-local') {
        // Snapshot under PREVIOUS user's id BEFORE wipe (C2b).
        try {
          if (accountSwitch?.previousUserId) {
            await snapshotLocalToBackup(
              db,
              accountSwitch.previousUserId,
              'account-switch-clear-local',
            )
          }
        } catch (err) {
          console.warn('[account-switch] snapshotLocalToBackup failed', err)
        }
        engineRef.current?.stop()
        engineRef.current = null
        await clearLocalSyncTables(db)
      }
      await setLastSignedInUserId(db, user.id)
      setAccountSwitch(null)
      setResolveTick((t) => t + 1)
    },
    [user],
  )

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

  const forcePush = useCallback(async (): Promise<void> => {
    const e = engineRef.current
    if (!e) return
    await e.pushAllNow()
  }, [])

  const forcePull = useCallback(async (): Promise<void> => {
    const e = engineRef.current
    if (!e) return
    await e.pullAllNow({ force: true })
  }, [])

  const getEngineDiagnostic = useCallback(
    async (): Promise<EngineDiagnosticSnapshot | null> => {
      const e = engineRef.current
      if (!e) return null
      return e.getDiagnosticSnapshot()
    },
    [],
  )

  const dismissSyncError = useCallback((): void => {
    setSyncError(null)
  }, [])

  const retrySyncError = useCallback(async (): Promise<void> => {
    const e = engineRef.current
    setSyncError(null)
    if (!e) return
    try {
      await e.pushAllNow()
      await e.pullAllNow({ force: true })
    } catch (err) {
      console.warn('[hospital-sync] manual retry failed', err)
    }
  }, [])

  const signOutWithFlush = useCallback(async (): Promise<void> => {
    // Best-effort flush — see 一階 for full rationale (fix-account-switch-data-loss C2a).
    const e = engineRef.current
    if (e) {
      try {
        await e.pushAllNow()
      } catch (err) {
        console.warn('[hospital-sync] flush before signOut failed (continuing)', err)
      }
    }
    await authSignOut()
  }, [authSignOut])

  const safeAccountSwitch = useCallback(async (): Promise<void> => {
    // 「切換帳號」 menu — see 一階 for full rationale (C2b).
    const e = engineRef.current
    const db = getHospitalDB()
    const uid = user?.id ?? null

    if (e) {
      try {
        await e.pushAllNow()
      } catch (err) {
        console.warn('[safeAccountSwitch] pushAllNow failed (continuing)', err)
      }
    }
    if (uid) {
      try {
        await snapshotLocalToBackup(db, uid, 'switch-account-menu')
      } catch (err) {
        console.warn('[safeAccountSwitch] snapshotLocalToBackup failed (continuing)', err)
      }
    }
    try {
      await clearLocalSyncTables(db)
    } catch (err) {
      console.warn('[safeAccountSwitch] clearLocalSyncTables failed (continuing)', err)
    }
    try {
      await authSignOut()
    } catch (err) {
      console.warn('[safeAccountSwitch] signOut failed (continuing)', err)
    }
    try {
      await signInWithGoogle()
    } catch (err) {
      console.warn('[safeAccountSwitch] signInWithGoogle failed', err)
    }
  }, [authSignOut, signInWithGoogle, user])

  const safeResetAccountData = useCallback(async (): Promise<void> => {
    // Mirror of 一階 — see apps/medexam-tw/src/lib/sync/useSync.ts for rationale.
    const supabase = getSupabase()
    if (!supabase || !user) {
      throw new Error('未登入或雲端同步未啟用')
    }
    const db = getHospitalDB()

    await snapshotLocalToBackup(db, user.id, 'reset-account-data')

    const { error } = await supabase.rpc('delete_my_data')
    if (error) throw error

    engineRef.current?.stop()
    engineRef.current = null
    await clearLocalSyncTables(db)

    setResolveTick((t) => t + 1)
  }, [user])

  const engine = engineRef.current
  return {
    status: engine?.getStatus() ?? (authStatus === 'disabled' ? 'disabled' : 'unauthed'),
    lastPushAt: engine?.lastPushAt() ?? null,
    lastPullAt: engine?.lastPullAt() ?? null,
    gateState,
    gateSnapshot,
    accountSwitch,
    syncError,
    resolveUploadPrompt,
    resolveConflictChooser,
    resolveAccountSwitch,
    reopenConflictChooser,
    resetMigrationPreference,
    forcePush,
    forcePull,
    getEngineDiagnostic,
    dismissSyncError,
    retrySyncError,
    signOutWithFlush,
    safeAccountSwitch,
    safeResetAccountData,
  }
}
