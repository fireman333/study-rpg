/**
 * Platform adapter types — local-PDF provenance (add-neurons-local-pdf-provenance).
 *
 * The adapter lets a supported platform open the player's OWN local source PDF at
 * the page a question's explanation came from. Phase 1 = web (File System Access
 * API); Phase 2 (gated) swaps in a Tauri/Rust backend behind the same surface.
 */

/** One question's source-PDF location, baked by scripts/build-provenance-map.mjs. */
export interface ProvenanceEntry {
  /** Real on-disk PDF filename (verbatim from the manifest's `sourcePdf`). */
  file: string
  /** 1-based page; min page when a question's figures span several pages. */
  page: number
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

/** Result of attempting to open a question's source PDF. Never throws into the UI. */
export type OpenResult =
  | { ok: true; page: number }
  | {
      ok: false
      reason: 'unsupported' | 'no-folder' | 'unmapped' | 'file-not-found' | 'permission-denied' | 'error'
      message?: string
    }
