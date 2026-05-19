// React hook to start / stop sync engine based on auth status (M4 cloud sync).
//
// Sign-in resolution machine (fix-sync-sign-in-lifecycle):
//   1. Auth transitions to 'authed'
//   2. Account-switch detector runs FIRST — if a DIFFERENT Google account
//      previously signed in on this browser AND local has non-default state,
//      surface AccountSwitchPrompt and pause everything else (Bug 2).
//   3. Otherwise: write last_signed_in_user_id to current, then compute
//      gate (existing migration-upload / conflict-chooser / etc. flow)
//   4. Gate race fix (Bug 1): computeGateState now awaits Dexie hydration
//      + 100ms settle. After fresh-start / silent-pull decisions, a 5-second
//      Dexie hook watches for late player writes and re-evaluates once.

import { useCallback, useEffect, useRef, useState } from 'react'
import { getDB } from '@study-rpg/core'
import { getSupabase } from '../auth/client'
import { useAuth } from '../auth/AuthContext'
import { createSyncEngine } from './engine'
import { ONE_STAGE_ADAPTERS } from './tables'
import {
  cloudHasAnyRows,
  computeGateState,
  getMaxLocalUpdatedAt,
  hasNonDefaultLocalState,
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
import {
  applyResetPropagationIfNeeded,
  fetchCloudResetTimestamp,
  writeLocalAckResetAt,
} from './reset-propagation'
import { registerSyncMetadataGetter } from '../../services/sync-metadata'
import type {
  EngineDiagnosticSnapshot,
  SyncEngine,
  SyncErrorRecord,
  SyncStatus,
} from './types'

const DEBOUNCE_MS = Number(import.meta.env.VITE_SYNC_DEBOUNCE_MS) || 3000

// Rollback safety env flag — set VITE_ACCOUNT_SWITCH_DETECTOR=false to bypass
// account-switch detection entirely (returns to pre-fix behavior).
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
  /** First error in the latest failed op (for display + retry). */
  record: SyncErrorRecord
  /** How many consecutive op-level failures (≥ 2 by definition when toast fires). */
  consecutive: number
  /** UI key — unique per toast event so React doesn't dedupe across distinct fires. */
  id: string
}

export interface UseSyncReturn {
  status: SyncStatus
  lastPushAt: number | null
  lastPullAt: number | null
  /** Current migration gate state (drives modal rendering in App.tsx). */
  gateState: MigrationGateState
  /** Cloud + local timestamps for the conflict chooser modal. */
  gateSnapshot: GateSnapshot | null
  /** Non-null iff account-switch detected — caller renders AccountSwitchPrompt. */
  accountSwitch: AccountSwitchInfo | null
  /** Non-null iff sync has failed ≥ 2 consecutive times — caller renders SyncErrorToast. */
  syncError: SyncErrorToastInfo | null
  /** Handler invoked by MigrationUploadPrompt. */
  resolveUploadPrompt: (choice: UploadChoice) => Promise<void>
  /** Handler invoked by ConflictChooserModal. */
  resolveConflictChooser: (choice: ConflictChoice) => Promise<void>
  /** Handler invoked by AccountSwitchPrompt. */
  resolveAccountSwitch: (choice: AccountSwitchChoice) => Promise<void>
  /**
   * Settings UI entry: re-render the conflict chooser with fresh timestamps.
   * Only meaningful when current state is `paused`. Engine stays paused.
   */
  reopenConflictChooser: () => Promise<void>
  /**
   * Settings UI entry: clear all persisted migration preferences for current
   * user (choice + paused flag) and re-run gate detection.
   */
  resetMigrationPreference: () => Promise<void>
  /** Force a manual push (Settings / SyncStatusChip popover). */
  forcePush: () => Promise<void>
  /** Force a manual pull (Settings / SyncStatusChip popover). */
  forcePull: () => Promise<void>
  /** Engine diagnostic snapshot for bug-report sync_metadata + DEV introspection. */
  getEngineDiagnostic: () => Promise<EngineDiagnosticSnapshot | null>
  /** Dismiss the sync error toast (auto-dismiss after 10s also clears). */
  dismissSyncError: () => void
  /** Retry the last failed op + dismiss toast. */
  retrySyncError: () => Promise<void>
  /**
   * Sign out, but first await any pending dirty writes via pushAllNow()
   * so the cloud row state matches local before engine teardown
   * (fix-account-switch-data-loss C2a). Best-effort flush — push failure
   * does NOT block sign-out.
   */
  signOutWithFlush: () => Promise<void>
  /**
   * 「切換帳號」 menu action: pushAllNow → snapshotLocalToBackup →
   * clearLocalSyncTables → signOut → signInWithGoogle. All five steps
   * run in order; per-step failures are logged but do NOT abort the
   * flow (the wipe must happen so the next sign-in is from clean state).
   */
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
  // Bump to force the gate-compute effect to re-run after the user resolves
  // an account-switch prompt (auth deps haven't changed).
  const [resolveTick, setResolveTick] = useState(0)
  // Same error message within 60s is suppressed (toast debounce).
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

