/**
 * Unit tests for refold-neurons-quick-review-into-expedition:
 * - `leadThenFill` ordering (pins lead, deduped, order preserved, optional cap)
 * - `getPinnedStillWrongIds` still-wrong filtering (queue order preserved)
 * - dequeue-after-full-expedition drains served pins, keeps the rest
 */

import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest'
import { leadThenFill } from '../lib/services/expedition'
import {
  enqueueQuickReview,
  getPinnedStillWrongIds,
  getQuickReviewQueue,
  dequeueQuickReview,
  clearQuickReviewQueue,
  pruneQuickReviewQueue,
  subscribeQuickReviewQueue,
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

describe('quick-review queue: pin filtering + dequeue', () => {
  beforeEach(() => {
    const store = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
      setItem: (k: string, v: string) => {
        store.set(k, v)
      },
      removeItem: (k: string) => {
        store.delete(k)
      },
    })
    clearQuickReviewQueue()
  })

  afterAll(() => {
    vi.unstubAllGlobals()
  })

  it('getPinnedStillWrongIds keeps only still-wrong ids, in enqueue order', () => {
    enqueueQuickReview('q1')
    enqueueQuickReview('q2')
    enqueueQuickReview('q3')
    // q2 is no longer wrong (cleared elsewhere) → excluded; q1/q3 kept in order.
    const stillWrong = new Set(['q1', 'q3'])
    expect(getPinnedStillWrongIds((id) => stillWrong.has(id))).toEqual(['q1', 'q3'])
  })

  it('getPinnedStillWrongIds is empty when nothing is still wrong', () => {
    enqueueQuickReview('q1')
    expect(getPinnedStillWrongIds(() => false)).toEqual([])
  })

  it('dequeue after a full expedition drops served pins, keeps the rest', () => {
    enqueueQuickReview('q1')
    enqueueQuickReview('q2')
    enqueueQuickReview('q3')
    // The full expedition served q1 + q2 (they were led to the front + cleared).
    dequeueQuickReview(['q1', 'q2'])
    expect(getQuickReviewQueue()).toEqual(['q3'])
  })

  it('dequeue ignores ids that were never queued (safe intersection)', () => {
    enqueueQuickReview('q1')
    // Passing the whole served pool (incl. non-pinned wrong questions) only removes
    // ids actually in the queue — mirrors OverviewPage passing expeditionPool ids.
    dequeueQuickReview(['q1', 'not-pinned-a', 'not-pinned-b'])
    expect(getQuickReviewQueue()).toEqual([])
  })

  it('pruneQuickReviewQueue drops ids no longer wrong, keeps order of the rest', () => {
    enqueueQuickReview('q1')
    enqueueQuickReview('q2')
    enqueueQuickReview('q3')
    const stillWrong = new Set(['q1', 'q3']) // q2 cleared elsewhere
    pruneQuickReviewQueue((id) => stillWrong.has(id))
    expect(getQuickReviewQueue()).toEqual(['q1', 'q3'])
  })

  it('pruneQuickReviewQueue does NOT write/notify when nothing changes', () => {
    enqueueQuickReview('q1')
    let hits = 0
    const off = subscribeQuickReviewQueue(() => {
      hits += 1
    })
    pruneQuickReviewQueue(() => true) // q1 still wrong → no-op
    off()
    expect(hits).toBe(0)
    expect(getQuickReviewQueue()).toEqual(['q1'])
  })

  it('subscribeQuickReviewQueue fires on mutation and stops after unsubscribe', () => {
    let hits = 0
    const off = subscribeQuickReviewQueue(() => {
      hits += 1
    })
    enqueueQuickReview('q1') // write → notify
    dequeueQuickReview(['q1']) // write → notify
    expect(hits).toBe(2)
    off()
    enqueueQuickReview('q2') // no longer subscribed
    expect(hits).toBe(2)
  })
})
