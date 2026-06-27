/**
 * LocalPdfViewer — in-app right-side drawer that renders a resolved source PDF with
 * PDF.js, opened at a question's mapped page (add-neurons-local-pdf-side-viewer).
 *
 * Pure renderer: it receives an already-resolved `{ url, page, file }` from the platform
 * adapter (web File System Access today; a Tauri/Rust backend in Phase 2 returns the same
 * shape) and is platform-agnostic — the Phase 2 desktop app reuses this component verbatim.
 * The caller (LocalPdfButton) owns the URL lifecycle and revokes it on close.
 *
 * pdfjs-dist is dynamically imported on first open so the ~1 MB library is code-split out
 * of the main bundle. The worker ships as a hashed Vite asset (offline / CF-Pages / Tauri
 * safe), not a CDN. Replaces the prior `window.open(blobURL#page=N)` new-tab approach,
 * whose `#page` fragment is unreliable in a Tauri WKWebView.
 */
import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
// `?url` emits a hashed asset and yields just its URL string (worker stays a separate
// chunk; the heavy pdfjs library below is dynamically imported).
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

export interface LocalPdfViewerProps {
  url: string
  /** 1-based page to open on. */
  page: number
  /** Matched on-disk filename (drawer title). */
  file: string
  onClose: () => void
}

export function LocalPdfViewer({ url, page, file, onClose }: LocalPdfViewerProps): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const panelRef = useRef<HTMLDivElement | null>(null)
  // pdfjs document proxy + loading task; `any` avoids importing pdfjs types into the
  // main bundle (the library is dynamically imported). The loading task owns teardown.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const docRef = useRef<any>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const taskRef = useRef<any>(null)
  const renderTaskRef = useRef<{ cancel: () => void } | null>(null)
  const [numPages, setNumPages] = useState(0)
  const [cur, setCur] = useState(page)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Load the document once (lazy pdfjs import).
  useEffect(() => {
    let alive = true
    setLoading(true)
    setError(null)
    ;(async () => {
      try {
        const pdfjs = await import('pdfjs-dist')
        pdfjs.GlobalWorkerOptions.workerSrc = workerUrl
        const task = pdfjs.getDocument({ url })
        taskRef.current = task
        const doc = await task.promise
        if (!alive) {
          task.destroy()
          return
        }
        docRef.current = doc
        setNumPages(doc.numPages)
        setCur((p) => Math.min(Math.max(1, p), doc.numPages))
      } catch (err) {
        if (alive) setError(err instanceof Error ? err.message : String(err))
        if (alive) setLoading(false)
      }
    })()
    return () => {
      alive = false
      renderTaskRef.current?.cancel()
      docRef.current = null
      taskRef.current?.destroy?.()
      taskRef.current = null
    }
  }, [url])

  // Render the current page whenever it (or the loaded doc) changes.
  useEffect(() => {
    const doc = docRef.current
    const canvas = canvasRef.current
    if (!doc || !canvas || numPages === 0) return
    let alive = true
    ;(async () => {
      try {
        renderTaskRef.current?.cancel()
        const pageObj = await doc.getPage(cur)
        if (!alive) return
        const panelW = panelRef.current?.clientWidth ?? 520
        const targetW = Math.max(280, panelW - 32) // minus padding
        const base = pageObj.getViewport({ scale: 1 })
        const dpr = Math.min(window.devicePixelRatio || 1, 2)
        const scale = (targetW / base.width) * dpr
        const viewport = pageObj.getViewport({ scale })
        const ctx = canvas.getContext('2d')
        if (!ctx) return
        canvas.width = Math.floor(viewport.width)
        canvas.height = Math.floor(viewport.height)
        canvas.style.width = `${Math.floor(viewport.width / dpr)}px`
        canvas.style.height = `${Math.floor(viewport.height / dpr)}px`
        const task = pageObj.render({ canvasContext: ctx, viewport })
        renderTaskRef.current = task
        await task.promise
        if (alive) setLoading(false)
      } catch (err) {
        // A cancelled render (page flip / unmount) throws RenderingCancelledException — ignore.
        const name = (err as { name?: string } | null)?.name
        if (alive && name !== 'RenderingCancelledException') {
          setError(err instanceof Error ? err.message : String(err))
          setLoading(false)
        }
      }
    })()
    return () => {
      alive = false
    }
  }, [cur, numPages])

  // Esc to close + focus the panel on open.
  useEffect(() => {
    panelRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowLeft') setCur((p) => Math.max(1, p - 1))
      else if (e.key === 'ArrowRight') setCur((p) => (numPages ? Math.min(numPages, p + 1) : p))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, numPages])

  return createPortal(
    <div style={backdropStyle} onClick={onClose}>
      <div
        ref={panelRef}
        role="dialog"
        aria-label={`原始詳解 PDF：${file}`}
        tabIndex={-1}
        style={panelStyle}
        onClick={(e) => e.stopPropagation()}
      >
        <header style={headerStyle}>
          <span style={titleStyle} title={file}>
            📄 {file}
          </span>
          <button type="button" onClick={onClose} aria-label="關閉" style={closeBtnStyle}>
            ✕
          </button>
        </header>

        <div style={bodyStyle}>
          {error ? (
            <div style={msgStyle}>
              <p>無法開啟此 PDF：{error}</p>
              <p style={{ color: '#6a5a45' }}>下方的文字版詳解仍可閱讀。</p>
            </div>
          ) : (
            <>
              {loading && <div style={msgStyle}>載入中…</div>}
              <canvas ref={canvasRef} style={{ display: loading ? 'none' : 'block', margin: '0 auto' }} />
            </>
          )}
        </div>

        {numPages > 0 && !error && (
          <footer style={footerStyle}>
            <button
              type="button"
              onClick={() => setCur((p) => Math.max(1, p - 1))}
              disabled={cur <= 1}
              style={navBtnStyle}
              aria-label="上一頁"
            >
              ◀
            </button>
            <span style={pageLabelStyle}>
              第 {cur} / {numPages} 頁
            </span>
            <button
              type="button"
              onClick={() => setCur((p) => Math.min(numPages, p + 1))}
              disabled={cur >= numPages}
              style={navBtnStyle}
              aria-label="下一頁"
            >
              ▶
            </button>
          </footer>
        )}
      </div>
    </div>,
    document.body,
  )
}

