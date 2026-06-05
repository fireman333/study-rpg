import { describe, it, expect, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import { FAMILY_IDS, SYNAPSE_BONUS_PER, SYNAPSE_BONUS_CAP } from '@study-rpg/content-neurons-tw'
import { db, type SynapseState } from '../lib/db'
import { pairKey } from '../lib/connectome/state-machine'
import { synapseBonus } from '../lib/maze/economy'

/**
 * Strong synapse → capped cross-family LTP energy bonus (design D6 / spec
 * "Strong synapse SHALL confer a capped cross-family energy bonus"). The maze
 * READS connectome synapse state read-only; no LTD/decay penalty.
 */

const FAM = FAMILY_IDS[0]

async function putSynapse(a: string, b: string, state: SynapseState): Promise<void> {
  await db.synapses.put({ pairKey: pairKey(a, b), state, lastCoFireDate: '2026-06-05', createdAt: '2026-06-05' })
}

beforeEach(async () => {
  await db.delete()
  await db.open()
})

describe('synapseBonus (LTP cross-family bonus, capped, no LTD)', () => {
  it('is 1.0 with no synapse', async () => {
    expect(await synapseBonus(FAM)).toBe(1)
  })

  it('a single strong synapse adds SYNAPSE_BONUS_PER', async () => {
    await putSynapse(FAM, FAMILY_IDS[1], 'strong')
    expect(await synapseBonus(FAM)).toBeCloseTo(1 + SYNAPSE_BONUS_PER, 6)
  })

  it('weak / dormant synapses give no bonus and no penalty (no LTD)', async () => {
    await putSynapse(FAM, FAMILY_IDS[1], 'weak')
    await putSynapse(FAM, FAMILY_IDS[2], 'dormant')
    expect(await synapseBonus(FAM)).toBe(1) // only strong counts; never below 1
  })

  it('a strong synapse not involving the family does not bonus it', async () => {
    await putSynapse(FAMILY_IDS[1], FAMILY_IDS[2], 'strong')
    expect(await synapseBonus(FAM)).toBe(1)
  })

  it('many strong synapses stay clamped to SYNAPSE_BONUS_CAP', async () => {
    // 8 strong synapses → 8 × 0.06 = 0.48, clamped to +0.30.
    for (let i = 1; i <= 8; i++) await putSynapse(FAM, FAMILY_IDS[i], 'strong')
    expect(await synapseBonus(FAM)).toBeCloseTo(1 + SYNAPSE_BONUS_CAP, 6)
  })
})
