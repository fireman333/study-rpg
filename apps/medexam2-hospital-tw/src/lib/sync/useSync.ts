// React hook to start / stop sync engine + handle sign-in resolution (M4 — 二階 mirror).
// Mirrors apps/medexam-tw/src/lib/sync/useSync.ts; see that file for design.
// Differences: HospitalDB instead of StudyRpgDB, canonical-row table is
// db.gameCounters (key 'singleton') instead of db.players ('p1').

import { useCallback, useEffect, useRef, useState } from 'react'
import { getHospitalDB, refreshDailyTickets } from '../../db/schema'
import { getSupabase } from '../auth/client'
import { useAuth } from '../auth/AuthContext'
import { createSyncEngine } from './engine'
import { BOOKMARKS_ADAPTERS, HOSPITAL_ADAPTERS, M2_ADAPTERS } from './tables'
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
import { checkAssignmentInvariants } from '../assignment'
import { reconcileRetiredDoctors } from '../retirement-reconcile'
import { getBackendConfig } from './backend-config'
import { pushLeaderboardIfOptedIn } from './leaderboard'
import { deleteLeaderboardMe } from '../leaderboard/api'
import { clearLeaderboardProfile, getLeaderboardProfile } from '../../services/leaderboard-profile'
import { requestR2Cleanup } from './r2/account-lifecycle'
import {
  applyResetPropagationIfNeeded,
  fetchCloudResetTimestamp,
  writeLocalAckResetAt,
} from './reset-propagation'
import { registerSyncMetadataGetter } from '../../services/sync-metadata'
import { backfillAchievementsFromCurrentStats } from '../../services/achievement-backfill'
import { backfillMonotonicCounters } from '../../services/counter-backfill'
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

        // Reset-propagation gate (add-reset-propagation-marker): if cloud's
        // `account_metadata.last_reset_at` is newer than our local ack, wipe
        // local before computeGateState so a post-reset sign-in lands in
        // `fresh-start` / `silent-pull` instead of `migration-upload` (whose
        // 「上傳本機」 option would resurrect the stale data on cloud).
        // Non-fatal: helper catches its own fetch errors and returns
        // { propagated: false } so engine start is never blocked.
        try {
          await applyResetPropagationIfNeeded(supabase, user.id, db)
        } catch (err) {
          console.warn('[sync.gate] reset-propagation failed, continuing', err)
        }
        if (cancelled) return

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
            r2Bundles: [
              { bundle: 'm2', adapters: M2_ADAPTERS },
              { bundle: 'bookmarks', adapters: BOOKMARKS_ADAPTERS },
            ],
            // Post-pull chain (runs after every successful pull cycle):
            //   1. Invariant repair — restores doctor↔room SOT if cloud applied
            //      stale hospital_state.rooms (legacy non-null assignedDoctorId
            //      values from pre-fix saves).
            //   2. Achievement backfill — silently writes any unlocked-but-
            //      missing rows for pre-existing players who already met
            //      thresholds before the achievement system shipped. Wrapped
            //      in try/catch so a Dexie transient failure cannot break the
            //      pull cycle (per spec scenario "Backfill error does not
            //      break the pull cycle").
            onPullComplete: async () => {
              // Step 1: Reconcile retired-doctor tombstones BEFORE any other
              // post-pull repair. checkAssignmentInvariants reads the doctor
              // roster to detect orphan room pointers — reconcile MUST clean
              // ghost rows first so the repair observes correct state. Per
              // spec cloud-sync "reconcile SHALL run BEFORE
              // checkAssignmentInvariants" (fix-doctor-retire-cloud-
              // resurrection-v2). Wrapped in its own try/catch so a transient
              // Dexie failure here cannot block achievement / invariant repair
              // downstream.
              try {
                const { cleaned } = await reconcileRetiredDoctors()
                if (cleaned > 0) {
                  // eslint-disable-next-line no-console
                  console.info(
                    `[retirement-reconcile] cleaned ${cleaned} ghost doctor rows after pull`,
                  )
                }
              } catch (err) {
                // eslint-disable-next-line no-console
                console.warn(
                  '[retirement-reconcile] failed, will retry on next pull cycle:',
                  err,
                )
              }
              try {
                await checkAssignmentInvariants()
                // Counter backfill MUST run first — achievement-backfill's
                // buildAchievementStats() reads from monotonicCounters, so
                // patched values need to be in place before predicate
                // evaluation. See backfill-monotonic-counters spec D5.
                await backfillMonotonicCounters()
                const unlocked = await backfillAchievementsFromCurrentStats()
                if (unlocked > 0) {
                  // eslint-disable-next-line no-console
                  console.info(
                    `[achievement-backfill] silently unlocked ${unlocked} achievements from current stats`,
                  )
                }
              } catch (err) {
                // eslint-disable-next-line no-console
                console.warn(
                  '[achievement-backfill] failed, will retry on next pull cycle:',
                  err,
                )
              }
              // Re-evaluate the daily ticket AFTER the pull reconciles. The
              // cold-start force-pull overwrites the local `tickets` row (incl.
              // lastRefreshDay) with the cloud snapshot, rolling back the +1
              // that App boot's refreshDailyTickets() granted before sync ran.
              // Re-running here is idempotent on lastRefreshDay (no-ops once
              // granted for the day); the re-grant is hook-tracked (this fires
              // after applyingFromCloud resets to false) so it marks dirty and
              // the existing debounced push persists it to cloud. Per
              // fix-medexam2-ticket-cloud-clobber recruitment-gacha delta.
              try {
                await refreshDailyTickets()
              } catch (err) {
                // eslint-disable-next-line no-console
                console.warn(
                  '[daily-ticket] post-pull refresh failed, will retry on next pull cycle:',
                  err,
                )
              }
            },
            // Post-push leaderboard chain — fires after every successful R2
            // bundle push within the same 3s debounce window. Orchestrator
            // skips silently for never-opted-in players; surface its tagged
            // error result via console.warn so a broken Worker is observable
            // (the chain itself must NEVER throw — leaderboard is best-effort
            // and a Worker outage must not trip the engine's failure counter).
            onPushComplete: () =>
              pushLeaderboardIfOptedIn(user.id).then((result) => {
                if (result.kind === 'error') {
                  console.warn('[leaderboard] push failed:', result.message)
                }
              }),
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
    // Reset-propagation gate (add-reset-propagation-marker): covers the
    // foreground-tab reproducer where the user presses 「立即同步下載」 after
    // another device reset the account. Without this, the press is a no-op
    // (cloud is empty, incremental pull applies 0 rows, local stays stale).
    const supabase = getSupabase()
    if (supabase && user) {
      try {
        await applyResetPropagationIfNeeded(supabase, user.id, getHospitalDB())
      } catch (err) {
        console.warn('[forcePull] reset-propagation failed, continuing', err)
      }
    }
    await e.pullAllNow({ force: true })
  }, [user])

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

    // Leaderboard D1 row cleanup — only if the player has a local profile
    // (opted_in or dismissed). Skipping non-opted-in players avoids a wasted
    // 200-with-deleted:0 Worker round-trip. Tolerate Worker failure here —
    // leaderboard is best-effort, the rest of the reset shouldn't abort just
    // because the Worker is down. Phase 7.5 + design.md §D5.
    const lbProfile = await getLeaderboardProfile(user.id)
    if (lbProfile) {
      try {
        await deleteLeaderboardMe()
      } catch (err) {
        console.warn('[safeResetAccountData] leaderboard delete failed; continuing', err)
      }
      await clearLeaderboardProfile(user.id)
    }

    // R2 cleanup FIRST while JWT is still fresh. If this fails, abort — we
    // haven't touched Supabase yet, so user can retry without partial state.
    // No-op (skip) when writeR2 is false (Phase 0–1 of migration).
    if (getBackendConfig().writeR2) {
      await requestR2Cleanup(supabase, 'reset')
    }

    const { error } = await supabase.rpc('delete_my_data')
    if (error) throw error

    // Ack the marker the RPC just wrote so our own cold-start gate sees
    // cloud == localAck on the engine restart below and skips a redundant
    // wipe + duplicate localBackup row. Non-fatal: if the read-back fails,
    // the gate will fire once and converge — wasteful but correct.
    try {
      const cloudResetAt = await fetchCloudResetTimestamp(supabase, user.id)
      if (cloudResetAt !== null) writeLocalAckResetAt(user.id, cloudResetAt)
    } catch (err) {
      console.warn('[safeResetAccountData] ack read-back failed, gate will retry', err)
    }

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
