/** Types for booklet-identity.mjs (shared by the provenance-map builder + its unit test). */

export interface BookletLink {
  driveFileId: string
  viewUrl: string
}

export interface ResolvedBooklet {
  bookletKey: string
  driveFileId: string
  resourceKey?: string
}

export function deriveBookletKey(file: string): string | null
export function parseResourceKey(viewUrl: string | undefined): string | undefined
export function resolveBooklet(
  file: string,
  links: Record<string, BookletLink> | null | undefined,
): ResolvedBooklet | null
