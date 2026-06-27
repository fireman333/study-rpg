import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { __resetProvenanceCache, loadProvenanceMap } from '../platform/provenance'
import type { ProvenanceMapFile } from '../platform/types'

// Mock the device-local folder store: openExplanation needs a handle WITH methods,
// but fake-indexeddb's structured clone would strip a mock's functions.
const mockHandle = {
  queryPermission: vi.fn().mockResolvedValue('granted'),
  requestPermission: vi.fn().mockResolvedValue('granted'),
  // eslint-disable-next-line require-yield
  entries: async function* () {
    yield ['106-2醫學(一).pdf', { kind: 'file' }]
    yield ['other.pdf', { kind: 'file' }]
  },
  getFileHandle: vi.fn().mockResolvedValue({
    getFile: vi.fn().mockResolvedValue(new File([new Uint8Array([1, 2, 3])], '106-2醫學(一).pdf')),
  }),
}
vi.mock('../platform/folderStore', () => ({
  loadFolderHandle: vi.fn().mockResolvedValue(mockHandle),
  saveFolderHandle: vi.fn().mockResolvedValue(undefined),
  clearFolderHandle: vi.fn().mockResolvedValue(undefined),
}))

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const g = globalThis as any
const MAP: ProvenanceMapFile = {
  version: 'v1',
  sourceHash: 'x',
  count: 1,
  entries: { '106-2-醫學一-生物化學-Q74': { file: '106-2醫學(一).pdf', page: 82 } },
}

const realWindow = g.window
const realCreate = g.URL.createObjectURL
const realRevoke = g.URL.revokeObjectURL
beforeEach(() => {
  __resetProvenanceCache()
  g.window = { showDirectoryPicker: vi.fn(), open: vi.fn() }
  g.URL.createObjectURL = vi.fn(() => 'blob:mock-123')
  g.URL.revokeObjectURL = vi.fn()
})
afterEach(() => {
  g.window = realWindow
  g.URL.createObjectURL = realCreate
  g.URL.revokeObjectURL = realRevoke
  vi.clearAllMocks()
})

describe('openExplanation — resolves a source for the in-app viewer (not a new tab)', () => {
  it('returns {ok,url,page,file} and does NOT open a new tab', async () => {
    const { openExplanation } = await import('../platform')
    await loadProvenanceMap(vi.fn().mockResolvedValue({ ok: true, json: async () => MAP }) as unknown as typeof fetch, '/')
    const r = await openExplanation('106-2-醫學一-生物化學-Q74')
    expect(r).toEqual({ ok: true, page: 82, url: 'blob:mock-123', file: '106-2醫學(一).pdf' })
    expect(g.window.open).not.toHaveBeenCalled()
    expect(g.URL.createObjectURL).toHaveBeenCalledTimes(1)
  })
})

describe('releaseExplanationUrl — revoke lifecycle', () => {
  it('revokes blob: URLs and ignores non-blob (future Tauri) URLs', async () => {
    const { releaseExplanationUrl } = await import('../platform')
    releaseExplanationUrl('blob:mock-123')
    expect(g.URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-123')
    g.URL.revokeObjectURL.mockClear()
    releaseExplanationUrl('tauri://localhost/106-2.pdf')
    expect(g.URL.revokeObjectURL).not.toHaveBeenCalled()
  })
})

describe('clampPanelWidth — docked panel width bounds', () => {
  it('clamps to [360, min(900, 70vw)]', async () => {
    g.window = { ...g.window, innerWidth: 1600 } // 70vw = 1120 → cap is min(900,1120)=900
    const { clampPanelWidth } = await import('../components/PdfPanelProvider')
    expect(clampPanelWidth(100)).toBe(360) // below min
    expect(clampPanelWidth(520)).toBe(520) // in range
    expect(clampPanelWidth(5000)).toBe(900) // above max (900 cap)
  })
  it('caps at 70vw on a narrow viewport', async () => {
    g.window = { ...g.window, innerWidth: 1000 } // 70vw = 700 → cap is min(900,700)=700
    const { clampPanelWidth } = await import('../components/PdfPanelProvider')
    expect(clampPanelWidth(5000)).toBe(700)
  })
})
