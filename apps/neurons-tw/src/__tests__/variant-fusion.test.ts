import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import 'fake-indexeddb/auto'
import { db } from '../lib/db'
import type { NeuronInstanceRow } from '../lib/db'
import {
  eligibleForTier,
  getPromoteState,
  promoteTier,
} from '../lib/services/variant-fusion'
import { NEURON_VARIANT_CATALOG, PROMOTE_COST_K } from '@study-rpg/content-neurons-tw'

/**
 * Lock the tier-promote core (add-neurons-dupe-fusion +
 * relax-neurons-fusion-last-copy-protection): the fusable pool is ALL held
 * individuals of a tier (no per-slot last-copy gate), the dupes-first consume
 * order, the P0 guard, the K threshold, and the consume-K → mint-T−1 flow.
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

describe('tier-promote eligibility (no per-slot last-copy protection)', () => {
  it('makes every held individual of a tier eligible (incl. a slot sole copy)', async () => {
    await db.neuronInstances.bulkPut([
      seed(FAMILY.p4[0], 'P4'), // slot A: 1
      seed(FAMILY.p4[1], 'P4'), // slot B: 3
      seed(FAMILY.p4[1], 'P4'),
      seed(FAMILY.p4[1], 'P4'),
    ])
    const eligible = await eligibleForTier(FAMILY.fam, 'P4')
    expect(eligible).toHaveLength(4) // all 4 held (was 2 under the old per-slot gate)
  })

  it('orders dupes before a slot sole copy (breadth-preserving consume order)', async () => {
    // slot A: 1 (sole), slot B: 3 → first 2 consumed SHALL be slot B dupes.
    const a0 = seed(FAMILY.p4[0], 'P4')
    const b0 = seed(FAMILY.p4[1], 'P4')
    const b1 = seed(FAMILY.p4[1], 'P4')
    const b2 = seed(FAMILY.p4[1], 'P4')
    await db.neuronInstances.bulkPut([a0, b0, b1, b2])
    const eligible = await eligibleForTier(FAMILY.fam, 'P4')
    // The two dupes of slot B (b1, b2) come first; the sole/oldest copies last.
    expect(eligible.slice(0, 2).every((r) => r.slotIndex === FAMILY.p4[1])).toBe(true)
    expect(eligible.slice(0, 2).map((r) => r.instanceId).sort()).toEqual([b1.instanceId, b2.instanceId].sort())
  })

  it('P0 is never promotable', async () => {
    const state = await getPromoteState(FAMILY.fam, 'P0')
    expect(state.canPromote).toBe(false)
    expect(state.reason).toBe('p0')
    expect(state.targetRarity).toBeNull()
  })

  it('disabled below the K threshold; heldCount reports the whole pool', async () => {
    await db.neuronInstances.bulkPut([seed(FAMILY.p4[0], 'P4'), seed(FAMILY.p4[0], 'P4')]) // 2 held
    const state = await getPromoteState(FAMILY.fam, 'P4')
    expect(state.heldCount).toBe(2)
    expect(state.canPromote).toBe(PROMOTE_COST_K <= 2)
    if (PROMOTE_COST_K > 2) expect(state.reason).toBe('insufficient')
  })

  it('fuses K held individuals spread across distinct slots (previously blocked)', async () => {
    // The reported bug: K individuals spread 1-per-slot were all last-copy-protected
    // → surplus 0 → could never fuse. Now the whole pool is fusable.
    const seeds: NeuronInstanceRow[] = []
    for (let i = 0; i < PROMOTE_COST_K; i++) seeds.push(seed(FAMILY.p4[i % FAMILY.p4.length], 'P4'))
    await db.neuronInstances.bulkPut(seeds)
    const state = await getPromoteState(FAMILY.fam, 'P4')
    expect(state.heldCount).toBe(PROMOTE_COST_K)
    expect(state.canPromote).toBe(true)
    const res = await promoteTier(FAMILY.fam, 'P4', (f) => f)
    expect(res.ok).toBe(true)
    expect(res.targetRarity).toBe('P3')
    const consumed = (await db.neuronInstances.where('familyId').equals(FAMILY.fam).toArray()).filter(
      (r) => r.rarity === 'P4' && r.consumedAt !== null,
    )
    expect(consumed).toHaveLength(PROMOTE_COST_K)
  })
})

describe('tier-promote execution', () => {
  it('consumes K P4 individuals and mints a P3 individual', async () => {
    const rows: NeuronInstanceRow[] = []
    for (let i = 0; i < PROMOTE_COST_K; i++) rows.push(seed(FAMILY.p4[0], 'P4'))
    rows.push(seed(FAMILY.p4[1], 'P4'))
    rows.push(seed(FAMILY.p4[1], 'P4'))
    await db.neuronInstances.bulkPut(rows)

    const res = await promoteTier(FAMILY.fam, 'P4', (f) => f)
    expect(res.ok).toBe(true)
    expect(res.targetRarity).toBe('P3')

    // Exactly K individuals consumed
    const consumed = (await db.neuronInstances.where('familyId').equals(FAMILY.fam).toArray()).filter(
      (r) => r.consumedAt !== null,
    )
    expect(consumed).toHaveLength(PROMOTE_COST_K)

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
    for (let i = 0; i < PROMOTE_COST_K; i++) rows.push(seed(FAMILY.p4[0], 'P4'))
    rows.push(seed(FAMILY.p4[1], 'P4'))
    rows.push(seed(FAMILY.p4[1], 'P4'))
    await db.neuronInstances.bulkPut(rows)
    await promoteTier(FAMILY.fam, 'P4', (f) => f)
    expect((await db.meta.get('neuralEnergyEarned'))?.value).toBe('140')
    expect((await db.meta.get('neuralEnergySpent'))?.value).toBe('60')
  })
})
