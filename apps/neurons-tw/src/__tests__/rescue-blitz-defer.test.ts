import { describe, it, expect } from 'vitest'
import {
  resolvePendingBlitzFlush,
  type PendingBlitzDone,
} from '../lib/services/rescue/rescue-blitz-defer'

// add-neurons-multi-subject-rescue — "Blitz completion is gated on startup sync" requires
// the blitzDoneAt write to be DEFERRED (flushed when the pull lands), never DROPPED.
describe('resolvePendingBlitzFlush — deferred blitz-completion flush', () => {
  const pending: PendingBlitzDone = { familyId: '藥理學', createdAt: 1_000 }

  it('does not flush while the startup pull is still pending (deferred, not dropped)', () => {
    // Even with a matching active plan, a still-gated device must hold the write.
    expect(resolvePendingBlitzFlush(pending, true, { createdAt: 1_000 })).toBeNull()
  })

  it('flushes once the gate clears and the pending run is still the active one', () => {
    expect(resolvePendingBlitzFlush(pending, false, { createdAt: 1_000 })).toEqual(pending)
  })

  it('does not resurrect a replaced run (active plan has a different createdAt)', () => {
    // A new run was minted for the family after the blitz was deferred → the stale
    // createdAt must not write blitzDoneAt onto the fresh run.
    expect(resolvePendingBlitzFlush(pending, false, { createdAt: 2_000 })).toBeNull()
  })

  it('does not flush onto an abandoned family (no active plan)', () => {
    expect(resolvePendingBlitzFlush(pending, false, null)).toBeNull()
  })

  it('returns null when nothing was deferred', () => {
    expect(resolvePendingBlitzFlush(null, false, { createdAt: 1_000 })).toBeNull()
  })
})
