// SyncEngine — wraps pushBundle/pullBundle with debounce + state machine.
//
// Pure R2 mode (no Supabase dual-write transitional phase per design D4).
// Caller registers onPullComplete to wire the triple-backfill hook (D5).

import type { SupabaseClient } from '@supabase/supabase-js'
import type { User } from '@supabase/supabase-js'
import type { NeuronsDB } from '../db'
import { pullBundle, pushBundleSerialized, type PullBundleResult } from './r2/engine-r2'
import { signalSchemaDowngradeReload, signalSyncStallReload } from './sync-reload-signal'

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

// Presign-429 cooldown (r2-worker-health-check 2026-07-14): the Worker
// rate-limits PUT presigns per (user, bundle) and answers 429. Without a
// client-side cooldown, the next Dexie write re-armed the ~12s debounce and
// slammed the limiter again — 88% of the 07-13 Worker requests were wasted 429
// retries. On a presign 429 the engine now raises a push horizon of
// max(server Retry-After, BASE × 2^(streak-1)) capped at MAX; schedulePush()
// floors its timer to the horizon and pushNow() re-arms instead of hitting
// /presign before it. The streak resets on any landed push or deferred
// outcome (both prove /presign answered 200 again).
const RATE_LIMIT_COOLDOWN_BASE_MS = 60_000
const RATE_LIMIT_COOLDOWN_MAX_MS = 300_000

// Deferred (cross-device 412) exponential back-off, ported from 二階's engine
// (harden-safari-visibility-sync-throttle D2): a known-conflicting bundle is
// not re-PUT on every ~12s debounce — 60s → 300s keyed on consecutiveDefers,
// ±DEBOUNCE_JITTER on the delay itself so two colliding devices whose streaks
// match still de-synchronize. Reset on any landed push or hard error.
const DEFERRED_RETRY_BASE_MS = 60_000
const DEFERRED_RETRY_MAX_MS = 300_000

// After this many CONSECUTIVE presign 429s OR deferred pushes, fire the
// one-shot reload prompt (sync-reload-signal, reason 'sync-stall'): a tab this
// stuck is most plausibly a stale cached bundle whose retry cadence predates
// the back-off rules above — a reload upgrades it to the current client.
// Advisory only; the back-off keeps the request rate bounded either way.
const RELOAD_PROMPT_STREAK = 8

// Extract the Retry-After hint (seconds) that r2/client.ts embeds into the
// presign_failed_429 message (`retry_after=<sec>`) — survives the
// `r2_push_exhausted: …` wrapping because only the message string carries it.
// 0 when absent (header not CORS-exposed today). Guarded to a positive SAFE
// integer so a malformed / absurdly-large token can never push the horizon to
// Infinity (which would silence sync forever, stranding data in Dexie); the
// caller additionally clamps the result to RATE_LIMIT_COOLDOWN_MAX_MS.
function parseRetryAfterMs(msg: string): number {
  const m = /retry_after=(\d+)/.exec(msg)
  if (!m) return 0
  const sec = Number(m[1])
  if (!Number.isSafeInteger(sec) || sec <= 0) return 0
  return sec * 1000
}

// Per-user retry-backoff state, hoisted to MODULE level so it survives the
// engine's dispose+recreate on every Supabase token refresh (~hourly):
// AuthContext hands useSync a fresh `user` object reference each
// onAuthStateChange, and useSync's effect deps include `user`, so the engine
// remounts. Instance fields would reset the cooldown / streaks every hour —
// exactly the stuck-tab the 429 storm is about. Keyed by userId so a different
// account gets fresh state (no cross-account cooldown leak). dispose() clears
// only the instance timer, never this map (retention IS the point).
interface RetryBackoffState {
  // Consecutive deferred (cross-device 412) pushes since the last non-defer
  // cycle. Reset to 0 on any landed push or hard error.
  consecutiveDefers: number
  // Consecutive presign-429 hard errors since the last proof the limiter is not
  // throttling us (a landed push, a deferred outcome, OR any non-429 hard
  // error). Drives the exponential 429 cooldown + the reload prompt.
  rateLimit429Streak: number
  // Earliest time the next push may hit /presign. Raised by the 429 cooldown
  // and the deferred back-off. 0 = no restriction.
  nextPushNotBeforeAt: number
}

const retryBackoffByUser = new Map<string, RetryBackoffState>()

function getRetryBackoffState(userId: string): RetryBackoffState {
  let s = retryBackoffByUser.get(userId)
  if (!s) {
    s = { consecutiveDefers: 0, rateLimit429Streak: 0, nextPushNotBeforeAt: 0 }
    retryBackoffByUser.set(userId, s)
  }
  return s
}

