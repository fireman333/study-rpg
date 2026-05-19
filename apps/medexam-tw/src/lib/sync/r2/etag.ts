// In-memory ETag tracker for R2 blob optimistic concurrency.
//
// ETags scope: process-lifetime only. Cold-start force-pull always uses
// unconditional GET (per cloud-sync spec "Cold-start force-pull bypasses
// incremental cursor"). Conditional GETs (If-None-Match) are reserved for
// visibility-change in-session refresh.

import type { Bundle } from './client'

const etags = new Map<Bundle, string>()

export function getEtag(bundle: Bundle): string | null {
  return etags.get(bundle) ?? null
}

export function setEtag(bundle: Bundle, etag: string | null): void {
  if (etag) etags.set(bundle, etag)
  else etags.delete(bundle)
}

export function clearAllEtags(): void {
  etags.clear()
}
