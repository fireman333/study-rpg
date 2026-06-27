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
import { openUrl } from '@tauri-apps/plugin-opener'
import type { OpenResult, PlatformStatus, ProvenanceEntry } from './types'
import { loadProvenanceMap, lookupEntry, findByNfcName, nfc } from './provenance'
import { matchFingerprint, type BookletManifestEntry, type Fingerprint } from './fingerprint'
import { loadFingerprintManifest, loadBookletLinks, bookletForFile } from './manifest'
import { fingerprintBytes } from './fingerprint-runtime'
import { getCachedFingerprint, setCachedFingerprint } from './fpCache'

/** Mirror of the Rust `PdfFileStat` command result. */
interface PdfFileStat {
  name: string
  size: number
  mtime: number
}

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

/** Open a URL in the player's real system browser (Tauri opener plugin) — for official links. */
export async function openExternalUrl(url: string): Promise<void> {
  await openUrl(url)
}

/**
 * Fingerprint one folder PDF, caching by (name, size, mtime) so it's parsed at most once.
 * Returns the read bytes too (only on a cache miss) so the caller can reuse them for the blob
 * instead of reading the same (possibly 96 MB) file a second time.
 */
async function fingerprintFile(f: PdfFileStat): Promise<{ fp: Fingerprint; bytes?: ArrayBuffer }> {
  const cached = getCachedFingerprint(f.name, f.size, f.mtime)
  if (cached) return { fp: cached }
  const bytes = await invoke<ArrayBuffer>('read_pdf_file', { file: f.name })
  const fp = await fingerprintBytes(bytes) // copies internally → `bytes` stays usable for the blob
  setCachedFingerprint(f.name, f.size, f.mtime, fp)
  return { fp, bytes }
}

/** The matched file (+ strength, + already-read bytes if any), or null when no folder PDF is the booklet. */
async function findBookletFile(
  files: PdfFileStat[],
  target: BookletManifestEntry | undefined,
  canonicalFile: string,
): Promise<{ name: string; confidence?: 'strong' | 'weak' | 'low'; bytes?: ArrayBuffer } | null> {
  // No manifest entry for this booklet → last-resort exact NFC name match (filename as tie-breaker).
  if (!target) {
    const m = findByNfcName(files.map((f) => f.name), canonicalFile)
    return m ? { name: m } : null
  }
  // Fast path: try the file named like the booklet's canonical owner-name first (the owner's own
  // copies), then everything else. Fingerprint each (cached) until a strong/weak match.
  const named = files.find((f) => nfc(f.name) === nfc(target.canonicalFile))
  const ordered = named ? [named, ...files.filter((f) => f !== named)] : files
  let lowConf: { name: string; confidence: 'low'; bytes?: ArrayBuffer } | null = null
  for (const f of ordered) {
    const { fp, bytes } = await fingerprintFile(f)
    const strength = matchFingerprint(fp, f.size, target)
    if (strength === 'strong' || strength === 'weak') return { name: f.name, confidence: strength, bytes }
    if (strength === 'low-confidence' && !lowConf) lowConf = { name: f.name, confidence: 'low', bytes }
  }
  return lowConf // only used when no strong/weak match exists
}

/** Build the「missing booklet → guided download」result with the official link, if known. */
async function notFound(target: BookletManifestEntry | undefined, file: string): Promise<OpenResult> {
  const bookletId = target?.bookletId
  const links = await loadBookletLinks()
  const driveUrl = bookletId ? links?.[bookletId]?.viewUrl : undefined
  return {
    ok: false,
    reason: 'file-not-found',
    message: bookletId ? `資料夾裡找不到「${bookletId}」這份 PDF` : `資料夾裡找不到對應的 PDF（${file}）`,
    bookletId,
    driveUrl,
  }
}

/**
 * Resolve a mapped question's source PDF by CONTENT FINGERPRINT (not filename), returning the
 * same `OpenResult` as the web path. Triggers a folder grant if none yet (must be called from a
 * user gesture). On success the caller renders `url` (a blob URL) at `page` and revokes it on
 * close via the shared `releaseExplanationUrl`. Never throws into the UI (No Silent Errors) —
 * a missing booklet comes back as `file-not-found` carrying the booklet + its official link.
 */
export async function openExplanation(questionId: string): Promise<OpenResult> {
  const entry: ProvenanceEntry | undefined = lookupEntry(await loadProvenanceMap(), questionId)
  if (!entry) return { ok: false, reason: 'unmapped' }
  const target = bookletForFile(await loadFingerprintManifest(), entry.file)

  let path = await ensureRegistered()
  if (!path) {
    if ((await grantFolder()) !== 'ready') return { ok: false, reason: 'no-folder' }
    path = localStorage.getItem(PATH_KEY)
    if (!path) return { ok: false, reason: 'no-folder' }
  }

  try {
    const files = await invoke<PdfFileStat[]>('list_pdf_files_with_stat')
    const match = await findBookletFile(files, target, entry.file)
    if (!match) return await notFound(target, entry.file)
    // Reuse bytes already read during fingerprinting (cache miss); only re-read on a cache hit.
    const buf = match.bytes ?? (await invoke<ArrayBuffer>('read_pdf_file', { file: match.name }))
    const url = URL.createObjectURL(new Blob([buf], { type: 'application/pdf' }))
    return { ok: true, page: entry.page, url, file: match.name, confidence: match.confidence }
  } catch (err) {
    return { ok: false, reason: 'error', message: err instanceof Error ? err.message : String(err) }
  }
}
