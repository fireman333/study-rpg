// Unit tests for pushBundle's 412 recovery loop, covering the three distinct
// paths that the engine must distinguish in production logs:
//
//   1. Corrupt-blob recovery — first PUT lands on a non-gzip leftover, engine
//      pulls the ETag without decoding the body, retries PUT with If-Match,
//      succeeds. console.info logs the recovery for grep-able auditing.
//   2. Concurrent-writer exhausted — every retry hits a 412 because a real
//      writer keeps invalidating the ETag. Engine surfaces a distinct error
//      `r2_blob_concurrent_writer_exhausted` so logs separate this from
//      the network-fail case.
//   3. Real network failure — fetch throws before getting a response. Engine
//      preserves the underlying message in `r2_push_exhausted: <orig>` so
//      CORS / DNS / offline misconfigs remain identifiable in logs.

import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { Bundle, PresignResult } from '../client'

// Mock module boundaries before importing the SUT.

const mocks = vi.hoisted(() => ({
  buildBundleSnapshot: vi.fn(async () => ({
    meta: { schema_version: 1, updated_at: '2026-05-20T00:00:00.000Z', client_id: 'test-client' },
    data: { player_state: [{ user_id: 'u1', updated_at: '2026-05-20T00:00:00.000Z' }] },
  })),
  gzipBundle: vi.fn(async () => new Blob(['fake-gz-body'], { type: 'application/gzip' })),
  gunzipBundle: vi.fn() as ReturnType<typeof vi.fn>,
  applyBundleSnapshot: vi.fn(async () => ({ applied: 1, skipped: 0 })),
  etagMap: new Map<string, string | null>(),
}))

vi.mock('../client', () => ({
  requestPresign: vi.fn(
    async (_supabase: unknown, _bundle: Bundle, _op: 'put' | 'get'): Promise<PresignResult> => ({
      url: 'mock://r2/m1',
      expiresAt: Date.now() + 60_000,
    }),
  ),
  clearPresignCache: vi.fn(),
  getWorkerUrl: vi.fn(() => 'mock://worker'),
}))

vi.mock('../bundles', () => ({
  buildBundleSnapshot: mocks.buildBundleSnapshot,
  gzipBundle: mocks.gzipBundle,
  gunzipBundle: mocks.gunzipBundle,
  applyBundleSnapshot: mocks.applyBundleSnapshot,
  validateBundleMeta: vi.fn(),
  getClientId: vi.fn(() => 'test-client'),
}))

vi.mock('../etag', () => ({
  getEtag: vi.fn((b: string) => mocks.etagMap.get(b) ?? null),
  setEtag: vi.fn((b: string, e: string | null) => {
    mocks.etagMap.set(b, e)
  }),
  clearAllEtags: vi.fn(() => {
    mocks.etagMap.clear()
  }),
}))

// Import after mocks so the SUT picks up the mocked deps.
import { pushBundle } from '../engine-r2'

function makeResponse(status: number, body: BodyInit | null, etag?: string): Response {
  const headers = new Headers()
  if (etag) headers.set('ETag', etag)
  return new Response(body, { status, headers })
}

describe('pushBundle 412 recovery paths', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.etagMap.clear()
  })

  it('recovers from a corrupt 1-byte blob via If-Match overwrite', async () => {
    const fetchMock = vi.fn()
    // 1: first PUT (If-None-Match: *) → 412 PreconditionFailed.
    fetchMock.mockResolvedValueOnce(makeResponse(412, '<PreconditionFailed/>'))
    // 2: GET inside pullBundle → 200 OK + corrupt 1-byte body + ETag.
    fetchMock.mockResolvedValueOnce(makeResponse(200, new Uint8Array([0x74]), '"corrupt-etag"'))
    // 3: second PUT (If-Match: "corrupt-etag") → 200 OK + new ETag.
    fetchMock.mockResolvedValueOnce(makeResponse(200, '', '"new-etag"'))
    vi.stubGlobal('fetch', fetchMock)

    // gunzip on the corrupt body throws — engine MUST NOT apply it.
    mocks.gunzipBundle.mockRejectedValueOnce(new Error('invalid gzip'))

    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => undefined)

    const result = await pushBundle({} as never, {} as never, [], 'm1', 'u1')

    expect(result.etag).toBe('"new-etag"')
    expect(result.attempts).toBe(2)
    expect(result.bytes).toBeGreaterThan(0)

    // Corrupt body MUST NOT have been merged to local Dexie.
    expect(mocks.applyBundleSnapshot).not.toHaveBeenCalled()

    // Operator-visible recovery log MUST fire.
    expect(infoSpy).toHaveBeenCalledWith(expect.stringMatching(/recovered from corrupt blob via overwrite/))

    // Fetch call sequence sanity.
    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(fetchMock.mock.calls[0][1]?.method).toBe('PUT')
    expect((fetchMock.mock.calls[0][1]?.headers as Record<string, string>)['If-None-Match']).toBe('*')
    expect(fetchMock.mock.calls[1][1]?.method).toBe('GET')
    expect(fetchMock.mock.calls[2][1]?.method).toBe('PUT')
    expect((fetchMock.mock.calls[2][1]?.headers as Record<string, string>)['If-Match']).toBe('"corrupt-etag"')
  })

  it('surfaces r2_blob_concurrent_writer_exhausted when 412 retries never succeed', async () => {
    const fetchMock = vi.fn()
    // Three rounds of (PUT 412, GET 200 corrupt) — every PUT loses the ETag race.
    for (let i = 0; i < 3; i++) {
      fetchMock.mockResolvedValueOnce(makeResponse(412, '<PreconditionFailed/>'))
      fetchMock.mockResolvedValueOnce(makeResponse(200, new Uint8Array([0x74]), `"etag-r${i}"`))
    }
    vi.stubGlobal('fetch', fetchMock)
    mocks.gunzipBundle.mockRejectedValue(new Error('invalid gzip'))

    await expect(pushBundle({} as never, {} as never, [], 'm1', 'u1')).rejects.toThrow(
      /r2_blob_concurrent_writer_exhausted/,
    )
  })

  it('preserves the underlying network-error message in r2_push_exhausted', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))
    vi.stubGlobal('fetch', fetchMock)

    await expect(pushBundle({} as never, {} as never, [], 'm1', 'u1')).rejects.toThrow(
      /r2_push_exhausted: Failed to fetch/,
    )
  })
})
