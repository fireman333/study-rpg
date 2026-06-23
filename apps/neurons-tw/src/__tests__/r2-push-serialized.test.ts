/**
 * pushBundleSerialized composition (port-neurons-r2-single-flight-push S1/S2).
 *
 * The engine's debounced/manual push routes through this helper, which must
 * (a) acquire the per-user push lock and (b) refresh the persisted ETag from
 * localStorage BEFORE issuing the PUT, and (c) pass `snapshotOverride` through.
 * (The account-reset path uses the SAME primitives — withPushLock +
 * refreshEtagFromStore + low-level pushBundle — inline, because it needs a wider
 * critical section spanning PUT + ack + local wipe; see account-reset.test.ts.)
 *
 * The REAL withPushLock / refreshEtagFromStore primitives are unit-tested in
 * r2-single-flight-push.test.ts. Here the sibling deps are mocked at file level
 * so the wiring + ordering is asserted deterministically without a network — this
 * is why it lives in its own file (file-level vi.mock can't coexist with the
 * real-primitive tests).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { order } = vi.hoisted(() => ({ order: [] as string[] }))

vi.mock('../lib/sync/r2/push-lock', () => ({
  withPushLock: vi.fn(async (userId: string, fn: () => Promise<unknown>) => {
    order.push(`lock:${userId}`)
    return fn()
  }),
}))

vi.mock('../lib/sync/r2/etag', () => ({
  refreshEtagFromStore: vi.fn((userId: string) => order.push(`refresh:${userId}`)),
  getEtag: vi.fn(() => null),
  setEtag: vi.fn(),
  clearEtag: vi.fn(),
}))

vi.mock('../lib/sync/r2/client', () => ({
  requestPresign: vi.fn(async () => {
    order.push('presign')
    return { url: 'https://r2.example/put', requiredHeaders: {} }
  }),
}))

vi.mock('../lib/sync/r2/bundles', () => ({
  buildBundleSnapshot: vi.fn(async () => ({ meta: { schema_version: 22 }, data: {} })),
  gzipBundle: vi.fn(async () => ({ size: 3 })),
  gunzipBundle: vi.fn(),
  applyBundleSnapshot: vi.fn(),
}))

import { withPushLock } from '../lib/sync/r2/push-lock'
import { refreshEtagFromStore } from '../lib/sync/r2/etag'
import { pushBundleSerialized } from '../lib/sync/r2/engine-r2'

const fakeSupabase = {} as never
const fakeDb = {} as never

beforeEach(() => {
  order.length = 0
  vi.clearAllMocks()
  ;(globalThis as Record<string, unknown>).fetch = vi.fn(async () => {
    order.push('PUT')
    return {
      ok: true,
      status: 200,
      headers: { get: (k: string) => (k === 'ETag' ? '"E1"' : null) },
      text: async () => '',
    } as unknown as Response
  })
})

describe('pushBundleSerialized — lock + fresh ETag wrapping', () => {
  it('acquires the per-user lock and refreshes the ETag before the PUT', async () => {
    await pushBundleSerialized(fakeSupabase, fakeDb, 'u1')
    expect(withPushLock).toHaveBeenCalledWith('u1', expect.any(Function))
    expect(refreshEtagFromStore).toHaveBeenCalledWith('u1')
    // lock entered → ETag refreshed → presign → PUT (refresh strictly before PUT)
    expect(order).toEqual(['lock:u1', 'refresh:u1', 'presign', 'PUT'])
  })

  it('passes snapshotOverride through under the lock', async () => {
    const override = vi.fn(async () => ({ meta: { schema_version: 22 }, data: {} }) as never)
    await pushBundleSerialized(fakeSupabase, fakeDb, 'u2', { snapshotOverride: override })
    expect(override).toHaveBeenCalledTimes(1)
    expect(withPushLock).toHaveBeenCalledWith('u2', expect.any(Function))
    expect(refreshEtagFromStore).toHaveBeenCalledWith('u2')
    expect(order.indexOf('refresh:u2')).toBeLessThan(order.indexOf('PUT'))
  })
})
