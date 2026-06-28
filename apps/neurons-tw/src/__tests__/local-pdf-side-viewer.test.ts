import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { __resetProvenanceCache, loadProvenanceMap } from '../platform/provenance'
import { openExplanation, releaseExplanationUrl } from '../platform'
import type { ByteStore } from '../platform/byteStore'
import type { ProvenanceMapFile } from '../platform/types'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const g = globalThis as any
const MAP: ProvenanceMapFile = {
  version: 'v1',
  sourceHash: 'x',
  count: 1,
  entries: {
    '106-2-醫學一-生物化學-Q74': {
      file: '106-2醫學(一).pdf',
      page: 82,
      bookletKey: '106-2-醫學一',
      driveFileId: 'FID-106-2-A',
    },
  },
}

function fakeStore(initial?: Record<string, Response>): ByteStore {
  const m = new Map<string, Response>(Object.entries(initial ?? {}))
  return {
    get: vi.fn(async (k: string) => m.get(k)),
    put: vi.fn(async (k: string, r: Response) => void m.set(k, r)),
    delete: vi.fn(async (k: string) => void m.delete(k)),
    list: vi.fn(async () => [...m.keys()]),
  }
}

const realWindow = g.window
const realRevoke = g.URL.revokeObjectURL
beforeEach(() => {
  __resetProvenanceCache()
  g.URL.revokeObjectURL = vi.fn()
})
afterEach(() => {
  g.window = realWindow
  g.URL.revokeObjectURL = realRevoke
  vi.clearAllMocks()
})

async function primeMap(): Promise<void> {
  await loadProvenanceMap(vi.fn().mockResolvedValue({ ok: true, json: async () => MAP }) as unknown as typeof fetch, '/')
}

describe('openExplanation (web) — fetch on miss, cache on hit, resolve for the docked viewer', () => {
  it('cache MISS → fetches from Drive, caches it, returns {ok,url,page,file} (no new tab)', async () => {
    await primeMap()
    const store = fakeStore()
    const fetchImpl = vi.fn().mockResolvedValue(new Response(new Uint8Array([1, 2, 3]), { status: 200 }))
    const r = await openExplanation('106-2-醫學一-生物化學-Q74', {
      byteStore: store,
      fetchImpl,
      apiKey: 'K',
      isOnline: () => true,
      createUrl: () => 'blob:mock-123',
    })
    expect(r).toEqual({ ok: true, page: 82, url: 'blob:mock-123', file: '106-2醫學(一).pdf' })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(store.put).toHaveBeenCalledTimes(1) // cached for next time
    expect((store.put as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBe('106-2-醫學一')
  })

  it('cache HIT → serves from cache with NO network fetch', async () => {
    await primeMap()
    const store = fakeStore({ '106-2-醫學一': new Response(new Uint8Array([9, 9]), { status: 200 }) })
    const fetchImpl = vi.fn()
    const r = await openExplanation('106-2-醫學一-生物化學-Q74', {
      byteStore: store,
      fetchImpl,
      apiKey: 'K',
      isOnline: () => true,
      createUrl: () => 'blob:cached-1',
    })
    expect(r).toEqual({ ok: true, page: 82, url: 'blob:cached-1', file: '106-2醫學(一).pdf' })
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('fetch FAILURE → typed reason + official Drive link, never throws', async () => {
    await primeMap()
    const store = fakeStore()
    const fetchImpl = vi.fn().mockResolvedValue(new Response('', { status: 404 }))
    const r = await openExplanation('106-2-醫學一-生物化學-Q74', {
      byteStore: store,
      fetchImpl,
      apiKey: 'K',
      isOnline: () => true,
      createUrl: () => 'blob:never',
    })
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.reason).toBe('not-found')
      expect(r.bookletId).toBe('106-2-醫學一')
      expect(r.driveUrl).toBe('https://drive.google.com/file/d/FID-106-2-A/view')
    }
    expect(store.put).not.toHaveBeenCalled()
  })
})

describe('releaseExplanationUrl — revoke lifecycle', () => {
  it('revokes blob: URLs and ignores non-blob (future Tauri) URLs', () => {
    releaseExplanationUrl('blob:mock-123')
    expect(g.URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-123')
    g.URL.revokeObjectURL.mockClear()
    releaseExplanationUrl('tauri://localhost/106-2.pdf')
    expect(g.URL.revokeObjectURL).not.toHaveBeenCalled()
  })
})

describe('clampPanelWidth — docked panel width bounds', () => {
  it('clamps to [360, min(900, 70vw)]', async () => {
    g.window = { innerWidth: 1600 } // 70vw = 1120 → cap is min(900,1120)=900
    const { clampPanelWidth } = await import('../components/PdfPanelProvider')
    expect(clampPanelWidth(100)).toBe(360) // below min
    expect(clampPanelWidth(520)).toBe(520) // in range
    expect(clampPanelWidth(5000)).toBe(900) // above max (900 cap)
  })
  it('caps at 70vw on a narrow viewport', async () => {
    g.window = { innerWidth: 1000 } // 70vw = 700 → cap is min(900,700)=700
    const { clampPanelWidth } = await import('../components/PdfPanelProvider')
    expect(clampPanelWidth(5000)).toBe(700)
  })
})
