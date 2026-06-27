/**
 * LocalPdfButton — opens the player's OWN local source PDF at the page a question's 詳解 came
 * from (add-neurons-local-pdf-provenance). Self-gating via useLocalPdfAvailable: renders nothing
 * unless the platform supports local files AND this question is mapped.
 *
 * On desktop, source PDFs are identified by CONTENT FINGERPRINT (not filename), and when the
 * booklet isn't in the granted folder yet, this shows a guided-download prompt linking to the
 * publisher's official Google Drive + a「掃描資料夾」retry (add-neurons-guided-pdf-onboarding).
 * The app provides ZERO copyrighted bytes — it only links to the publisher's own source.
 */
import { useState, type CSSProperties } from 'react'
import { openExplanation, openExternalUrl } from '../platform'
import { usePdfPanel } from './PdfPanelProvider'
import { useLocalPdfAvailable } from './useLocalPdfAvailable'

interface GuidedState {
  bookletId?: string
  driveUrl?: string
}

export function LocalPdfButton({ questionId }: { questionId: string }): JSX.Element | null {
  const available = useLocalPdfAvailable(questionId)
  const { openPdf } = usePdfPanel()
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const [guided, setGuided] = useState<GuidedState | null>(null)

  if (!available) return null

  async function tryOpen(): Promise<void> {
    setBusy(true)
    setNote(null)
    setGuided(null)
    const r = await openExplanation(questionId)
    setBusy(false)
    if (r.ok) {
      openPdf({ url: r.url, page: r.page, file: r.file })
      // Low-confidence = matched by page-count only (no usable text layer) — flag it, don't hide it.
      if (r.confidence === 'low') setNote('（依頁數比對開啟，未能核對內文，請確認是否為該份）')
      return
    }
    // No-folder = the player cancelled the picker → no nagging message.
    if (r.reason === 'file-not-found') setGuided({ bookletId: r.bookletId, driveUrl: r.driveUrl })
    else if (r.reason === 'permission-denied') setNote('需要授權讀取資料夾才能開啟原檔')
    else if (r.reason === 'error') setNote('開啟失敗，請再試一次')
  }

  return (
    <div style={wrapStyle}>
      <button
        type="button"
        onClick={tryOpen}
        disabled={busy}
        style={btnStyle}
        title="開啟你本機的原始詳解 PDF，跳到該題所在頁（首次會請你選擇陽明 PDF 資料夾）"
      >
        📄 {busy ? '開啟中…' : '看原始詳解 PDF'}
      </button>
      {note && <span style={noteStyle}>{note}</span>}
      {guided && (
        <div style={guidedStyle}>
          <p style={guidedTextStyle}>
            資料夾裡還沒有這份 PDF{guided.bookletId ? `（${guided.bookletId}）` : ''}。
          </p>
          {guided.driveUrl && (
            <button type="button" style={dlBtnStyle} onClick={() => guided.driveUrl && openExternalUrl(guided.driveUrl)}>
              📥 從陽明官方 Google Drive 下載
            </button>
          )}
          <button type="button" style={rescanBtnStyle} onClick={tryOpen} disabled={busy}>
            🔄 我下載好了，掃描資料夾
          </button>
          <span style={creditStyle}>下載後存到你授權的資料夾即可。來源：陽明國考考古題小組</span>
        </div>
      )}
    </div>
  )
}

const wrapStyle: CSSProperties = { display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }
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
const noteStyle: CSSProperties = { fontSize: '0.78rem', color: '#8a3a2a', fontFamily: 'var(--font-legible)' }
const guidedStyle: CSSProperties = {
  flexBasis: '100%',
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  gap: '0.5rem',
  padding: '0.5rem 0.6rem',
  border: '1px dashed #c9ad7f',
  borderRadius: '6px',
  background: '#f6efde',
}
const guidedTextStyle: CSSProperties = {
  margin: 0,
  flexBasis: '100%',
  fontSize: '0.8rem',
  color: '#3a2a1a',
  fontFamily: 'var(--font-legible)',
}
const dlBtnStyle: CSSProperties = { ...btnStyle, background: '#dfe9cf', borderColor: '#9bb37f' }
const rescanBtnStyle: CSSProperties = { ...btnStyle, background: '#efe3c8' }
const creditStyle: CSSProperties = {
  flexBasis: '100%',
  fontSize: '0.72rem',
  color: '#6a5a45',
  fontFamily: 'var(--font-legible)',
}
