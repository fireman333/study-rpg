import { describe, it, expect, vi, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import {
  findByNfcName,
  lookupEntry,
  loadProvenanceMap,
  __resetProvenanceCache,
} from '../platform/provenance'
import { isDesktop, isLocalPdfSupported, hasProvenance, openExplanation } from '../platform'
import type { ProvenanceMapFile } from '../platform/types'

const MAP: ProvenanceMapFile = {
  version: 'v1',
  sourceHash: 'deadbeef',
  count: 2,
  entries: {
    // Mapped + resolved to a Drive id → web action is available.
    '112-1-醫學一-解剖學-Q1': {
      file: '112-1醫學一 詳解.pdf',
      page: 3,
      bookletKey: '112-1-醫學一',
      driveFileId: 'FID-112-1-A',
    },
    // Mapped but unresolved (no Drive id) → web action hidden, open degrades to unmapped.
    '999-9-未解析-Q1': { file: 'mystery.pdf', page: 1 },
  },
}

beforeEach(() => {
  __resetProvenanceCache()
})

function primeMap(): Promise<unknown> {
  return loadProvenanceMap(
    vi.fn().mockResolvedValue({ ok: true, json: async () => MAP }) as unknown as typeof fetch,
    '/',
  )
}

describe('findByNfcName — CJK-safe filename matching (desktop helper, D9)', () => {
  it('matches an NFD on-disk name against an NFC map name', () => {
    const nfcTarget = 'café.pdf'.normalize('NFC') // U+00E9
    const nfdOnDisk = 'café.pdf'.normalize('NFD') // e + combining acute
    expect(nfcTarget).not.toBe(nfdOnDisk) // raw bytes differ
    expect(findByNfcName([nfdOnDisk], nfcTarget)).toBe(nfdOnDisk)
  })
  it('returns undefined when no entry matches', () => {
    expect(findByNfcName(['a.pdf', 'b.pdf'], 'missing.pdf')).toBeUndefined()
  })
})

describe('lookupEntry', () => {
  it('returns the entry for a mapped question', () => {
    expect(lookupEntry(MAP, '112-1-醫學一-解剖學-Q1')).toMatchObject({ page: 3, driveFileId: 'FID-112-1-A' })
  })
  it('returns undefined for an unmapped question or null map', () => {
    expect(lookupEntry(MAP, '000-0-無此題-Q1')).toBeUndefined()
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

describe('web adapter — available on every browser, gated only on a resolved mapping', () => {
  it('is supported on the web (NOT FSA-gated) and is not the desktop build', () => {
    expect(isLocalPdfSupported()).toBe(true)
    expect(isDesktop()).toBe(false)
  })

  it('hasProvenance is true for a Drive-resolved question, false otherwise', async () => {
    await primeMap()
    expect(await hasProvenance('112-1-醫學一-解剖學-Q1')).toBe(true) // mapped + driveFileId
    expect(await hasProvenance('999-9-未解析-Q1')).toBe(false) // mapped but no driveFileId
    expect(await hasProvenance('000-0-無此題-Q1')).toBe(false) // unmapped
  })

  it('openExplanation degrades to unmapped for unmapped / unresolved questions (No Silent Errors)', async () => {
    await primeMap()
    expect(await openExplanation('000-0-無此題-Q1')).toEqual({ ok: false, reason: 'unmapped' })
    expect(await openExplanation('999-9-未解析-Q1')).toEqual({ ok: false, reason: 'unmapped' })
  })
})
