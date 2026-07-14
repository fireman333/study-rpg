/**
 * Presign-429 cooldown + deferred (412) exponential back-off + sustained-stall
 * reload prompt (r2-worker-health-check 2026-07-14).
 *
 * Background: the Worker rate-limits PUT presigns and answers 429. The old
 * engine treated 429 as a plain hard error — the next Dexie write re-armed the
 * ~12s debounce and slammed the limiter again, so 88% of the 07-13 Worker
 * requests were wasted 429 retries. These tests lock the fix:
 *   1. a presign 429 raises a push horizon of max(Retry-After, 60s×2^(streak-1))
 *      capped at 300s, during which pushNow never reaches the transport;
 *   2. a deferred (cross-device 412) push backs off exponentially (60s→300s,
 *      ±30% jitter) instead of re-colliding on the fixed debounce;
 *   3. a sustained streak (≥8 consecutive 429s or defers) fires the one-shot
 *      reload prompt with the neutral 'sync-stall' reason, while the original
 *      schema-downgrade 409 path keeps its 'schema-downgrade' reason;
 *   4. any landed push (and, for the 429 streak, any deferred outcome — proof
 *      /presign answered 200) resets the counters and clears the horizon.
 *
 * engine-r2 is module-mocked so we drive pushBundleSerialized's outcome
 * directly; the clock is a mocked Date.now so cooldowns are stepped precisely.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const pushBundleSerialized = vi.fn()
const pullBundle = vi.fn()

vi.mock('../lib/sync/r2/engine-r2', () => ({
  pushBundleSerialized: (...args: unknown[]) => pushBundleSerialized(...args),
  pullBundle: (...args: unknown[]) => pullBundle(...args),
}))

import {
  createSyncEngine,
  __resetRetryBackoffForTests,
  type SyncEngine,
} from '../lib/sync/engine'
import {
  __resetSchemaDowngradeReloadForTests,
  getSyncReloadReason,
  shouldShowSchemaDowngradeReload,
} from '../lib/sync/sync-reload-signal'

const fakeSupabase = {} as never
const fakeDb = {} as never
const fakeUser = { id: 'u1' } as never

const DEFERRED = { status: 'deferred', reason: 'concurrent-writer', attempts: 1 }
const PUSHED = { status: 'pushed', etag: '"E1"', bytes: 3, attempts: 1 }
// Realistic wrapped form: client.ts throws `presign_failed_429: …`, engine-r2's
// exhausted tail wraps it into `r2_push_exhausted: …` — only the message string
// reaches the engine, so the matcher + retry_after parsing work on it.
const ERR_429 = () =>
  new Error('r2_push_exhausted: presign_failed_429: {"error":"rate_limited","bundle":"neurons"}')
const ERR_429_RETRY_AFTER = (sec: number) =>
  new Error(`r2_push_exhausted: presign_failed_429: retry_after=${sec} {"error":"rate_limited"}`)

// Worst-case horizon (300s cap × 1.3 jitter) — advancing past this always
// clears any cooldown / back-off.
const PAST_ANY_BACKOFF_MS = 400_000

let now = 0
let dateNowSpy: ReturnType<typeof vi.spyOn> | null = null

function makeEngine(hooks?: {
  onPushComplete?: () => void | Promise<void>
  onPullComplete?: (r: unknown) => void | Promise<void>
}): SyncEngine {
  const engine = makeRealTimerEngine(hooks)
  // Isolate pushNow's horizon logic from the real (jittered) timer re-arm.
  vi.spyOn(engine, 'schedulePush').mockImplementation(() => {})
  return engine
}

// Same engine but WITHOUT the schedulePush spy — used by the fake-timer test so
// the real re-arm floor (schedulePush's max(jittered, horizon-now)) is exercised.
function makeRealTimerEngine(hooks?: {
  onPushComplete?: () => void | Promise<void>
  onPullComplete?: (r: unknown) => void | Promise<void>
}): SyncEngine {
  return createSyncEngine({
    supabase: fakeSupabase,
    db: fakeDb,
    user: fakeUser,
    onPushComplete: hooks?.onPushComplete,
    onPullComplete: hooks?.onPullComplete,
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  __resetSchemaDowngradeReloadForTests()
  __resetRetryBackoffForTests()
  now = 1_750_000_000_000
  dateNowSpy = vi.spyOn(Date, 'now').mockImplementation(() => now)
})

describe('SyncEngine.pushNow — presign-429 cooldown', () => {
  it('a 429 enters error state and gates the next push until the 60s base cooldown', async () => {
    pushBundleSerialized.mockRejectedValue(ERR_429())
    const engine = makeEngine()

    await engine.pushNow()
    const s = engine.getStatus()
    expect(s.state).toBe('error')
    expect(s.lastError).toContain('presign_failed_429')
    expect(engine.schedulePush).toHaveBeenCalled() // stays dirty, re-armed to the horizon
    expect(pushBundleSerialized).toHaveBeenCalledTimes(1)

    // Inside the cooldown: pushNow must NOT reach the transport (no /presign).
    now += 30_000
    await engine.pushNow()
    expect(pushBundleSerialized).toHaveBeenCalledTimes(1)

    // Past the cooldown: the retry goes through.
    now += 31_000 // t = +61s
    pushBundleSerialized.mockResolvedValue(PUSHED)
    await engine.pushNow()
    expect(pushBundleSerialized).toHaveBeenCalledTimes(2)
    expect(engine.getStatus().state).toBe('idle')
  })

  it('honors a server Retry-After larger than the base cooldown', async () => {
    pushBundleSerialized.mockRejectedValue(ERR_429_RETRY_AFTER(120))
    const engine = makeEngine()
    await engine.pushNow()

    now += 90_000 // past the 60s base but inside Retry-After=120s
    await engine.pushNow()
    expect(pushBundleSerialized).toHaveBeenCalledTimes(1)

    now += 31_000 // t = +121s
    await engine.pushNow()
    expect(pushBundleSerialized).toHaveBeenCalledTimes(2)
  })

  it('consecutive 429s escalate the cooldown exponentially (60s → 120s)', async () => {
    pushBundleSerialized.mockRejectedValue(ERR_429())
    const engine = makeEngine()

    await engine.pushNow() // streak 1 → 60s
    now += 61_000
    await engine.pushNow() // streak 2 → 120s
    expect(pushBundleSerialized).toHaveBeenCalledTimes(2)

    now += 90_000 // inside the 120s cooldown
    await engine.pushNow()
    expect(pushBundleSerialized).toHaveBeenCalledTimes(2)

    now += 31_000 // t = +121s after the 2nd 429
    await engine.pushNow()
    expect(pushBundleSerialized).toHaveBeenCalledTimes(3)
  })

  it('a landed push clears the cooldown and resets the 429 streak to the base', async () => {
    const engine = makeEngine()
    pushBundleSerialized.mockRejectedValue(ERR_429())
    await engine.pushNow() // streak 1
    now += 61_000

    pushBundleSerialized.mockResolvedValue(PUSHED)
    await engine.pushNow() // lands → streak + horizon reset
    expect(engine.getStatus().state).toBe('idle')

    // No cooldown remains: an immediate push reaches the transport.
    await engine.pushNow()
    expect(pushBundleSerialized).toHaveBeenCalledTimes(3)

    // And the next 429 starts back at the 60s base (not 120s).
    pushBundleSerialized.mockRejectedValue(ERR_429())
    await engine.pushNow()
    now += 61_000
    pushBundleSerialized.mockResolvedValue(PUSHED)
    await engine.pushNow()
    expect(pushBundleSerialized).toHaveBeenCalledTimes(5)
  })

  it('a deferred outcome resets the 429 streak (presign answered 200)', async () => {
    const engine = makeEngine()
    pushBundleSerialized.mockRejectedValue(ERR_429())
    await engine.pushNow() // 429 streak 1
    now += PAST_ANY_BACKOFF_MS

    pushBundleSerialized.mockResolvedValue(DEFERRED)
    await engine.pushNow() // deferred → 429 streak reset
    now += PAST_ANY_BACKOFF_MS

    pushBundleSerialized.mockRejectedValue(ERR_429())
    await engine.pushNow() // would be streak 2 (120s) without the reset

    now += 61_000 // past the 60s base → proves the streak restarted at 1
    await engine.pushNow()
    expect(pushBundleSerialized).toHaveBeenCalledTimes(4)
  })
})

describe('SyncEngine.pushNow — deferred (412) exponential back-off', () => {
  it('a deferred push backs off ~60s (±30% jitter) instead of the plain debounce', async () => {
    pushBundleSerialized.mockResolvedValue(DEFERRED)
    const engine = makeEngine()
    await engine.pushNow() // defer 1 → horizon ∈ [42s, 78s]

    now += 41_000 // below the jitter floor — always still gated
    await engine.pushNow()
    expect(pushBundleSerialized).toHaveBeenCalledTimes(1)

    now += 38_000 // t = +79s — above the jitter ceiling — always free
    await engine.pushNow()
    expect(pushBundleSerialized).toHaveBeenCalledTimes(2)
  })

  it('the deferred back-off escalates on the streak (2nd defer ∈ [84s, 156s])', async () => {
    pushBundleSerialized.mockResolvedValue(DEFERRED)
    const engine = makeEngine()
    await engine.pushNow() // defer 1
    now += PAST_ANY_BACKOFF_MS
    await engine.pushNow() // defer 2 → horizon ∈ [84s, 156s]
    expect(pushBundleSerialized).toHaveBeenCalledTimes(2)

    now += 83_000 // below the floor
    await engine.pushNow()
    expect(pushBundleSerialized).toHaveBeenCalledTimes(2)

    now += 74_000 // t = +157s — above the ceiling
    await engine.pushNow()
    expect(pushBundleSerialized).toHaveBeenCalledTimes(3)
  })

  it('deferred still never fires onPushComplete nor sets lastPushAt (guardrail intact)', async () => {
    const onPushComplete = vi.fn()
    pushBundleSerialized.mockResolvedValue(DEFERRED)
    const engine = makeEngine({ onPushComplete })
    await engine.pushNow()
    expect(onPushComplete).not.toHaveBeenCalled()
    expect(engine.getStatus().lastPushAt).toBeNull()
  })
})

describe('sustained-stall reload prompt (sync-reload-signal, reason "sync-stall")', () => {
  it('fires once after 8 consecutive presign 429s — not before', async () => {
    pushBundleSerialized.mockRejectedValue(ERR_429())
    const engine = makeEngine()
    for (let i = 0; i < 7; i++) {
      await engine.pushNow()
      now += PAST_ANY_BACKOFF_MS
    }
    expect(shouldShowSchemaDowngradeReload()).toBe(false)

    await engine.pushNow() // 8th consecutive 429
    expect(shouldShowSchemaDowngradeReload()).toBe(true)
    expect(getSyncReloadReason()).toBe('sync-stall')
  })

  it('fires once after 8 consecutive deferred pushes — not before', async () => {
    pushBundleSerialized.mockResolvedValue(DEFERRED)
    const engine = makeEngine()
    for (let i = 0; i < 7; i++) {
      await engine.pushNow()
      now += PAST_ANY_BACKOFF_MS
    }
    expect(shouldShowSchemaDowngradeReload()).toBe(false)

    await engine.pushNow() // 8th consecutive defer
    expect(shouldShowSchemaDowngradeReload()).toBe(true)
    expect(getSyncReloadReason()).toBe('sync-stall')
  })

  it('schema-downgrade 409 still fires the reload with its own reason and NO cooldown', async () => {
    pushBundleSerialized.mockRejectedValue(
      new Error('r2_schema_downgrade_refused_by_server: cloud=28 incoming=27 bundle=neurons'),
    )
    const engine = makeEngine()
    await engine.pushNow()
    expect(shouldShowSchemaDowngradeReload()).toBe(true)
    expect(getSyncReloadReason()).toBe('schema-downgrade')

    // The 409 path sets no push horizon — an immediate retry reaches the
    // transport (unchanged pre-fix behavior for the schema path).
    await engine.pushNow()
    expect(pushBundleSerialized).toHaveBeenCalledTimes(2)
  })
})

describe('real-timer path — cooldown floor + remount persistence (fake timers)', () => {
  // These tests exercise the ACTUAL schedulePush re-arm (no spy) so the
  // `max(jittered, horizon - now)` floor is under test — a regression that
  // deleted the floor would let the timer fire the retry EARLY and this would
  // catch it. 429 base cooldown is un-jittered (exactly 60s) → deterministic.
  it('the real debounce timer fires the retry only PAST the horizon, not before', async () => {
    // Hand the clock to fake timers (undo the fixed Date.now spy first).
    dateNowSpy?.mockRestore()
    vi.useFakeTimers()
    vi.setSystemTime(0)
    try {
      pushBundleSerialized.mockRejectedValue(ERR_429())
      const engine = makeRealTimerEngine()

      await engine.pushNow() // 429 → 60s cooldown, schedulePush re-arms the timer
      expect(pushBundleSerialized).toHaveBeenCalledTimes(1)
      expect(engine.getStatus().state).toBe('error')

      // Next attempt WOULD land — prove the timer, not us, gates it.
      pushBundleSerialized.mockResolvedValue(PUSHED)

      await vi.advanceTimersByTimeAsync(59_000) // still inside the 60s horizon
      expect(pushBundleSerialized).toHaveBeenCalledTimes(1) // timer hasn't crossed the floor

      await vi.advanceTimersByTimeAsync(2_000) // cross the horizon (t = 61s)
      expect(pushBundleSerialized).toHaveBeenCalledTimes(2) // timer self-fired the retry
      expect(engine.getStatus().state).toBe('idle')

      engine.dispose()
    } finally {
      vi.useRealTimers()
    }
  })

  it('a remount (new engine, same userId) inherits the cooldown — module-level backoff survives', async () => {
    dateNowSpy?.mockRestore()
    vi.useFakeTimers()
    vi.setSystemTime(0)
    try {
      pushBundleSerialized.mockRejectedValue(ERR_429())
      const e1 = makeRealTimerEngine()
      await e1.pushNow() // sets a 60s cooldown on the module state for 'u1'
      expect(pushBundleSerialized).toHaveBeenCalledTimes(1)
      e1.dispose() // clears only the instance timer, NOT the module cooldown

      // Simulate the token-refresh remount: a fresh engine for the same user.
      const e2 = makeRealTimerEngine()
      pushBundleSerialized.mockResolvedValue(PUSHED)

      vi.setSystemTime(30_000) // still inside the inherited cooldown
      await e2.pushNow()
      expect(pushBundleSerialized).toHaveBeenCalledTimes(1) // gated by the surviving horizon

      vi.setSystemTime(61_000) // past the horizon
      await e2.pushNow()
      expect(pushBundleSerialized).toHaveBeenCalledTimes(2)

      e2.dispose()
    } finally {
      vi.useRealTimers()
    }
  })

  it('a fresh account (different userId) does NOT inherit another user\'s cooldown', async () => {
    dateNowSpy?.mockRestore()
    vi.useFakeTimers()
    vi.setSystemTime(0)
    try {
      pushBundleSerialized.mockRejectedValue(ERR_429())
      const e1 = makeRealTimerEngine() // user u1 → cooldown
      await e1.pushNow()
      e1.dispose()

      // A different user must start clean — no cross-account cooldown leak.
      const e2 = createSyncEngine({
        supabase: fakeSupabase,
        db: fakeDb,
        user: { id: 'u2' } as never,
      })
      vi.spyOn(e2, 'schedulePush').mockImplementation(() => {})
      pushBundleSerialized.mockResolvedValue(PUSHED)
      await e2.pushNow() // immediately reaches the transport (no inherited horizon)
      expect(pushBundleSerialized).toHaveBeenCalledTimes(2)
      e2.dispose()
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('remount-overlap disposed guard (Codex NO-GO scenario)', () => {
  // Encodes the exact race both reviewers converged on: E1 is stuck in pushNow's
  // startup-pull await when it gets disposed on a token-refresh remount; E2 (same
  // userId, SHARED module-level backoff record) then hits a 429 and sets the
  // shared cooldown. When E1's await releases, it must NOT (a) send a presign,
  // nor (b) zero E2's shared cooldown via the landed-push reset. Without the
  // disposed guard this test fails (E1 proceeds past the await); with it, E1
  // bails at the post-await recheck.
  it('a disposed engine stuck in the startup await sends no presign and preserves a newer engine\'s cooldown', async () => {
    // Make E1's startup force-pull hang so its first push blocks in the await.
    let releaseStartupPull!: (v: unknown) => void
    const hangingPull = new Promise((resolve) => {
      releaseStartupPull = resolve
    })
    pullBundle.mockReturnValueOnce(hangingPull)

    const e1 = makeRealTimerEngine() // real schedulePush (must also be gated by disposed)
    e1.beginStartupForcePull() // arms e1.startupForcePull with the hanging pull
    const e1Push = e1.pushNow() // suspends at `await Promise.race([startupForcePull, sleep])`
    await Promise.resolve() // let e1Push reach the await
    expect(pushBundleSerialized).not.toHaveBeenCalled() // blocked before any transport

    // Token-refresh remount: tear down E1, mount E2 for the same user.
    e1.dispose()
    const e2 = makeEngine() // shares the module-level backoff record for 'u1'
    pushBundleSerialized.mockRejectedValueOnce(ERR_429())
    await e2.pushNow() // E2's 429 sets the SHARED nextPushNotBeforeAt (now + 60s)
    const transportCallsAfterE2 = pushBundleSerialized.mock.calls.length
    expect(transportCallsAfterE2).toBe(1) // only E2's 429 so far

    // Release E1's startup await → its continuation resumes and must bail.
    releaseStartupPull({ applied: null, notModified: true, blobMissing: false })
    await e1Push

    // (a) E1 sent no presign after the await.
    expect(pushBundleSerialized.mock.calls.length).toBe(transportCallsAfterE2)

    // (b) E2's shared cooldown survived (E1 did not run the landed-push reset):
    // E2's next would-land push is still gated by the horizon → no transport.
    pushBundleSerialized.mockResolvedValue(PUSHED)
    await e2.pushNow()
    expect(pushBundleSerialized.mock.calls.length).toBe(transportCallsAfterE2)

    e2.dispose()
  })
})

describe('load-bearing invariants stay wired', () => {
  it('pushNow still threads onRecoveryPull → onPullComplete (412/409/428 recovery hook)', async () => {
    const onPullComplete = vi.fn()
    pushBundleSerialized.mockImplementation(
      async (...args: unknown[]) => {
        const opts = args[3] as {
          deferOnConflict?: boolean
          onRecoveryPull?: (r: unknown) => Promise<void>
        }
        expect(opts.deferOnConflict).toBe(true)
        expect(typeof opts.onRecoveryPull).toBe('function')
        // Simulate the transport's conflict-recovery pull firing the hook.
        await opts.onRecoveryPull?.({ applied: {}, notModified: false, blobMissing: false })
        return DEFERRED
      },
    )
    const engine = makeEngine({ onPullComplete })
    await engine.pushNow()
    expect(onPullComplete).toHaveBeenCalledTimes(1)
  })
})
