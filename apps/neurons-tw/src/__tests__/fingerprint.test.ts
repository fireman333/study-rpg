import { describe, it, expect } from 'vitest'
import { createHash } from 'node:crypto'
import {
  normText,
  samplePages,
  computeFingerprint,
  matchFingerprint,
  type PdfLike,
  type BookletManifestEntry,
} from '../platform/fingerprint'

// Node sha256 — the SAME digest the build script uses, and (by spec) the same the browser
// SubtleCrypto path produces for an identical UTF-8 string. This guards the shared logic so a
// drift in normText / page sampling would break build↔runtime hash parity.
const sha = (s: string): Promise<string> =>
  Promise.resolve(createHash('sha256').update(s, 'utf8').digest('hex'))

function mockPdf(pageTexts: string[]): PdfLike {
  return {
    numPages: pageTexts.length,
    getPage: (n: number) =>
      Promise.resolve({
        getTextContent: () => Promise.resolve({ items: [{ str: pageTexts[n - 1] }] }),
      }),
  }
}

describe('normText', () => {
  it('NFC-normalizes, collapses whitespace, trims', () => {
    expect(normText('  a\n\t b   c ')).toBe('a b c')
    // NFD "é" (e + combining accent) → NFC single codepoint
    expect(normText('é')).toBe('é')
  })
  it('tolerates empty / nullish', () => {
    expect(normText('')).toBe('')
    expect(normText(undefined as unknown as string)).toBe('')
  })
})

describe('samplePages', () => {
  it('is [1, 2, last] deduped + clamped', () => {
    expect(samplePages(5)).toEqual([1, 2, 5])
    expect(samplePages(2)).toEqual([1, 2])
    expect(samplePages(1)).toEqual([1])
  })
})

describe('computeFingerprint', () => {
  it('hashes the sampled pages deterministically', async () => {
    const pdf = mockPdf(['cover page', 'instructions', 'p3', 'last page'])
    const fp = await computeFingerprint(pdf, sha)
    expect(fp.pageCount).toBe(4)
    expect(fp.samplePages).toEqual([1, 2, 4])
    expect(fp.fingerprints).toEqual([
      await sha('cover page'),
      await sha('instructions'),
      await sha('last page'),
    ])
  })
  it('empty text layer → empty-string hashes (size-only booklet)', async () => {
    const emptyHash = await sha('')
    const pdf = mockPdf(['', '', ''])
    const fp = await computeFingerprint(pdf, sha)
    expect(fp.fingerprints.every((h) => h === emptyHash)).toBe(true)
  })
})

describe('matchFingerprint', () => {
  const entry: BookletManifestEntry = {
    bookletId: '104-1-醫學一',
    canonicalFile: '104-1醫學(一).pdf',
    pageCount: 89,
    samplePages: [1, 2, 89],
    fingerprints: ['h1', 'h2', 'h3'],
    textFingerprintable: true,
    expectedSizeRange: [1000, 9000],
  }
  const fp = (pageCount: number, hashes: string[]) => ({ pageCount, samplePages: [1, 2, 89], fingerprints: hashes })

  it('all hashes match → strong', () => {
    expect(matchFingerprint(fp(89, ['h1', 'h2', 'h3']), 5000, entry)).toBe('strong')
  })
  it('majority match → weak', () => {
    expect(matchFingerprint(fp(89, ['h1', 'h2', 'XX']), 5000, entry)).toBe('weak')
  })
  it('page count differs → none', () => {
    expect(matchFingerprint(fp(90, ['h1', 'h2', 'h3']), 5000, entry)).toBe('none')
  })
  it('text unusable but page count + size band → low-confidence', () => {
    const sizeOnly = { ...entry, fingerprints: ['', '', ''], textFingerprintable: false }
    expect(matchFingerprint(fp(89, ['', '', '']), 5000, sizeOnly)).toBe('low-confidence')
  })
  it('text unusable + size out of band → none', () => {
    const sizeOnly = { ...entry, fingerprints: ['', '', ''], textFingerprintable: false }
    expect(matchFingerprint(fp(89, ['', '', '']), 50, sizeOnly)).toBe('none')
  })
  it('no hashes match → none (not a coincidental low-confidence)', () => {
    expect(matchFingerprint(fp(89, ['x', 'y', 'z']), 5000, entry)).toBe('none')
  })
})
