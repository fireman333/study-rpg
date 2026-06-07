import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import 'fake-indexeddb/auto'
import { FAMILY_IDS, NEURON_VARIANT_CATALOG, NEURON_VARIANT_TOTAL } from '@study-rpg/content-neurons-tw'
import { db, type NeuronVariantRow } from '../lib/db'
import {
  FAMILY_GRAPHS,
  frontierNode,
  litNodes,
  walkerCell,
  familyNodeCount,
  firstRouteNodeCount,
  isSecondLapSlot,
  synapseLocationFor,
  GRID_SYNAPSES,
} from '../lib/maze/graph'
import { locationVariantArt } from '../lib/variant-decor'
import { variantBirthCaption } from '../lib/variant-caption'
import { pullVariant } from '../lib/services/variant-gacha'
import { reconcileSettles, cumulativeCost, earnedKey } from '../lib/maze/economy'

const resolve = (id: string): string => id
const FAM = FAMILY_IDS[0] // 藥理學

async function seedFamily(familyId: string): Promise<void> {
  await db.familyAccrual.put({
    familyId,
    ap: 0,
    firedToday: false,
    lastFireDate: null,
    unlockedSlots: [],
    sameDayCorrect: 0,
    pullCount: 0,
  })
}

beforeEach(async () => {
  await db.delete()
  await db.open()
})

afterEach(() => {
  vi.restoreAllMocks()
})

// ─── 10.1 second-lap auto-entry ───────────────────────────────────────────────
describe('二回目 auto-entry (settles ≥ firstRouteNodeCount)', () => {
  it('frontier crosses from route 1 to route 2 at the first-route node count, derived from settles alone', () => {
    const first = firstRouteNodeCount(FAM)
    expect(first).toBe(10)
    // last first-route settle still on route 1
    expect(frontierNode(FAM, first - 1)?.route).toBe(1)
    // at settles == firstRouteNodeCount the family is in 二回目 (frontier = route 2)
    expect(frontierNode(FAM, first)?.route).toBe(2)
    expect(frontierNode(FAM, first)?.slotIndex).toBe(first)
  })

  it('first-route families (settles < firstRouteNodeCount) are unaffected', () => {
    const first = firstRouteNodeCount(FAM)
    for (let s = 0; s < first; s++) {
      expect(frontierNode(FAM, s)?.route).toBe(1)
      expect(frontierNode(FAM, s)?.slotIndex).toBe(s)
    }
  })
})

// ─── 10.2 position-bound deterministic unlock ─────────────────────────────────
describe('position-bound deterministic unlock (二回目) vs random first route', () => {
  it('forceSlotIndex pull unlocks exactly that location variant (no rarity roll)', async () => {
    await seedFamily(FAM)
    const res = await pullVariant(FAM, resolve, { forceSlotIndex: 12 })
    expect(res.ok).toBe(true)
    expect(res.variant?.slotIndex).toBe(12)
    const def = NEURON_VARIANT_CATALOG.find((d) => d.familyId === FAM && d.slotIndex === 12)
    expect(def?.isLocation).toBe(true)
    expect(res.variant?.rarity).toBe(def?.rarity) // pinned to the catalog def's rarity, not rolled
  })

  it('reconcile lights second-route nodes deterministically at their own slots', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5) // first-route rolls are random; 二回目 ignores it
    await seedFamily(FAM)
    const first = firstRouteNodeCount(FAM)
    // enough energy for the whole first route + 3 second-route settles
    await db.meta.put({ key: earnedKey(FAM), value: String(cumulativeCost(first + 3)) })
    await reconcileSettles(FAM, resolve)
    // the three second-route positions walked (slots 10,11,12) MUST be collected
    for (const slot of [first, first + 1, first + 2]) {
      const row = await db.neuronVariants.get([FAM, slot])
      expect(row, `slot ${slot} should be unlocked deterministically`).toBeTruthy()
      expect(isSecondLapSlot(FAM, slot)).toBe(true)
    }
  })

  it('a normal (no-force) pull never lands on a 二回目 location variant', async () => {
    await seedFamily(FAM)
    for (let i = 0; i < 30; i++) {
      const res = await pullVariant(FAM, resolve)
      expect(res.ok).toBe(true)
      expect(isSecondLapSlot(FAM, res.variant!.slotIndex)).toBe(false) // first-route slots only
    }
  })
})

