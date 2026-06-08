import { describe, it, expect, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import { db } from '../lib/db'
import {
  buildBundleSnapshot,
  applyBundleSnapshot,
  SCHEMA_VERSION,
  type BundleSnapshot,
} from '../lib/sync/r2/bundles'

/**
 * connectorNeurons sync contract (add-neurons-connector-neuron-family): UNION by
 * pairKey + MONOTONIC on presence (earlier unlockedAt wins, never un-unlock) +
 * bundle additive/reader-tolerant. Mirrors equipment / neuronInstances discipline.
 * DO NOT relax to LWW — a stale device must not remove an unlocked connector.
 */

async function getAdapter() {
  const { NEURONS_ADAPTERS } = await import('../lib/sync/tables')
  const a = NEURONS_ADAPTERS.find((x) => x.name === 'connectorNeurons')
  expect(a).toBeDefined()
  return a!
}

const row = (pairKey: string, unlockedAt: number) => ({
  pairKey,
  familyA: pairKey.split('|')[0],
  familyB: pairKey.split('|')[1],
  unlockedAt,
  updatedAt: unlockedAt,
})

beforeEach(async () => {
  await db.delete()
  await db.open()
})

describe('connectorNeuronsAdapter — union + monotonic', () => {
  it('unions a first-seen incoming connector', async () => {
    const a = await getAdapter()
    await a.apply(db, [row('A|B', 100)])
    expect(await db.connectorNeurons.get('A|B')).toBeDefined()
  })

  it('union across devices: local X + incoming Y → both present', async () => {
    await db.connectorNeurons.put(row('A|B', 100))
    const a = await getAdapter()
    await a.apply(db, [row('A|C', 200)])
    expect(await db.connectorNeurons.count()).toBe(2)
    expect(await db.connectorNeurons.get('A|B')).toBeDefined()
    expect(await db.connectorNeurons.get('A|C')).toBeDefined()
  })

  it('a stale device (empty incoming) cannot un-unlock', async () => {
    await db.connectorNeurons.put(row('A|B', 100))
    const a = await getAdapter()
    await a.apply(db, []) // stale device never saw the unlock
    expect(await db.connectorNeurons.get('A|B')).toBeDefined()
  })

  it('keeps the EARLIER unlockedAt on conflict (monotonic provenance)', async () => {
    await db.connectorNeurons.put(row('A|B', 200))
    const a = await getAdapter()
    await a.apply(db, [row('A|B', 100)]) // earlier
    expect((await db.connectorNeurons.get('A|B'))?.unlockedAt).toBe(100)
  })

  it('does not adopt a LATER unlockedAt over an earlier local', async () => {
    await db.connectorNeurons.put(row('A|B', 100))
    const a = await getAdapter()
    await a.apply(db, [row('A|B', 300)]) // later
    expect((await db.connectorNeurons.get('A|B'))?.unlockedAt).toBe(100)
  })
})

describe('bundle cross-version tolerance (v19 ↔ v20)', () => {
  it('snapshot includes connectorNeurons at the current schema', async () => {
    await db.connectorNeurons.put(row('A|B', 100))
    const snap = await buildBundleSnapshot(db)
    expect(snap.meta.schema_version).toBe(SCHEMA_VERSION) // 20
    expect(snap.data.connectorNeurons).toBeDefined()
    expect((snap.data.connectorNeurons as unknown[]).length).toBe(1)
  })

  it('a v20 client reading a v19 bundle (no connectorNeurons key) preserves local', async () => {
    await db.connectorNeurons.put(row('A|B', 100))
    const v19Bundle: BundleSnapshot = {
      meta: { schema_version: 19, updated_at: '2026-06-08T00:00:00Z', client_id: 'c', app_version: '0.4.0' },
      data: {}, // no connectorNeurons key → adapter applies [] → preserve-on-omission
    }
    await applyBundleSnapshot(db, v19Bundle)
    expect(await db.connectorNeurons.get('A|B')).toBeDefined()
  })
})
