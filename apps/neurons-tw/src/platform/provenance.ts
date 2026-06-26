/**
 * Pure provenance helpers — lazy map fetch + lookup + CJK-safe filename matching.
 * No DOM/FSA here so these stay unit-testable (add-neurons-local-pdf-provenance).
 */
import type { ProvenanceEntry, ProvenanceMapFile } from './types'

/** NFC-normalize a (CJK) filename so NFD-on-disk names compare equal to NFC map names. */
export function nfc(s: string): string {
  return s.normalize('NFC')
}

/**
 * Find the directory entry whose NFC form equals the NFC of `target`.
 * macOS stores CJK names in NFD; the map stores NFC — exact-name lookup misses (D9).
 */
export function findByNfcName(names: string[], target: string): string | undefined {
  const t = nfc(target)
  return names.find((n) => nfc(n) === t)
}

/** Look up a question's source-PDF location in the loaded map. */
export function lookupEntry(map: ProvenanceMapFile | null, questionId: string): ProvenanceEntry | undefined {
  return map?.entries?.[questionId]
}

let cache: Promise<ProvenanceMapFile | null> | null = null

/**
 * Lazy-fetch + cache the provenance map. Resolves to null on any failure (missing
 * build artifact / network) so callers degrade gracefully rather than throw.
 * `fetchImpl` + `base` are injectable for tests.
 */
export function loadProvenanceMap(
  fetchImpl: typeof fetch = typeof fetch !== 'undefined' ? fetch : (undefined as unknown as typeof fetch),
  base: string = import.meta.env.BASE_URL,
): Promise<ProvenanceMapFile | null> {
  if (!cache) {
    cache = Promise.resolve()
      .then(() => fetchImpl(`${base}provenance/question-pdf-map.v1.json`))
      .then((r) => (r.ok ? (r.json() as Promise<ProvenanceMapFile>) : null))
      .catch(() => null)
  }
  return cache
}

/** Test-only: drop the memoized map so each test starts clean. */
export function __resetProvenanceCache(): void {
  cache = null
}
