/**
 * PdfPanelHost — the single docked PDF panel, mounted once near the app root
 * (rework-neurons-pdf-viewer-docked-panel). NON-modal (no backdrop): its width lives in
 * the `--pdf-panel-width` CSS variable so the app shell + full-screen modals reflow beside
 * it. Left-edge drag resizes it (live via the CSS var, committed on release). Renders the
 * platform-agnostic PdfDocumentView; closing releases the resolved object URL (in provider).
 */
import {
  Suspense,
  lazy,
  useCallback,
  useEffect,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { createPortal } from 'react-dom'
import { usePdfPanel, clampPanelWidth } from './PdfPanelProvider'

// Lazy so react-pdf + pdfjs (~0.5 MB) are code-split out of the main bundle and only
// fetched when a player actually opens a PDF (the panel is opened from a user gesture).
const PdfDocumentView = lazy(() =>
  import('./PdfDocumentView').then((m) => ({ default: m.PdfDocumentView })),
)

export function PdfPanelHost(): JSX.Element | null {
  const { open, url, page, file, width, setWidth, closePdf } = usePdfPanel()

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closePdf()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, closePdf])

  const onDragStart = useCallback(
    (e: ReactPointerEvent) => {
      e.preventDefault()
      const widthAt = (clientX: number) => clampPanelWidth(window.innerWidth - clientX)
      const move = (ev: PointerEvent) => {
        // Live resize via the CSS variable only — avoids re-rendering pages on every move.
        document.documentElement.style.setProperty('--pdf-panel-width', `${widthAt(ev.clientX)}px`)
      }
      const up = (ev: PointerEvent) => {
        setWidth(widthAt(ev.clientX)) // commit → state + persist + re-render pages at new width
        window.removeEventListener('pointermove', move)
        window.removeEventListener('pointerup', up)
      }
      window.addEventListener('pointermove', move)
      window.addEventListener('pointerup', up)
    },
    [setWidth],
  )

  if (!open || !url) return null

  return createPortal(
    <aside style={panelStyle} role="complementary" aria-label={`原始詳解 PDF：${file}`}>
      <div style={handleStyle} onPointerDown={onDragStart} title="拖曳調整寬度" />
      <header style={headerStyle}>
        <span style={titleStyle} title={file}>
          📄 {file}
        </span>
        <button type="button" onClick={closePdf} aria-label="關閉" style={closeBtnStyle}>
          ✕
        </button>
      </header>
      <div style={bodyStyle}>
        <Suspense fallback={<div style={loadingStyle}>載入檢視器…</div>}>
          <PdfDocumentView url={url} initialPage={page} width={width} />
        </Suspense>
      </div>
    </aside>,
    document.body,
  )
}

const panelStyle: CSSProperties = {
  position: 'fixed',
  top: 0,
  right: 0,
  height: '100vh',
  width: 'var(--pdf-panel-width)',
  background: '#f6efe0',
  borderLeft: '2px solid #c9ad7f',
  boxShadow: '-6px 0 24px rgba(0,0,0,0.25)',
  display: 'flex',
  flexDirection: 'column',
  zIndex: 9000,
}
const handleStyle: CSSProperties = {
  position: 'absolute',
  left: -4,
  top: 0,
  bottom: 0,
  width: 8,
  cursor: 'ew-resize',
  touchAction: 'none',
  zIndex: 1,
}
const headerStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '0.5rem',
  padding: '0.6rem 0.8rem',
  borderBottom: '1px solid #d8c39a',
  background: '#efe3c8',
}
const titleStyle: CSSProperties = {
  flex: 1,
  fontFamily: 'var(--font-legible)',
  fontSize: '0.85rem',
  fontWeight: 700,
  color: '#3a2a1a',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
}
const closeBtnStyle: CSSProperties = {
  cursor: 'pointer',
  border: '1px solid #c9ad7f',
  borderRadius: '4px',
  background: '#f6efe0',
  color: '#3a2a1a',
  fontSize: '0.9rem',
  fontWeight: 700,
  padding: '0.2rem 0.5rem',
}
const bodyStyle: CSSProperties = { flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }
const loadingStyle: CSSProperties = {
  padding: '2rem 1rem',
  textAlign: 'center',
  color: '#3a2a1a',
  fontFamily: 'var(--font-legible)',
  fontSize: '0.85rem',
}
