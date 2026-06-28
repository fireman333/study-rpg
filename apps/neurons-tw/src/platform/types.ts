/**
 * Platform adapter types — local-PDF provenance (add-neurons-local-pdf-provenance).
 *
 * The adapter lets a supported platform open the player's OWN local source PDF at
 * the page a question's explanation came from. Phase 1 = web (File System Access
 * API); Phase 2 (gated) swaps in a Tauri/Rust backend behind the same surface.
 */

/** One question's source-PDF location, baked by scripts/build-provenance-map.mjs. */
export interface ProvenanceEntry {
  /** PDF filename — display/debug only; NOT the identity boundary (D4). */
  file: string
  /** 1-based page; min page when a question's figures span several pages. */
  page: number
  /** Stable booklet identity (e.g. "104-1-醫學二"). Present once the builder resolves it. */
  bookletKey?: string
  /** Publisher Drive file id — the web runtime fetches the booklet by this. */
  driveFileId?: string
  /** Drive resourceKey for legacy 0B… files (adds the X-Goog-Drive-Resource-Keys header). */
  resourceKey?: string
}

/** Shape of public/provenance/question-pdf-map.v1.json (lazy-fetched at runtime). */
export interface ProvenanceMapFile {
  version: string
  sourceHash: string
  count: number
  entries: Record<string, ProvenanceEntry>
}

/**
 * Capability/grant state for the local-PDF feature.
 * - `unsupported`: platform has no local-file capability (Safari / mobile / no FSA).
 * - `no-folder`: supported, but the player has not granted a folder yet.
 * - `needs-permission`: a folder handle is persisted but permission isn't granted this session.
 * - `ready`: folder granted + permission active.
 */
export type PlatformStatus = 'unsupported' | 'no-folder' | 'needs-permission' | 'ready'

/**
 * Result of resolving a question's source PDF. Never throws into the UI.
 * On success the caller renders `url` (a blob URL on web; a host URL under a future
 * Tauri backend) in the in-app viewer at `page`; `file` is the matched on-disk
 * filename (viewer title). A blob URL MUST be revoked by the consumer on close.
 */
export type OpenResult =
  | {
      ok: true
      page: number
      url: string
      file: string
      /** Desktop fingerprint-match strength; `low` = page-count-only (UI should flag it). */
      confidence?: 'strong' | 'weak' | 'low'
    }
  | {
      ok: false
      reason:
        // Web (Drive auto-fetch) failures:
        | 'unmapped'
        | 'offline'
        | 'quota'
        | 'not-found'
        | 'config'
        | 'error'
        // Desktop (Tauri / FSA) failures, retained for that out-of-scope path:
        | 'unsupported'
        | 'no-folder'
        | 'file-not-found'
        | 'permission-denied'
      message?: string
      /** The booklet involved (web: bookletKey; desktop: booklet id) — for the fallback message. */
      bookletId?: string
      /** Official Drive link, surfaced as the non-blocking fallback when bytes can't be obtained. */
      driveUrl?: string
    }
