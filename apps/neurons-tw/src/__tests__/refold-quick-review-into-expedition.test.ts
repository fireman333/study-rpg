/**
 * Unit tests for refold-neurons-quick-review-into-expedition:
 * - `leadThenFill` ordering (pins lead, deduped, order preserved, optional cap)
 * - `getPinnedStillWrongIds` still-wrong filtering (pin order preserved)
 * - dequeue-after-full-expedition drains served pins, keeps the rest
 *
 * The queue moved off localStorage onto the R2-synced `questionFlags.pinnedAt`
 * (add-neurons-pin-queue-r2-sync) — the queue block below exercises the same
 * refold contracts over the Dexie-backed API. The old subscribe/prune tests are
 * gone with the machinery (reactivity is native Dexie liveQuery; still-wrong is
 * a read-time filter). Sync-level pinnedAt tests live in pin-queue-r2-sync.test.ts.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import 'fake-indexeddb/auto'
import { db } from '../lib/db'
import { leadThenFill } from '../lib/services/expedition'
import {
  enqueueQuickReview,
  getPinnedStillWrongIds,
  dequeueQuickReview,
  clearQuickReviewQueue,
} from '../lib/services/quick-review-queue'

const item = (id: string): { id: string } => ({ id })

describe('leadThenFill', () => {
  it('places lead items ahead of the fill pool, order preserved', () => {
    const lead = [item('b'), item('d')]
    const fill = [item('a'), item('b'), item('c'), item('d'), item('e')]
    expect(leadThenFill(lead, fill).map((x) => x.id)).toEqual(['b', 'd', 'a', 'c', 'e'])
  })

  it('dedupes: a lead item already present in fill is not repeated', () => {
    const lead = [item('a')]
    const fill = [item('a'), item('b')]
    expect(leadThenFill(lead, fill).map((x) => x.id)).toEqual(['a', 'b'])
  })

  it('dedupes duplicate lead ids', () => {
    const lead = [item('a'), item('a')]
    const fill = [item('b')]
    expect(leadThenFill(lead, fill).map((x) => x.id)).toEqual(['a', 'b'])
  })

  it('honours the cap: lead + fill truncated to the cap', () => {
    const lead = [item('x'), item('y')]
    const fill = [item('a'), item('b'), item('c'), item('d')]
    expect(leadThenFill(lead, fill, 3).map((x) => x.id)).toEqual(['x', 'y', 'a'])
  })

  it('cap smaller than the lead list still truncates', () => {
    const lead = [item('x'), item('y'), item('z')]
    const fill = [item('a')]
    expect(leadThenFill(lead, fill, 2).map((x) => x.id)).toEqual(['x', 'y'])
  })

  it('no cap returns the full merged list', () => {
    expect(leadThenFill([item('a')], [item('b'), item('c')]).map((x) => x.id)).toEqual([
      'a',
      'b',
      'c',
    ])
  })
})

describe('quick-review queue: pin filtering + dequeue (questionFlags.pinnedAt)', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
    // Deterministic strictly-increasing Date.now so enqueue order (pinnedAt asc)
    // is stable even when calls land in the same millisecond.
    let tick = 1_000
    vi.spyOn(Date, 'now').mockImplementation(() => ++tick)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('getPinnedStillWrongIds keeps only still-wrong ids, in enqueue order', async () => {
    await enqueueQuickReview('q1')
    await enqueueQuickReview('q2')
    await enqueueQuickReview('q3')
    // q2 is no longer wrong (cleared elsewhere) → excluded; q1/q3 kept in order.
    const stillWrong = new Set(['q1', 'q3'])
    expect(await getPinnedStillWrongIds((id) => stillWrong.has(id))).toEqual(['q1', 'q3'])
  })

  it('getPinnedStillWrongIds is empty when nothing is still wrong', async () => {
    await enqueueQuickReview('q1')
    expect(await getPinnedStillWrongIds(() => false)).toEqual([])
  })

  it('dequeue after a full expedition drops served pins, keeps the rest', async () => {
    await enqueueQuickReview('q1')
    await enqueueQuickReview('q2')
    await enqueueQuickReview('q3')
    // The full expedition served q1 + q2 (they were led to the front + cleared).
    await dequeueQuickReview(['q1', 'q2'])
    expect(await getPinnedStillWrongIds(() => true)).toEqual(['q3'])
  })

  it('dequeue ignores ids that were never queued (safe intersection)', async () => {
    await enqueueQuickReview('q1')
    // Passing the whole served pool (incl. non-pinned wrong questions) only clears
    // ids actually pinned — mirrors OverviewPage passing expeditionPool ids.
    await dequeueQuickReview(['q1', 'not-pinned-a', 'not-pinned-b'])
    expect(await getPinnedStillWrongIds(() => true)).toEqual([])
    // No phantom flag row is minted for a never-pinned id (no updatedAt churn).
    expect(await db.questionFlags.get('not-pinned-a')).toBeUndefined()
  })

  it('clearQuickReviewQueue nulls every pin', async () => {
    await enqueueQuickReview('q1')
    await enqueueQuickReview('q2')
    await clearQuickReviewQueue()
    expect(await getPinnedStillWrongIds(() => true)).toEqual([])
  })
})
