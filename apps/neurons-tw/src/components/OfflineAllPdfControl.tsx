/**
 * OfflineAllPdfControl — the「全部下載供離線」action for原始詳解 PDF (add-neurons-pdf-drive-autofetch,
 * task 5.3). Fetches every booklet in the committed manifest from the publisher's Drive and caches it
 * on the device, so later opens work offline. Completion is derived from the byte-store's cached list
 * vs the manifest (no schema table); the player's preference rides the existing key-value `meta` store.
 *
 * Failures never block: a per-booklet error is counted and surfaced; the rest still cache.
 *
 * Mobile-Safari durability (fix-neurons-offline-pdf-progress): the full set is ~250 MB–1.5 GB (one
 * booklet is 123 MB), and the Cache API is best-effort, evictable storage. Two things made the
 * feature confusing on iOS:
 *  1. The progress counter was the loop index, so a fast cache-hit skip and a slow real re-fetch
 *     looked identical — the player couldn't tell "re-downloading everything" from "skipping the
 *     cached ones". WebKit also evicts the cache whole-origin (7-day ITP / storage pressure), so the
 *     same button genuinely behaves differently between sessions/devices. We now tally downloaded vs
 *     skipped vs failed separately and show them.
 *  2. A `QuotaExceededError` on a large booklet was swallowed into a generic "失敗" count, so the big
 *     PDFs appeared to fail forever. We now classify out-of-space distinctly and request persistent
 *     storage up front to reduce eviction.
 */
import { useEffect, useState, type CSSProperties } from 'react'
import { loadBookletLinks, type BookletLinkMap } from '../platform/manifest'
import { byteStore } from '../platform/byteStore'
import { fetchBooklet, parseResourceKey } from '../platform/driveFetch'
import { db } from '../lib/db'

const META_KEY = 'pdfOfflineAll'

interface LiveProgress {
  checked: number
  total: number
  downloaded: number
  skipped: number
}
interface RunResult {
  downloaded: number
  skipped: number
  failedNet: number
  failedSpace: number
}

/** Best-effort: ask the browser to keep this origin's storage from being evicted. Harmless if denied
 * (Safari grants on its own heuristics) or unsupported. Returns the resulting persisted state. */
async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (typeof navigator === 'undefined' || !navigator.storage) return false
    if (await navigator.storage.persisted?.()) return true
    return (await navigator.storage.persist?.()) ?? false
  } catch {
    return false
  }
}

/** Best-effort remaining cache budget, in bytes, or null if unknown. */
async function estimateRemaining(): Promise<number | null> {
  try {
    if (typeof navigator === 'undefined' || !navigator.storage?.estimate) return null
    const { usage = 0, quota = 0 } = await navigator.storage.estimate()
    return quota > 0 ? Math.max(0, quota - usage) : null
  } catch {
    return null
  }
}

function isQuotaError(err: unknown): boolean {
  return (
    err instanceof DOMException &&
    (err.name === 'QuotaExceededError' || err.code === 22 || err.name === 'NS_ERROR_DOM_QUOTA_REACHED')
  )
}

