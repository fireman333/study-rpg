import { describe, it, expect } from 'vitest'
import { deriveBookletKey, parseResourceKey, resolveBooklet } from '../../scripts/booklet-identity.mjs'

// Mirror of the committed booklet-drive-links.json shape (bookletKey → { driveFileId, viewUrl }).
const LINKS = {
  '104-1-醫學一': {
    driveFileId: '1IJYfseAtO_dVhuZzfTNt50GaoK8yk1Ok',
    viewUrl: 'https://drive.google.com/file/d/1IJYfseAtO_dVhuZzfTNt50GaoK8yk1Ok/view',
  },
  '104-1-醫學二': {
    driveFileId: '0B1fUmKbhv5stbHJEaS1saEtTQWc',
    viewUrl:
      'https://drive.google.com/file/d/0B1fUmKbhv5stbHJEaS1saEtTQWc/view?resourcekey=0-vqIS1ZA6_SMcycDAowhO8Q',
  },
  '111-2-醫學一': { driveFileId: 'FID1112', viewUrl: 'https://drive.google.com/file/d/FID1112/view' },
  '113-1-醫學一': { driveFileId: 'FID1131', viewUrl: 'https://drive.google.com/file/d/FID1131/view' },
}

describe('deriveBookletKey — filename → stable bookletKey (D4)', () => {
  it('handles parenthesized 醫學(一)/(二)', () => {
    expect(deriveBookletKey('104-1醫學(一).pdf')).toBe('104-1-醫學一')
    expect(deriveBookletKey('104-1醫學(二).pdf')).toBe('104-1-醫學二')
  })
  it('handles bare 醫學一 + suffixes (合併檔案 / 詳解 / _merged / 修)', () => {
    expect(deriveBookletKey('111-2醫學一合併檔案.pdf')).toBe('111-2-醫學一')
    expect(deriveBookletKey('112-1醫學二 詳解 (校正).pdf')).toBe('112-1-醫學二')
    expect(deriveBookletKey('112-2醫學一(全)_merged.pdf')).toBe('112-2-醫學一')
    expect(deriveBookletKey('113-1醫學一（修）.pdf')).toBe('113-1-醫學一')
    expect(deriveBookletKey('114-1_醫學二總檔案（修訂版）.pdf')).toBe('114-1-醫學二')
  })
  it('returns null for an unrecognizable filename', () => {
    expect(deriveBookletKey('not-a-booklet.pdf')).toBeNull()
    expect(deriveBookletKey('')).toBeNull()
  })
})

describe('parseResourceKey — pull resourceKey from a viewUrl', () => {
  it('extracts the resourcekey query param', () => {
    expect(parseResourceKey(LINKS['104-1-醫學二'].viewUrl)).toBe('0-vqIS1ZA6_SMcycDAowhO8Q')
  })
  it('returns undefined when absent', () => {
    expect(parseResourceKey(LINKS['104-1-醫學一'].viewUrl)).toBeUndefined()
    expect(parseResourceKey(undefined)).toBeUndefined()
  })
})

describe('resolveBooklet — filename → { bookletKey, driveFileId, resourceKey? }', () => {
  it('resolves a plain booklet (no resourceKey)', () => {
    expect(resolveBooklet('104-1醫學(一).pdf', LINKS)).toEqual({
      bookletKey: '104-1-醫學一',
      driveFileId: '1IJYfseAtO_dVhuZzfTNt50GaoK8yk1Ok',
    })
  })
  it('resolves the legacy resource-keyed booklet WITH its resourceKey', () => {
    expect(resolveBooklet('104-1醫學(二).pdf', LINKS)).toEqual({
      bookletKey: '104-1-醫學二',
      driveFileId: '0B1fUmKbhv5stbHJEaS1saEtTQWc',
      resourceKey: '0-vqIS1ZA6_SMcycDAowhO8Q',
    })
  })
  it('returns null for an unrecognizable filename or a key missing from the manifest', () => {
    expect(resolveBooklet('garbage.pdf', LINKS)).toBeNull()
    expect(resolveBooklet('109-9醫學(一).pdf', LINKS)).toBeNull() // valid shape, key not in manifest
  })
})
