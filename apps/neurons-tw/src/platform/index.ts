/**
 * Platform adapter for local-PDF provenance (add-neurons-local-pdf-provenance).
 *
 * Public surface: isDesktop / getStatus / grantFolder / openExplanation / hasProvenance.
 * Phase 1 implements the web (File System Access) path; Phase 2 (gated) swaps a
 * Tauri/Rust backend behind this same surface via VITE_TARGET. Nothing here throws
 * into the UI — failures come back as OpenResult / PlatformStatus so the caller
 * degrades to the inline explanation.
 */
import type { OpenResult, PlatformStatus } from './types'
import { loadProvenanceMap, lookupEntry, findByNfcName } from './provenance'
import { loadFolderHandle, saveFolderHandle } from './folderStore'

export type { OpenResult, PlatformStatus, ProvenanceEntry } from './types'

/** True only in a desktop (Tauri) build. Phase 1 web build → always false. */
export function isDesktop(): boolean {
  return import.meta.env.VITE_TARGET === 'desktop'
}

/** Whether this platform can open a local source PDF at all (FSA present). */
export function isLocalPdfSupported(): boolean {
  return typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function'
}

async function ensurePermission(handle: FileSystemDirectoryHandle): Promise<boolean> {
  const opts = { mode: 'read' as const }
  if ((await handle.queryPermission?.(opts)) === 'granted') return true
  return (await handle.requestPermission?.(opts)) === 'granted'
}

/** Current capability/grant state — never prompts (safe to call during render effects). */
export async function getStatus(): Promise<PlatformStatus> {
  if (!isLocalPdfSupported()) return 'unsupported'
  const handle = await loadFolderHandle()
  if (!handle) return 'no-folder'
  const p = await handle.queryPermission?.({ mode: 'read' })
  return p === 'granted' ? 'ready' : 'needs-permission'
}

/** Prompt the player to grant a read-only folder; persists the handle on success. */
export async function grantFolder(): Promise<PlatformStatus> {
  if (!isLocalPdfSupported()) return 'unsupported'
  let handle: FileSystemDirectoryHandle
  try {
    handle = await window.showDirectoryPicker!({ mode: 'read' })
  } catch {
    // User cancelled the picker — leave state unchanged.
    return getStatus()
  }
  if (!(await ensurePermission(handle))) return 'needs-permission'
  await saveFolderHandle(handle)
  return 'ready'
}

/** True if this question has a source-PDF mapping (gates whether to show the action). */
export async function hasProvenance(questionId: string): Promise<boolean> {
  return !!lookupEntry(await loadProvenanceMap(), questionId)
}

/**
 * Open this question's source PDF at its mapped page. Triggers a folder grant if
 * none yet (must be called from a user gesture). Returns a discriminated result;
 * callers surface `file-not-found` etc. as a non-blocking message (No Silent Errors).
 */
export async function openExplanation(questionId: string): Promise<OpenResult> {
  if (!isLocalPdfSupported()) return { ok: false, reason: 'unsupported' }

  const entry = lookupEntry(await loadProvenanceMap(), questionId)
  if (!entry) return { ok: false, reason: 'unmapped' }

  let handle = await loadFolderHandle()
  if (!handle) {
    if ((await grantFolder()) !== 'ready') return { ok: false, reason: 'no-folder' }
    handle = await loadFolderHandle()
    if (!handle) return { ok: false, reason: 'no-folder' }
  }
  if (!(await ensurePermission(handle))) return { ok: false, reason: 'permission-denied' }

  try {
    // Enumerate actual on-disk names, NFC-match the target (D9: macOS NFD vs map NFC).
    const names: string[] = []
    for await (const [name, child] of handle.entries()) {
      if (child.kind === 'file' && name.toLowerCase().endsWith('.pdf')) names.push(name)
    }
    const match = findByNfcName(names, entry.file)
    if (!match) {
      return { ok: false, reason: 'file-not-found', message: `在資料夾中找不到「${entry.file}」` }
    }
    const fileHandle = await handle.getFileHandle(match)
    const file = await fileHandle.getFile()
    const url = URL.createObjectURL(file)
    window.open(`${url}#page=${entry.page}`, '_blank', 'noopener')
    return { ok: true, page: entry.page }
  } catch (err) {
    return { ok: false, reason: 'error', message: err instanceof Error ? err.message : String(err) }
  }
}
