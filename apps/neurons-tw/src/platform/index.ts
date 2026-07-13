/**
 * Platform adapter for source-PDF provenance.
 *
 * The booklet bytes are fetched on demand straight from the publisher's official Google Drive
 * (Drive REST API, referrer-restricted public key) and cached in a device-local byte-store
 * (Cache API v1). No folder grant, no manual download, no File System Access — so it works on
 * desktop AND mobile / Safari. The app's own infra is never in the byte path. Nothing here throws
 * into the UI — failures come back as OpenResult / PlatformStatus so the caller degrades to the
 * inline explanation + the official link.
 */
import type { OpenResult, PlatformStatus, ProvenanceEntry } from './types'
import { loadProvenanceMap, lookupEntry } from './provenance'
import { byteStore as defaultByteStore, type ByteStore } from './byteStore'
import { fetchBooklet, officialDriveUrl, isSuspectedEdgeThrottle } from './driveFetch'
import { noteDriveSuccess } from './pdfCooldown'

export type { OpenResult, PlatformStatus, ProvenanceEntry } from './types'

/**
 * Whether this platform can open a source PDF at all. Web can always fetch + render (the action
 * is gated only on whether the question is mapped), so this is true on every evergreen browser
 * incl. mobile / Safari — NOT gated on the File System Access API.
 */
export function isLocalPdfSupported(): boolean {
  return true
}

/** Current capability/grant state. Web needs no grant → always 'ready'. */
export async function getStatus(): Promise<PlatformStatus> {
  return 'ready'
}

/** Web needs no folder grant (auto-fetch), so this is a no-op returning 'ready'. */
export async function grantFolder(): Promise<PlatformStatus> {
  return 'ready'
}

/** True if this question has a usable source mapping (gates whether to show the action). */
export async function hasProvenance(questionId: string): Promise<boolean> {
  const entry = lookupEntry(await loadProvenanceMap(), questionId)
  if (!entry) return false
  // Web needs a Drive file id to fetch.
  return !!entry.driveFileId
}

/** Injectable seams so the web fetch+cache path is unit-testable (all default to production). */
export interface WebOpenDeps {
  byteStore?: ByteStore
  fetchImpl?: typeof fetch
  apiKey?: string
  isOnline?: () => boolean
  createUrl?: (blob: Blob) => string
}

/**
 * Open this question's source PDF at its mapped page.
 *
 * Resolve the booklet's Drive id from the map → serve from the byte-cache if present, else fetch
 * it from Drive and cache it → return a blob URL for the docked viewer at `page`. On any fetch
 * failure return a non-blocking reason + the official Drive link as fallback (No Silent Errors);
 * the inline 詳解 always remains.
 */
export async function openExplanation(questionId: string, deps: WebOpenDeps = {}): Promise<OpenResult> {
  const entry = lookupEntry(await loadProvenanceMap(), questionId)
  if (!entry) return { ok: false, reason: 'unmapped' }
  if (!entry.driveFileId || !entry.bookletKey) return { ok: false, reason: 'unmapped' }
  return openWebBooklet(entry, deps)
}

async function openWebBooklet(entry: ProvenanceEntry, deps: WebOpenDeps): Promise<OpenResult> {
  const store = deps.byteStore ?? defaultByteStore
  const createUrl = deps.createUrl ?? ((b: Blob) => URL.createObjectURL(b))
  const bookletKey = entry.bookletKey!
  const driveFileId = entry.driveFileId!
  const driveUrl = officialDriveUrl(driveFileId, entry.resourceKey)

  // Cache hit → serve from the device cache (no network).
  try {
    const cached = await store.get(bookletKey)
    if (cached) {
      const blob = await cached.blob()
      return { ok: true, page: entry.page, url: createUrl(blob), file: entry.file }
    }
  } catch {
    // Cache read failure is non-fatal — fall through to a fresh fetch.
  }

  const res = await fetchBooklet(driveFileId, entry.resourceKey, {
    fetchImpl: deps.fetchImpl,
    apiKey: deps.apiKey,
    isOnline: deps.isOnline,
  })
  if (!res.ok) {
    // Single-open SOFT-respects the edge throttle (fix-neurons-pdf-edge-throttle): it still attempted
    // (one request rarely trips the throttle), but if THIS failure looks like the throttle, surface
    // throttle-aware copy + the official link. It does NOT record a strike or hard-block — only the
    // bulk run drives the cooldown.
    const message = (await isSuspectedEdgeThrottle(res, { fetchImpl: deps.fetchImpl }))
      ? 'Google Drive 暫時限制大量下載，請稍後再試（可改用下方官方連結開啟）'
      : res.message
    return { ok: false, reason: res.reason, message, bookletId: bookletKey, driveUrl }
  }

  const blob = await res.response.blob()
  // A successful Drive fetch counts toward clearing any active edge-throttle cooldown.
  void noteDriveSuccess()
  // Cache for next time (best-effort; a clean Response avoids Cache.put Vary/206 pitfalls).
  try {
    await store.put(bookletKey, new Response(blob, { headers: { 'content-type': 'application/pdf' } }))
  } catch {
    // Cache write failure is non-fatal — the open still succeeds.
  }
  return { ok: true, page: entry.page, url: createUrl(blob), file: entry.file }
}

/** Revoke a resolved source URL when the viewer closes (no-op for non-blob URLs). */
export function releaseExplanationUrl(url: string): void {
  if (url.startsWith('blob:')) URL.revokeObjectURL(url)
}

/** Open an external URL in the system browser (a new tab). */
export async function openExternalUrl(url: string): Promise<void> {
  window.open(url, '_blank', 'noopener,noreferrer')
}

/**
 * One-time cleanup of the now-dead File System Access folder-handle store (the web feature no longer
 * grants a folder). Guarded by a localStorage flag so it runs at most once per device. Best-effort —
 * any failure is ignored (the store going unused is already harmless).
 */
export function cleanupLegacyPdfStorage(): void {
  if (typeof indexedDB === 'undefined') return
  const FLAG = 'neurons.pdf.legacyFolderStoreCleaned.v1'
  try {
    if (localStorage.getItem(FLAG) === '1') return
    indexedDB.deleteDatabase('neurons-local-pdf')
    localStorage.setItem(FLAG, '1')
  } catch {
    /* ignore — cleanup is opportunistic */
  }
}
