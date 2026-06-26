import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import 'fake-indexeddb/auto'
import {
  findByNfcName,
  lookupEntry,
  loadProvenanceMap,
  __resetProvenanceCache,
} from '../platform/provenance'
import { saveFolderHandle, loadFolderHandle, clearFolderHandle } from '../platform/folderStore'
import { isDesktop, isLocalPdfSupported, getStatus, openExplanation } from '../platform'
import type { ProvenanceMapFile } from '../platform/types'

const MAP: ProvenanceMapFile = {
  version: 'v1',
  sourceHash: 'deadbeef',
  count: 2,
  entries: {
    '112-1-醫學一-解剖學-Q1': { file: '112-1醫學一 詳解.pdf', page: 3 },
    '106-2-醫學一-生物化學-Q74': { file: '106-2醫學(一).pdf', page: 82 },
  },
}

const realWindow = (globalThis as { window?: unknown }).window
beforeEach(() => {
  __resetProvenanceCache()
  ;(globalThis as { window?: unknown }).window = undefined
})
afterEach(() => {
  ;(globalThis as { window?: unknown }).window = realWindow
})

describe('findByNfcName — CJK-safe filename matching (D9)', () => {
  it('matches an NFD on-disk name against an NFC map name', () => {
    const nfcTarget = 'café.pdf' // U+00E9
    const nfdOnDisk = 'café.pdf' // e + combining acute
    expect(nfcTarget).not.toBe(nfdOnDisk) // raw bytes differ
    expect(findByNfcName([nfdOnDisk], nfcTarget)).toBe(nfdOnDisk)
  })

  it('matches an identical CJK filename', () => {
    const name = '112-1醫學一 詳解.pdf'
    expect(findByNfcName(['other.pdf', name], name)).toBe(name)
  })

  it('returns undefined when no entry matches', () => {
    expect(findByNfcName(['a.pdf', 'b.pdf'], 'missing.pdf')).toBeUndefined()
  })
})

describe('lookupEntry', () => {
  it('returns the entry for a mapped question', () => {
    expect(lookupEntry(MAP, '112-1-醫學一-解剖學-Q1')).toEqual({ file: '112-1醫學一 詳解.pdf', page: 3 })
  })
  it('returns undefined for an unmapped question or null map', () => {
    expect(lookupEntry(MAP, '999-9-無此題-Q1')).toBeUndefined()
    expect(lookupEntry(null, '112-1-醫學一-解剖學-Q1')).toBeUndefined()
  })
})

describe('loadProvenanceMap — lazy fetch + cache + graceful failure', () => {
  it('fetches once and caches the result', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, json: async () => MAP })
    const a = await loadProvenanceMap(fetchImpl as unknown as typeof fetch, '/')
    const b = await loadProvenanceMap(fetchImpl as unknown as typeof fetch, '/')
    expect(a).toEqual(MAP)
    expect(b).toBe(a)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(fetchImpl).toHaveBeenCalledWith('/provenance/question-pdf-map.v1.json')
  })

  it('resolves null on a non-ok response', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false })
    expect(await loadProvenanceMap(fetchImpl as unknown as typeof fetch, '/')).toBeNull()
  })

  it('resolves null when fetch throws', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('offline'))
    expect(await loadProvenanceMap(fetchImpl as unknown as typeof fetch, '/')).toBeNull()
  })
})

describe('adapter graceful degradation (No Silent Errors)', () => {
  it('reports unsupported on a platform without File System Access', async () => {
    expect(isLocalPdfSupported()).toBe(false)
    expect(isDesktop()).toBe(false)
    expect(await getStatus()).toBe('unsupported')
    expect(await openExplanation('112-1-醫學一-解剖學-Q1')).toEqual({ ok: false, reason: 'unsupported' })
  })

  it('reports unmapped for a supported platform when the question has no provenance', async () => {
    ;(globalThis as { window?: unknown }).window = { showDirectoryPicker: () => Promise.resolve({}) }
    // Prime the map cache so openExplanation reuses our fixture (no real network).
    await loadProvenanceMap(
      vi.fn().mockResolvedValue({ ok: true, json: async () => MAP }) as unknown as typeof fetch,
      '/',
    )
    expect(isLocalPdfSupported()).toBe(true)
    expect(await openExplanation('999-9-無此題-Q1')).toEqual({ ok: false, reason: 'unmapped' })
  })
})

describe('folderStore — device-local handle persistence', () => {
  it('round-trips a saved handle and clears it', async () => {
    const fakeHandle = { kind: 'directory', name: '陽明PDF' } as unknown as FileSystemDirectoryHandle
    expect(await loadFolderHandle()).toBeNull()
    await saveFolderHandle(fakeHandle)
    expect(await loadFolderHandle()).toMatchObject({ name: '陽明PDF' })
    await clearFolderHandle()
    expect(await loadFolderHandle()).toBeNull()
  })
})
