/**
 * LocalPdfButton — opens the player's OWN local source PDF at the page a question's
 * 詳解 came from (add-neurons-local-pdf-provenance). Self-gating: renders nothing
 * unless the platform supports local files AND this question is mapped, so callers
 * can pass it unconditionally and unsupported/unmapped cases fall back to inline.
 *
 * First click on a supported platform with no granted folder triggers the folder
 * picker; the grant persists across sessions (device-local, never synced). The
 * resolved PDF renders in an in-app side-panel viewer (add-neurons-local-pdf-side-viewer);
 * this component owns the resolved URL's lifecycle and revokes it on close.
 */
import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { hasProvenance, isLocalPdfSupported, openExplanation, releaseExplanationUrl } from '../platform'
import { LocalPdfViewer } from './LocalPdfViewer'

interface OpenSource {
  url: string
  page: number
  file: string
}

export function LocalPdfButton({ questionId }: { questionId: string }): JSX.Element | null {
  const [available, setAvailable] = useState(false)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const [source, setSource] = useState<OpenSource | null>(null)
  const sourceRef = useRef<OpenSource | null>(null)
  sourceRef.current = source

  useEffect(() => {
    if (!isLocalPdfSupported()) {
      setAvailable(false)
      return
    }
    let alive = true
    hasProvenance(questionId).then((ok) => {
      if (alive) setAvailable(ok)
    })
    return () => {
      alive = false
    }
  }, [questionId])

  // Release any open object URL if the button unmounts while the viewer is open.
  useEffect(() => {
    return () => {
      if (sourceRef.current) releaseExplanationUrl(sourceRef.current.url)
    }
  }, [])

  if (!available) return null

  function closeViewer(): void {
    setSource((prev) => {
      if (prev) releaseExplanationUrl(prev.url)
      return null
    })
  }

  async function onClick(): Promise<void> {
    setBusy(true)
    setNote(null)
    const r = await openExplanation(questionId)
    setBusy(false)
    if (r.ok) {
      // Revoke any previously-open source before showing the new one.
      setSource((prev) => {
        if (prev) releaseExplanationUrl(prev.url)
        return { url: r.url, page: r.page, file: r.file }
      })
      return
    }
    // No-folder = the player cancelled the picker → no nagging message.
    if (r.reason === 'file-not-found') setNote(r.message ?? '在你選的資料夾找不到對應 PDF')
    else if (r.reason === 'permission-denied') setNote('需要授權讀取資料夾才能開啟原檔')
    else if (r.reason === 'error') setNote('開啟失敗，請再試一次')
  }

  return (
    <div style={wrapStyle}>
      <button
        type="button"
        onClick={onClick}
        disabled={busy}
        style={btnStyle}
        title="開啟你本機的原始詳解 PDF，跳到該題所在頁（首次會請你選擇陽明 PDF 資料夾）"
      >
        📄 {busy ? '開啟中…' : '看原始詳解 PDF'}
      </button>
      {note && <span style={noteStyle}>{note}</span>}
      {source && (
        <LocalPdfViewer url={source.url} page={source.page} file={source.file} onClose={closeViewer} />
      )}
    </div>
  )
}

const wrapStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  flexWrap: 'wrap',
  gap: '0.5rem',
}
const btnStyle: CSSProperties = {
  alignSelf: 'flex-start',
  cursor: 'pointer',
  border: '1px solid #c9ad7f',
  borderRadius: '4px',
  background: '#efe3c8',
  color: '#3a2a1a',
  fontFamily: 'var(--font-legible)',
  fontSize: '0.82rem',
  fontWeight: 700,
  padding: '0.3rem 0.6rem',
}
const noteStyle: CSSProperties = {
  fontSize: '0.78rem',
  color: '#8a3a2a',
  fontFamily: 'var(--font-legible)',
}
