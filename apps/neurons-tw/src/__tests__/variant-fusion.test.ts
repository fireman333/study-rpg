import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import 'fake-indexeddb/auto'
import { db } from '../lib/db'
import type { NeuronInstanceRow } from '../lib/db'
import {
  eligibleSurplusByTier,
  getPromoteState,
  promoteTier,
} from '../lib/services/variant-fusion'
import { NEURON_VARIANT_CATALOG, PROMOTE_COST_K } from '@study-rpg/content-neurons-tw'

/**
 * Lock the tier-promote core (add-neurons-dupe-fusion + rework-neurons-fusion-
 * dupes-only): fusion eats ONLY duplicates (last-copy protection keeps the oldest
 * held individual of each slot), K-threshold gating, the P0 guard, and the
 * consume-K → mint-T−1 flow.
 */

// Pick a real family that has ≥ 2 P4 slots and ≥ 1 P3 slot (pyramid guarantees it).
const FAMILY = (() => {
  const byFamily = new Map<string, { p4: number[]; p3: number[] }>()
  for (const d of NEURON_VARIANT_CATALOG) {
    const e = byFamily.get(d.familyId) ?? { p4: [], p3: [] }
    if (d.rarity === 'P4') e.p4.push(d.slotIndex)
    if (d.rarity === 'P3') e.p3.push(d.slotIndex)
    byFamily.set(d.familyId, e)
  }
  for (const [fam, e] of byFamily) if (e.p4.length >= 2 && e.p3.length >= 1) return { fam, ...e }
  throw new Error('no family with ≥2 P4 + ≥1 P3 slots')
})()

let n = 0
function seed(slotIndex: number, rarity: 'P4' | 'P3'): NeuronInstanceRow {
  return {
    instanceId: `${FAMILY.fam}:${slotIndex}:t:${n++}`,
    familyId: FAMILY.fam,
    slotIndex,
    rarity,
    spriteKey: `variant:${FAMILY.fam}:${slotIndex}`,
    rolledAt: 1717070400000 + n,
    consumedAt: null,
  }
}

beforeEach(async () => {
  await db.neuronInstances.clear()
  await db.neuronVariants.clear()
})
afterEach(async () => {
  await db.neuronInstances.clear()
  await db.neuronVariants.clear()
})

describe('tier-promote eligibility (duplicates only, last-copy protected)', () => {
  it('protects the sole/oldest individual of a slot (last-copy)', async () => {
    await db.neuronInstances.bulkPut([
      seed(FAMILY.p4[0], 'P4'), // slot A: 1 only → protected, 0 surplus
      seed(FAMILY.p4[1], 'P4'), // slot B: 3 → 1 protected, 2 surplus
      seed(FAMILY.p4[1], 'P4'),
      seed(FAMILY.p4[1], 'P4'),
    ])
    const surplus = await eligibleSurplusByTier(FAMILY.fam, 'P4')
    expect(surplus).toHaveLength(2)
    expect(surplus.every((s) => s.slotIndex === FAMILY.p4[1])).toBe(true)
  })

  it('a tier spread one-per-slot has ZERO surplus (only dupes fuse)', async () => {
    // Two distinct P4 slots, one individual each → both protected → nothing fusable.
    await db.neuronInstances.bulkPut([seed(FAMILY.p4[0], 'P4'), seed(FAMILY.p4[1], 'P4')])
    const surplus = await eligibleSurplusByTier(FAMILY.fam, 'P4')
    expect(surplus).toHaveLength(0)
    const state = await getPromoteState(FAMILY.fam, 'P4')
    expect(state.surplusCount).toBe(0)
    expect(state.canPromote).toBe(false)
  })

  it('P0 is never promotable', async () => {
    const state = await getPromoteState(FAMILY.fam, 'P0')
    expect(state.canPromote).toBe(false)
    expect(state.reason).toBe('p0')
    expect(state.targetRarity).toBeNull()
  })

  it('disabled below the K threshold; surplusCount reports duplicates only', async () => {
    await db.neuronInstances.bulkPut([seed(FAMILY.p4[0], 'P4'), seed(FAMILY.p4[0], 'P4')]) // 1 surplus
    const state = await getPromoteState(FAMILY.fam, 'P4')
    expect(state.surplusCount).toBe(1)
    expect(state.costK).toBe(PROMOTE_COST_K)
    expect(state.canPromote).toBe(PROMOTE_COST_K <= 1)
    if (PROMOTE_COST_K > 1) expect(state.reason).toBe('insufficient')
  })
})

describe('tier-promote execution', () => {
  it('consumes K surplus P4 individuals and mints a P3 individual', async () => {
    // slot A: K+1 instances (K surplus) → ≥ K surplus without touching slot A's last copy
    const rows: NeuronInstanceRow[] = []
    for (let i = 0; i < PROMOTE_COST_K + 1; i++) rows.push(seed(FAMILY.p4[0], 'P4'))
    rows.push(seed(FAMILY.p4[1], 'P4')) // slot B sole copy (protected)
    await db.neuronInstances.bulkPut(rows)

    const before = await eligibleSurplusByTier(FAMILY.fam, 'P4')
    expect(before.length).toBeGreaterThanOrEqual(PROMOTE_COST_K)

    const res = await promoteTier(FAMILY.fam, 'P4', (f) => f)
    expect(res.ok).toBe(true)
    expect(res.targetRarity).toBe('P3')

    // Exactly K individuals consumed
    const consumed = (await db.neuronInstances.where('familyId').equals(FAMILY.fam).toArray()).filter(
      (r) => r.consumedAt !== null,
    )
    expect(consumed).toHaveLength(PROMOTE_COST_K)
    // All consumed came from the duplicate-rich slot A — slot B's sole copy is untouched
    expect(consumed.every((r) => r.slotIndex === FAMILY.p4[0])).toBe(true)

    // One new held P3 individual minted + its slot-ownership row created
    const p3Held = (await db.neuronInstances.where('familyId').equals(FAMILY.fam).toArray()).filter(
      (r) => r.rarity === 'P3' && r.consumedAt === null,
    )
    expect(p3Held).toHaveLength(1)
    const p3Slot = await db.neuronVariants.get([FAMILY.fam, p3Held[0].slotIndex])
    expect(p3Slot).toBeTruthy()
  })

  it('does not touch neural energy', async () => {
    await db.meta.put({ key: 'neuralEnergyEarned', value: '140' })
    await db.meta.put({ key: 'neuralEnergySpent', value: '60' })
    const rows: NeuronInstanceRow[] = []
    for (let i = 0; i < PROMOTE_COST_K + 1; i++) rows.push(seed(FAMILY.p4[0], 'P4'))
    await db.neuronInstances.bulkPut(rows)
    await promoteTier(FAMILY.fam, 'P4', (f) => f)
    expect((await db.meta.get('neuralEnergyEarned'))?.value).toBe('140')
    expect((await db.meta.get('neuralEnergySpent'))?.value).toBe('60')
  })
})
