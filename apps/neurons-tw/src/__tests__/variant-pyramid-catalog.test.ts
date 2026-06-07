import { describe, it, expect } from 'vitest'
import {
  NEURON_VARIANT_CATALOG,
  VARIANT_COUNT_BY_FAMILY,
  NEURON_VARIANT_TOTAL,
  type Rarity,
} from '@study-rpg/content-neurons-tw'

/**
 * Pyramid-catalog shape. The content pack's module-load `assertCatalogShape`
 * already throws on any violation; these tests pin the shipped shape + the
 * structural invariants explicitly.
 *
 * Catalog = 220 (11 families × 20): 10 first-route pyramid slots (0..9) + 10
 * 二回目 location-variant slots (10..19, isLocation) per family
 * (add-neurons-maze-second-lap-variants). The PYRAMID invariant applies only to
 * the first-route (non-location) subset — location variants are deterministic
 * position unlocks excluded from the rarity pyramid.
 */

const FAMILIES = [...new Set(NEURON_VARIANT_CATALOG.map((e) => e.familyId))]
const RARE_TO_COMMON: Rarity[] = ['P0', 'P1', 'P2', 'P3', 'P4', 'P5']
/** First-route pyramid subset (location variants excluded). */
const PYRAMID = NEURON_VARIANT_CATALOG.filter((e) => !e.isLocation)
const LOCATION = NEURON_VARIANT_CATALOG.filter((e) => e.isLocation)

// D1 Option A per-family first-route slot → rarity layout (slots 0..9):
//   0=P0 | 1=P5 2=P4 3=P3 4=P2 5=P1 | 6=P5 7=P4 8=P3 9=P2
// → per-tier slot-sets: P0{0} P1{5} P2{4,9} P3{3,8} P4{2,7} P5{1,6}
const SLOTS_BY_TIER: Record<Rarity, number[]> = {
  P0: [0],
  P1: [5],
  P2: [4, 9],
  P3: [3, 8],
  P4: [2, 7],
  P5: [1, 6],
}

describe('pyramid variant catalog', () => {
  it('ships 11 families × 20 slots = 220 entries (110 pyramid + 110 二回目 location)', () => {
    expect(NEURON_VARIANT_CATALOG).toHaveLength(220)
    expect(NEURON_VARIANT_TOTAL).toBe(220)
    expect(FAMILIES).toHaveLength(11)
    for (const f of FAMILIES) expect(VARIANT_COUNT_BY_FAMILY[f]).toBe(20)
    expect(PYRAMID).toHaveLength(110)
    expect(LOCATION).toHaveLength(110)
  })

  it('marks every 二回目 location variant: isLocation + slotIndex >= 10 + rarity P3 + canonical spriteKey', () => {
    for (const e of LOCATION) {
      expect(e.isLocation).toBe(true)
      expect(e.slotIndex).toBeGreaterThanOrEqual(10)
      expect(e.rarity).toBe('P3')
      expect(e.spriteKey).toBe(`variant:${e.familyId}:${e.slotIndex}`)
    }
    for (const f of FAMILIES) {
      expect(LOCATION.filter((e) => e.familyId === f)).toHaveLength(10)
    }
  })

  it('gives each family exactly one P0 apex at slotIndex 0', () => {
    for (const f of FAMILIES) {
      const fam = NEURON_VARIANT_CATALOG.filter((e) => e.familyId === f)
      const p0 = fam.filter((e) => e.rarity === 'P0')
      expect(p0).toHaveLength(1)
      expect(p0[0].slotIndex).toBe(0)
    }
  })

  it('uses contiguous unique slotIndex 0..19 per family (pyramid 0..9 + location 10..19)', () => {
    for (const f of FAMILIES) {
      const slots = NEURON_VARIANT_CATALOG.filter((e) => e.familyId === f)
        .map((e) => e.slotIndex)
        .sort((a, b) => a - b)
      expect(slots).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19])
    }
  })

  it('reads first-route rarity from the explicit field, with the D1 Option A per-tier slot-sets', () => {
    // Pyramid subset only (location variants are P3 at slots 10..19, excluded).
    for (const f of FAMILIES) {
      for (const tier of RARE_TO_COMMON) {
        const slots = PYRAMID.filter((e) => e.familyId === f && e.rarity === tier).map((e) => e.slotIndex)
        expect(new Set(slots)).toEqual(new Set(SLOTS_BY_TIER[tier]))
      }
    }
  })

  it('satisfies the pyramid invariant on the first-route subset (rarer tier ≤ commoner tier count)', () => {
    for (const f of FAMILIES) {
      const fam = PYRAMID.filter((e) => e.familyId === f)
      const count = (r: Rarity): number => fam.filter((e) => e.rarity === r).length
      for (let i = 0; i < RARE_TO_COMMON.length - 1; i++) {
        const rarer = count(RARE_TO_COMMON[i])
        const commoner = count(RARE_TO_COMMON[i + 1])
        expect(rarer).toBeLessThanOrEqual(commoner)
      }
    }
  })
})
