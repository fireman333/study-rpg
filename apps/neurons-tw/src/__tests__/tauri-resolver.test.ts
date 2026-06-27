import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock the Tauri + pdfjs boundary so the desktop resolver is testable in Node.
const invoke = vi.fn()
vi.mock('@tauri-apps/api/core', () => ({ invoke: (...a: unknown[]) => invoke(...a) }))
vi.mock('@tauri-apps/plugin-dialog', () => ({ open: vi.fn() }))
const fingerprintBytes = vi.fn()
vi.mock('../platform/fingerprint-runtime', () => ({ fingerprintBytes: (...a: unknown[]) => fingerprintBytes(...a) }))

import { openExplanation } from '../platform/tauriBackend'
import { __resetProvenanceCache } from '../platform/provenance'
import { __resetManifestCaches } from '../platform/manifest'

// A question whose provenance file is the booklet's canonical name; the booklet fingerprints to
// pageCount 89 + one text hash "H1".
const QID = '104-1-醫學一-公共衛生學-Q83'
const CANON = '104-1醫學(一).pdf'
const TARGET_FP = { pageCount: 89, samplePages: [1, 2, 89], fingerprints: ['H1', 'H2', 'H3'] }

const fetchJson = (obj: unknown) => Promise.resolve({ ok: true, json: () => Promise.resolve(obj) } as Response)

function installLocalStorageMock(): void {
  const store = new Map<string, string>()
  ;(globalThis as Record<string, unknown>).localStorage = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
    clear: () => void store.clear(),
  }
}

beforeEach(() => {
  invoke.mockReset()
  fingerprintBytes.mockReset()
  __resetProvenanceCache()
  __resetManifestCaches()
  installLocalStorageMock()
  localStorage.setItem('neurons.desktop.pdfFolder.v1', '/Users/me/pdfs') // pre-granted folder
  globalThis.URL.createObjectURL = vi.fn(() => 'blob:fake')
  globalThis.fetch = vi.fn((url: string) => {
    if (String(url).includes('question-pdf-map')) return fetchJson({ entries: { [QID]: { file: CANON, page: 78 } } })
    if (String(url).includes('fingerprint-manifest'))
      return fetchJson({
        version: 'fp-v1',
        count: 1,
        entries: [{ bookletId: '104-1-醫學一', canonicalFile: CANON, ...TARGET_FP, textFingerprintable: true, expectedSizeRange: [1000, 9_000_000] }],
      })
    if (String(url).includes('booklet-drive-links'))
      return fetchJson({ '104-1-醫學一': { driveFileId: 'ID1', viewUrl: 'https://drive.google.com/file/d/ID1/view' } })
    return Promise.resolve({ ok: false } as Response)
  }) as typeof fetch
})

describe('desktop openExplanation (fingerprint resolver)', () => {
  it('resolves a booklet by fingerprint even when the file has an arbitrary name', async () => {
    invoke.mockImplementation((cmd: string) => {
      if (cmd === 'set_pdf_folder') return Promise.resolve()
      if (cmd === 'list_pdf_files_with_stat') return Promise.resolve([{ name: '隨便取的名字.pdf', size: 5000, mtime: 1 }])
      if (cmd === 'read_pdf_file') return Promise.resolve(new ArrayBuffer(8))
      return Promise.resolve()
    })
    fingerprintBytes.mockResolvedValue(TARGET_FP) // the random-named file IS the booklet

    const r = await openExplanation(QID)
    expect(r).toMatchObject({ ok: true, page: 78, file: '隨便取的名字.pdf', confidence: 'strong' })
  })

  it('missing booklet → file-not-found carrying the official Drive link (guided download)', async () => {
    invoke.mockImplementation((cmd: string) => {
      if (cmd === 'set_pdf_folder') return Promise.resolve()
      if (cmd === 'list_pdf_files_with_stat') return Promise.resolve([]) // folder has no PDFs
      return Promise.resolve()
    })

    const r = await openExplanation(QID)
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.reason).toBe('file-not-found')
      expect(r.bookletId).toBe('104-1-醫學一')
      expect(r.driveUrl).toBe('https://drive.google.com/file/d/ID1/view')
    }
  })

  it('unmapped question short-circuits before any folder access', async () => {
    const r = await openExplanation('999-9-醫學一-X-Q1')
    expect(r).toEqual({ ok: false, reason: 'unmapped' })
    expect(invoke).not.toHaveBeenCalled()
  })
})
