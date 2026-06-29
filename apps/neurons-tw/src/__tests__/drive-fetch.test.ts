import { describe, it, expect, vi } from 'vitest'
import { fetchBooklet, officialDriveUrl, parseResourceKey } from '../platform/driveFetch'

const KEY = 'TEST_KEY'
const online = () => true
const noSleep = async (): Promise<void> => {}

describe('fetchBooklet — resourceKey header inclusion', () => {
  it('adds X-Goog-Drive-Resource-Keys ONLY when a resourceKey is present', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('ok', { status: 200 }))

    await fetchBooklet('FID', 'RK', { apiKey: KEY, isOnline: online, fetchImpl })
    const [url1, init1] = fetchImpl.mock.calls[0]
    expect(url1).toContain('/drive/v3/files/FID?alt=media&key=TEST_KEY')
    expect((init1.headers as Record<string, string>)['X-Goog-Drive-Resource-Keys']).toBe('FID/RK')

    fetchImpl.mockClear()
    await fetchBooklet('FID2', undefined, { apiKey: KEY, isOnline: online, fetchImpl })
    const init2 = fetchImpl.mock.calls[0][1]
    expect((init2.headers as Record<string, string>)['X-Goog-Drive-Resource-Keys']).toBeUndefined()
  })
})

describe('fetchBooklet — error classification (No Silent Errors)', () => {
  it('config: missing key returns config without fetching', async () => {
    const fetchImpl = vi.fn()
    const r = await fetchBooklet('FID', undefined, { apiKey: '', isOnline: online, fetchImpl })
    expect(r).toMatchObject({ ok: false, reason: 'config' })
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('offline: returns offline without fetching', async () => {
    const fetchImpl = vi.fn()
    const r = await fetchBooklet('FID', undefined, { apiKey: KEY, isOnline: () => false, fetchImpl })
    expect(r).toMatchObject({ ok: false, reason: 'offline' })
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('403 and 429 → quota (terminal, no retry)', async () => {
    for (const status of [403, 429]) {
      const fetchImpl = vi.fn().mockResolvedValue(new Response('', { status }))
      const r = await fetchBooklet('FID', undefined, { apiKey: KEY, isOnline: online, fetchImpl, sleep: noSleep })
      expect(r).toMatchObject({ ok: false, reason: 'quota', status })
      expect(fetchImpl).toHaveBeenCalledTimes(1)
    }
  })

  it('404 → not-found (link-rot, terminal)', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('', { status: 404 }))
    const r = await fetchBooklet('FID', undefined, { apiKey: KEY, isOnline: online, fetchImpl, sleep: noSleep })
    expect(r).toMatchObject({ ok: false, reason: 'not-found', status: 404 })
  })

  it('transient 503 is retried then succeeds', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response('', { status: 503 }))
      .mockResolvedValueOnce(new Response('ok', { status: 200 }))
    const r = await fetchBooklet('FID', undefined, { apiKey: KEY, isOnline: online, fetchImpl, sleep: noSleep })
    expect(r.ok).toBe(true)
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it('persistent 503 retries to exhaustion then returns error', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('', { status: 503 }))
    const r = await fetchBooklet('FID', undefined, {
      apiKey: KEY,
      isOnline: online,
      fetchImpl,
      sleep: noSleep,
      retries: 1,
    })
    expect(r).toMatchObject({ ok: false, reason: 'error', status: 503 })
    expect(fetchImpl).toHaveBeenCalledTimes(2) // attempt 0 + 1 retry
  })

  it('network error is retried then returns error', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new TypeError('network down'))
    const r = await fetchBooklet('FID', undefined, {
      apiKey: KEY,
      isOnline: online,
      fetchImpl,
      sleep: noSleep,
      retries: 1,
    })
    expect(r).toMatchObject({ ok: false, reason: 'error' })
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })
})

describe('fetchBooklet — Range-chunked assembly (fix-neurons-ipad-large-pdf-fetch)', () => {
  // Serve `data` in Range slices like Drive does: 206 + Content-Range with the total.
  const body = (u: Uint8Array): BodyInit => u as unknown as BodyInit
  const rangeServer = (data: Uint8Array) =>
    vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      const range = ((init?.headers ?? {}) as Record<string, string>)['Range']
      const m = /bytes=(\d+)-(\d+)/.exec(range ?? '')
      if (!m) return new Response(body(data), { status: 200 })
      const start = Number(m[1])
      const end = Math.min(Number(m[2]), data.length - 1)
      const slice = data.slice(start, end + 1)
      return new Response(body(slice), {
        status: 206,
        headers: { 'Content-Range': `bytes ${start}-${end}/${data.length}` },
      })
    })

  it('assembles a multi-slice file from Range requests, bytes intact', async () => {
    const data = new Uint8Array(Array.from({ length: 10 }, (_, i) => i))
    const fetchImpl = rangeServer(data)
    const r = await fetchBooklet('FID', undefined, {
      apiKey: KEY,
      isOnline: online,
      fetchImpl,
      sleep: noSleep,
      chunkSize: 4,
    })
    expect(r.ok).toBe(true)
    const got = new Uint8Array(await (r as { response: Response }).response.arrayBuffer())
    expect([...got]).toEqual([...data])
    expect(fetchImpl).toHaveBeenCalledTimes(3) // ceil(10/4): probe(0-3) + 4-7 + 8-9
  })

  it('a single-slice (small) file makes exactly one request', async () => {
    const data = new Uint8Array([1, 2, 3])
    const fetchImpl = rangeServer(data)
    const r = await fetchBooklet('FID', undefined, {
      apiKey: KEY,
      isOnline: online,
      fetchImpl,
      sleep: noSleep,
      chunkSize: 4,
    })
    expect(r.ok).toBe(true)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    const got = new Uint8Array(await (r as { response: Response }).response.arrayBuffer())
    expect([...got]).toEqual([1, 2, 3])
  })

  it('a slice that 404s mid-stream surfaces as a read error (no partial cache)', async () => {
    const data = new Uint8Array(Array.from({ length: 10 }, (_, i) => i))
    let call = 0
    const fetchImpl = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      call += 1
      const range = ((init?.headers ?? {}) as Record<string, string>)['Range']
      const m = /bytes=(\d+)-(\d+)/.exec(range ?? '')!
      const start = Number(m[1])
      if (call >= 2) return new Response('', { status: 404 }) // second slice fails
      const end = Math.min(Number(m[2]), data.length - 1)
      return new Response(data.slice(start, end + 1) as unknown as BodyInit, {
        status: 206,
        headers: { 'Content-Range': `bytes ${start}-${end}/${data.length}` },
      })
    })
    const r = await fetchBooklet('FID', undefined, {
      apiKey: KEY,
      isOnline: online,
      fetchImpl,
      sleep: noSleep,
      chunkSize: 4,
    })
    expect(r.ok).toBe(true) // the probe succeeded; the failure is deferred to body consumption
    await expect((r as { response: Response }).response.arrayBuffer()).rejects.toThrow()
  })
})

describe('helpers', () => {
  it('officialDriveUrl appends resourcekey only when present', () => {
    expect(officialDriveUrl('FID')).toBe('https://drive.google.com/file/d/FID/view')
    expect(officialDriveUrl('FID', '0-abc')).toBe('https://drive.google.com/file/d/FID/view?resourcekey=0-abc')
  })
  it('parseResourceKey mirrors the build-time helper', () => {
    expect(parseResourceKey('https://x/view?resourcekey=0-zzz')).toBe('0-zzz')
    expect(parseResourceKey('https://x/view')).toBeUndefined()
  })
})
