import { describe, it, expect } from 'vitest'
import 'fake-indexeddb/auto'
import { db } from '../lib/db'
import { recordCorrectAnswer } from '../lib/services/connectome'
import { readMazeEnergyState } from '../lib/maze/economy'

/**
 * wire-mastery-energy-acceleration (carried through redesign-neurons-maze-rotjs-grid):
 * the correct-answer energy faucet honors the mastery multiplier. There is a SINGLE
 * energy faucet — the per-FAMILY maze energy (the former global pull currency is
 * retired). We isolate the mastery factor with a RATIO across two fresh-db
 * first-answers (streak + collection are identical, so they cancel).
 */

const FAMILY = '藥理學'

async function answerOnce(correct: number, total: number): Promise<number> {
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
  return (await readMazeEnergyState(FAMILY)).earned
}

describe('mastery multiplier applies at the (sole) correct-answer energy faucet', () => {
  it('answering accrues into the family own pool (maze faucet reachable)', async () => {
    expect(await answerOnce(0, 0)).toBeGreaterThan(0)
  })

  it('P1-tier energy is ×1.30 vs none-tier (mastery accelerates energy acquisition)', async () => {
    const none = await answerOnce(0, 0) // → 1/1 → tier none, mult 1.0
    const p1 = await answerOnce(200, 210) // → 201/211 → tier P1, mult 1.30
    expect(none).toBeGreaterThan(0)
    expect(p1 / none).toBeCloseTo(1.3, 5)
  })
})
