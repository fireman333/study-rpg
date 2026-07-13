/**
 * Lazy loader for the committed booklet→Drive-link map, served from public/provenance/
 * (add-neurons-pdf-drive-autofetch). Same memoize-or-null pattern as `loadProvenanceMap`,
 * so callers degrade gracefully if the artifact is missing.
 */
export interface BookletLink {
  driveFileId: string
  viewUrl: string
}
export type BookletLinkMap = Record<string, BookletLink>

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
