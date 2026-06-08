import { describe, it, expect, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import { FAMILY_IDS, CONNECTOME_CONDUCTION_EPOCH } from '@study-rpg/content-neurons-tw'
import { db, type SynapseState } from '../lib/db'
import { pairKey } from '../lib/connectome/state-machine'
import { synapticConduction, earnedKey } from '../lib/maze/economy'

/**
 * Synaptic Conduction (rework-neurons-connectome-expedition-driven): a wired pair,
 * when one subject earns a BATCH of energy, sends a capped, additive, VISIBLE
 * fraction to its neighbor (weak 6% / strong 12%). One-hop, never below baseline,
 * legacy (pre-epoch) wires do not conduct until re-validated.
 */

const A = FAMILY_IDS[0]
const B = FAMILY_IDS[1]
const C = FAMILY_IDS[2]
const D = FAMILY_IDS[3]
const E = FAMILY_IDS[4]

// `lastCoFireDate === epoch` is validated (the filter excludes only `< epoch`).
const VALID = CONNECTOME_CONDUCTION_EPOCH

async function putSynapse(a: string, b: string, state: SynapseState, date = VALID): Promise<void> {
  await db.synapses.put({ pairKey: pairKey(a, b), state, lastCoFireDate: date, createdAt: date })
}
async function earned(fam: string): Promise<number> {
  return Number((await db.meta.get(earnedKey(fam)))?.value ?? '0') || 0
}

beforeEach(async () => {
  await db.delete()
  await db.open()
})

describe('synapticConduction', () => {
  it('grants nothing when the source has no wire (unwired never worse than baseline)', async () => {
    expect(await synapticConduction(A, 100)).toEqual([])
    expect(await earned(B)).toBe(0)
  })

  it('a strong wire conducts floor(batch×0.12) to the neighbor', async () => {
    await putSynapse(A, B, 'strong')
    const flows = await synapticConduction(A, 100)
    expect(flows).toHaveLength(1)
    expect(flows[0]).toMatchObject({ fromFamily: A, toFamily: B, amount: 12, state: 'strong' })
    expect(await earned(B)).toBe(12)
  })

  it('a weak wire conducts floor(batch×0.06)', async () => {
    await putSynapse(A, B, 'weak')
    const flows = await synapticConduction(A, 100)
    expect(flows[0].amount).toBe(6)
  })

  it('suppresses sub-1 conduction (no energy, no pulse)', async () => {
    await putSynapse(A, B, 'weak')
    expect(await synapticConduction(A, 10)).toEqual([]) // floor(10×0.06) = 0
    expect(await earned(B)).toBe(0)
  })

  it('does not conduct a dormant wire', async () => {
    await putSynapse(A, B, 'dormant')
    expect(await synapticConduction(A, 100)).toEqual([])
  })

  it('does not conduct a legacy (pre-epoch) wire', async () => {
    await putSynapse(A, B, 'strong', '2026-06-01')
    expect(await synapticConduction(A, 100)).toEqual([])
    expect(await earned(B)).toBe(0)
  })

  it('per-wire daily cap bounds a strong wire to 15/day', async () => {
    await putSynapse(A, B, 'strong')
    await synapticConduction(A, 100) // 12
    expect((await synapticConduction(A, 100))[0].amount).toBe(3) // 12+3 = wire cap 15
    expect(await synapticConduction(A, 100)).toEqual([]) // cap reached
    expect(await earned(B)).toBe(15)
  })

  it('per-target daily cap bounds incoming to 30/day', async () => {
    await putSynapse(A, B, 'strong')
    await putSynapse(C, B, 'strong')
    await synapticConduction(A, 200) // wire cap 15
    await synapticConduction(C, 200) // target remaining 30-15 = 15
    expect(await earned(B)).toBe(30)
  })

  it('per-source daily cap bounds outgoing to 45/day', async () => {
    for (const n of [B, C, D, E]) await putSynapse(A, n, 'strong')
    const flows = await synapticConduction(A, 200) // each wire wants 15; source cap 45 → 3 wires
    expect(flows.reduce((s, f) => s + f.amount, 0)).toBe(45)
    expect(flows.filter((f) => f.amount > 0)).toHaveLength(3)
  })

  it('is additive-only: the source pool is untouched and the grant has no target multiplier', async () => {
    await putSynapse(A, B, 'strong')
    const aBefore = await earned(A)
    await synapticConduction(A, 100)
    expect(await earned(A)).toBe(aBefore)
    expect(await earned(B)).toBe(12)
  })
})
