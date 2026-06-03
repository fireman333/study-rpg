import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import 'fake-indexeddb/auto'
import { db } from '../lib/db'
import { NEURONS_ADAPTERS } from '../lib/sync/tables'
import { applyBundleSnapshot, type BundleSnapshot } from '../lib/sync/r2/bundles'

/**
 * Lock the instanceNicknames sync semantics (add-neurons-instance-rename):
 * per-row LWW on `updatedAt` (NOT monotonic). A cleared nickname is an
 * empty-string row with a fresh updatedAt and SHALL propagate. A v13 client
 * reading a v12 bundle (no instanceNicknames key) SHALL preserve local
 * nicknames (omission ≠ clear).
 */

const adapter = NEURONS_ADAPTERS.find((a) => a.name === 'instanceNicknames')!

beforeEach(async () => {
  await db.instanceNicknames.clear()
})
afterEach(async () => {
  await db.instanceNicknames.clear()
})

describe('instanceNicknames sync merge (LWW)', () => {
  it('writes a nickname the local device has never seen', async () => {
    await adapter.apply(db, [{ instanceId: 'a', nickname: '小藍', updatedAt: 100 }])
    expect((await db.instanceNicknames.get('a'))?.nickname).toBe('小藍')
  })

  it('newer updatedAt wins', async () => {
    await db.instanceNicknames.put({ instanceId: 'a', nickname: '舊名', updatedAt: 100 })
    await adapter.apply(db, [{ instanceId: 'a', nickname: '新名', updatedAt: 200 }])
    expect((await db.instanceNicknames.get('a'))?.nickname).toBe('新名')
  })

  it('older updatedAt loses (local kept)', async () => {
    await db.instanceNicknames.put({ instanceId: 'a', nickname: '本地', updatedAt: 200 })
    await adapter.apply(db, [{ instanceId: 'a', nickname: '較舊', updatedAt: 100 }])
    expect((await db.instanceNicknames.get('a'))?.nickname).toBe('本地')
  })

  it('empty-string clear propagates when newer (NOT monotonic)', async () => {
    await db.instanceNicknames.put({ instanceId: 'a', nickname: '小藍', updatedAt: 100 })
    await adapter.apply(db, [{ instanceId: 'a', nickname: '', updatedAt: 200 }])
    expect((await db.instanceNicknames.get('a'))?.nickname).toBe('')
  })

  it('skips malformed incoming rows (no instanceId / no updatedAt)', async () => {
    const res = await adapter.apply(db, [
      { nickname: 'x', updatedAt: 100 }, // no instanceId
      { instanceId: 'b', nickname: 'y' }, // no updatedAt
      null,
    ])
    expect(res.applied).toBe(0)
    expect(res.skipped).toBe(3)
    expect(await db.instanceNicknames.count()).toBe(0)
  })
})

describe('instanceNicknames cross-version tolerance', () => {
  it('v13 client reading a v12 bundle (no instanceNicknames key) preserves local nicknames', async () => {
    await db.instanceNicknames.put({ instanceId: 'a', nickname: '小藍', updatedAt: 100 })
    const v12Bundle: BundleSnapshot = {
      meta: {
        schema_version: 12,
        updated_at: '2026-06-04T00:00:00.000Z',
        client_id: 'other-device',
        app_version: '0.4.0',
      },
      data: {}, // no instanceNicknames key — older bundle omits it
    }
    await applyBundleSnapshot(db, v12Bundle)
    // Omission ≠ clear: local nickname survives.
    expect((await db.instanceNicknames.get('a'))?.nickname).toBe('小藍')
  })
})
