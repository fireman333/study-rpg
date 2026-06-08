import { describe, it, expect, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import { FAMILY_IDS } from '@study-rpg/content-neurons-tw'
import { db, todayISO } from '../lib/db'
import { pairKey } from '../lib/connectome/state-machine'
import { creditConnectomeFromExpedition, runDailyResetIfNeeded } from '../lib/services/connectome'

function daysAgoISO(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toLocaleDateString('en-CA')
}

/**
 * Expedition-driven connectome trigger (rework-neurons-connectome-expedition-driven):
 * "repair together, wire together". Wiring fires at expedition settlement, gated on
 * an effective completion (≥5 repairs/day), K=2 per subject, ≤3 pairs/day; cross-day
 * co-repair strengthens dormant→weak→strong.
 */

const [A, B, C, D] = FAMILY_IDS

beforeEach(async () => {
  await db.delete()
  await db.open()
  await db.meta.put({ key: 'lastResetDate', value: todayISO() }) // pin reset so no decay surprises
})

const credit = (
  repairsBySubject: Record<string, number>,
  sessionPool: number,
  energyBySubject: Record<string, number> = {},
) => creditConnectomeFromExpedition({ repairsBySubject, energyBySubject, sessionPool })

/** Simulate the next day's empty per-day accumulators (todayISO stays "today"). */
async function simulateNewDay(): Promise<void> {
  await db.meta.delete(`connectome:dailyWiredPairs:${todayISO()}`)
  await db.meta.delete(`connectome:dailyRepair:${todayISO()}`)
}

describe('creditConnectomeFromExpedition', () => {
  it('forms a dormant synapse when 2 subjects each repaired ≥K and the gate is met', async () => {
    const r = await credit({ [A]: 3, [B]: 2 }, 20)
    expect(r.effectiveCompletion).toBe(true)
    expect((await db.synapses.get(pairKey(A, B)))?.state).toBe('dormant')
    expect(r.newlyWired).toContainEqual({ pairKey: pairKey(A, B), formed: true })
  })

  it('does not pair a subject below K (2)', async () => {
    await credit({ [A]: 5, [B]: 1 }, 20)
    expect(await db.synapses.get(pairKey(A, B))).toBeUndefined()
  })

  it('does not wire below the effective-completion gate', async () => {
    const r = await credit({ [A]: 2, [B]: 2 }, 20) // 4 repairs, large pool → not effective
    expect(r.effectiveCompletion).toBe(false)
    expect(await db.synapses.get(pairKey(A, B))).toBeUndefined()
  })

  it('treats a cleared <5 pool as an effective completion', async () => {
    const r = await credit({ [A]: 2, [B]: 2 }, 4) // pool 4 (<5), all cleared, ≥2
    expect(r.effectiveCompletion).toBe(true)
    expect((await db.synapses.get(pairKey(A, B)))?.state).toBe('dormant')
  })

  it('caps daily pairs at 3', async () => {
    const r = await credit({ [A]: 2, [B]: 2, [C]: 2, [D]: 2 }, 20) // 4 subjects → 6 pairs
    expect(r.newlyWired).toHaveLength(3)
    expect(await db.synapses.count()).toBe(3)
  })

  it('increments the streak once per day on effective completion', async () => {
    expect((await credit({ [A]: 3, [B]: 2 }, 20)).streak).toBe(1)
    expect((await credit({ [A]: 2, [C]: 2 }, 20)).streak).toBe(1) // same day → once
  })

  it('strengthens dormant→weak on a later-day co-repair', async () => {
    await credit({ [A]: 3, [B]: 2 }, 20) // forms dormant today
    await simulateNewDay()
    await db.synapses.update(pairKey(A, B), { lastCoFireDate: '2026-01-01' }) // backdate
    const r = await credit({ [A]: 3, [B]: 2 }, 20)
    expect((await db.synapses.get(pairKey(A, B)))?.state).toBe('weak')
    expect(r.newlyWired).toContainEqual({ pairKey: pairKey(A, B), formed: false })
  })

  it('does not double-advance the same day', async () => {
    await credit({ [A]: 3, [B]: 2 }, 20) // dormant today
    const r = await credit({ [A]: 3, [B]: 2 }, 20) // same day → excluded
    expect(r.newlyWired).toHaveLength(0)
    expect((await db.synapses.get(pairKey(A, B)))?.state).toBe('dormant')
  })

  it('decays a strong wire one level after >7 days without co-repair (never removed)', async () => {
    await db.synapses.put({
      pairKey: pairKey(A, B),
      state: 'strong',
      lastCoFireDate: daysAgoISO(8),
      createdAt: daysAgoISO(30),
    })
    await db.meta.put({ key: 'lastResetDate', value: daysAgoISO(8) }) // force the reset to run
    await runDailyResetIfNeeded()
    const s = await db.synapses.get(pairKey(A, B))
    expect(s?.state).toBe('weak') // one level down, still present
  })

  it('conducts batched energy through an existing strong wire at settlement', async () => {
    await db.synapses.put({
      pairKey: pairKey(A, B),
      state: 'strong',
      lastCoFireDate: todayISO(),
      createdAt: todayISO(),
    })
    const r = await credit({ [A]: 5 }, 20, { [A]: 100 })
    expect(r.conductionFlows).toContainEqual(
      expect.objectContaining({ fromFamily: A, toFamily: B, amount: 12, state: 'strong' }),
    )
  })
})
