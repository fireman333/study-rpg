import { describe, it, expect } from 'vitest'
import 'fake-indexeddb/auto'
import type { Question } from '@study-rpg/core'
import { FAMILY_BUFF_ENERGY_MULT } from '@study-rpg/content-neurons-tw'
import { db, type QuestionHistoryRow } from '../lib/db'
import { recordCorrectAnswer } from '../lib/services/connectome'
import { buildQuickReviewPool } from '../lib/services/expedition'
import { readMazeEnergyState } from '../lib/maze/economy'
import { branchOfFamily } from '../lib/maze/graph'

/**
 * realign-dmn-event-rewards-to-maze:
 *  - family-buff now multiplies the (sole) maze-energy faucet by
 *    FAMILY_BUFF_ENERGY_MULT for the buffed family, no longer touching AP.
 *  - quick-review-batch arms a ≤5-question expedition mini-batch.
 */

const FAMILY = '藥理學'
const OTHER = '解剖學'

async function seedAndAnswer(buffFamilyId: string | null): Promise<number> {
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
  await db.familyMastery.put({ familyId: FAMILY, correct: 0, total: 0 }) // tier none → mastery ×1.0
  if (buffFamilyId !== null) {
    await db.dmnActiveBuffs.add({
      buffKind: 'family-buff',
      familyId: buffFamilyId,
      expiresAt: Date.now() + 60 * 60 * 1000,
      payload: null,
      sourceCardId: 'test-card',
    })
  }
  await recordCorrectAnswer(FAMILY)
  return (await readMazeEnergyState(branchOfFamily(FAMILY)!)).earned
}

// NOTE: family-buff's active-buff → energy multiplier is now folded into the
// acceleration `energyAccel` pool (add-neurons-acceleration-system superseded the
// standalone getActiveFamilyBuffMultiplier helper). The end-to-end tests below
// remain the regression guard — a family-buff still yields FAMILY_BUFF_ENERGY_MULT×
// branch energy via energyAccel (1 + 1.0 = 2.0). See acceleration.test.ts for the
// unit-level pool composition + cap.

describe('family-buff multiplies the maze-energy faucet (not AP)', () => {
  it(`buffed family accrues ${FAMILY_BUFF_ENERGY_MULT}× the branch energy of an unbuffed answer`, async () => {
    const unbuffed = await seedAndAnswer(null)
    const buffed = await seedAndAnswer(FAMILY)
    expect(unbuffed).toBeGreaterThan(0)
    expect(buffed / unbuffed).toBeCloseTo(FAMILY_BUFF_ENERGY_MULT, 5)
  })

  it('a buff for a different family does NOT multiply this family', async () => {
    const unbuffed = await seedAndAnswer(null)
    const otherBuffed = await seedAndAnswer(OTHER)
    expect(otherBuffed / unbuffed).toBeCloseTo(1, 5)
  })

  it('family-buff leaves AP at the flat +1 gain (no AP boost)', async () => {
    await seedAndAnswer(FAMILY)
    const accrual = await db.familyAccrual.get(FAMILY)
    expect(accrual?.ap).toBe(1) // started 0, +1 flat regardless of buff
  })
})

describe('buildQuickReviewPool caps the wrong pool', () => {
  const q = (id: string, subject: string): Question =>
    ({ id, subject, stem: 's', options: { A: 'a', B: 'b' }, answer: 'A' }) as unknown as Question
  const hist = (questionId: string): QuestionHistoryRow => ({
    questionId,
    family: 'x',
    lastResult: 'wrong',
    everWrong: true,
    lastAnsweredAt: 1,
    updatedAt: 1,
  })

  it('caps at 5 when more than 5 are wrong', () => {
    const pool = Array.from({ length: 8 }, (_, i) => q(`q${i}`, '藥理學'))
    const history = pool.map((x) => hist(x.id))
    expect(buildQuickReviewPool(pool, history, 5)).toHaveLength(5)
  })

  it('returns all when fewer than 5 are wrong', () => {
    const pool = [q('q0', '藥理學'), q('q1', '藥理學'), q('q2', '藥理學')]
    const history = pool.map((x) => hist(x.id))
    expect(buildQuickReviewPool(pool, history, 5)).toHaveLength(3)
  })

  it('returns empty when nothing is wrong', () => {
    expect(buildQuickReviewPool([q('q0', '藥理學')], [], 5)).toEqual([])
  })
})
