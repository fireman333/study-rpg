/**
 * OfflineAllPdfControl — the「全部下載供離線」action for原始詳解 PDF (add-neurons-pdf-drive-autofetch,
 * task 5.3). Fetches every booklet in the committed manifest from the publisher's Drive and caches it
 * on the device, so later opens work offline. Completion is derived from the byte-store's cached list
 * vs the manifest (no schema table); the player's preference rides the existing key-value `meta` store.
 *
 * Failures never block: a per-booklet error is counted and surfaced; the rest still cache.
 */
import { useEffect, useState, type CSSProperties } from 'react'
import { loadBookletLinks, type BookletLinkMap } from '../platform/manifest'
import { byteStore } from '../platform/byteStore'
import { fetchBooklet, parseResourceKey } from '../platform/driveFetch'
import { db } from '../lib/db'

const META_KEY = 'pdfOfflineAll'

export function OfflineAllPdfControl(): JSX.Element {
  const [links, setLinks] = useState<BookletLinkMap | null>(null)
  const [cached, setCached] = useState<number>(0)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [failed, setFailed] = useState(0)

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
    setFailed(0)
    try {
      await db.meta.put({ key: META_KEY, value: '1' })
    } catch {
      /* preference persistence is best-effort */
    }
    const keys = Object.keys(links)
    let fail = 0
    for (let i = 0; i < keys.length; i++) {
      setProgress({ done: i, total: keys.length })
      const key = keys[i]
      const link = links[key]
      // Skip booklets already cached.
      try {
        if (await byteStore.get(key)) continue
      } catch {
        /* treat as uncached → re-fetch */
      }
      const res = await fetchBooklet(link.driveFileId, parseResourceKey(link.viewUrl))
      if (!res.ok) {
        fail += 1
        continue
      }
      try {
        // Stream the body straight to the cache — never materialize the whole PDF in JS.
        await byteStore.put(key, new Response(res.response.body, { headers: { 'content-type': 'application/pdf' } }))
      } catch {
        fail += 1
      }
    }
    setProgress({ done: keys.length, total: keys.length })
    setFailed(fail)
    setBusy(false)
    await refreshCachedCount(links)
  }

  return (
    <div style={wrapStyle}>
      <button type="button" style={btnStyle} onClick={downloadAll} disabled={busy}>
        {busy ? '下載中…' : allCached ? '✓ 已全部下載' : '⬇ 全部下載供離線'}
      </button>
      <span style={statusStyle}>
        {busy && progress
          ? `下載中 ${progress.done} / ${progress.total}…`
          : `已快取 ${cached} / ${total} 份`}
        {failed > 0 && !busy ? `（${failed} 份失敗，稍後可再試）` : ''}
      </span>
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
const hintStyle: CSSProperties = { fontSize: '0.8rem', color: '#4a3a25', fontFamily: 'var(--font-legible)', lineHeight: 1.6 }
