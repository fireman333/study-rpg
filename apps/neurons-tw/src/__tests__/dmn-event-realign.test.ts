import { describe, it, expect, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import type { Question } from '@study-rpg/core'
import { FAMILY_BUFF_ENERGY_MULT } from '@study-rpg/content-neurons-tw'
import { db, type QuestionHistoryRow } from '../lib/db'
import { recordCorrectAnswer } from '../lib/services/connectome'
import { getActiveFamilyBuffMultiplier } from '../lib/services/dmn-event-dispatcher'
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

describe('getActiveFamilyBuffMultiplier', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
  })

  it('returns 1 when no buff is active', async () => {
    expect(await getActiveFamilyBuffMultiplier(FAMILY)).toBe(1)
  })

  it('returns FAMILY_BUFF_ENERGY_MULT for the matching family while active', async () => {
    await db.dmnActiveBuffs.add({
      buffKind: 'family-buff',
      familyId: FAMILY,
      expiresAt: Date.now() + 60 * 60 * 1000,
      payload: null,
      sourceCardId: 'c',
    })
    expect(await getActiveFamilyBuffMultiplier(FAMILY)).toBe(FAMILY_BUFF_ENERGY_MULT)
    expect(await getActiveFamilyBuffMultiplier(OTHER)).toBe(1) // non-matching family
  })

  it('returns 1 for an expired buff', async () => {
    await db.dmnActiveBuffs.add({
      buffKind: 'family-buff',
      familyId: FAMILY,
      expiresAt: Date.now() - 1000,
      payload: null,
      sourceCardId: 'c',
    })
    expect(await getActiveFamilyBuffMultiplier(FAMILY)).toBe(1)
  })
})

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
