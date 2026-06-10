import { describe, it, expect, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import { db } from '../lib/db'
import { pullVariant } from '../lib/services/variant-gacha'
import { recordCorrectAnswer } from '../lib/services/connectome'

/**
 * fix-neurons-family-accrual-lazy-seed: both the settle-triggered pull and the
 * correct-answer AP accrual must tolerate a MISSING `familyAccrual` row (fresh /
 * anonymous DB, or a sync-hydration race) by lazily seeding the canonical default
 * row in-transaction — instead of throwing. The orphaned `initFamilyAccrualIfEmpty`
 * never seeded these rows, so a fresh family genuinely has none.
 */

const FAMILY = '藥理學'
const resolve = (id: string): string => id

beforeEach(async () => {
  // Fresh DB with NO familyAccrual rows (the seeder is never called in prod).
  await db.delete()
  await db.open()
})

describe('pullVariant lazy-seeds a missing familyAccrual row', () => {
  it('succeeds, mints a variant + individual, and seeds the row with pullCount=1', async () => {
    expect(await db.familyAccrual.get(FAMILY)).toBeUndefined()

    const r = await pullVariant(FAMILY, resolve)

    expect(r.ok).toBe(true)
    // The row was lazily created and its pity clock advanced to 1.
    const acc = await db.familyAccrual.get(FAMILY)
    expect(acc).toBeDefined()
    expect(acc?.pullCount).toBe(1)
    expect(acc?.ap).toBe(0)
    // The pull was NOT dropped — a variant row + individual were minted.
    expect(await db.neuronVariants.where('familyId').equals(FAMILY).count()).toBe(1)
    expect(await db.neuronInstances.where('familyId').equals(FAMILY).count()).toBe(1)
  })
})

describe('recordCorrectAnswer lazy-seeds a missing familyAccrual row', () => {
  it('does not throw, seeds the row, and accrues AP to 1', async () => {
    // Mastery IS seeded (initMasteryForPack runs on homepage mount); only the
    // accrual row is absent — the exact production shape of the bug.
    await db.familyMastery.put({ familyId: FAMILY, correct: 0, total: 0 })
    expect(await db.familyAccrual.get(FAMILY)).toBeUndefined()

    await expect(recordCorrectAnswer(FAMILY)).resolves.toBeUndefined()

    const acc = await db.familyAccrual.get(FAMILY)
    expect(acc).toBeDefined()
    expect(acc?.ap).toBe(1) // prevAp defaulted to 0 → +1
  })
})
