/**
 * BookletDownloadList — links to EVERY booklet's official 陽明 Google Drive file, for the player
 * who wants to download everything up front (add-neurons-guided-pdf-onboarding, task 3.2). Reused
 * by the desktop onboarding banner. The app provides ZERO copyrighted bytes — every entry opens
 * the publisher's own official source in the system browser; the player saves it to their folder.
 */
import { useEffect, useState, type CSSProperties } from 'react'
import { loadBookletLinks, type BookletLinkMap } from '../platform/manifest'
import { openExternalUrl } from '../platform'

export function BookletDownloadList(): JSX.Element {
  const [links, setLinks] = useState<BookletLinkMap | null>(null)
  useEffect(() => {
    let alive = true
    loadBookletLinks().then((l) => {
      if (alive) setLinks(l)
    })
    return () => {
      alive = false
    }
  }, [])

  if (!links) return <p style={hintStyle}>載入官方下載連結中…</p>
  // Newest year/session first.
  const ids = Object.keys(links).sort().reverse()

  return (
    <div>
      <p style={hintStyle}>
        從 <strong>陽明國考考古題小組</strong> 的官方 Google Drive 下載你需要的年份，存到你授權的資料夾即可。
        本 App 不提供 PDF、只連到官方來源。
      </p>
      <div style={gridStyle}>
        {ids.map((id) => (
          <button key={id} type="button" style={itemStyle} onClick={() => openExternalUrl(links[id].viewUrl)}>
            📥 {id}
          </button>
        ))}
      </div>
    </div>
  )
}

const hintStyle: CSSProperties = {
  fontSize: '0.8rem',
  color: '#4a3a25',
  fontFamily: 'var(--font-legible)',
  lineHeight: 1.6,
}
const gridStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))',
  gap: '0.4rem',
}
const itemStyle: CSSProperties = {
  cursor: 'pointer',
  border: '1px solid #c9ad7f',
  borderRadius: '4px',
  background: '#efe3c8',
  color: '#3a2a1a',
  fontFamily: 'var(--font-legible)',
  fontSize: '0.78rem',
  fontWeight: 700,
  padding: '0.3rem 0.4rem',
}
