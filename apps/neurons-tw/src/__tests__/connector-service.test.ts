import { describe, it, expect, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import { FAMILY_IDS, CONNECTOR_PAIR_KEYS, connectorPairKey } from '@study-rpg/content-neurons-tw'
import { db, todayISO } from '../lib/db'
import { pairKey } from '../lib/connectome/state-machine'
import { creditConnectomeFromExpedition, runDailyResetIfNeeded } from '../lib/services/connectome'
import { unlockConnector, buildConnectorEntries } from '../lib/services/connector'

/**
 * Connector neuron service + unlock-hook contract (add-neurons-connector-neuron-
 * family). Locks: (1) the content pairKey is byte-identical to the app synapse
 * pairKey (coding principle §6); (2) the first weak→strong transition unlocks a
 * permanent connector; (3) non-strong transitions do NOT; (4) unlock is idempotent
 * + survives wire decay.
 */

const [A, B, C] = FAMILY_IDS

function daysAgoISO(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toLocaleDateString('en-CA')
}

beforeEach(async () => {
  await db.delete()
  await db.open()
  await db.meta.put({ key: 'lastResetDate', value: todayISO() })
})

const credit = (repairsBySubject: Record<string, number>, sessionPool: number) =>
  creditConnectomeFromExpedition({ repairsBySubject, energyBySubject: {}, sessionPool })

describe('connector pairKey ↔ synapse pairKey agreement (coding §6)', () => {
  it('content connectorPairKey === app synapse pairKey for every pair', () => {
    for (let i = 0; i < FAMILY_IDS.length; i++) {
      for (let j = i + 1; j < FAMILY_IDS.length; j++) {
        expect(connectorPairKey(FAMILY_IDS[i], FAMILY_IDS[j])).toBe(pairKey(FAMILY_IDS[i], FAMILY_IDS[j]))
      }
    }
  })

  it('CONNECTOR_PAIR_KEYS equals the set built from the app pairKey', () => {
    const fromApp = new Set<string>()
    for (let i = 0; i < FAMILY_IDS.length; i++)
      for (let j = i + 1; j < FAMILY_IDS.length; j++) fromApp.add(pairKey(FAMILY_IDS[i], FAMILY_IDS[j]))
    expect(new Set(CONNECTOR_PAIR_KEYS)).toEqual(fromApp)
    expect(CONNECTOR_PAIR_KEYS.length).toBe(55)
  })
})

describe('unlockConnector — idempotent + permanent', () => {
  it('first call unlocks, returns true; second call no-ops, returns false', async () => {
    const key = pairKey(A, B)
    expect(await unlockConnector(key)).toBe(true)
    const first = await db.connectorNeurons.get(key)
    expect(first).toBeDefined()
    expect(first?.familyA).toBe(key.split('|')[0])

    expect(await unlockConnector(key)).toBe(false)
    expect(await db.connectorNeurons.count()).toBe(1)
    // unlockedAt preserved (not overwritten).
    expect((await db.connectorNeurons.get(key))?.unlockedAt).toBe(first?.unlockedAt)
  })
})

describe('creditConnectomeFromExpedition — connector unlock hook', () => {
  it('unlocks the connector on the first weak→strong transition', async () => {
    // Seed a backdated weak wire so the next co-repair strengthens it to strong.
    await db.synapses.put({
      pairKey: pairKey(A, B),
      state: 'weak',
      lastCoFireDate: '2026-01-01',
      createdAt: '2026-01-01',
    })
    const r = await credit({ [A]: 3, [B]: 2 }, 20)
    expect((await db.synapses.get(pairKey(A, B)))?.state).toBe('strong')
    expect(r.newlyWired).toContainEqual({ pairKey: pairKey(A, B), formed: false })
    // Post-commit unlock fired.
    expect(await db.connectorNeurons.get(pairKey(A, B))).toBeDefined()
  })

  it('does NOT unlock when a wire only forms (dormant) — non-strong transition', async () => {
    const r = await credit({ [A]: 3, [B]: 2 }, 20) // fresh → dormant
    expect((await db.synapses.get(pairKey(A, B)))?.state).toBe('dormant')
    expect(r.newlyWired).toContainEqual({ pairKey: pairKey(A, B), formed: true })
    expect(await db.connectorNeurons.get(pairKey(A, B))).toBeUndefined()
  })

  it('does NOT unlock on a dormant→weak transition', async () => {
    await db.synapses.put({
      pairKey: pairKey(A, B),
      state: 'dormant',
      lastCoFireDate: '2026-01-01',
      createdAt: '2026-01-01',
    })
    await credit({ [A]: 3, [B]: 2 }, 20)
    expect((await db.synapses.get(pairKey(A, B)))?.state).toBe('weak')
    expect(await db.connectorNeurons.get(pairKey(A, B))).toBeUndefined()
  })

  it('connector survives wire decay (strong→weak)', async () => {
    // Unlock via a strong wire, then force a >7-day decay.
    await db.synapses.put({
      pairKey: pairKey(A, B),
      state: 'weak',
      lastCoFireDate: '2026-01-01',
      createdAt: '2026-01-01',
    })
    await credit({ [A]: 3, [B]: 2 }, 20)
    expect(await db.connectorNeurons.get(pairKey(A, B))).toBeDefined()

    // Backdate + force the daily decay reset.
    await db.synapses.update(pairKey(A, B), { lastCoFireDate: daysAgoISO(8) })
    await db.meta.put({ key: 'lastResetDate', value: daysAgoISO(8) })
    await runDailyResetIfNeeded()
    expect((await db.synapses.get(pairKey(A, B)))?.state).toBe('weak') // decayed
    // Connector is permanent.
    expect(await db.connectorNeurons.get(pairKey(A, B))).toBeDefined()
  })
})

describe('buildConnectorEntries — collection projection', () => {
  it('projects unlocked rows onto the full closed 55-set', async () => {
    await unlockConnector(pairKey(A, B))
    await unlockConnector(pairKey(A, C))
    const rows = await db.connectorNeurons.toArray()
    const entries = buildConnectorEntries(rows)
    expect(entries.length).toBe(55)
    expect(entries.filter((e) => e.unlocked).length).toBe(2)
    expect(entries.find((e) => e.pairKey === pairKey(A, B))?.unlocked).toBe(true)
    expect(entries.find((e) => e.pairKey === pairKey(B, C))?.unlocked).toBe(false)
  })
})
