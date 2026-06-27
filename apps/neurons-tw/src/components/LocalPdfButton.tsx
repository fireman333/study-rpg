/**
 * LocalPdfButton — opens the player's OWN local source PDF at the page a question's
 * 詳解 came from (add-neurons-local-pdf-provenance). Self-gating via useLocalPdfAvailable:
 * renders nothing unless the platform supports local files AND this question is mapped.
 *
 * First click on a supported platform with no granted folder triggers the folder picker;
 * the grant persists across sessions (device-local, never synced). The resolved PDF opens in
 * the global docked panel (rework-neurons-pdf-viewer-docked-panel) — this button no longer
 * owns any viewer state; the PdfPanelProvider owns the panel + the resolved URL's lifecycle.
 */
import { useState, type CSSProperties } from 'react'
import { openExplanation } from '../platform'
import { usePdfPanel } from './PdfPanelProvider'
import { useLocalPdfAvailable } from './useLocalPdfAvailable'

export function LocalPdfButton({ questionId }: { questionId: string }): JSX.Element | null {
  const available = useLocalPdfAvailable(questionId)
  const { openPdf } = usePdfPanel()
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)

  if (!available) return null

  async function onClick(): Promise<void> {
    setBusy(true)
    setNote(null)
    const r = await openExplanation(questionId)
    setBusy(false)
    if (r.ok) {
      openPdf({ url: r.url, page: r.page, file: r.file })
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
