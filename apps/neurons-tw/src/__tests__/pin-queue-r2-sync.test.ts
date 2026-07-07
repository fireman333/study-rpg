/**
 * add-neurons-pin-queue-r2-sync — 置頂下次出征 pin on `questionFlags.pinnedAt`.
 *
 * Locks the three correctness points (mirrors the four-flag round-trip tests in
 * question-flags-error-cause.test.ts):
 *  (a) R2 questionFlags adapter round-trips `pinnedAt`; an EXPLICIT
 *      `pinnedAt: null` in a newer row clears the local pin (dequeue-as-null
 *      under per-row LWW) while an OMITTED key preserves it
 *      (preserve-on-omission). Omitted ≠ explicit null is THE load-bearing
 *      distinction of this change (design D3) — DO NOT conflate them.
 *  (b) `putFlag` carries `pinnedAt` through, so the boolean-flag setters
 *      (✨/🤔/👁/💡) never drop a pin (design D4).
 *  (c) Queue semantics over pinnedAt: FIFO = pinnedAt ascending, enqueue
 *      idempotent, dequeue stores an explicit persisted `null` (so it
 *      serializes as `"pinnedAt": null` and the removal propagates).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import 'fake-indexeddb/auto'
import { db } from '../lib/db'
import { setEasy, setPinnedAt } from '../lib/services/question-flags'
import {
  enqueueQuickReview,
  dequeueQuickReview,
  isQueuedForQuickReview,
  getPinnedStillWrongIds,
} from '../lib/services/quick-review-queue'

beforeEach(async () => {
  await db.delete()
  await db.open()
})

async function getAdapter() {
  const { NEURONS_ADAPTERS } = await import('../lib/sync/tables')
  const a = NEURONS_ADAPTERS.find((x) => x.name === 'questionFlags')
  expect(a).toBeDefined()
  return a!
}

describe('questionFlags R2 adapter — pinnedAt round-trip + dequeue-as-null + preserve-on-omission', () => {
  it('a pinned row round-trips through snapshot → JSON → apply', async () => {
    await db.questionFlags.put({
      questionId: 'q-1', easyMarked: false, guessedMarked: false,
      wrongAnswerMarked: false, insightMarked: false, pinnedAt: 111, updatedAt: 500,
    })
    const a = await getAdapter()
    const snap = (await a.snapshot(db)) as Array<Record<string, unknown>>
    // Bundle JSON round-trip — pinnedAt is a plain row field, so it serializes.
    const serialized = JSON.parse(JSON.stringify(snap)) as Array<Record<string, unknown>>
    expect(serialized.find((r) => r.questionId === 'q-1')!.pinnedAt).toBe(111)
    await db.questionFlags.clear()
    await a.apply(db, serialized)
    const row = await db.questionFlags.get('q-1')
    expect(row!.pinnedAt).toBe(111)
  })

  it('an incoming EXPLICIT pinnedAt:null with newer updatedAt clears the local pin (dequeue under LWW)', async () => {
    await db.questionFlags.put({
      questionId: 'q-1', easyMarked: false, guessedMarked: false,
      wrongAnswerMarked: false, insightMarked: false, pinnedAt: 111, updatedAt: 100,
    })
    const a = await getAdapter()
    // A dequeue on the peer serializes as `"pinnedAt": null` — key PRESENT.
    await a.apply(db, [
      { questionId: 'q-1', easyMarked: false, guessedMarked: false, wrongAnswerMarked: false, insightMarked: false, pinnedAt: null, updatedAt: 200 },
    ])
    const row = await db.questionFlags.get('q-1')
    expect(row!.pinnedAt).toBeNull() // explicit null applied → pin cleared
  })

  it('an incoming row OMITTING pinnedAt does NOT clear a locally-set pin (preserve-on-omission)', async () => {
    await db.questionFlags.put({
      questionId: 'q-1', easyMarked: false, guessedMarked: false,
      wrongAnswerMarked: false, insightMarked: false, pinnedAt: 111, updatedAt: 100,
    })
    const a = await getAdapter()
    // Newer row from an OLDER (pre-v25) client that never learned pinnedAt.
    await a.apply(db, [
      { questionId: 'q-1', easyMarked: true, guessedMarked: false, updatedAt: 200 },
    ])
    const row = await db.questionFlags.get('q-1')
    expect(row!.easyMarked).toBe(true) // newer field applied
    expect(row!.pinnedAt).toBe(111) // preserve-on-omission — pin survives
  })

  it('a STALE explicit null does not clear a newer local pin (row-level LWW gate)', async () => {
    await db.questionFlags.put({
      questionId: 'q-1', easyMarked: false, guessedMarked: false,
      wrongAnswerMarked: false, insightMarked: false, pinnedAt: 111, updatedAt: 300,
    })
    const a = await getAdapter()
    await a.apply(db, [
      { questionId: 'q-1', easyMarked: false, guessedMarked: false, wrongAnswerMarked: false, insightMarked: false, pinnedAt: null, updatedAt: 100 },
    ])
    const row = await db.questionFlags.get('q-1')
    expect(row!.pinnedAt).toBe(111) // local newer → incoming skipped wholesale
  })
})

describe('putFlag pinnedAt carry-through (boolean setters never drop a pin)', () => {
  it('setEasy does NOT drop an existing pin', async () => {
    await setPinnedAt('q-1', 123)
    await setEasy('q-1', true)
    const row = await db.questionFlags.get('q-1')
    expect(row!.easyMarked).toBe(true)
    expect(row!.pinnedAt).toBe(123) // carried through
  })

  it('setPinnedAt(id, null) clears the pin as a PERSISTED explicit null, preserving flags', async () => {
    await setEasy('q-1', true)
    await setPinnedAt('q-1', 123)
    await setPinnedAt('q-1', null)
    const row = await db.questionFlags.get('q-1')
    expect(row!.pinnedAt).toBeNull()
    // Key must be PRESENT (not deleted) so it serializes as `"pinnedAt": null`
    // and the dequeue propagates cross-device (design D3).
    expect('pinnedAt' in row!).toBe(true)
    expect(row!.easyMarked).toBe(true) // flags untouched
  })
})

describe('quick-review queue over pinnedAt — FIFO order + idempotent enqueue + dequeue', () => {
  it('getPinnedStillWrongIds: only pinnedAt != null && still-wrong, pinnedAt-ascending', async () => {
    await setPinnedAt('q-late', 3000)
    await setPinnedAt('q-early', 1000)
    await setPinnedAt('q-mid', 2000)
    await setPinnedAt('q-dequeued', 1500)
    await setPinnedAt('q-dequeued', null) // explicit null → not counted
    await setEasy('q-unpinned', true) // flag row without a pin → not counted
    await setPinnedAt('q-no-longer', 500) // pinned but no longer wrong → filtered at read
    const stillWrong = new Set(['q-early', 'q-mid', 'q-late', 'q-dequeued', 'q-unpinned'])
    expect(await getPinnedStillWrongIds((id) => stillWrong.has(id))).toEqual([
      'q-early', 'q-mid', 'q-late',
    ])
  })

  it('enqueue is idempotent — re-pinning keeps the original pinnedAt (FIFO position)', async () => {
    const spy = vi.spyOn(Date, 'now')
    spy.mockReturnValue(1000)
    await enqueueQuickReview('q-1')
    spy.mockReturnValue(2000)
    await enqueueQuickReview('q-1') // already pinned → no-op
    spy.mockRestore()
    const row = await db.questionFlags.get('q-1')
    expect(row!.pinnedAt).toBe(1000)
  })

  it('dequeue nulls the pin; isQueuedForQuickReview reflects it', async () => {
    await enqueueQuickReview('q-1')
    expect(await isQueuedForQuickReview('q-1')).toBe(true)
    await dequeueQuickReview(['q-1'])
    expect(await isQueuedForQuickReview('q-1')).toBe(false)
    const row = await db.questionFlags.get('q-1')
    expect(row!.pinnedAt).toBeNull() // explicit null, row survives (carries LWW)
  })
})
