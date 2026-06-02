import { describe, it, expect } from 'vitest'
import {
  NEURON_VARIANT_CATALOG,
  VARIANT_COUNT_BY_FAMILY,
  type Rarity,
} from '@study-rpg/content-neurons-tw'

/**
 * Pyramid-catalog shape. The content pack's module-load `assertCatalogShape`
 * already throws on any violation; these tests pin the shipped shape
 * (110 = 11 × 10, D1 Option A "thicken mids" — expand-neuron-variant-catalog)
 * + the structural invariants explicitly.
 */

const FAMILIES = [...new Set(NEURON_VARIANT_CATALOG.map((e) => e.familyId))]
const RARE_TO_COMMON: Rarity[] = ['P0', 'P1', 'P2', 'P3', 'P4', 'P5']

// D1 Option A per-family slot → rarity layout (slots 0..9):
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
  it('ships 11 families × 10 slots = 110 entries', () => {
    expect(NEURON_VARIANT_CATALOG).toHaveLength(110)
    expect(FAMILIES).toHaveLength(11)
    for (const f of FAMILIES) expect(VARIANT_COUNT_BY_FAMILY[f]).toBe(10)
  })

  it('gives each family exactly one P0 apex at slotIndex 0', () => {
    for (const f of FAMILIES) {
      const fam = NEURON_VARIANT_CATALOG.filter((e) => e.familyId === f)
      const p0 = fam.filter((e) => e.rarity === 'P0')
      expect(p0).toHaveLength(1)
      expect(p0[0].slotIndex).toBe(0)
    }
  })

  it('uses contiguous unique slotIndex 0..9 per family', () => {
    for (const f of FAMILIES) {
      const slots = NEURON_VARIANT_CATALOG.filter((e) => e.familyId === f)
        .map((e) => e.slotIndex)
        .sort((a, b) => a - b)
      expect(slots).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9])
    }
  })

  it('reads rarity from the explicit field, with the D1 Option A per-tier slot-sets', () => {
    // Each tier's slots are decoupled from rarity (same tier lives at non-adjacent slots).
    for (const f of FAMILIES) {
      for (const tier of RARE_TO_COMMON) {
        const slots = NEURON_VARIANT_CATALOG.filter(
          (e) => e.familyId === f && e.rarity === tier,
        ).map((e) => e.slotIndex)
        expect(new Set(slots)).toEqual(new Set(SLOTS_BY_TIER[tier]))
      }
    }
  })

  it('satisfies the pyramid invariant (rarer tier ≤ commoner tier count)', () => {
    for (const f of FAMILIES) {
      const fam = NEURON_VARIANT_CATALOG.filter((e) => e.familyId === f)
      const count = (r: Rarity): number => fam.filter((e) => e.rarity === r).length
      // walk rarest → commonest; each tier must be ≤ the next-commoner tier
      for (let i = 0; i < RARE_TO_COMMON.length - 1; i++) {
        const rarer = count(RARE_TO_COMMON[i])
        const commoner = count(RARE_TO_COMMON[i + 1])
        expect(rarer).toBeLessThanOrEqual(commoner)
      }
    }
  })
})