function formatBytes(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)} GB`
  if (n >= 1e6) return `${Math.round(n / 1e6)} MB`
  return `${Math.round(n / 1e3)} KB`
}

export function OfflineAllPdfControl(): JSX.Element {
  const [links, setLinks] = useState<BookletLinkMap | null>(null)
  const [cached, setCached] = useState<number>(0)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<LiveProgress | null>(null)
  const [result, setResult] = useState<RunResult | null>(null)
  const [remaining, setRemaining] = useState<number | null>(null)

  async function refreshCachedCount(map: BookletLinkMap): Promise<void> {
    try {
      const keys = new Set(await byteStore.list())
      setCached(Object.keys(map).filter((k) => keys.has(k)).length)
    } catch {
      setCached(0)
    }
  }

  useEffect(() => {
    let alive = true
    loadBookletLinks().then((l) => {
      if (!alive || !l) return
      setLinks(l)
      void refreshCachedCount(l)
    })
    void estimateRemaining().then((r) => {
      if (alive) setRemaining(r)
    })
    return () => {
      alive = false
    }
  }, [])

  if (!links) return <p style={hintStyle}>載入清單中…</p>
  const total = Object.keys(links).length
  const allCached = total > 0 && cached >= total

  async function downloadAll(): Promise<void> {
    if (!links) return
    setBusy(true)
    setResult(null)
    // User-gesture-triggered: ask the browser to keep these PDFs from being evicted.
    await requestPersistentStorage()
    try {
      await db.meta.put({ key: META_KEY, value: '1' })
    } catch {
      /* preference persistence is best-effort */
    }
    const keys = Object.keys(links)
    let downloaded = 0
    let skipped = 0
    let failedNet = 0
    let failedSpace = 0
    for (let i = 0; i < keys.length; i++) {
      setProgress({ checked: i, total: keys.length, downloaded, skipped })
      const key = keys[i]
      const link = links[key]
      // Skip booklets already cached (fast — no network).
      try {
        if (await byteStore.get(key)) {
          skipped += 1
          continue
        }
      } catch {
        /* treat as uncached → re-fetch */
      }
      const res = await fetchBooklet(link.driveFileId, parseResourceKey(link.viewUrl))
      if (!res.ok) {
        failedNet += 1
        continue
      }
      try {
        // Stream the body straight to the cache — never materialize the whole PDF in JS.
        await byteStore.put(key, new Response(res.response.body, { headers: { 'content-type': 'application/pdf' } }))
        // Verify it actually landed — on iOS a large booklet can fail to persist without a thrown
        // error; without this it would silently re-download every run.
        if (await byteStore.get(key)) downloaded += 1
        else failedSpace += 1
      } catch (err) {
        if (isQuotaError(err)) failedSpace += 1
        else failedNet += 1
      }
    }
    setProgress({ checked: keys.length, total: keys.length, downloaded, skipped })
    setResult({ downloaded, skipped, failedNet, failedSpace })
    setBusy(false)
    await refreshCachedCount(links)
    setRemaining(await estimateRemaining())
  }

  return (
    <div style={wrapStyle}>
      <button type="button" style={btnStyle} onClick={downloadAll} disabled={busy}>
        {busy ? '下載中…' : allCached ? '✓ 已全部下載' : '⬇ 全部下載供離線'}
      </button>
      <span style={statusStyle}>
        {busy && progress
          ? `檢查 ${progress.checked}/${progress.total} · 本次下載 ${progress.downloaded}・略過已快取 ${progress.skipped}`
          : `已快取 ${cached} / ${total} 份`}
      </span>
      {!busy && result && (result.failedSpace > 0 || result.failedNet > 0) && (
        <span style={warnStyle}>
          {result.failedSpace > 0
            ? `儲存空間不足，${result.failedSpace} 份未能快取——手機 / Safari 對網頁可用空間有限。${
                remaining != null ? `目前約剩 ${formatBytes(remaining)}。` : ''
              }可改用桌機瀏覽器，或清出空間後再試；已下載的 ${result.downloaded + result.skipped} 份仍可離線看。`
            : `${result.failedNet} 份下載失敗，稍後可再試。`}
        </span>
      )}
      {!busy && !result && !allCached && (
        <span style={hintStyle}>全部約需數百 MB 至 1 GB；手機空間有限時可能無法全部存下，仍可在開啟單份時即時載入。</span>
      )}
    </div>
  )
}

const wrapStyle: CSSProperties = { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.5rem', marginTop: '0.4rem' }
const btnStyle: CSSProperties = {
  cursor: 'pointer',
  border: '1px solid #9bb37f',
  borderRadius: '4px',
  background: '#dfe9cf',
  color: '#3a2a1a',
  fontFamily: 'var(--font-legible)',
  fontSize: '0.82rem',
  fontWeight: 700,
  padding: '0.3rem 0.6rem',
}
const statusStyle: CSSProperties = { fontSize: '0.78rem', color: '#6a5a45', fontFamily: 'var(--font-legible)' }
const warnStyle: CSSProperties = {
  flexBasis: '100%',
  fontSize: '0.76rem',
  color: '#8a3b2a',
  fontFamily: 'var(--font-legible)',
  lineHeight: 1.5,
}
const hintStyle: CSSProperties = { fontSize: '0.78rem', color: '#6a5a45', fontFamily: 'var(--font-legible)', lineHeight: 1.5 }