  // Engine lifecycle + gate computation
  useEffect(() => {
    const supabase = getSupabase()
    if (!supabase) {
      setGateState('fresh-start') // auth disabled → no modal needed
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

    // Cleanup handles for the 5s re-eval watcher.
    let reEvalWatchActive = false
    let reEvalDebounceTimer: ReturnType<typeof setTimeout> | null = null
    let reEvalWindowTimer: ReturnType<typeof setTimeout> | null = null
    let reEvalHookFn: ((primKey: unknown, obj: unknown) => void) | null = null

    function cancelReEval(): void {
      reEvalWatchActive = false
      if (reEvalDebounceTimer) clearTimeout(reEvalDebounceTimer)
      if (reEvalWindowTimer) clearTimeout(reEvalWindowTimer)
      const db = getDB()
      if (reEvalHookFn) {
        try {
          ;(db.players.hook('creating') as { unsubscribe: (fn: unknown) => void }).unsubscribe(
            reEvalHookFn,
          )
        } catch {
          // Dexie unsubscribe may throw if already torn down — ignore.
        }
        reEvalHookFn = null
      }
    }

    ;(async () => {
      try {
        const db = getDB()
        devLog('[sync.gate]', { phase: 'compute-start', userId: user.id })

        // ─── Account-switch detection (Bug 2) ────────────────────────
        if (ACCOUNT_SWITCH_DETECTOR_ENABLED) {
          const lastUid = await getLastSignedInUserId(db)
          if (lastUid && lastUid !== user.id) {
            // Different account previously signed in; check if local has
            // anything worth flagging (empty local = no risk, just proceed).
            const hasLocal = await hasNonDefaultLocalState(db)
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
              return // Wait for resolveAccountSwitch() to set resolveTick.
            }
          }
        }

        // No account-switch → record current as last-signed-in, then gate.
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
            db: getDB(),
            adapters: ONE_STAGE_ADAPTERS,
            debounceMs: DEBOUNCE_MS,
            onConsecutiveFailure: handleConsecutiveFailure,
            r2BundleName: 'm1',
          })
        }
        if (needsModal) engineRef.current.pause()
        engineRef.current.start(user.id)

        if (DEV) {
          ;(globalThis as { __sync?: SyncEngine }).__sync = engineRef.current
          ;(globalThis as { __db?: unknown }).__db = getDB()
        }

        // ─── Post-decision re-eval watcher (Bug 1) ────────────────────
        // If the decision was "no local data", install a brief watcher; if
        // a player write lands shortly after (slow hydration race), re-run
        // the gate once.
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
                  // If new state needs a modal, ensure engine is paused.
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
                console.warn('[sync] re-eval failed', err)
              }
              cancelReEval()
            }, RE_EVAL_DEBOUNCE_MS)
          }
          db.players.hook('creating', reEvalHookFn)
          reEvalWindowTimer = setTimeout(() => {
            if (reEvalWatchActive) {
              devLog('[sync.gate]', { phase: 're-eval-window-elapsed' })
            }
            cancelReEval()
          }, RE_EVAL_WINDOW_MS)
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
      cancelReEval()
    }
  }, [authStatus, user, resolveTick])

  // Hard stop on unmount.
  useEffect(() => {
    return () => {
      engineRef.current?.stop()
      engineRef.current = null
    }
  }, [])

  // Register a metadata getter so services/bug-report.ts can grab the
  // engine snapshot at submit time without re-running useSync (which
  // would spawn a duplicate engine).
  useEffect(() => {
    registerSyncMetadataGetter(async () => {
      const eng = engineRef.current
      const engSnap = eng ? await eng.getDiagnosticSnapshot() : null
      const lastSignedInUserId = await getLastSignedInUserId(getDB()).catch(() => null)
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

  /** Handle AccountSwitchPrompt user choice. */
  const resolveAccountSwitch = useCallback(
    async (choice: AccountSwitchChoice): Promise<void> => {
      const supabase = getSupabase()
      if (!supabase || !user) return
      const db = getDB()

      if (choice === 'signout') {
        await supabase.auth.signOut()
        setAccountSwitch(null)
        return
      }
      if (choice === 'clear-local') {
        // Snapshot local under the PREVIOUS user's id BEFORE we wipe — gives
        // a recoverable record if the previous user had unpushed writes
        // (fix-account-switch-data-loss C2b). The localBackup table is
        // append-only and shared across all sync flows.
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
          // continue anyway — wipe must proceed so the new sign-in starts clean
        }
        // Tear down engine first so its hooks don't observe the bulk clear.
        engineRef.current?.stop()
        engineRef.current = null
        await clearLocalSyncTables(db)
      }
      // For both 'clear-local' and 'keep-local': record the new current user
      // as last-signed-in so the next effect tick doesn't re-fire the prompt.
      await setLastSignedInUserId(db, user.id)
      setAccountSwitch(null)
      // Force the gate-compute effect to re-run (auth deps unchanged).
      setResolveTick((t) => t + 1)
    },
    [user],
  )

  /** Handle MigrationUploadPrompt user choice. */
  const resolveUploadPrompt = useCallback(
    async (choice: UploadChoice): Promise<void> => {
      const supabase = getSupabase()
      const engine = engineRef.current
      if (!supabase || !user) return

      const db = getDB()
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
        await applyResetPropagationIfNeeded(supabase, user.id, getDB())
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
      console.warn('[sync] manual retry failed', err)
    }
  }, [])

  const signOutWithFlush = useCallback(async (): Promise<void> => {
    // Best-effort flush — push failure does NOT block sign-out
    // (fix-account-switch-data-loss C2a). User can sign out even when offline;
    // dirty rows remain in local IndexedDB for next sign-in's cold-start
    // force-pull to reconcile with cloud state.
    const e = engineRef.current
    if (e) {
      try {
        await e.pushAllNow()
      } catch (err) {
        console.warn('[sync] flush before signOut failed (continuing)', err)
      }
    }
    await authSignOut()
  }, [authSignOut])

  const safeAccountSwitch = useCallback(async (): Promise<void> => {
    // 「切換帳號」 menu: flush → snapshot → clear → signOut → re-open sign-in
    // (fix-account-switch-data-loss C2b). All five steps run in order
    // regardless of individual failures — the wipe must complete so the
    // next sign-in starts from a clean slate.
    const e = engineRef.current
    const db = getDB()
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
    // Abort on cloud-delete error so local + cloud both retain pre-reset state
    // (next sync re-uploads). See design.md decisions 1 + 2.
    const supabase = getSupabase()
    if (!supabase || !user) {
      throw new Error('未登入或雲端同步未啟用')
    }
    const db = getDB()

    await snapshotLocalToBackup(db, user.id, 'reset-account-data')

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
