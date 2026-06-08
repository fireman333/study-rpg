import { describe, it, expect, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import { db } from '../lib/db'

/**
 * Locks the per-field monotonic-MAX merge contract for the `familyMastery` R2
 * sync adapter (spec `neuron-family-mastery` Req "Per-family mastery SHALL
 * track correct and total attempt counts", cross-device sync clause).
 *
 * DO NOT relax these to plain row-LWW — that would silently swallow a
 * concurrent device's attempt increment. Same discipline family as the
 * `everWrong` monotonic-OR (question-history-merge.test.ts) and the
 * `dmnEventLog` monotonic-union carve-outs.
 */

beforeEach(async () => {
  await db.delete()
  await db.open()
})

async function getAdapter() {
  const { NEURONS_ADAPTERS } = await import('../lib/sync/tables')
  const a = NEURONS_ADAPTERS.find((x) => x.name === 'familyMastery')
  expect(a).toBeDefined()
  return a!
}

describe('familyMastery adapter — per-field monotonic-MAX merge', () => {
  it('merges correct and total by per-field MAX, never row-LWW, in either order', async () => {
    const a = await getAdapter()

    // Order A: local = device A (12, 17), incoming = device B (11, 19)
    await db.familyMastery.put({ familyId: 'pharma', correct: 12, total: 17 })
    await a.apply(db, [{ familyId: 'pharma', correct: 11, total: 19 }])
    let row = await db.familyMastery.get('pharma')
    expect(row).toEqual({ familyId: 'pharma', correct: 12, total: 19 })
    expect(row!.total).toBeGreaterThanOrEqual(row!.correct) // invariant

    // Order B: local = device B (11, 19), incoming = device A (12, 17)
    await db.familyMastery.put({ familyId: 'pharma', correct: 11, total: 19 })
    await a.apply(db, [{ familyId: 'pharma', correct: 12, total: 17 }])
    row = await db.familyMastery.get('pharma')
    expect(row).toEqual({ familyId: 'pharma', correct: 12, total: 19 }) // order-independent
    expect(row!.total).toBeGreaterThanOrEqual(row!.correct)
  })

  it('re-applying the same incoming row is idempotent (no double-count)', async () => {
    const a = await getAdapter()
    await db.familyMastery.put({ familyId: 'physio', correct: 3, total: 5 })
    await a.apply(db, [{ familyId: 'physio', correct: 4, total: 6 }])
    await a.apply(db, [{ familyId: 'physio', correct: 4, total: 6 }]) // twice
    const row = await db.familyMastery.get('physio')
    expect(row).toEqual({ familyId: 'physio', correct: 4, total: 6 }) // not (8, 12)
  })

  it('concurrent same-state attempts collapse — documented limitation', async () => {
    // Both devices start from (correct: 3, total: 5).
    // Device A answers correctly → local (4, 6).
    // Device B answers incorrectly → local (3, 6).
    // MAX merge collapses B's `total` increment into A's: (4, 6), NOT (4, 7).
    const a = await getAdapter()
    await db.familyMastery.put({ familyId: 'physio', correct: 4, total: 6 }) // device A local
    await a.apply(db, [{ familyId: 'physio', correct: 3, total: 6 }]) // device B incoming
    const row = await db.familyMastery.get('physio')
    expect(row).toEqual({ familyId: 'physio', correct: 4, total: 6 })
    expect(row!.total).not.toBe(7) // MAX projection cannot recover the lost attempt
    expect(row!.total).toBeGreaterThanOrEqual(row!.correct)
  })
})
