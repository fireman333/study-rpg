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
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

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
// A non-429, non-412, non-schema hard error — the class that had no back-off at
// all until 2026-07-15. 401 is the realistic worst case: a dead token never
// self-heals, so the tab burns quota on every subsequent Dexie write forever.
const ERR_HARD = () =>
  new Error('r2_push_exhausted: presign_failed_401: {"error":"jwt expired"}')

// Worst-case horizon (300s cap × 1.3 jitter) — advancing past this always
// clears any cooldown / back-off.
const PAST_ANY_BACKOFF_MS = 400_000

let now = 0
let dateNowSpy: ReturnType<typeof vi.spyOn> | null = null

// The test env is `environment: 'node'` (not jsdom), where `navigator` EXISTS but
// has no `onLine` property at all — reading it yields undefined, not false. That
// is not an accident of the harness, it is the engine's most important input
// state: `undefined` is the "can't tell" case, and the engine must treat it as
// online so the back-off is unchanged wherever the signal is unavailable. Hence
// vi.spyOn(navigator, 'onLine', 'get') is not usable here (it throws on an absent
// property) — define and delete the property instead.
function setNavigatorOnLine(value: boolean | undefined): void {
  if (value === undefined) {
    delete (navigator as { onLine?: unknown }).onLine
    return
  }
  Object.defineProperty(navigator, 'onLine', { value, configurable: true })
}

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

