/**
 * Desktop (Tauri) backend for the local-PDF provenance feature (add-neurons-tauri-shell).
 *
 * Satisfies the SAME platform adapter surface as the web (File System Access) path and
 * returns the SAME `OpenResult` ({ ok, page, url, file }), so the platform-agnostic docked
 * PDF viewer renders it unchanged — only the resolution differs. Resolution reuses the
 * shared provenance helpers (`loadProvenanceMap` / `lookupEntry` / `findByNfcName`); the
 * Rust side only does read-only folder enumeration + file reads (traversal-guarded).
 *
 * This module is the ONLY place that imports `@tauri-apps/*`; `platform/index.ts` reaches it
 * exclusively through a `VITE_TARGET==='desktop'`-gated dynamic import so the web bundle
 * tree-shakes it (and the Tauri deps) away entirely.
 */
import { invoke } from '@tauri-apps/api/core'
import { open as openDialog } from '@tauri-apps/plugin-dialog'
import type { OpenResult, PlatformStatus } from './types'
import { loadProvenanceMap, lookupEntry, findByNfcName } from './provenance'

// Device-local: the granted folder's absolute path. Mirrors the web `folderStore` principle
// (device-bound, never cloud-synced) — a plain localStorage string, not a Dexie/synced table.
const PATH_KEY = 'neurons.desktop.pdfFolder.v1'

// Whether the granted path has been pushed into the Rust session state yet (once per launch).
let registered = false

/** Re-register the persisted folder with the Rust backend (once). Never prompts. */
async function ensureRegistered(): Promise<string | null> {
  const path = localStorage.getItem(PATH_KEY)
  if (!path) return null
  if (!registered) {
    try {
      await invoke('set_pdf_folder', { path })
      registered = true
    } catch {
      // Folder moved/deleted/denied since last launch → treat as not-granted; re-grant heals it.
      return null
    }
  }
  return path
}

/** Current grant state — never prompts (safe during render effects). */
export async function getStatus(): Promise<PlatformStatus> {
  return (await ensureRegistered()) ? 'ready' : 'no-folder'
}

/** Prompt the player for a read-only PDF folder; persists the path on success. */
export async function grantFolder(): Promise<PlatformStatus> {
  let selected: string | string[] | null
  try {
    selected = await openDialog({
      directory: true,
      multiple: false,
      title: '選擇你的陽明國考 PDF 資料夾',
    })
  } catch {
    return getStatus()
  }
  if (typeof selected !== 'string') return getStatus() // cancelled
  try {
    await invoke('set_pdf_folder', { path: selected })
  } catch (err) {
    return 'needs-permission'
  }
  registered = true
  try {
    localStorage.setItem(PATH_KEY, selected)
  } catch {
    /* ignore */
  }
  return 'ready'
}

/**
 * Resolve a mapped question's source PDF → same `OpenResult` as the web path. Triggers a
 * folder grant if none yet (must be called from a user gesture). On success the caller renders
 * `url` (a blob URL) at `page` and revokes it on close via the shared `releaseExplanationUrl`.
 * Never throws into the UI (No Silent Errors) — failures come back as reasons.
 */
export async function openExplanation(questionId: string): Promise<OpenResult> {
  const entry = lookupEntry(await loadProvenanceMap(), questionId)
  if (!entry) return { ok: false, reason: 'unmapped' }

  let path = await ensureRegistered()
  if (!path) {
    if ((await grantFolder()) !== 'ready') return { ok: false, reason: 'no-folder' }
    path = localStorage.getItem(PATH_KEY)
    if (!path) return { ok: false, reason: 'no-folder' }
  }

  try {
    // Enumerate on-disk names + NFC-match (macOS stores CJK as NFD; the map holds NFC).
    const names = await invoke<string[]>('list_pdf_files')
    const match = findByNfcName(names, entry.file)
    if (!match) {
      return { ok: false, reason: 'file-not-found', message: `在資料夾中找不到「${entry.file}」` }
    }
    const buf = await invoke<ArrayBuffer>('read_pdf_file', { file: match })
    const url = URL.createObjectURL(new Blob([buf], { type: 'application/pdf' }))
    return { ok: true, page: entry.page, url, file: match }
  } catch (err) {
    return { ok: false, reason: 'error', message: err instanceof Error ? err.message : String(err) }
  }
}
