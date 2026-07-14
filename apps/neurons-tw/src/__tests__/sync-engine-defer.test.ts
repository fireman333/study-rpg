/**
 * Phase 1 (eliminate-cross-device-r2-412-storm): SyncEngine.pushNow must treat a
 * deferred push (cross-device 412) as a re-armed, still-dirty, idle state — NOT a
 * success.
 *
 * The CRITICAL guardrail (codex blocking-regression find): a deferred push MUST
 * NOT fire onPushComplete, which auto-upserts the leaderboard — firing it for a
 * push that never landed would falsely report progress + incur a write. After a
 * sustained streak the engine surfaces an error so a pathologically
 * non-converging multi-device writer isn't silent.
 *
 * engine-r2 is module-mocked so we drive pushBundleSerialized's outcome directly.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const pushBundleSerialized = vi.fn()

vi.mock('../lib/sync/r2/engine-r2', () => ({
  pushBundleSerialized: (...args: unknown[]) => pushBundleSerialized(...args),
  pullBundle: vi.fn(),
}))

import {
  createSyncEngine,
  __resetRetryBackoffForTests,
  type SyncEngine,
} from '../lib/sync/engine'

const fakeSupabase = {} as never
const fakeDb = {} as never
const fakeUser = { id: 'u1' } as never

const DEFERRED = { status: 'deferred', reason: 'concurrent-writer', attempts: 1 }
const PUSHED = { status: 'pushed', etag: '"E1"', bytes: 3, attempts: 1 }

// A deferred outcome now raises the exponential back-off horizon (60s→300s,
// ±30% jitter) that gates the next pushNow. Larger than the worst-case horizon
// (300s × 1.3) so each loop iteration's push actually reaches the transport.
const PAST_ANY_BACKOFF_MS = 400_000

function makeEngine(onPushComplete?: () => void | Promise<void>): SyncEngine {
  const engine = createSyncEngine({
    supabase: fakeSupabase,
    db: fakeDb,
    user: fakeUser,
    onPushComplete,
  })
  // Isolate pushNow's defer logic from the real (jittered) timer re-arm.
  vi.spyOn(engine, 'schedulePush').mockImplementation(() => {})
  return engine
}

let now = 0

beforeEach(() => {
  vi.clearAllMocks()
  // Retry-backoff counters are module-level per-user (survive remount) — reset
  // so each test starts from a clean streak for userId 'u1'.
  __resetRetryBackoffForTests()
  now = 1_750_000_000_000
  vi.spyOn(Date, 'now').mockImplementation(() => now)
})

describe('SyncEngine.pushNow — deferred (cross-device 412) handling', () => {
  it('a deferred push does NOT fire onPushComplete and does NOT record lastPushAt', async () => {
    const onPushComplete = vi.fn()
    pushBundleSerialized.mockResolvedValue(DEFERRED)
    const engine = makeEngine(onPushComplete)

    await engine.pushNow()

    expect(onPushComplete).not.toHaveBeenCalled() // <-- the blocking guardrail
    const s = engine.getStatus()
    expect(s.lastPushAt).toBeNull()
    expect(s.state).toBe('idle') // a single defer is a normal backoff, not an error
    expect(s.lastError).toBeNull() // so the sync light stays 🟢, not 🔴
    expect(engine.schedulePush).toHaveBeenCalled() // re-armed (stays dirty)
  })

  it('passes deferOnConflict:true so the engine push can defer instead of throwing', async () => {
    pushBundleSerialized.mockResolvedValue(PUSHED)
    const engine = makeEngine()
    await engine.pushNow()
    expect(pushBundleSerialized).toHaveBeenCalledWith(
      fakeSupabase,
      fakeDb,
      'u1',
      expect.objectContaining({ deferOnConflict: true }),
    )
  })

  it('surfaces an error only after MAX_CONSECUTIVE_DEFERS consecutive defers', async () => {
    pushBundleSerialized.mockResolvedValue(DEFERRED)
    const engine = makeEngine()
    for (let i = 0; i < 4; i++) {
      await engine.pushNow()
      expect(engine.getStatus().state).toBe('idle')
      now += PAST_ANY_BACKOFF_MS // clear the deferred back-off so the next attempt lands on the transport
    }
    await engine.pushNow() // 5th consecutive defer
    const s = engine.getStatus()
    expect(s.state).toBe('error')
    expect(s.lastError).toBe('sync_deferred_concurrent_writer')
  })

  it('a landed push resets the defer streak, fires onPushComplete, and clears the error', async () => {
    const onPushComplete = vi.fn()
    const engine = makeEngine(onPushComplete)

    pushBundleSerialized.mockResolvedValue(DEFERRED)
    for (let i = 0; i < 5; i++) {
      await engine.pushNow()
      now += PAST_ANY_BACKOFF_MS
    }
    expect(engine.getStatus().state).toBe('error')

    pushBundleSerialized.mockResolvedValue(PUSHED)
    await engine.pushNow()
    const s = engine.getStatus()
    expect(s.state).toBe('idle')
    expect(s.lastError).toBeNull()
    expect(s.lastPushAt).not.toBeNull()
    expect(onPushComplete).toHaveBeenCalledTimes(1)

    // Streak reset: a subsequent single defer must NOT immediately re-error.
    pushBundleSerialized.mockResolvedValue(DEFERRED)
    await engine.pushNow()
    expect(engine.getStatus().state).toBe('idle')
  })
})
