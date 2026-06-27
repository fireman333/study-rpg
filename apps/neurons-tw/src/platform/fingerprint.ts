/**
 * Content-fingerprint of a PDF — the SHARED identity logic used by BOTH the build-time
 * manifest generator (Node + pdfjs) and the runtime desktop resolver (browser + bundled
 * pdfjs), so build-time and runtime hashes are directly comparable (add-neurons-guided-pdf-
 * onboarding, design D1/D2). "booklet identity is proven by content fingerprint, filename is
 * only a normalized storage convention."
 *
 * Engine parity is the whole point: same pdfjs version + identical normText + identical page
 * sampling on both sides → identical hashes. `sha256hex` is injected (Node `crypto` vs browser
 * SubtleCrypto) — both hash the SAME UTF-8 string, so the hex digests match regardless of impl.
 */

/** NFC + collapse whitespace + trim. MUST stay identical across build and runtime. */
export function normText(s: string): string {
  return (s ?? '').normalize('NFC').replace(/\s+/g, ' ').trim()
}

/** Pages we fingerprint: first, second, last (deduped, clamped). */
export function samplePages(pageCount: number): number[] {
  return [1, 2, pageCount].filter((p, i, a) => p >= 1 && p <= pageCount && a.indexOf(p) === i)
}

/**
 * Minimal structural shape of a pdfjs PDFDocumentProxy (both Node + browser builds satisfy it).
 * The text-item index signature accepts pdfjs's `TextItem | TextMarkedContent` union (the latter
 * carries no `str`) without importing pdfjs types here, so this module stays engine-agnostic.
 */
export interface PdfLike {
  numPages: number
  getPage(n: number): Promise<{
    getTextContent(): Promise<{ items: ReadonlyArray<{ str?: string; [k: string]: unknown }> }>
  }>
}

/** Normalized text of one page (join text items with a space, then normText). */
export async function pageNormText(pdf: PdfLike, pageNum: number): Promise<string> {
  const page = await pdf.getPage(pageNum)
  const tc = await page.getTextContent()
  return normText(tc.items.map((it) => it.str ?? '').join(' '))
}

export interface Fingerprint {
  pageCount: number
  samplePages: number[]
  /** sha256 hex of each sampled page's normText, in samplePages order. */
  fingerprints: string[]
}

/**
 * Compute the fingerprint of an open PDF. `sha256hex` hashes a UTF-8 string to lowercase hex.
 * Booklets whose text layer is empty/garbled yield empty-string hashes — the caller treats a
 * page-count-only match as low-confidence (design D1).
 */
export async function computeFingerprint(
  pdf: PdfLike,
  sha256hex: (s: string) => Promise<string>,
): Promise<Fingerprint> {
  const pages = samplePages(pdf.numPages)
  const fingerprints: string[] = []
  for (const p of pages) fingerprints.push(await sha256hex(await pageNormText(pdf, p)))
  return { pageCount: pdf.numPages, samplePages: pages, fingerprints }
}

export interface BookletManifestEntry extends Fingerprint {
  bookletId: string
  /** The owner's canonical on-disk filename (a storage convention only; not used for matching). */
  canonicalFile: string
  /** Whether the sampled pages had usable text (false → size+page-count only, low-confidence). */
  textFingerprintable: boolean
  expectedSizeRange: [number, number]
}

/** Match outcome of a candidate PDF's fingerprint against a manifest entry. */
export type MatchStrength = 'strong' | 'weak' | 'low-confidence' | 'none'

/**
 * Compare a candidate fingerprint (+ byte size) to a manifest entry. Page count must match.
 * strong = all sampled text hashes match; weak = a majority match; low-confidence = page count
 * (and size band) match but text is unusable on one/both sides. (design D1)
 */
export function matchFingerprint(
  candidate: Fingerprint,
  sizeBytes: number,
  entry: BookletManifestEntry,
): MatchStrength {
  if (candidate.pageCount !== entry.pageCount) return 'none'
  const [lo, hi] = entry.expectedSizeRange
  const sizeOk = sizeBytes >= lo && sizeBytes <= hi
  const usable = entry.fingerprints.filter((h) => h.length > 0)
  const candUsable = candidate.fingerprints.filter((h) => h.length > 0)
  if (usable.length === 0 || candUsable.length === 0) {
    return sizeOk ? 'low-confidence' : 'none'
  }
  const n = Math.min(candidate.fingerprints.length, entry.fingerprints.length)
  let hits = 0
  let comparable = 0
  for (let i = 0; i < n; i++) {
    if (entry.fingerprints[i] && candidate.fingerprints[i]) {
      comparable++
      if (entry.fingerprints[i] === candidate.fingerprints[i]) hits++
    }
  }
  // No overlapping usable page to compare (e.g. each side's text survived on different pages):
  // can't confirm by text → page-count + size band only = low-confidence.
  if (comparable === 0) return sizeOk ? 'low-confidence' : 'none'
  if (hits === comparable) return 'strong'
  if (hits >= Math.ceil(comparable / 2)) return 'weak'
  // Both sides have comparable text but they disagree → a different booklet, not a weak match.
  return 'none'
}
