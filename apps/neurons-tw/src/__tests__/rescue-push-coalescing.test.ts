/**
 * add-neurons-rescue-r2-sync review locks (engine-level, engine-r2 file-mocked):
 *
 *  1. Quick-fix 3 — a rescue session's N confidence taps (meta writes riding the
 *     same Dexie push hooks as questionHistory) coalesce into ONE debounced push
 *     intent, not N independent R2 PUTs. Net-new PUT count per session ≈ 0
 *     because the taps land inside the same 12s debounce window the answer
 *     writes already open.
 *
 *  2. B2 wiring — SyncEngine.pushNow threads its onPullComplete into
 *     pushBundle's conflict-recovery hook (`onRecoveryPull`), so the LWW
 *     backfill families reconcile a 412-recovery snapshot before the deferred
 *     re-push. (The db-level end-to-end lock lives in
 *     rescue-conflict-recovery.test.ts — this locks the ENGINE wiring.)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import 'fake-indexeddb/auto'

vi.mock('../lib/sync/r2/engine-r2', () => ({
  pushBundleSerialized: vi.fn(async () => ({
    status: 'pushed',
    etag: '"E1"',
    bytes: 1,
    attempts: 1,
  })),
  pullBundle: vi.fn(async () => ({
    etag: null,
    notModified: false,
    blobMissing: true,
    applied: null,
  })),
}))

import { pushBundleSerialized, type PullBundleResult } from '../lib/sync/r2/engine-r2'
import { createSyncEngine } from '../lib/sync/engine'
import { attachTableHooks, detachTableHooks } from '../lib/sync/useSync'
import { db } from '../lib/db'
import {
  startRescue,
  recordConfidence,
  __resetRescueStoreForTests,
} from '../lib/services/rescue/rescue-store'

const fakeSupabase = {} as never
const fakeUser = { id: 'u-rescue' } as never

beforeEach(async () => {
  vi.clearAllMocks()
  await __resetRescueStoreForTests()
})

afterEach(() => {
  detachTableHooks(db)
  vi.useRealTimers()
})

describe('rescue confidence taps — push coalescing (quick-fix 3)', () => {
  it('a session of N taps produces exactly ONE push intent inside the debounce window', async () => {
    // Fake only the debounce timer — Dexie / fake-indexeddb keep the real
    // microtask + setImmediate scheduler so writes actually land.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })

    const engine = createSyncEngine({
      supabase: fakeSupabase,
      db,
      user: fakeUser,
      debounceMs: 12_000, // prod default
    })
    attachTableHooks(db, () => engine.schedulePush())

    // One rescue session: plan envelope write + 8 pre-reveal confidence taps.
    // Every write is a db.meta put → Dexie hook → schedulePush.
    const started = startRescue({ familyId: '藥理學', examDate: '2026-07-12', dailyMinutes: 30 })
    expect(started.ok).toBe(true)
    for (let i = 1; i <= 8; i++) recordConfidence(`q${i}`, i % 2 ? 'sure' : 'guess')

    // Flush the fire-and-forget meta puts (transactions queue in order).
    await db.meta.toArray()

    // Inside the window nothing has pushed yet…
    expect(pushBundleSerialized).not.toHaveBeenCalled()

    // …and past the (jittered ≤ 1.3×) debounce, the 9 writes fire ONE push.
    await vi.advanceTimersByTimeAsync(30_000)
    expect(pushBundleSerialized).toHaveBeenCalledTimes(1)

    engine.dispose()
  })
})

describe('SyncEngine.pushNow — conflict-recovery backfill wiring (B2)', () => {
  it('threads onPullComplete into pushBundle as onRecoveryPull', async () => {
    const onPullComplete = vi.fn()
    const engine = createSyncEngine({
      supabase: fakeSupabase,
      db,
      user: fakeUser,
      onPullComplete,
    })

    await engine.pushNow()

    expect(pushBundleSerialized).toHaveBeenCalledTimes(1)
    const opts = vi.mocked(pushBundleSerialized).mock.calls[0]![3]!
    expect(opts.deferOnConflict).toBe(true)
    expect(typeof opts.onRecoveryPull).toBe('function')

    // Simulate pushBundle invoking the hook after a recovery pull: it must
    // reach the engine's onPullComplete with the pull result untouched.
    const recoveryResult = {
      etag: '"e2"',
      notModified: false,
      blobMissing: false,
      applied: { applied: 1, skipped: 0, perTable: {} },
      snapshot: undefined,
    } as unknown as PullBundleResult
    await opts.onRecoveryPull!(recoveryResult)
    expect(onPullComplete).toHaveBeenCalledTimes(1)
    expect(onPullComplete).toHaveBeenCalledWith(recoveryResult)

    engine.dispose()
  })
})
