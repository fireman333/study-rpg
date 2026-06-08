import { describe, it, expect, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import {
  FAMILY_IDS,
  CONNECTOME_CONDUCTION_EPOCH,
  CONDUCTION_WIRE_CAP_STRONG,
  CONDUCTION_WIRE_CAP_WEAK,
} from '@study-rpg/content-neurons-tw'
import { db, todayISO, type SynapseState } from '../lib/db'
import { pairKey } from '../lib/connectome/state-machine'
import { getWireConductionStatuses } from '../lib/maze/economy'
import { getAboutToWireHint } from '../lib/services/connectome'

/**
 * Read-only presentation helpers for polish-neurons-connectome-visual:
 *   getWireConductionStatuses() → per-wire tooltip data
 *   getAboutToWireHint()        → settlement "再修復 X 題就能和 Y 形成連線" nudge
 * Both are pure projections — they grant/compute no gameplay state.
 */

const VALID = CONNECTOME_CONDUCTION_EPOCH
const [A, B] = FAMILY_IDS

async function putSynapse(a: string, b: string, state: SynapseState, date = VALID): Promise<void> {
  await db.synapses.put({ pairKey: pairKey(a, b), state, lastCoFireDate: date, createdAt: date })
}
async function setRepairs(map: Record<string, number>): Promise<void> {
  await db.meta.put({ key: `connectome:dailyRepair:${todayISO()}`, value: JSON.stringify(map) })
}

beforeEach(async () => {
  await db.delete()
  await db.open()
})

describe('getWireConductionStatuses', () => {
  it('maps a strong wire to rate 12% + strong cap', async () => {
    await putSynapse(A, B, 'strong')
    const s = (await getWireConductionStatuses()).get(pairKey(A, B))!
    expect(s).toMatchObject({ state: 'strong', isLegacy: false, ratePct: 12, cap: CONDUCTION_WIRE_CAP_STRONG })
    expect(s.subjects).toContain(A)
    expect(s.subjects).toContain(B)
  })

  it('maps a weak wire to rate 6% + weak cap', async () => {
    await putSynapse(A, B, 'weak')
    const s = (await getWireConductionStatuses()).get(pairKey(A, B))!
    expect(s).toMatchObject({ state: 'weak', ratePct: 6, cap: CONDUCTION_WIRE_CAP_WEAK })
  })

  it("reports today's used energy from the per-wire accumulator", async () => {
    await putSynapse(A, B, 'strong')
    await db.meta.put({ key: `conduction:wire:${pairKey(A, B)}:${todayISO()}`, value: '12' })
    const s = (await getWireConductionStatuses()).get(pairKey(A, B))!
    expect(s.todayUsed).toBe(12)
  })

  it('flags a legacy (pre-epoch) wire as non-conducting (rate 0, cap 0)', async () => {
    await putSynapse(A, B, 'strong', '2026-06-01')
    const s = (await getWireConductionStatuses()).get(pairKey(A, B))!
    expect(s).toMatchObject({ isLegacy: true, ratePct: 0, cap: 0, todayUsed: 0 })
  })

  it('treats a dormant wire as non-conducting', async () => {
    await putSynapse(A, B, 'dormant')
    const s = (await getWireConductionStatuses()).get(pairKey(A, B))!
    expect(s).toMatchObject({ ratePct: 0, cap: 0 })
  })
})

describe('getAboutToWireHint', () => {
  it('suggests the closest unwired pair where the partner is short of the gate', async () => {
    await setRepairs({ [A]: 2, [B]: 1 })
    expect(await getAboutToWireHint()).toEqual({ subjectA: A, subjectB: B, remaining: 1 })
  })

  it('returns null when no subject is repaired-today at the threshold', async () => {
    await setRepairs({ [A]: 1, [B]: 1 })
    expect(await getAboutToWireHint()).toBeNull()
  })

  it('excludes a pair that is already wired (does not suggest that partner)', async () => {
    await setRepairs({ [A]: 2, [B]: 1 })
    await putSynapse(A, B, 'weak') // A↔B already wired
    const hint = await getAboutToWireHint()
    expect(hint).not.toBeNull()
    expect(hint!.subjectB).not.toBe(B) // B is wired with A → excluded; falls to a colder partner
    expect(hint!.remaining).toBe(2)
  })

  it('returns null when there are no repairs at all', async () => {
    expect(await getAboutToWireHint()).toBeNull()
  })
})
