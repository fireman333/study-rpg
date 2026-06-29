import { describe, it, expect, vi } from 'vitest'
import {
  fetchBooklet,
  officialDriveUrl,
  parseResourceKey,
  isCorsMaskedError,
  sameOriginProbe,
  isSuspectedEdgeThrottle,
  type DriveFetchResult,
} from '../platform/driveFetch'

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

describe('fetchBooklet — single whole-file request (fix-neurons-pdf-edge-throttle)', () => {
  it('fetches the booklet in ONE request, no Range header, returns the response', async () => {
    const data = new Uint8Array([1, 2, 3, 4, 5])
    const fetchImpl = vi.fn().mockResolvedValue(new Response(data as unknown as BodyInit, { status: 200 }))
    const r = await fetchBooklet('FID', undefined, { apiKey: KEY, isOnline: online, fetchImpl, sleep: noSleep })
    expect(r.ok).toBe(true)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    const init = fetchImpl.mock.calls[0][1] as RequestInit
    expect((init.headers as Record<string, string>)['Range']).toBeUndefined()
    const got = new Uint8Array(await (r as { response: Response }).response.arrayBuffer())
    expect([...got]).toEqual([1, 2, 3, 4, 5])
  })

  it('a 206 (server-initiated partial) is still treated as ok (res.ok covers 2xx)', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('partial', { status: 206 }))
    const r = await fetchBooklet('FID', undefined, { apiKey: KEY, isOnline: online, fetchImpl, sleep: noSleep })
    expect(r.ok).toBe(true)
  })
})

describe('isCorsMaskedError', () => {
  it('is true for TypeError / Load failed / Failed to fetch / NetworkError (string or Error)', () => {
    expect(isCorsMaskedError(new TypeError('Load failed'))).toBe(true)
    expect(isCorsMaskedError('TypeError: Load failed')).toBe(true)
    expect(isCorsMaskedError('Failed to fetch')).toBe(true)
    expect(isCorsMaskedError('NetworkError when attempting to fetch resource.')).toBe(true)
  })
  it('is false for readable HTTP-status details and unrelated errors', () => {
    expect(isCorsMaskedError('HTTP 403')).toBe(false)
    expect(isCorsMaskedError('HTTP 404')).toBe(false)
    expect(isCorsMaskedError(new Error('boom'))).toBe(false)
    expect(isCorsMaskedError(undefined)).toBe(false)
  })
})

describe('sameOriginProbe', () => {
  it('true when the probe fetch resolves (origin reachable, even a 404)', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('', { status: 404 }))
    expect(await sameOriginProbe({ fetchImpl, url: '/x' })).toBe(true)
  })
  it('false when the probe fetch throws (origin unreachable)', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new TypeError('Load failed'))
    expect(await sameOriginProbe({ fetchImpl, url: '/x' })).toBe(false)
  })
})

describe('isSuspectedEdgeThrottle', () => {
  const probeOk = vi.fn().mockResolvedValue(new Response('', { status: 200 }))
  const probeDown = vi.fn().mockRejectedValue(new TypeError('Load failed'))

  it('true: CORS-masked error + origin reachable', async () => {
    const res: DriveFetchResult = { ok: false, reason: 'error', message: 'x', detail: 'TypeError: Load failed' }
    expect(await isSuspectedEdgeThrottle(res, { fetchImpl: probeOk })).toBe(true)
  })
  it('false: CORS-masked error but origin ALSO unreachable (real outage)', async () => {
    const res: DriveFetchResult = { ok: false, reason: 'error', message: 'x', detail: 'TypeError: Load failed' }
    expect(await isSuspectedEdgeThrottle(res, { fetchImpl: probeDown })).toBe(false)
  })
  it('false: a readable quota 403 is NOT the CORS-masked throttle', async () => {
    const res: DriveFetchResult = { ok: false, reason: 'quota', status: 403, message: 'x', detail: 'HTTP 403' }
    expect(await isSuspectedEdgeThrottle(res, { fetchImpl: probeOk })).toBe(false)
  })
  it('false: an ok result is never a throttle', async () => {
    const res: DriveFetchResult = { ok: true, response: new Response('ok') }
    expect(await isSuspectedEdgeThrottle(res, { fetchImpl: probeOk })).toBe(false)
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
