/**
 * Lazy loaders for the two committed desktop artifacts, served from public/provenance/
 * (add-neurons-guided-pdf-onboarding). Same memoize-or-null pattern as `loadProvenanceMap`,
 * so callers degrade gracefully if an artifact is missing.
 */
import type { BookletManifestEntry } from './fingerprint'

export interface FingerprintManifest {
  version: string
  sourceHash: string
  count: number
  entries: BookletManifestEntry[]
}

export interface BookletLink {
  driveFileId: string
  viewUrl: string
}
export type BookletLinkMap = Record<string, BookletLink>

let manifestCache: Promise<FingerprintManifest | null> | null = null
export function loadFingerprintManifest(
  // Default evaluated at CALL time (like loadProvenanceMap) so a test's mocked global fetch is used.
  fetchImpl: typeof fetch = typeof fetch !== 'undefined' ? fetch : (undefined as unknown as typeof fetch),
  base: string = import.meta.env.BASE_URL,
): Promise<FingerprintManifest | null> {
  if (!manifestCache) {
    manifestCache = Promise.resolve()
      .then(() => fetchImpl(`${base}provenance/fingerprint-manifest.json`))
      .then((r) => (r.ok ? (r.json() as Promise<FingerprintManifest>) : null))
      .catch(() => null)
  }
  return manifestCache
}

let linksCache: Promise<BookletLinkMap | null> | null = null
export function loadBookletLinks(
  fetchImpl: typeof fetch = typeof fetch !== 'undefined' ? fetch : (undefined as unknown as typeof fetch),
  base: string = import.meta.env.BASE_URL,
): Promise<BookletLinkMap | null> {
  if (!linksCache) {
    linksCache = Promise.resolve()
      .then(() => fetchImpl(`${base}provenance/booklet-drive-links.json`))
      .then((r) => (r.ok ? (r.json() as Promise<BookletLinkMap>) : null))
      .catch(() => null)
  }
  return linksCache
}

/** Find the booklet a provenance file belongs to (canonicalFile is that booklet's owner name). */
export function bookletForFile(manifest: FingerprintManifest | null, file: string): BookletManifestEntry | undefined {
  return manifest?.entries.find((e) => e.canonicalFile === file)
}

/** Test-only: drop memoized artifacts. */
export function __resetManifestCaches(): void {
  manifestCache = null
  linksCache = null
}
