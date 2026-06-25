/**
 * Phase 1 (eliminate-cross-device-r2-412-storm): a cross-device 412 must resolve
 * to a BOUNDED, deferred outcome — NOT a ×3 PUT retry burst, and NOT a throw for
 * the engine push path. The account-reset path (no `deferOnConflict`) must still
 * THROW so a conflicted reset aborts rather than silently "deferring" the empty
 * reset bundle (which would leave the cloud un-wiped).
 *
 * Sibling deps (client / bundles / etag / push-lock) are file-mocked so the PUT
 * count + outcome are deterministic without a network. The REAL push-lock / etag
 * primitives are unit-tested in r2-single-flight-push.test.ts (a separate file —
 * file-level vi.mock can't coexist with the real-primitive tests).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../lib/sync/r2/push-lock', () => ({
  withPushLock: vi.fn(async (_u: string, fn: () => Promise<unknown>) => fn()),
}))
vi.mock('../lib/sync/r2/etag', () => ({
  getEtag: vi.fn(() => null),
  setEtag: vi.fn(),
  clearEtag: vi.fn(),
  refreshEtagFromStore: vi.fn(),
}))
vi.mock('../lib/sync/r2/client', () => ({
  requestPresign: vi.fn(async (_sb: unknown, op: string) => ({
    url: `https://r2.example/${op}`,
    requiredHeaders: {},
  })),
}))
vi.mock('../lib/sync/r2/bundles', () => ({
  buildBundleSnapshot: vi.fn(async () => ({ meta: { schema_version: 22 }, data: {} })),
  gzipBundle: vi.fn(async () => ({ size: 3 })),
  gunzipBundle: vi.fn(),
  applyBundleSnapshot: vi.fn(),
}))

import { pushBundle } from '../lib/sync/r2/engine-r2'

const fakeSupabase = {} as never
const fakeDb = {} as never

let putCount = 0
let getCount = 0

/** Install a fetch that 412s (or 2xx's) every PUT and 404s the internal pull GET. */
function installFetch(putStatus: number, putEtag: string | null = null) {
  putCount = 0
  getCount = 0
  ;(globalThis as Record<string, unknown>).fetch = vi.fn(
    async (_url: string, init?: { method?: string }) => {
      const method = init?.method ?? 'GET'
      if (method === 'PUT') {
        putCount += 1
        return {
          ok: putStatus >= 200 && putStatus < 300,
          status: putStatus,
          headers: { get: (k: string) => (k === 'ETag' ? putEtag : null) },
          text: async () => '',
        } as unknown as Response
      }
      // Internal pull GET → 404 (blob missing) so the pull short-circuits cleanly.
      getCount += 1
      return {
        ok: false,
        status: 404,
        headers: { get: () => null },
        text: async () => '',
      } as unknown as Response
    },
  )
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('pushBundle — Phase 1 defer-on-conflict', () => {
  it('on 412 with deferOnConflict, returns a deferred outcome after exactly ONE PUT (no ×3 burst)', async () => {
    installFetch(412)
    const result = await pushBundle(fakeSupabase, fakeDb, 'u1', { deferOnConflict: true })
    expect(result).toEqual({ status: 'deferred', reason: 'concurrent-writer', attempts: 1 })
    expect(putCount).toBe(1) // was up to MAX_PUSH_RETRIES=3 PUTs before Phase 1
    expect(getCount).toBe(1) // one refresh pull, no extra retry-burst GETs
  })

  it('on 409 with deferOnConflict, also defers after one PUT (same path as 412)', async () => {
    installFetch(409)
    const result = await pushBundle(fakeSupabase, fakeDb, 'u1', { deferOnConflict: true })
    expect(result).toEqual({ status: 'deferred', reason: 'concurrent-writer', attempts: 1 })
    expect(putCount).toBe(1)
  })

  it('on 412 WITHOUT deferOnConflict (account-reset path), still throws + aborts after one PUT', async () => {
    installFetch(412)
    await expect(pushBundle(fakeSupabase, fakeDb, 'u1')).rejects.toThrow(
      'r2_blob_concurrent_writer_exhausted',
    )
    expect(putCount).toBe(1)
  })

  it('on 200, returns a pushed outcome carrying the ETag', async () => {
    installFetch(200, '"E1"')
    const result = await pushBundle(fakeSupabase, fakeDb, 'u1', { deferOnConflict: true })
    expect(result).toMatchObject({ status: 'pushed', etag: '"E1"' })
    expect(putCount).toBe(1)
  })
})
