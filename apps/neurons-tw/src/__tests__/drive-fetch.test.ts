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
