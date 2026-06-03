import { describe, it, expect } from 'vitest'
import 'fake-indexeddb/auto'
import { db } from '../lib/db'
import { recordCorrectAnswer } from '../lib/services/connectome'
import { readEarned } from '../lib/services/currency'
import { readMazeSignalState } from '../lib/maze/economy'
import { branchOfFamily } from '../lib/maze/graph'

/**
 * wire-mastery-energy-acceleration — both correct-answer faucets honor the mastery
 * multiplier. Spec: neuron-family-mastery "Mastery multiplier SHALL apply at both
 * correct-answer energy faucets for the answered family".
 *
 * The maze faucet composes streak × collection × mastery; we isolate the mastery
 * factor with a RATIO across two fresh-db first-answers (streak + collection are
 * identical, so they cancel) rather than reproducing the streak internals here.
 */

const FAMILY = '藥理學'

async function answerOnce(correct: number, total: number): Promise<{ earned: number; mazeSignal: number }> {
  await db.delete()
  await db.open()
  await db.familyAccrual.put({
    familyId: FAMILY,
    ap: 0,
    firedToday: false,
    lastFireDate: '',
    unlockedSlots: [],
    sameDayCorrect: 0,
    pullCount: 0,
  })
  await db.familyMastery.put({ familyId: FAMILY, correct, total })
  await recordCorrectAnswer(FAMILY)
  const branch = branchOfFamily(FAMILY)!
  return { earned: await readEarned(), mazeSignal: (await readMazeSignalState(branch)).signal }
}

describe('mastery multiplier applies at both correct-answer faucets', () => {
  it('FAMILY maps to an NT branch (maze faucet reachable)', () => {
    expect(branchOfFamily(FAMILY)).toBeDefined()
  })

  it('none tier (mult 1.0): neural energy = base CORRECT_ANSWER_ENERGY (3)', async () => {
    const { earned } = await answerOnce(0, 0) // → 1/1 → tier none
    expect(earned).toBe(3) // round(3 × 1.0)
  })

  it('P1 tier (mult 1.30): energy rounds to 4, maze signal ×1.30 vs none', async () => {
    const none = await answerOnce(0, 0) // tier none, mult 1.0
    const p1 = await answerOnce(200, 210) // → 201/211 → tier P1, mult 1.30

    expect(p1.earned).toBe(4) // round(3 × 1.30)
    expect(none.mazeSignal).toBeGreaterThan(0)
    expect(p1.mazeSignal / none.mazeSignal).toBeCloseTo(1.3, 5)
  })
})