afterEach(() => {
  // Restore the env's real shape (property ABSENT) so a test that forgets to set
  // it explicitly exercises the "can't tell" default rather than inheriting a
  // neighbour's stub.
  setNavigatorOnLine(undefined)
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

  it('caps the 429 cooldown at 300s — a throttled tab is never stranded forever', async () => {
    // The 429 twin of the hard-error cap test below. Both branches compute
    // `base × 2^(streak-1)` and both need the Math.min; only the hard-error one
    // was locked when the cap was written (2026-07-15), so this closes the gap.
    // Without the cap a tab that stays throttled — precisely the exam-morning
    // shape, when the limiter is busiest — doubles into a horizon measured in
    // days and its writes never leave Dexie.
    // The 429 cooldown is deliberately un-jittered, so the cap is exactly 300s.
    //
    // This locks the INVARIANT (cooldown ≤ 300s), not a line: the branch clamps
    // twice — once on the exponential, once on the final max(hint, backoff) —
    // and either clamp alone enforces the bound. So deleting just one is an
    // equivalent mutation this test does not (and should not) detect; deleting
    // both turns it red. Verified by mutation on 2026-07-15.
    pushBundleSerialized.mockRejectedValue(ERR_429())
    const engine = makeEngine()
    for (let i = 0; i < 20; i++) {
      await engine.pushNow() // streak → 20; uncapped this would be 60s × 2^19
      now += PAST_ANY_BACKOFF_MS
    }
    // Anti-vacuity, and where the mutation actually bites first: capped, every
    // horizon (≤300s) is inside PAST_ANY_BACKOFF_MS so all 20 attempts reach the
    // transport. Uncapped, streak 4 already yields 480s > 400s and the loop
    // starts gating itself — this count drops below 20.
    expect(pushBundleSerialized).toHaveBeenCalledTimes(20)

    // One more 429 to set a fresh horizon off the (deep) streak, then prove it
    // is still inside the 300s cap.
    await engine.pushNow()
    now += 301_000
    pushBundleSerialized.mockResolvedValue(PUSHED)
    await engine.pushNow()
    expect(pushBundleSerialized).toHaveBeenCalledTimes(22)
    expect(engine.getStatus().state).toBe('idle')
  })

  it('caps even a server Retry-After hint at 300s (the hint is not trusted blindly)', async () => {
    // parseRetryAfterMs already rejects non-safe integers, but a merely LARGE
    // honest hint (a Worker misconfigured to say "come back in 2 hours") is
    // sanitized and would sail through — the Math.min is the only thing between
    // it and a two-hour sync stall. Distinct code path from the streak cap above
    // (Math.max(hint, backoff) then clamp), so it gets its own lock.
    pushBundleSerialized.mockRejectedValue(ERR_429_RETRY_AFTER(7200)) // 2 hours
    const engine = makeEngine()
    await engine.pushNow()

    now += 301_000 // past the cap, far short of the 7200s hint
    pushBundleSerialized.mockResolvedValue(PUSHED)
    await engine.pushNow()
    expect(pushBundleSerialized).toHaveBeenCalledTimes(2)
    expect(engine.getStatus().state).toBe('idle')
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

describe('SyncEngine.pushNow — hard-error (non-429/412) cooldown', () => {
  // Audit follow-up 2026-07-15. Before this, the hard-error branch set NO
  // horizon: a tab with a dead token (presign 401) or a Worker answering 502
  // re-pushed on the plain ~12s debounce forever (~7 req/min) and never
  // surfaced the reload prompt, because that was wired only to 429/defer.
  // Bounded (the branch never schedulePush()es, so it only retries when the
  // user writes again) but indefinite and silent.
  it('the FIRST hard error keeps the plain debounce — a one-off blip costs no stall', async () => {
    pushBundleSerialized.mockRejectedValue(ERR_HARD())
    const engine = makeEngine()

    await engine.pushNow() // streak 1 → within grace, no horizon
    expect(engine.getStatus().state).toBe('error')
    expect(engine.getStatus().lastError).toContain('presign_failed_401')

    // No horizon → an immediate retry still reaches the transport.
    await engine.pushNow()
    expect(pushBundleSerialized).toHaveBeenCalledTimes(2)
  })

  it('a SECOND consecutive hard error gates the next push for ~30s (±30% jitter)', async () => {
    pushBundleSerialized.mockRejectedValue(ERR_HARD())
    const engine = makeEngine()

    await engine.pushNow() // streak 1 (grace)
    await engine.pushNow() // streak 2 → horizon ∈ [21s, 39s]
    expect(pushBundleSerialized).toHaveBeenCalledTimes(2)

    now += 20_000 // below the jitter floor — always still gated
    await engine.pushNow()
    expect(pushBundleSerialized).toHaveBeenCalledTimes(2)

    now += 20_000 // t = +40s — above the jitter ceiling — always free
    await engine.pushNow()
    expect(pushBundleSerialized).toHaveBeenCalledTimes(3)
  })

  it('the hard-error cooldown escalates on the streak (3rd ∈ [42s, 78s])', async () => {
    pushBundleSerialized.mockRejectedValue(ERR_HARD())
    const engine = makeEngine()

    await engine.pushNow() // 1 (grace)
    await engine.pushNow() // 2 → ~30s
    now += PAST_ANY_BACKOFF_MS
    await engine.pushNow() // 3 → ~60s → ∈ [42s, 78s]
    expect(pushBundleSerialized).toHaveBeenCalledTimes(3)

    now += 41_000 // below the floor
    await engine.pushNow()
    expect(pushBundleSerialized).toHaveBeenCalledTimes(3)

    now += 38_000 // t = +79s — above the ceiling
    await engine.pushNow()
    expect(pushBundleSerialized).toHaveBeenCalledTimes(4)
  })

  it('a landed push clears the hard-error streak (next error restarts at the grace)', async () => {
    const engine = makeEngine()
    pushBundleSerialized.mockRejectedValue(ERR_HARD())
    await engine.pushNow() // 1
    await engine.pushNow() // 2 → horizon
    now += PAST_ANY_BACKOFF_MS

    pushBundleSerialized.mockResolvedValue(PUSHED)
    await engine.pushNow() // lands → streak + horizon reset
    expect(engine.getStatus().state).toBe('idle')

    // Streak restarted: the next hard error is a grace again → no horizon.
    pushBundleSerialized.mockRejectedValue(ERR_HARD())
    await engine.pushNow() // 1 (grace)
    await engine.pushNow() // reaches transport — proves no horizon was set
    expect(pushBundleSerialized).toHaveBeenCalledTimes(5)
  })

  it('a 429 resets the hard-error streak (presign answered — it was the limiter)', async () => {
    const engine = makeEngine()
    pushBundleSerialized.mockRejectedValue(ERR_HARD())
    await engine.pushNow() // hard 1
    await engine.pushNow() // hard 2 → horizon
    now += PAST_ANY_BACKOFF_MS

    pushBundleSerialized.mockRejectedValue(ERR_429())
    await engine.pushNow() // 429 → hard streak reset
    now += PAST_ANY_BACKOFF_MS

    // Back to hard errors: the streak restarted, so the first is a grace again.
    pushBundleSerialized.mockRejectedValue(ERR_HARD())
    await engine.pushNow() // hard 1 (grace, no horizon)
    await engine.pushNow() // reaches transport — proves the reset happened
    expect(pushBundleSerialized).toHaveBeenCalledTimes(5)
  })

  it('a hard error still resets the 429 streak (pre-existing symmetry intact)', async () => {
    const engine = makeEngine()
    pushBundleSerialized.mockRejectedValue(ERR_429())
    await engine.pushNow() // 429 streak 1
    now += PAST_ANY_BACKOFF_MS

    pushBundleSerialized.mockRejectedValue(ERR_HARD())
    await engine.pushNow() // hard error → 429 streak reset
    now += PAST_ANY_BACKOFF_MS

    pushBundleSerialized.mockRejectedValue(ERR_429())
    await engine.pushNow() // would be 429 streak 2 (120s) without the reset
    now += 61_000 // past the 60s base → proves the 429 streak restarted at 1
    pushBundleSerialized.mockResolvedValue(PUSHED)
    await engine.pushNow()
    expect(pushBundleSerialized).toHaveBeenCalledTimes(4)
  })

  it('NEVER fires the reload prompt, however long the hard-error streak runs', async () => {
    // Fable review 2026-07-15 killed a first cut that prompted here. This branch
    // also catches pure network failure, and navigator.onLine reports true for
    // flaky Wi-Fi / captive portals — so a prompt would hit commuting users with
    // a close-button-less toast that reloading cannot fix. Locked as a NEGATIVE:
    // re-adding the prompt must turn this red, not slip through silently.
    pushBundleSerialized.mockRejectedValue(ERR_HARD())
    const engine = makeEngine()
    for (let i = 0; i < 20; i++) {
      await engine.pushNow()
      now += PAST_ANY_BACKOFF_MS
    }
    // Anti-vacuity: prove all 20 attempts actually reached the transport (and so
    // ran the hard-error branch). Without this, a future edit to ERR_HARD's
    // message could silently reroute it and the negative assertion below would
    // pass for the wrong reason.
    expect(pushBundleSerialized).toHaveBeenCalledTimes(20)
    expect(shouldShowSchemaDowngradeReload()).toBe(false)
    expect(getSyncReloadReason()).toBeNull()
  })

  it('caps the hard-error cooldown at 300s — sync can never be stranded forever', async () => {
    // THE load-bearing bound. Without the Math.min the horizon doubles without
    // limit (streak 20 → 30s × 2^18 ≈ 91 days) and the user's writes are
    // stranded in Dexie — they would lose the session by switching devices.
    // Worst realistic outcome of this whole change, so it gets an explicit lock.
    // Mutation actually bites earlier than that: uncapped, streak 6 already
    // yields a 480s horizon > PAST_ANY_BACKOFF_MS, so the loop starts gating
    // itself and callsBefore never reaches 20 either.
    pushBundleSerialized.mockRejectedValue(ERR_HARD())
    const engine = makeEngine()
    for (let i = 0; i < 20; i++) {
      await engine.pushNow() // streak → 20; uncapped this would be astronomical
      now += PAST_ANY_BACKOFF_MS
    }
    const callsBefore = pushBundleSerialized.mock.calls.length

    // One more error to set a fresh horizon off the (deep) streak, then prove it
    // is still inside the cap + jitter ceiling (300s × 1.3 = 390s).
    await engine.pushNow()
    now += 391_000
    pushBundleSerialized.mockResolvedValue(PUSHED)
    await engine.pushNow()
    expect(pushBundleSerialized).toHaveBeenCalledTimes(callsBefore + 2)
    expect(engine.getStatus().state).toBe('idle')
  })

  it('a landed push clears the hard-error HORIZON, not just the streak', async () => {
    // Separate lock from the streak-reset test above (which advances the clock
    // past the horizon before landing, so it cannot see this). Two distinct
    // lines in the reset block; one test each.
    pushBundleSerialized.mockRejectedValue(ERR_HARD())
    const engine = makeEngine()
    await engine.pushNow() // 1 (grace)
    await engine.pushNow() // 2 → horizon ~30s is now live
    now += PAST_ANY_BACKOFF_MS

    pushBundleSerialized.mockResolvedValue(PUSHED)
    await engine.pushNow() // lands → must zero nextPushNotBeforeAt
    const calls = pushBundleSerialized.mock.calls.length

    // WITHOUT advancing the clock: a horizon left set would gate this.
    await engine.pushNow()
    expect(pushBundleSerialized).toHaveBeenCalledTimes(calls + 1)
  })

  it('the hard-error branch never self-schedules — the reason it cannot storm', async () => {
    // Load-bearing premise of the whole design: unlike the 429/defer branches,
    // this one does NOT schedulePush(), so a broken tab retries only when the
    // user writes to Dexie again (~7 req/min ceiling) rather than spinning on a
    // timer. Previously asserted only by a comment.
    pushBundleSerialized.mockRejectedValue(ERR_HARD())
    const engine = makeEngine() // schedulePush is spied to a no-op here
    await engine.pushNow() // 1: no horizon yet (grace) → clears the gate
    expect(engine.schedulePush).not.toHaveBeenCalled()
    await engine.pushNow() // 2: still no horizon on entry → clears the gate, SETS one
    expect(engine.schedulePush).not.toHaveBeenCalled()
    // Stops at 2 deliberately: a 3rd call would hit the horizon gate, and THAT
    // branch does schedulePush() — correctly, and it is not what this locks.
  })
})

describe('SyncEngine.pushNow — offline hard errors do not accrue the streak', () => {
  // Audit follow-up 2026-07-15. The hard-error branch also catches a push that
  // never left the device (offline → `TypeError: Failed to fetch`), which is
  // indistinguishable BY MESSAGE from a real Worker 502. Backing off there
  // protects nothing — no request reached the Worker, no quota was burned — and
  // costs the one user we can least afford to annoy: someone answering questions
  // on the MRT two days before the exam, whose every write would otherwise walk
  // the streak to the 300s ceiling within a couple of minutes and then idle
  // there after they resurface.
  //
  // navigator.onLine is a legitimate signal for THIS decision and not for the
  // reload prompt — the asymmetry is spelled out on isDefinitelyOffline() and
  // guarded by the "NEVER fires the reload prompt" test above. If you are here
  // to wire the prompt back in: don't.

  it('offline hard errors never set a horizon, however long the failure runs', async () => {
    setNavigatorOnLine(false)
    pushBundleSerialized.mockRejectedValue(ERR_HARD())
    const engine = makeEngine()

    // No clock advance at all: every one of these must still reach the transport.
    // With the streak accruing (pre-fix), #2 sets a ~30s horizon and #3 onwards
    // are gated — this stops at 2.
    for (let i = 0; i < 20; i++) await engine.pushNow()
    expect(pushBundleSerialized).toHaveBeenCalledTimes(20)
    expect(engine.getStatus().state).toBe('error') // still surfaced, just not backed off
  })

  it('coming back online after a long offline run starts at the grace, not the ceiling', async () => {
    // The user-facing point of the whole fix: the MRT commuter surfaces and syncs
    // on the next debounce, instead of waiting out a 300s horizon they earned by
    // being in a tunnel.
    setNavigatorOnLine(false)
    pushBundleSerialized.mockRejectedValue(ERR_HARD())
    const engine = makeEngine()
    for (let i = 0; i < 20; i++) await engine.pushNow()

    setNavigatorOnLine(true)
    await engine.pushNow() // streak 0 → 1: a grace, so still no horizon
    const calls = pushBundleSerialized.mock.calls.length
    // WITHOUT advancing the clock: a horizon carried over from the offline run
    // would gate this. Reaching the transport proves the streak really was 0.
    await engine.pushNow()
    expect(pushBundleSerialized).toHaveBeenCalledTimes(calls + 1)
  })

  it('an ONLINE hard error still backs off (the gate is offline-only)', async () => {
    // Mutation guard: an `isDefinitelyOffline()` stubbed to always-true, or the
    // gate inverted, would silently delete the 2026-07-15 hard-error cooldown
    // altogether and every other test in that block would still pass (they run
    // with the property absent). This pins the explicit online:true case.
    setNavigatorOnLine(true)
    pushBundleSerialized.mockRejectedValue(ERR_HARD())
    const engine = makeEngine()

    await engine.pushNow() // streak 1 (grace)
    await engine.pushNow() // streak 2 → horizon ∈ [21s, 39s]
    expect(pushBundleSerialized).toHaveBeenCalledTimes(2)

    now += 20_000 // below the jitter floor — gated
    await engine.pushNow()
    expect(pushBundleSerialized).toHaveBeenCalledTimes(2)

    now += 20_000 // t = +40s — above the jitter ceiling — free
    await engine.pushNow()
    expect(pushBundleSerialized).toHaveBeenCalledTimes(3)
  })

  it('an UNKNOWN onLine (property absent) is treated as online — fail-safe default', async () => {
    // The node env's real shape, and the one that decides what happens in any
    // browser/webview that doesn't expose the property: back off exactly as
    // before the helper existed. Never fail OPEN into "assume offline, never back
    // off", which would restore the unbounded quota burn 3ee9f3fd fixed.
    setNavigatorOnLine(undefined)
    pushBundleSerialized.mockRejectedValue(ERR_HARD())
    const engine = makeEngine()

    await engine.pushNow() // 1 (grace)
    await engine.pushNow() // 2 → horizon set, exactly as pre-helper
    now += 20_000
    await engine.pushNow()
    expect(pushBundleSerialized).toHaveBeenCalledTimes(2) // gated → the streak accrued
  })

  it('going offline does NOT clear a horizon an online streak already earned', async () => {
    // The Worker asked for this cooldown while it was answering; losing the
    // network afterwards is not evidence it changed its mind. (Also the reason
    // the gate wraps only the accrual, not the whole branch.)
    setNavigatorOnLine(true)
    pushBundleSerialized.mockRejectedValue(ERR_HARD())
    const engine = makeEngine()
    await engine.pushNow() // 1 (grace)
    await engine.pushNow() // 2 → horizon ∈ [21s, 39s] is now live
    expect(pushBundleSerialized).toHaveBeenCalledTimes(2)

    setNavigatorOnLine(false)
    now += 20_000 // below the jitter floor
    await engine.pushNow()
    expect(pushBundleSerialized).toHaveBeenCalledTimes(2) // still gated by the earned horizon
  })
})

describe('SyncEngine.pullNow — non-forced pull throttle', () => {
  // Audit follow-up 2026-07-15: the ONLY path where user behaviour maps 1:1 onto
  // requests. The 240s GET-presign URL cache normally absorbs visibility pulls,
  // but a FAILED presign GET is never cached (client.ts caches on success only),
  // so with the cache cold every `visibilitychange` cost a /presign — and iOS
  // Safari fires that on every app switch.
  const PULLED = { applied: {}, notModified: false, blobMissing: false }

  it('throttles a second non-forced pull inside the 30s window', async () => {
    pullBundle.mockResolvedValue(PULLED)
    const engine = makeEngine()

    await engine.pullNow()
    expect(pullBundle).toHaveBeenCalledTimes(1)

    now += 29_000 // inside the window
    expect(await engine.pullNow()).toBeNull() // gated, no transport
    expect(pullBundle).toHaveBeenCalledTimes(1)

    now += 2_000 // t = +31s — past the window
    await engine.pullNow()
    expect(pullBundle).toHaveBeenCalledTimes(2)
  })

  it('a FORCED pull always bypasses the throttle (manual sync stays instant)', async () => {
    pullBundle.mockResolvedValue(PULLED)
    const engine = makeEngine()

    await engine.pullNow()
    await engine.pullNow({ force: true })
    await engine.pullNow({ force: true })
    expect(pullBundle).toHaveBeenCalledTimes(3)
  })

  it('a FAILED pull holds non-forced pulls for ~60s — the visibility-storm guard', async () => {
    pullBundle.mockRejectedValue(new Error('presign_failed_502'))
    const engine = makeEngine()

    await engine.pullNow()
    expect(engine.getStatus().state).toBe('error')
    expect(pullBundle).toHaveBeenCalledTimes(1)

    // Simulate the app-switch storm: many visibility flips inside the cooldown.
    now += 31_000 // past the SUCCESS window — the error cooldown must still hold
    for (let i = 0; i < 20; i++) await engine.pullNow()
    expect(pullBundle).toHaveBeenCalledTimes(1)

    // A forced pull is the user's escape hatch — never gated.
    pullBundle.mockResolvedValue(PULLED)
    await engine.pullNow({ force: true })
    expect(pullBundle).toHaveBeenCalledTimes(2)

    now += 61_000
    await engine.pullNow()
    expect(pullBundle).toHaveBeenCalledTimes(3)
  })

  it('a disposed engine pulls nothing', async () => {
    pullBundle.mockResolvedValue(PULLED)
    const engine = makeEngine()
    engine.dispose()
    expect(await engine.pullNow()).toBeNull()
    expect(await engine.pullNow({ force: true })).toBeNull()
    expect(pullBundle).not.toHaveBeenCalled()
  })

  it('a remount (new engine, same userId) inherits the pull window', async () => {
    // `nextPullNotBeforeAt` lives in the SAME module-level per-user record as the
    // push horizons, for the same reason: the engine is disposed and recreated on
    // every Supabase token refresh (~hourly). Instance state would hand a free
    // pull to every remount. Mirrors the push side's remount test — asserted
    // there since 2026-07-14, never for the pull field.
    pullBundle.mockResolvedValue(PULLED)
    const e1 = makeEngine()
    await e1.pullNow()
    expect(pullBundle).toHaveBeenCalledTimes(1)
    e1.dispose() // clears the instance timer, NOT the module-level window

    const e2 = makeEngine() // token-refresh remount: same userId 'u1'
    expect(await e2.pullNow()).toBeNull() // gated by the surviving window
    expect(pullBundle).toHaveBeenCalledTimes(1)

    now += 31_000 // past the window → the remounted engine pulls normally again
    await e2.pullNow()
    expect(pullBundle).toHaveBeenCalledTimes(2)
  })

  it('a fresh account (different userId) does NOT inherit another user\'s pull window', async () => {
    // The other half of "keyed by userId": account B must not start life gated by
    // account A's window. Real path — signing out and into a second account (a
    // shared iPad, or the owner's own test account) — where the first thing the
    // new account needs is precisely a pull.
    pullBundle.mockResolvedValue(PULLED)
    const e1 = makeEngine() // u1
    await e1.pullNow()
    expect(pullBundle).toHaveBeenCalledTimes(1)

    // Anti-vacuity: prove a window actually exists to be leaked. Without this,
    // the assertion below would pass even if the throttle were deleted outright.
    expect(await e1.pullNow()).toBeNull()
    expect(pullBundle).toHaveBeenCalledTimes(1)

    const e2 = createSyncEngine({
      supabase: fakeSupabase,
      db: fakeDb,
      user: { id: 'u2' } as never,
    })
    vi.spyOn(e2, 'schedulePush').mockImplementation(() => {})
    await e2.pullNow() // no inherited window → reaches the transport immediately
    expect(pullBundle).toHaveBeenCalledTimes(2)
    e2.dispose()
  })

  it('the pull ERROR cooldown is per-user too', async () => {
    // The 60s error hold is the aggressive one (it is what absorbs the iOS
    // visibility storm), so it is the one that would hurt most if it leaked onto
    // a freshly signed-in account whose cold start needs a pull.
    pullBundle.mockRejectedValue(new Error('presign_failed_502'))
    const e1 = makeEngine() // u1 → 60s error cooldown
    await e1.pullNow()
    expect(pullBundle).toHaveBeenCalledTimes(1)
    now += 31_000 // past the success window; e1 is still held by the error hold
    expect(await e1.pullNow()).toBeNull()
    expect(pullBundle).toHaveBeenCalledTimes(1)

    const e2 = createSyncEngine({
      supabase: fakeSupabase,
      db: fakeDb,
      user: { id: 'u2' } as never,
    })
    vi.spyOn(e2, 'schedulePush').mockImplementation(() => {})
    pullBundle.mockResolvedValue(PULLED)
    await e2.pullNow()
    expect(pullBundle).toHaveBeenCalledTimes(2)
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