const backdropStyle: CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(20,14,6,0.55)',
  zIndex: 9000,
  display: 'flex',
  justifyContent: 'flex-end',
}
const panelStyle: CSSProperties = {
  width: 'min(560px, 94vw)',
  height: '100%',
  background: '#f6efe0',
  borderLeft: '2px solid #c9ad7f',
  boxShadow: '-6px 0 24px rgba(0,0,0,0.3)',
  display: 'flex',
  flexDirection: 'column',
  outline: 'none',
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
const bodyStyle: CSSProperties = {
  flex: 1,
  overflow: 'auto',
  padding: '1rem',
  background: '#e9dcc0',
}
const msgStyle: CSSProperties = {
  textAlign: 'center',
  color: '#3a2a1a',
  fontFamily: 'var(--font-legible)',
  fontSize: '0.85rem',
  padding: '2rem 1rem',
}
const footerStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '1rem',
  padding: '0.5rem',
  borderTop: '1px solid #d8c39a',
  background: '#efe3c8',
}
const navBtnStyle: CSSProperties = {
  cursor: 'pointer',
  border: '1px solid #c9ad7f',
  borderRadius: '4px',
  background: '#f6efe0',
  color: '#3a2a1a',
  fontSize: '0.9rem',
  fontWeight: 700,
  padding: '0.25rem 0.7rem',
}
const pageLabelStyle: CSSProperties = {
  fontFamily: 'var(--font-legible)',
  fontSize: '0.82rem',
  color: '#3a2a1a',
  minWidth: '7rem',
  textAlign: 'center',
}
