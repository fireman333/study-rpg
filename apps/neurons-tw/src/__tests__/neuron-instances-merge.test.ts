import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import 'fake-indexeddb/auto'
import { db } from '../lib/db'
import { NEURONS_ADAPTERS } from '../lib/sync/tables'
import { applyBundleSnapshot, type BundleSnapshot } from '../lib/sync/r2/bundles'
import type { NeuronInstanceRow } from '../lib/db'

/**
 * Lock the neuronInstances sync carve-out (add-neurons-dupe-fusion): UNION by
 * instanceId + `consumedAt` MONOTONIC-OR — a consumed (promoted-away) individual
 * must never resurrect across devices. Mirrors dmnEventLog / everWrong discipline.
 */

const adapter = NEURONS_ADAPTERS.find((a) => a.name === 'neuronInstances')!

function inst(id: string, consumedAt: number | null): NeuronInstanceRow {
  return {
    instanceId: id,
    familyId: '藥理學',
    slotIndex: 2,
    rarity: 'P4',
    spriteKey: 'variant:藥理學:2',
    rolledAt: 1717070400000,
    consumedAt,
  }
}

beforeEach(async () => {
  await db.neuronInstances.clear()
})
afterEach(async () => {
  await db.neuronInstances.clear()
})

describe('neuronInstances sync merge', () => {
  it('unions an instance the local device has never seen', async () => {
    await adapter.apply(db, [inst('a', null)])
    expect(await db.neuronInstances.count()).toBe(1)
    expect((await db.neuronInstances.get('a'))?.consumedAt).toBeNull()
  })

  it('a consumed individual stays consumed (held local + consumed incoming)', async () => {
    await db.neuronInstances.put(inst('a', null)) // held locally
    await adapter.apply(db, [inst('a', 1717080000000)]) // consumed on the other device
    expect((await db.neuronInstances.get('a'))?.consumedAt).toBe(1717080000000)
  })

  it('does NOT resurrect: consumed local + held incoming stays consumed', async () => {
    await db.neuronInstances.put(inst('a', 1717080000000)) // consumed locally
    await adapter.apply(db, [inst('a', null)]) // other device still holds it
    expect((await db.neuronInstances.get('a'))?.consumedAt).toBe(1717080000000)
  })

  it('keeps the EARLIER consumedAt when both sides consumed', async () => {
    await db.neuronInstances.put(inst('a', 200))
    await adapter.apply(db, [inst('a', 100)])
    expect((await db.neuronInstances.get('a'))?.consumedAt).toBe(100)
  })

  it('skips invalid rows without throwing', async () => {
    const res = await adapter.apply(db, [null, {}, { instanceId: 5 }])
    expect(res.applied).toBe(0)
    expect(res.skipped).toBe(3)
  })
})

describe('neuronInstances cross-version tolerance', () => {
  it('v11 client reading an old bundle (no neuronInstances key) preserves local', async () => {
    await db.neuronInstances.put(inst('local-1', null))
    // A pre-v11 bundle: no `neuronInstances` key in data.
    const oldBundle: BundleSnapshot = {
      meta: { schema_version: 10, updated_at: '2026-06-02T00:00:00Z', client_id: 'old', app_version: '0.4.0' },
      data: {},
    }
    await applyBundleSnapshot(db, oldBundle)
    expect(await db.neuronInstances.count()).toBe(1)
    expect(await db.neuronInstances.get('local-1')).toBeTruthy()
  })
})
