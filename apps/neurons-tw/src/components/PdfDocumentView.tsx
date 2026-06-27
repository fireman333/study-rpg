/**
 * PdfDocumentView — render-only PDF surface (rework-neurons-pdf-viewer-docked-panel).
 *
 * react-pdf <Document>/<Page> gives a selectable text layer for free. For 200+ page
 * booklets we virtualize: every page is a slot, but a real <Page> mounts only for slots
 * near the viewport (IntersectionObserver, generous rootMargin); far slots are placeholders
 * sized to the last measured page height. Opens scrolled to `initialPage`. Platform-agnostic
 * (just url + page + width), so a Tauri build reuses it by supplying a different url.
 */
import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import { Document, Page, pdfjs } from 'react-pdf'
import 'react-pdf/dist/Page/TextLayer.css'
import 'react-pdf/dist/Page/AnnotationLayer.css'
// Worker shipped as a bundled Vite asset (offline / CF-Pages / Tauri safe), not a CDN.
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

export function PdfDocumentView({
  url,
  initialPage,
  width,
}: {
  url: string
  initialPage: number
  width: number
}): JSX.Element {
  const [numPages, setNumPages] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [active, setActive] = useState<Set<number>>(() => new Set())
  const heights = useRef<Map<number, number>>(new Map())
  const slots = useRef<Map<number, HTMLDivElement>>(new Map())
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const ioRef = useRef<IntersectionObserver | null>(null)
  const didScroll = useRef(false)

  const pageWidth = Math.max(280, width - 32)
  const estHeight = Math.round(pageWidth * 1.414) // A4-ish placeholder

  const onLoad = useCallback(({ numPages: n }: { numPages: number }) => {
    setError(null)
    didScroll.current = false
    setNumPages(n)
  }, [])

  // (Re)build the observer when the page count changes.
  useEffect(() => {
    if (!numPages || !scrollRef.current) return
    const io = new IntersectionObserver(
      (entries) => {
        setActive((prev) => {
          const next = new Set(prev)
          for (const e of entries) {
            const p = Number((e.target as HTMLElement).dataset.page)
            if (e.isIntersecting) next.add(p)
            else next.delete(p)
          }
          return next
        })
      },
      { root: scrollRef.current, rootMargin: '1200px 0px' },
    )
    ioRef.current = io
    for (const el of slots.current.values()) io.observe(el)
    return () => {
      io.disconnect()
      ioRef.current = null
    }
  }, [numPages])

  const setSlot = useCallback((p: number, el: HTMLDivElement | null) => {
    const prev = slots.current.get(p)
    if (prev && ioRef.current) ioRef.current.unobserve(prev)
    if (el) {
      slots.current.set(p, el)
      ioRef.current?.observe(el)
    } else {
      slots.current.delete(p)
    }
  }, [])

  // Scroll the mapped page into view once its slot exists.
  useEffect(() => {
    if (!numPages || didScroll.current) return
    const el = slots.current.get(Math.min(Math.max(1, initialPage), numPages))
    if (el) {
      el.scrollIntoView({ block: 'start' })
      didScroll.current = true
    }
  }, [numPages, initialPage, active])

  if (error) {
    return (
      <div style={msgStyle}>
        <p>無法開啟此 PDF：{error}</p>
        <p style={{ color: '#6a5a45' }}>下方的文字版詳解仍可閱讀。</p>
      </div>
    )
  }

  return (
    // Scroll container is the OUTER element so it inherits a bounded height from the flex
    // panel body; react-pdf's <Document> wrapper has no height and would otherwise break a
    // height:100% chain (pages would overflow + be clipped/unreachable).
    <div ref={scrollRef} style={scrollStyle}>
      <Document
        file={url}
        onLoadSuccess={onLoad}
        onLoadError={(e: Error) => setError(e.message)}
        loading={<div style={msgStyle}>載入中…</div>}
        error={<div style={msgStyle}>PDF 載入失敗</div>}
      >
        {Array.from({ length: numPages }, (_, i) => i + 1).map((p) => {
          const isActive = active.has(p)
          const h = heights.current.get(p) ?? estHeight
          return (
            <div
              key={p}
              data-page={p}
              ref={(el) => setSlot(p, el)}
              style={{ width: pageWidth, margin: '0 auto 8px', minHeight: isActive ? undefined : h }}
            >
              {isActive && (
                <Page
                  pageNumber={p}
                  width={pageWidth}
                  renderTextLayer
                  renderAnnotationLayer={false}
                  onRenderSuccess={() => {
                    const el = slots.current.get(p)
                    if (el) heights.current.set(p, el.getBoundingClientRect().height)
                  }}
                />
              )}
            </div>
          )
        })}
      </Document>
    </div>
  )
}

const scrollStyle: CSSProperties = {
  flex: 1,
  minHeight: 0,
  overflow: 'auto',
  background: '#e9dcc0',
  padding: '1rem 0',
}
const msgStyle: CSSProperties = {
  textAlign: 'center',
  color: '#3a2a1a',
  fontFamily: 'var(--font-legible)',
  fontSize: '0.85rem',
  padding: '2rem 1rem',
}