/** Test hook — clear all per-user retry-backoff state (module-level, so it
 *  otherwise persists across engine instances within a test file). */
export function __resetRetryBackoffForTests(): void {
  retryBackoffByUser.clear()
}

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
  // Set by dispose(). A continuation that resumes after an await (the startup
  // pull, or an in-flight push round-trip) re-checks this and bails, so a stale
  // engine torn down mid-flight on a token-refresh remount cannot send a
  // redundant /presign or clobber the shared module-level backoff record that a
  // newer engine (same userId) has since taken over (remount-overlap guard).
  private disposed = false
  // Retry-backoff counters (consecutiveDefers / rateLimit429Streak /
  // nextPushNotBeforeAt) live in a MODULE-level per-user record so a
  // token-refresh remount doesn't reset the cooldown — see RetryBackoffState.
  // Held by reference; every read/write goes through this.backoff.*.
  private readonly backoff: RetryBackoffState
  // Retained cold-start force-pull promise (S3). The first push awaits it
  // (bounded) before its PUT; nulled after so only the first push waits.
  private startupForcePull: Promise<void> | null = null

  constructor(opts: SyncEngineOpts) {
    this.supabase = opts.supabase
    this.db = opts.db
    this.user = opts.user
    this.backoff = getRetryBackoffState(opts.user.id)
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
    if (this.disposed) return
    if (this.state === 'paused') return
    this.pending = true
    if (this.pushTimer) clearTimeout(this.pushTimer)
    // ±jitter so concurrent devices that would fire together de-synchronize.
    const base = this.debounceMs
    const jittered = Math.max(0, base + (Math.random() * 2 - 1) * base * DEBOUNCE_JITTER)
    // Floor to the 429-cooldown / deferred-back-off horizon so a Dexie write
    // during a cooldown re-arms to the horizon instead of re-hitting /presign
    // on the plain debounce cadence.
    const delay = Math.max(jittered, this.backoff.nextPushNotBeforeAt - Date.now())
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
    if (this.disposed) return
    if (this.state === 'paused') return
    if (!this.pending && this.state === 'pushing') return
    // 429-cooldown / deferred-back-off gate: never hit /presign before the
    // horizon — re-arm to it instead (the write stays in Dexie, nothing is
    // lost). Applies to every caller (timer, beforeunload flush, manual sync):
    // re-PUTting a throttled or known-conflicting bundle early only burns
    // Worker quota (mirrors 二階's D2, which backs off even the page-exit flush).
    if (Date.now() < this.backoff.nextPushNotBeforeAt) {
      this.pending = true
      this.schedulePush()
      return
    }
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

    // Remount-overlap guard (Codex NO-GO fix): the startup await can span a
    // token-refresh remount. Re-check BEFORE acquiring the push lock / hitting
    // /presign — this is where the race lives (the await is the only suspension
    // point before the network call).
    //  (a) disposed: this engine was torn down while awaiting → don't send.
    //  (b) horizon: a newer engine sharing this user's module-level backoff
    //      record may have set a cooldown during the await → re-gate (a live
    //      engine re-arms; a disposed one already returned at (a)). Without this
    //      a disposed E1 could still send a presign that E2's cooldown forbids.
    if (this.disposed) return
    if (Date.now() < this.backoff.nextPushNotBeforeAt) {
      this.pending = true
      this.schedulePush()
      return
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

      // Remount-overlap guard (post-round-trip): if this engine was disposed
      // while the presign/PUT was in flight, do NOT touch the SHARED
      // module-level backoff record (a landed-push reset would zero a newer
      // engine's cooldown) and do NOT fire onPushComplete / set lastPushAt. If
      // the PUT actually landed, the data is already on R2 and the live engine
      // converges on its own schedule — a torn-down tab must not write shared
      // state. onRecoveryPull already ran inside pushBundleSerialized (harmless
      // LWW merge into the shared Dexie), so invariant 1 is unaffected.
      if (this.disposed) return

      if (result.status === 'deferred') {
        // The push did NOT land. CRITICAL: do not set lastPushAt and do not fire
        // onPushComplete — that would falsely upsert the leaderboard for a push
        // that never succeeded. Keep the state dirty and re-arm; only surface an
        // error after a sustained non-converging streak.
        this.backoff.consecutiveDefers += 1
        // A deferred outcome means /presign answered 200 — the rate limiter is
        // not throttling us; reset the 429 streak (symmetric with the landed-
        // push reset).
        this.backoff.rateLimit429Streak = 0
        this.pending = true
        // Exponential back-off (60s→300s, jittered) before the next re-PUT of a
        // known-conflicting bundle — the fixed ~12s jittered debounce alone
        // re-collided every cycle (ported from 二階 D2).
        const backoff = Math.min(
          DEFERRED_RETRY_MAX_MS,
          DEFERRED_RETRY_BASE_MS * 2 ** Math.max(0, this.backoff.consecutiveDefers - 1),
        )
        this.backoff.nextPushNotBeforeAt =
          Date.now() + Math.max(0, backoff + (Math.random() * 2 - 1) * backoff * DEBOUNCE_JITTER)
        if (this.backoff.consecutiveDefers >= MAX_CONSECUTIVE_DEFERS) {
          this.state = 'error'
          this.lastError = 'sync_deferred_concurrent_writer'
        } else {
          this.state = 'idle'
          this.lastError = null
        }
        // A tab stuck deferring this long is most plausibly a stale cached
        // bundle — offer the one-shot reload (no-op after the first fire).
        if (this.backoff.consecutiveDefers >= RELOAD_PROMPT_STREAK) signalSyncStallReload()
        this.schedulePush()
        return
      }

      this.backoff.consecutiveDefers = 0
      this.backoff.rateLimit429Streak = 0
      this.backoff.nextPushNotBeforeAt = 0
      this.lastPushAt = Date.now()
      this.state = 'idle'
      this.lastError = null
      try {
        await this.onPushComplete?.()
      } catch (err) {
        console.warn('[sync] onPushComplete failed', err)
      }
    } catch (err) {
      this.backoff.consecutiveDefers = 0
      const msg = (err as { message?: string })?.message ?? 'unknown'
      this.lastError = msg
      this.state = 'error'
      // Stale-tab schema-downgrade (a v(n-1) build pushing over a v(n) cloud
      // blob → presign 409): surface a one-time reload prompt so the heavy
      // per-tap 409 stream stops at the source. The error stays in lastError so
      // the sync light remains 🔴 until the reload (design D4).
      if (msg.includes('r2_schema_downgrade_refused_by_server')) {
        // Mutually exclusive with 429 (client.ts throws 409 before 429) and the
        // tab is dead until reload, so the 429 streak is intentionally left as-is.
        signalSchemaDowngradeReload()
      } else if (msg.includes('presign_failed_429')) {
        // Worker presign rate limiter said stop — enter a cooldown instead of
        // letting the next Dexie write re-arm the ~12s debounce into a 429 loop
        // (88% of the 07-13 Worker load). Cooldown = clamp(max(server
        // Retry-After, exponential 60s→300s on the consecutive-429 streak),
        // RATE_LIMIT_COOLDOWN_MAX_MS) — the CAP guards against an oversized (but
        // parseRetryAfterMs-sanitized) hint stranding the push forever. The
        // state stays dirty (schedulePush) and re-arms to the cooldown end.
        this.backoff.rateLimit429Streak += 1
        const backoff = Math.min(
          RATE_LIMIT_COOLDOWN_MAX_MS,
          RATE_LIMIT_COOLDOWN_BASE_MS * 2 ** Math.max(0, this.backoff.rateLimit429Streak - 1),
        )
        const cooldown = Math.min(
          RATE_LIMIT_COOLDOWN_MAX_MS,
          Math.max(parseRetryAfterMs(msg), backoff),
        )
        this.backoff.nextPushNotBeforeAt = Date.now() + cooldown
        // A tab still throttled after this many spaced-out attempts is most
        // plausibly a stale cached bundle — offer the one-shot reload.
        if (this.backoff.rateLimit429Streak >= RELOAD_PROMPT_STREAK) signalSyncStallReload()
        this.schedulePush()
      } else {
        // A non-429, non-schema hard error (R2 PUT 500, presign 401/403, network
        // blip) proves THIS cycle was not a rate-limit throttle — reset the 429
        // streak so it only ever counts CONSECUTIVE 429s (otherwise a 500 dropped
        // between 429s would let the next 429 be miscounted, inflating the
        // cooldown / prematurely tripping the reload prompt). No cooldown is set
        // for these — a network blip should retry on the normal debounce.
        this.backoff.rateLimit429Streak = 0
      }
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
    // Invalidate any in-flight continuation (startup await / push round-trip)
    // so it bails before sending a presign or writing the SHARED backoff record
    // (remount-overlap guard). Deliberately does NOT clear the module-level
    // retryBackoffByUser entry — cooldown retention across a token-refresh
    // remount is the whole point of修正 2.
    this.disposed = true
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
