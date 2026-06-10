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
 * add-neurons-acceleration-system §3.5 — cross-version + merge semantics for the
 * two new adapters:
 *  - inventory: per-kind LWW on updatedAt (mutable stock); preserve-on-omission
 *  - equipment: UNION by equipmentId, MONOTONIC on presence (owning never un-owns)
 */

beforeEach(async () => {
  await db.delete()
  await db.open()
})

describe('acceleration bundle adapters', () => {
  it('SCHEMA_VERSION is 21', () => {
    expect(SCHEMA_VERSION).toBe(21)
  })

  it('inventory + equipment round-trip through the current bundle', async () => {
    await db.inventory.put({ kind: 'surge', count: 3, updatedAt: 2000 })
    await db.equipment.put({
      equipmentId: 'eq-fully-myelinated-axon-p1',
      rarity: 'P1',
      obtainedAt: 1000,
      updatedAt: 1000,
    })

    const bundle = await buildBundleSnapshot(db)
    expect(bundle.meta.schema_version).toBe(21)
    expect((bundle.data.inventory as unknown[]).length).toBe(1)
    expect((bundle.data.equipment as unknown[]).length).toBe(1)

    await db.delete()
    await db.open()
    expect(await db.inventory.count()).toBe(0)
    await applyBundleSnapshot(db, bundle)
    expect((await db.inventory.get('surge'))?.count).toBe(3)
    expect((await db.equipment.get('eq-fully-myelinated-axon-p1'))?.rarity).toBe('P1')
  })

  it('inventory LWW keeps the newer updatedAt; older incoming is skipped', async () => {
    await db.inventory.put({ kind: 'bolus', count: 5, updatedAt: 5000 })
    const stale: BundleSnapshot = {
      meta: { schema_version: 16, updated_at: '2026-06-04T00:00:00Z', client_id: 'c', app_version: '0.4.0' },
      data: { inventory: [{ kind: 'bolus', count: 1, updatedAt: 1000 }] },
    }
    await applyBundleSnapshot(db, stale)
    expect((await db.inventory.get('bolus'))?.count).toBe(5) // local newer wins
  })

  it('equipment never un-owns on a stale/empty omission (preserve-on-omission)', async () => {
    await db.equipment.put({
      equipmentId: 'eq-sodium-potassium-pump-p2',
      rarity: 'P2',
      obtainedAt: 3000,
      updatedAt: 3000,
    })
    // A v15 bundle (no inventory/equipment keys) must NOT wipe local ownership.
    const v15Bundle: BundleSnapshot = {
      meta: { schema_version: 15, updated_at: '2026-06-04T00:00:00Z', client_id: 'old', app_version: '0.4.0' },
      data: { synapses: [], meta: [] },
    }
    await applyBundleSnapshot(db, v15Bundle)
    expect(await db.equipment.count()).toBe(1) // still owned
  })

  it('equipment monotonic-union keeps the EARLIER obtainedAt when both sides own it', async () => {
    await db.equipment.put({
      equipmentId: 'eq-oligodendrocyte-companion-p3',
      rarity: 'P3',
      obtainedAt: 9000,
      updatedAt: 9000,
    })
    const incoming: BundleSnapshot = {
      meta: { schema_version: 16, updated_at: '2026-06-04T00:00:00Z', client_id: 'c', app_version: '0.4.0' },
      data: {
        equipment: [{ equipmentId: 'eq-oligodendrocyte-companion-p3', rarity: 'P3', obtainedAt: 4000, updatedAt: 9500 }],
      },
    }
    await applyBundleSnapshot(db, incoming)
    const row = await db.equipment.get('eq-oligodendrocyte-companion-p3')
    expect(row?.obtainedAt).toBe(4000) // earliest provenance kept
    expect(await db.equipment.count()).toBe(1) // no duplicate
  })
})
