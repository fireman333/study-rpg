// SyncEngine — wraps pushBundle/pullBundle with debounce + state machine.
//
// Pure R2 mode (no Supabase dual-write transitional phase per design D4).
// Caller registers onPullComplete to wire the triple-backfill hook (D5).

import type { SupabaseClient } from '@supabase/supabase-js'
import type { User } from '@supabase/supabase-js'
import type { NeuronsDB } from '../db'
import { pullBundle, pushBundleSerialized, type PullBundleResult } from './r2/engine-r2'

export type SyncState = 'idle' | 'pushing' | 'pulling' | 'paused' | 'error'

// S3 (port-neurons-r2-single-flight-push): the FIRST push after cold start waits
// (bounded) for the startup force-pull to warm the ETag cache. 8s guard so a
// hung pull never blocks pushes permanently.
const STARTUP_PULL_AWAIT_MS = 8000

// Phase 1 (eliminate-cross-device-r2-412-storm): a cross-device 412 resolves to
// a DEFERRED push — a normal converging backoff, not an error — so the light
// stays idle and re-arms on the next (jittered) debounce. But after this many
// CONSECUTIVE defers with no success, surface an error so a pathologically
// non-converging multi-device writer isn't silent. One success resets the streak.
const MAX_CONSECUTIVE_DEFERS = 5

// ±jitter fraction on the debounce timer so two devices whose timers would fire
// together de-synchronize and stop re-colliding on the same R2 object.
const DEBOUNCE_JITTER = 0.3

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

export interface SyncStatus {
  state: SyncState
  lastPushAt: number | null
  lastPullAt: number | null
  lastError: string | null
}

export interface SyncEngineOpts {
  supabase: SupabaseClient
  db: NeuronsDB
  user: User
  debounceMs?: number
  onPullComplete?: (result: PullBundleResult) => void | Promise<void>
  onPushComplete?: () => void | Promise<void>
}

export class SyncEngine {
  private readonly supabase: SupabaseClient
  private readonly db: NeuronsDB
  private readonly user: User
  private readonly debounceMs: number
  private readonly onPullComplete?: (result: PullBundleResult) => void | Promise<void>
  private readonly onPushComplete?: () => void | Promise<void>

  private state: SyncState = 'idle'
  private lastPushAt: number | null = null
  private lastPullAt: number | null = null
  private lastError: string | null = null
  private pushTimer: ReturnType<typeof setTimeout> | null = null
  private pending = false
  // Consecutive deferred (cross-device 412) pushes since the last success — see
  // MAX_CONSECUTIVE_DEFERS. Reset to 0 on any landed push or hard error.
  private consecutiveDefers = 0
  // Retained cold-start force-pull promise (S3). The first push awaits it
  // (bounded) before its PUT; nulled after so only the first push waits.
  private startupForcePull: Promise<void> | null = null

  constructor(opts: SyncEngineOpts) {
    this.supabase = opts.supabase
    this.db = opts.db
    this.user = opts.user
    this.debounceMs = opts.debounceMs ?? 3000
    this.onPullComplete = opts.onPullComplete
    this.onPushComplete = opts.onPushComplete
  }

  getStatus(): SyncStatus {
    return {
      state: this.state,
      lastPushAt: this.lastPushAt,
      lastPullAt: this.lastPullAt,
      lastError: this.lastError,
    }
  }

  getUserId(): string {
    return this.user.id
  }

  schedulePush(): void {
    if (this.state === 'paused') return
    this.pending = true
    if (this.pushTimer) clearTimeout(this.pushTimer)
    // ±jitter so concurrent devices that would fire together de-synchronize.
    const base = this.debounceMs
    const delay = Math.max(0, base + (Math.random() * 2 - 1) * base * DEBOUNCE_JITTER)
    this.pushTimer = setTimeout(() => {
      this.pushTimer = null
      void this.pushNow()
    }, delay)
  }

  /**
   * Kick the cold-start force-pull and retain it so the FIRST push can await it
   * (bounded) — S3. Warms the ETag cache before the first push so it sends
   * `If-Match` instead of the guaranteed empty-cache `If-None-Match:*` cold-start
   * 412. Assigns synchronously (before any await) so a Dexie-hook-triggered first
   * push always observes a non-null promise. Never rejects (a failed warm-up must
   * not break pushes; `pullNow` records its own error / state).
   */
  beginStartupForcePull(): Promise<PullBundleResult | null> {
    const p = this.pullNow({ force: true })
    // Void view retained for the first push to await (bounded); nulled after.
    this.startupForcePull = p.then(() => {}).catch(() => {})
    // Result view so the caller can tell whether the startup pull DEFINITIVELY
    // read cloud state (non-null: applied / notModified / blobMissing) vs errored
    // (null) — used to bound the one-shot anonymous-adoption cloud-wins window.
    return p
  }

