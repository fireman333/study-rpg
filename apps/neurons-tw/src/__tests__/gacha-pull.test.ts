import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import 'fake-indexeddb/auto'
import {
  effectiveP0Rate,
  rollRarityWithP0Pity,
  P0_BASE_RATE,
  PULL_COST,
} from '@study-rpg/content-neurons-tw'
import { db } from '../lib/db'
import { pullVariant } from '../lib/services/variant-gacha'
import { awardEnergy, readBalance } from '../lib/services/currency'

const resolve = (id: string): string => id

function seedFamily(familyId: string, pullCount = 0): Promise<unknown> {
  return db.familyAccrual.put({
    familyId,
    ap: 5,
    firedToday: false,
    lastFireDate: null,
    unlockedSlots: [],
    sameDayCorrect: 0,
    pullCount,
  })
}

beforeEach(async () => {
  await db.delete()
  await db.open()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('effectiveP0Rate (P0 soft-pity ramp)', () => {
  it('is the base rate before the pity start', () => {
    expect(effectiveP0Rate(1)).toBeCloseTo(P0_BASE_RATE, 6)
    expect(effectiveP0Rate(40)).toBeCloseTo(P0_BASE_RATE, 6)
  })

  it('ramps toward near-certainty by ~pull 60', () => {
    expect(effectiveP0Rate(60)).toBeGreaterThanOrEqual(0.99)
    expect(effectiveP0Rate(1000)).toBe(1)
  })
})

describe('rollRarityWithP0Pity', () => {
  it('returns P0 at the low end when P0 is unowned', () => {
    expect(rollRarityWithP0Pity(1, false, () => 0)).toBe('P0')
  })

  it('excludes P0 when already owned', () => {
    // rng=0 would have hit P0, but p0Owned skips it → falls to the commonest tier.
    expect(rollRarityWithP0Pity(1, true, () => 0)).toBe('P5')
  })

  it('does not return P0 on a high roll past the base rate', () => {
    expect(rollRarityWithP0Pity(1, false, () => 0.999)).not.toBe('P0')
  })
})

describe('pullVariant', () => {
  it('spends cost, bumps pullCount, and mints a new variant', async () => {
    await seedFamily('藥理學')
    await awardEnergy(100)
    const r = await pullVariant('藥理學', resolve)
    expect(r.ok).toBe(true)
    expect(await readBalance()).toBe(100 - PULL_COST)
    const acc = await db.familyAccrual.get('藥理學')
    expect(acc?.pullCount).toBe(1)
    expect(await db.neuronVariants.where('familyId').equals('藥理學').count()).toBe(1)
  })

  it('is rejected (no spend) when balance is below cost', async () => {
    await seedFamily('藥理學')
    await awardEnergy(PULL_COST - 1)
    const r = await pullVariant('藥理學', resolve)
    expect(r.ok).toBe(false)
    expect(r.reason).toBe('insufficient')
    expect(await db.neuronVariants.count()).toBe(0)
    expect(await readBalance()).toBe(PULL_COST - 1)
  })

  it('is rejected (no spend) when the family is fully collected', async () => {
    await seedFamily('藥理學')
    await awardEnergy(100)
    for (let slotIndex = 0; slotIndex <= 5; slotIndex++) {
      await db.neuronVariants.put({
        familyId: '藥理學',
        slotIndex,
        rarity: 'P5',
        displayName: `x${slotIndex}`,
        spriteKey: `variant:藥理學:${slotIndex}`,
        rolledAt: 1000,
        wasPityFloor: false,
        copies: 1,
      })
    }
    const r = await pullVariant('藥理學', resolve)
    expect(r.ok).toBe(false)
    expect(r.reason).toBe('complete')
    expect(await readBalance()).toBe(100)
  })

  it('increments copies on a duplicate pull', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0)
    await seedFamily('藥理學')
    await awardEnergy(100)
    // rng=0 → pull1 P0 (slotIndex 0, new); pull2 P5 (P0 now owned). NOTE:
    // SLOT_RARITY maps P5 → slotIndex 1 (slot 5 is P1), so P5 lives at slot 1.
    // pull3 P5 again → dupe at slot 1 (copies 2).
    await pullVariant('藥理學', resolve)
    await pullVariant('藥理學', resolve)
    const r3 = await pullVariant('藥理學', resolve)
    expect(r3.ok).toBe(true)
    expect(r3.isDupe).toBe(true)
    const dupeRow = await db.neuronVariants.get(['藥理學', 1])
    expect(dupeRow?.copies).toBe(2)
    expect(dupeRow?.rarity).toBe('P5')
  })
})
