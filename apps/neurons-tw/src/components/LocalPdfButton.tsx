/**
 * LocalPdfButton — opens the original source PDF at the page a question's 詳解 came from
 * (add-neurons-pdf-drive-autofetch). Self-gating via useLocalPdfAvailable: renders nothing unless
 * the question is mapped. On the web it auto-fetches the booklet from the publisher's official
 * Google Drive and caches it on the device, so it works on desktop AND mobile / Safari with no
 * download and no folder grant.
 *
 * The app provides ZERO of its own bytes — the browser fetches directly from the publisher's Drive.
 * On any fetch failure it degrades to a non-blocking message + the official Drive link; the inline
 * 詳解 always remains the fallback (No Silent Errors).
 */
import { useState, type CSSProperties } from 'react'
import { openExplanation, openExternalUrl } from '../platform'
import { EmojiIcon } from './EmojiIcon'
import { usePdfPanel } from './PdfPanelProvider'
import { useLocalPdfAvailable } from './useLocalPdfAvailable'

interface FailState {
  message: string
  driveUrl?: string
}

export function LocalPdfButton({
  questionId,
  actionRowItem = false,
}: {
  questionId: string
  /** When true, render as a bare fragment (button + fail block) with no own wrap
   *  div, so the button sits inline in a parent horizontal action row and the
   *  fail block (flexBasis:100%) breaks to a full row of that parent flex group. */
  actionRowItem?: boolean
}): JSX.Element | null {
  const available = useLocalPdfAvailable(questionId)
  const { openPdf } = usePdfPanel()
  const [busy, setBusy] = useState(false)
  const [fail, setFail] = useState<FailState | null>(null)

  if (!available) return null

  async function tryOpen(): Promise<void> {
    setBusy(true)
    setFail(null)
    const r = await openExplanation(questionId)
    setBusy(false)
    if (r.ok) {
      openPdf({ url: r.url, page: r.page, file: r.file })
      return
    }
    // Never break the flow — surface a non-blocking message + the official Drive link as fallback.
    setFail({ message: r.message ?? '載入失敗，請稍後再試', driveUrl: r.driveUrl })
  }

  const button = (
    <button
      type="button"
      onClick={tryOpen}
      disabled={busy}
      style={btnStyle}
      aria-label="開啟原始詳解 PDF"
      title="自動從陽明官方 Google Drive 載入原始詳解 PDF，跳到該題所在頁（手機 / Safari 也可用）"
    >
      <EmojiIcon char="📄" size={14} decorative />
      {/* .pdf-btn-label — collapses to icon-only on narrow QuizModal footer
          (scoped via .quiz-modal-footer @media); the aria-label keeps the
          accessible name when the text is hidden. */}
      <span className="pdf-btn-label">{busy ? '載入中…' : '原始詳解'}</span>
    </button>
  )
  const failBlock = fail && (
    <div style={failStyle}>
      <span style={failTextStyle}>{fail.message}</span>
      {fail.driveUrl && (
        <button type="button" style={linkBtnStyle} onClick={() => fail.driveUrl && openExternalUrl(fail.driveUrl)}>
          ↗ 開啟官方 Google Drive
        </button>
      )}
    </div>
  )

  if (actionRowItem) {
    return (
      <>
        {button}
        {failBlock}
      </>
    )
  }
  return (
    <div style={wrapStyle}>
      {button}
      {failBlock}
    </div>
  )
}

const wrapStyle: CSSProperties = { display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }
const btnStyle: CSSProperties = {
  alignSelf: 'flex-start',
  display: 'inline-flex',
  alignItems: 'center',
  gap: '0.3rem',
  cursor: 'pointer',
  border: '1px solid #c9ad7f',
  borderRadius: '4px',
  background: '#efe3c8',
  color: '#3a2a1a',
  fontFamily: 'var(--font-legible)',
  fontSize: '0.82rem',
  fontWeight: 700,
  padding: '0.3rem 0.6rem',
  whiteSpace: 'nowrap',
}
const failStyle: CSSProperties = {
  flexBasis: '100%',
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  gap: '0.5rem',
  padding: '0.4rem 0.6rem',
  border: '1px dashed #c9ad7f',
  borderRadius: '6px',
  background: '#f6efde',
}
const failTextStyle: CSSProperties = { fontSize: '0.8rem', color: '#8a3a2a', fontFamily: 'var(--font-legible)' }
const linkBtnStyle: CSSProperties = { ...btnStyle, background: '#dfe9cf', borderColor: '#9bb37f' }
