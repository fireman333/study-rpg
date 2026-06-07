import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import 'fake-indexeddb/auto'
import {
  effectiveP0Rate,
  effectiveP1Rate,
  rollRarityWithP0Pity,
  P0_BASE_RATE,
  P1_PITY_START,
} from '@study-rpg/content-neurons-tw'
import { db } from '../lib/db'
import { pullVariant } from '../lib/services/variant-gacha'

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

describe('effectiveP1Rate (silent P1 soft-pity ramp — rebalance-neurons-maze-economy)', () => {
  it('is 0 before the pity start (P1 reachable only via the weighted roll)', () => {
    expect(effectiveP1Rate(1)).toBe(0)
    expect(effectiveP1Rate(P1_PITY_START)).toBe(0)
  })

  it('ramps toward certainty past the pity start', () => {
    expect(effectiveP1Rate(P1_PITY_START + 1)).toBeGreaterThan(0)
    expect(effectiveP1Rate(P1_PITY_START + 100)).toBe(1)
  })
})

describe('rollRarityWithP0Pity', () => {
  it('returns P0 at the low end when P0 is unowned', () => {
    expect(rollRarityWithP0Pity(1, false, false, () => 0)).toBe('P0')
  })

  it('excludes P0 when already owned', () => {
    expect(rollRarityWithP0Pity(1, true, false, () => 0)).toBe('P5')
  })

  it('does not return P0 on a high roll past the base rate', () => {
    expect(rollRarityWithP0Pity(1, false, false, () => 0.999)).not.toBe('P0')
  })

  it('P1 silent pity forces P1 when unowned + past the pity start (P0 owned, mid roll)', () => {
    // P0 owned → P0 check skipped; rng=0.5 < effectiveP1Rate(big) ≈ 1 → P1.
    expect(rollRarityWithP0Pity(P1_PITY_START + 100, true, false, () => 0.5)).toBe('P1')
  })

  it('P1 pity is inert once P1 is owned (falls through to the weighted roll)', () => {
    // P0 owned + P1 owned → both pity checks skipped; rng=0 → first weighted tier (P5).
    expect(rollRarityWithP0Pity(P1_PITY_START + 100, true, true, () => 0)).toBe('P5')
  })
})

describe('pullVariant (maze-settle triggered, free at this layer)', () => {
  it('bumps pullCount and mints a new variant (no currency spend)', async () => {
    await seedFamily('藥理學')
    const r = await pullVariant('藥理學', resolve)
    expect(r.ok).toBe(true)
    const acc = await db.familyAccrual.get('藥理學')
    expect(acc?.pullCount).toBe(1)
    expect(await db.neuronVariants.where('familyId').equals('藥理學').count()).toBe(1)
    // Each pull mints one individual (the Pikmin-Bloom layer).
    expect(await db.neuronInstances.where('familyId').equals('藥理學').count()).toBe(1)
  })

  it('pulls a dupe (no rejection) when the rolled tier is fully owned', async () => {
    // Open collection: a fully-owned tier is still pullable; fill-missing-first finds
    // no unowned slot in the rolled tier → dupe (copies +1). No 全部收集 gate.
    vi.spyOn(Math, 'random').mockReturnValue(0.5) // P0 excluded (owned) → lands P5
    await seedFamily('藥理學')
    // Seed all 10 route-1 slots (0..9) so every within-tier pick lands on an owned slot.
    for (let slotIndex = 0; slotIndex <= 9; slotIndex++) {
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
    expect(r.ok).toBe(true)
    expect(r.isDupe).toBe(true)
    // No new row (still 10); a copies increment + a new individual.
    expect(await db.neuronVariants.where('familyId').equals('藥理學').count()).toBe(10)
    const acc = await db.familyAccrual.get('藥理學')
    expect(acc?.pullCount).toBe(1)
  })

  it('within-tier roll can land on the second P5 variant (slot 6)', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5)
    await seedFamily('藥理學')
    await db.neuronVariants.put({
      familyId: '藥理學',
      slotIndex: 0,
      rarity: 'P0',
      displayName: 'p0',
      spriteKey: 'variant:藥理學:0',
      rolledAt: 1,
      wasPityFloor: false,
      copies: 1,
    })
    const r = await pullVariant('藥理學', resolve)
    expect(r.ok).toBe(true)
    expect(r.rarity).toBe('P5')
    expect(r.variant?.slotIndex).toBe(6)
  })

  it('increments copies on a duplicate pull (rolled tier fully owned → fill-missing-first dupes)', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0)
    await seedFamily('藥理學')
    // Seed P0 + both P5 slots (1, 6) so a P5 roll has no missing slot left to fill.
    for (const [slotIndex, rarity] of [[0, 'P0'], [1, 'P5'], [6, 'P5']] as const) {
      await db.neuronVariants.put({
        familyId: '藥理學',
        slotIndex,
        rarity,
        displayName: `x${slotIndex}`,
        spriteKey: `variant:藥理學:${slotIndex}`,
        rolledAt: 1,
        wasPityFloor: false,
        copies: 1,
      })
    }
    // rng=0 → P0 owned (skip), P1 pity inert (low pullCount), weighted → P5; both P5
    // owned → fill-missing-first falls back to a dupe at tierDefs[0] = slot 1.
    const r = await pullVariant('藥理學', resolve)
    expect(r.ok).toBe(true)
    expect(r.isDupe).toBe(true)
    const dupeRow = await db.neuronVariants.get(['藥理學', 1])
    expect(dupeRow?.copies).toBe(2)
    expect(dupeRow?.rarity).toBe('P5')
  })

  it('fill-missing-first: a within-tier roll fills an UNOWNED slot before duping (rebalance)', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0)
    await seedFamily('藥理學')
    // Seed P0 + ONE of the two P5 slots (slot 1). A P5 roll SHOULD fill the missing
    // P5 slot (6), NOT dupe slot 1 — this is the fill-missing-first behavior.
    for (const [slotIndex, rarity] of [[0, 'P0'], [1, 'P5']] as const) {
      await db.neuronVariants.put({
        familyId: '藥理學',
        slotIndex,
        rarity,
        displayName: `x${slotIndex}`,
        spriteKey: `variant:藥理學:${slotIndex}`,
        rolledAt: 1,
        wasPityFloor: false,
        copies: 1,
      })
    }
    const r = await pullVariant('藥理學', resolve)
    expect(r.ok).toBe(true)
    expect(r.isDupe).toBe(false) // filled the missing P5 slot, did NOT dupe
    expect(r.rarity).toBe('P5')
    expect(r.variant?.slotIndex).toBe(6) // the previously-unowned P5 slot
  })
})
