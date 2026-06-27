/**
 * Device-local cache of per-file content fingerprints, so a granted-folder PDF is parsed at
 * most once per (name, size, mtime) instead of on every「看原始詳解」(add-neurons-guided-pdf-
 * onboarding, design D3). Plain localStorage (small: a few hashes × ~46 files), device-bound,
 * never synced — mirrors the `folderStore` isolation principle.
 */
import type { Fingerprint } from './fingerprint'

const KEY = 'neurons.desktop.fpCache.v1'

interface CacheEntry {
  size: number
  mtime: number
  fp: Fingerprint
}

function load(): Record<string, CacheEntry> {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '{}') as Record<string, CacheEntry>
  } catch {
    return {}
  }
}

function save(c: Record<string, CacheEntry>): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(c))
  } catch {
    /* ignore quota / disabled storage */
  }
}

/** Cached fingerprint if the file's size+mtime are unchanged; else null (recompute). */
export function getCachedFingerprint(name: string, size: number, mtime: number): Fingerprint | null {
  const e = load()[name]
  return e && e.size === size && e.mtime === mtime ? e.fp : null
}

export function setCachedFingerprint(name: string, size: number, mtime: number, fp: Fingerprint): void {
  const c = load()
  c[name] = { size, mtime, fp }
  save(c)
}
