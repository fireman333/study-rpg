import { describe, it, expect } from 'vitest'
import {
  NEURON_VARIANT_CATALOG,
  VARIANT_COUNT_BY_FAMILY,
  type Rarity,
} from '@study-rpg/content-neurons-tw'

/**
 * Pyramid-catalog shape (rework-neurons-variant-pyramid). The content pack's
 * module-load `assertCatalogShape` already throws on any violation; these tests
 * pin the D3a shape (77 = 11 × 7) + the structural invariants explicitly.
 */

const FAMILIES = [...new Set(NEURON_VARIANT_CATALOG.map((e) => e.familyId))]
const RARE_TO_COMMON: Rarity[] = ['P0', 'P1', 'P2', 'P3', 'P4', 'P5']

describe('pyramid variant catalog', () => {
  it('ships 11 families × 7 slots = 77 entries (D3a)', () => {
    expect(NEURON_VARIANT_CATALOG).toHaveLength(77)
    expect(FAMILIES).toHaveLength(11)
    for (const f of FAMILIES) expect(VARIANT_COUNT_BY_FAMILY[f]).toBe(7)
  })

  it('gives each family exactly one P0 apex at slotIndex 0', () => {
    for (const f of FAMILIES) {
      const fam = NEURON_VARIANT_CATALOG.filter((e) => e.familyId === f)
      const p0 = fam.filter((e) => e.rarity === 'P0')
      expect(p0).toHaveLength(1)
      expect(p0[0].slotIndex).toBe(0)
    }
  })

  it('uses contiguous unique slotIndex 0..N-1 per family', () => {
    for (const f of FAMILIES) {
      const slots = NEURON_VARIANT_CATALOG.filter((e) => e.familyId === f)
        .map((e) => e.slotIndex)
        .sort((a, b) => a - b)
      expect(slots).toEqual([0, 1, 2, 3, 4, 5, 6])
    }
  })

  it('reads rarity from the explicit field, decoupled from slot index', () => {
    // Two P5 variants per family at distinct slots (1 and 6) — same tier, different slot.
    for (const f of FAMILIES) {
      const p5 = NEURON_VARIANT_CATALOG.filter((e) => e.familyId === f && e.rarity === 'P5')
      expect(p5).toHaveLength(2)
      expect(new Set(p5.map((e) => e.slotIndex))).toEqual(new Set([1, 6]))
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