  async pushNow(): Promise<void> {
    if (this.state === 'paused') return
    if (!this.pending && this.state === 'pushing') return
    this.pending = false
    // The debounce timer (if any) has fired or is being superseded — clear the
    // ref so a deferred re-arm starts a clean timer.
    if (this.pushTimer) {
      clearTimeout(this.pushTimer)
      this.pushTimer = null
    }

    // S3: the FIRST push after cold start waits for the startup force-pull to
    // warm the ETag cache. Awaited BEFORE the lock (inside pushBundleSerialized)
    // so a tab never holds the lock while waiting on a pull; bounded by a
    // timeout; only the first push waits (startupForcePull is nulled after).
    if (this.startupForcePull) {
      await Promise.race([this.startupForcePull, sleep(STARTUP_PULL_AWAIT_MS)])
      this.startupForcePull = null
    }

    this.state = 'pushing'
    try {
      // S1/S2: serialize the R2 push per user across same-tab overlaps AND
      // concurrent tabs, using the freshest persisted ETag. Phase 1: a
      // cross-device 412 resolves to a deferred outcome (not a throw).
      const result = await pushBundleSerialized(this.supabase, this.db, this.user.id, {
        deferOnConflict: true,
        // A 412/409/428 recovery pull inside pushBundle used to bypass
        // onPullComplete entirely, so the LWW/MAX backfill families never
        // reconciled the recovery snapshot — the deferred re-push then clobbered
        // newer cloud LWW values with stale local state (e.g. a rescue
        // `plan: null` abandoned on another device resurrected). Thread the same
        // hook the normal pull path (pullNow) fires.
        onRecoveryPull: async (pull) => {
          await this.onPullComplete?.(pull)
        },
      })

      if (result.status === 'deferred') {
        // The push did NOT land. CRITICAL: do not set lastPushAt and do not fire
        // onPushComplete — that would falsely upsert the leaderboard for a push
        // that never succeeded. Keep the state dirty and re-arm on the jittered
        // debounce; only surface an error after a sustained non-converging streak.
        this.consecutiveDefers += 1
        this.pending = true
        if (this.consecutiveDefers >= MAX_CONSECUTIVE_DEFERS) {
          this.state = 'error'
          this.lastError = 'sync_deferred_concurrent_writer'
        } else {
          this.state = 'idle'
          this.lastError = null
        }
        this.schedulePush()
        return
      }

      this.consecutiveDefers = 0
      this.lastPushAt = Date.now()
      this.state = 'idle'
      this.lastError = null
      try {
        await this.onPushComplete?.()
      } catch (err) {
        console.warn('[sync] onPushComplete failed', err)
      }
    } catch (err) {
      this.consecutiveDefers = 0
      this.lastError = (err as { message?: string })?.message ?? 'unknown'
      this.state = 'error'
      console.warn('[sync] push failed', err)
    }
  }

  async pullNow(opts?: { force?: boolean }): Promise<PullBundleResult | null> {
    if (this.state === 'paused') return null
    this.state = 'pulling'
    try {
      const result = await pullBundle(this.supabase, this.db, this.user.id, {
        conditional: !opts?.force,
        force: opts?.force,
      })
      this.lastPullAt = Date.now()
      this.state = 'idle'
      this.lastError = null

      // Only fire the backfill hook when something actually changed locally
      // (applied !== null && not notModified && not blobMissing).
      if (result.applied && !result.notModified && !result.blobMissing) {
        try {
          await this.onPullComplete?.(result)
        } catch (err) {
          console.warn('[sync] onPullComplete failed', err)
        }
      }
      // Returned so callers can distinguish a definitive cloud read (applied /
      // notModified / blobMissing) from an error (null) — see beginStartupForcePull.
      return result
    } catch (err) {
      this.lastError = (err as { message?: string })?.message ?? 'unknown'
      this.state = 'error'
      console.warn('[sync] pull failed', err)
      return null
    }
  }

  pause(): void {
    this.state = 'paused'
    if (this.pushTimer) {
      clearTimeout(this.pushTimer)
      this.pushTimer = null
    }
  }

  resume(): void {
    if (this.state === 'paused') this.state = 'idle'
  }

  dispose(): void {
    if (this.pushTimer) {
      clearTimeout(this.pushTimer)
      this.pushTimer = null
    }
    this.startupForcePull = null
  }
}

export function createSyncEngine(opts: SyncEngineOpts): SyncEngine {
  return new SyncEngine(opts)
}