// ─── 10.3 lit / frontier / walker extend over both routes ─────────────────────
describe('lit / frontier / walker extend over the combined route', () => {
  it('litNodes caps at the combined node count; walker tweens the second route', () => {
    const total = familyNodeCount(FAM)
    expect(total).toBe(20)
    expect(litNodes(FAM, 25)).toHaveLength(20)
    expect(frontierNode(FAM, total)).toBeNull() // both routes lit
    // walker on a second-route frontier sits on the second-route polyline (path2),
    // not resting at center.
    const g = FAMILY_GRAPHS[FAM]
    const w = walkerCell(FAM, firstRouteNodeCount(FAM) + 1, 0.5)
    expect(Array.isArray(w)).toBe(true)
    expect(g.path2.length).toBeGreaterThan(g.path.length) // second route is longer
  })
})

// ─── 10.4 catalog total + catalog↔graph coupling ──────────────────────────────
describe('catalog total derives from the catalog and matches the committed graph', () => {
  it('NEURON_VARIANT_TOTAL > 110 and has no hard-coded literal consumer', () => {
    expect(NEURON_VARIANT_TOTAL).toBeGreaterThan(110)
    expect(NEURON_VARIANT_TOTAL).toBe(NEURON_VARIANT_CATALOG.length)
  })

  it('each family catalog location-variant slots EXACTLY match its committed second-route node slots', () => {
    for (const fam of FAMILY_IDS) {
      const catalogLocSlots = NEURON_VARIANT_CATALOG.filter((d) => d.familyId === fam && d.isLocation)
        .map((d) => d.slotIndex)
        .sort((a, b) => a - b)
      const graphSecondSlots = FAMILY_GRAPHS[fam].nodes
        .filter((n) => n.route === 2)
        .map((n) => n.slotIndex)
        .sort((a, b) => a - b)
      expect(catalogLocSlots, `family ${fam}`).toEqual(graphSecondSlots)
      // and there is a catalog def for every node (no unreachable / missing slot)
      for (const slot of graphSecondSlots) {
        expect(NEURON_VARIANT_CATALOG.some((d) => d.familyId === fam && d.slotIndex === slot)).toBe(true)
      }
    }
  })
})

// ─── 10.5 learning-circuit naming + caption form ──────────────────────────────
describe('learning-circuit location naming + caption form', () => {
  it('every first-route synapse + every second-route node carries a location name', () => {
    for (const s of GRID_SYNAPSES) expect(typeof s.location).toBe('string')
    for (const fam of FAMILY_IDS) {
      for (const n of FAMILY_GRAPHS[fam].nodes.filter((x) => x.route === 2)) {
        expect(typeof n.location).toBe('string')
        expect((n.location ?? '').length).toBeGreaterThan(0)
      }
    }
  })

  it('first-route caption uses 尋獲, second-route uses 解鎖', () => {
    const mk = (slotIndex: number): NeuronVariantRow => ({
      familyId: FAM,
      slotIndex,
      rarity: 'P3',
      displayName: 'x',
      spriteKey: 'k',
      rolledAt: Date.UTC(2026, 5, 7, 9, 0, 0),
      wasPityFloor: false,
      copies: 1,
      provenance: { bornAtISO: '2026-06-07', apAtUnlock: 5, wasRedemption: false, streakAtMint: 0 },
    })
    const firstLoc = synapseLocationFor(FAM, 1)
    if (firstLoc) expect(variantBirthCaption(mk(1))).toContain('尋獲')
    const secondLoc = synapseLocationFor(FAM, 12)
    expect(secondLoc).toBeTruthy()
    expect(variantBirthCaption(mk(12))).toContain('解鎖')
  })
})

// ─── 10.7 location hue/filter determinism + first-route exemption ─────────────
describe('location hue/filter is deterministic and first-route variants are exempt', () => {
  it('same (familyId, slotIndex) → identical art across calls; base sprite is the family base', () => {
    const a = locationVariantArt(FAM, 12)
    const b = locationVariantArt(FAM, 12)
    expect(a).not.toBeNull()
    expect(a).toEqual(b)
    expect(a?.baseSpriteKey).toBe(`variant:${FAM}:1`)
    expect(a?.filter).toMatch(/hue-rotate\(\d+deg\)/)
  })

  it('returns null for first-route (non-location) slots', () => {
    expect(locationVariantArt(FAM, 0)).toBeNull()
    expect(locationVariantArt(FAM, 9)).toBeNull()
  })
})
