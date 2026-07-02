/**
 * PdfDocumentView — render-only PDF surface (rework-neurons-pdf-viewer-docked-panel).
 *
 * react-pdf <Document>/<Page> gives a selectable text layer for free. For 200+ page booklets we
 * virtualize: every page is a slot div sized to its measured (or A4-estimated) height — so the
 * scrollbar always represents the FULL document — but a real <Page> mounts only for a contiguous
 * window of pages around what the player is looking at. Opens scrolled to `initialPage`.
 * Platform-agnostic (just url + page + width), so a Tauri build reuses it by supplying a
 * different url.
 *
 * Scroll model (why it is shaped like this): the old "scrollIntoView the target, then re-pin as
 * estimated heights above it reflow" approach produced scroll-through, white-page flashing, and an
 * intermittent 1–2-page miss (the landing raced IntersectionObserver / render / effect ordering).
 * Now we keep ONE invariant: the slot list always represents the whole document; on open we mount
 * ONLY the target and pages below it (never above), so the target's offset can be written to
 * scrollTop with nothing above it to reflow the landing.
 *
 * WKWebView (Tauri desktop) needs two extra defenses, neither of which Blink requires:
 *  1. It ACCEPTS a scrollTop write on a freshly-docked panel (read-back even confirms it) but then
 *     DISCARDS it a compositing frame later, resetting scrollTop to 0 → the viewport lands on the
 *     unmounted placeholders above the target ("flash then blank"). So the landing re-asserts the
 *     offset every frame until it HOLDS for several consecutive frames, with onScroll growth + RO
 *     compensation frozen (openingRef) the whole time so the transient reset can't grow the window.
 *  2. It has no scroll anchoring, so when a page whose box sits entirely ABOVE the viewport top
 *     changes height we shift scrollTop by exactly that delta (the manual overflow-anchor sub).
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { Document, Page, pdfjs } from 'react-pdf'
import 'react-pdf/dist/Page/TextLayer.css'
import 'react-pdf/dist/Page/AnnotationLayer.css'
// Worker shipped as a bundled Vite asset (offline / CF-Pages / Tauri safe), not a CDN.
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

const WINDOW_BELOW = 6 // pages below the target mounted on open
const EXPAND_STEP = 4 // pages added each time the window grows
const EXPAND_MARGIN = 900 // px of look-ahead before a window edge before growing it
const MAX_WINDOW = 16 // cap on simultaneously-mounted pages (bounds memory on long scrolls)
const PAGE_GAP = 8 // vertical flow gap between page slots (the slot's bottom margin, in px)
const SETTLE_HOLDS = 3 // consecutive frames the landing must survive before releasing scroll control
const SETTLE_MAX_FRAMES = 30 // give up re-asserting after ~0.5s (avoid pinning scroll forever)
// Zoom range. 1.0 = fit-to-width (the 符合寬度 reset). The floor is BELOW 1 on purpose: when the
// docked panel is dragged wide (up to 70% of the viewport) the fit-width page is huge, and on a
// phone a layout-vs-visual-viewport mismatch can render fit-width wider than the screen — in both
// cases the player needs to shrink the page back down without re-dragging the panel. A floor of 1
// ("100% lock") made an over-sized page un-shrinkable; 0.5 gives a usable shrink range either way.
const MIN_ZOOM = 0.5
const MAX_ZOOM = 2.5 // dense exam pages stay readable up to ~2.5×
const ZOOM_STEP = 0.25

const clampNum = (v: number, lo: number, hi: number): number => Math.min(Math.max(v, lo), hi)

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
  // [start,end] inclusive 1-based range of pages that mount a real <Page>; every other page is a
  // sized placeholder so the scrollbar represents the whole document.
  const [win, setWin] = useState<{ start: number; end: number }>({ start: 1, end: 1 })
  // Re-render placeholders once a measured height lands. Heights live in a ref (below) so the
  // scroll-compensation math never races a React state flush; this counter just nudges a re-render.
  const [, bumpHeights] = useState(0)

  const scrollRef = useRef<HTMLDivElement | null>(null)
  const slots = useRef<Map<number, HTMLDivElement>>(new Map())
  const heights = useRef<Map<number, number>>(new Map()) // committed measured border-box heights
  const roRef = useRef<ResizeObserver | null>(null)
  const winRef = useRef(win)
  winRef.current = win
  const pendingAnchor = useRef<number | null>(null) // page to pin to the top, once the window applies
  const openingRef = useRef(false) // freeze scroll-driven growth + RO compensation during the landing
  const lastTopRef = useRef(0) // previous scrollTop — to detect upward-scroll intent
  const prevWidthRef = useRef(0)
  const pinchingRef = useRef(false) // freeze scroll-driven growth + RO compensation during a pinch
  const landedRef = useRef(false) // false until the first open-settle lands (initial target = initialPage)
  // The top-visible page, tracked in onScroll while scrollTop + pageWidth are CONSISTENT. A
  // zoom / drag-resize re-pins to this page number (space-independent), so the width-repin effect
  // never has to derive a page from a stale scrollTop against the new page offsets.
  const topPageRef = useRef(1)

  // In-app zoom (add-neurons-pdf-mobile-zoom): dense A4 exam pages are tiny at fit-width on a phone,
  // and native pinch-zoom-out is hijacked by Safari's Tab Overview — so zoom is APP STATE, applied
  // by re-rasterizing react-pdf at a larger width (crisp, unlike a CSS transform). 1 = fit-to-width.
  const [zoom, setZoom] = useState(1)
  const zoomRef = useRef(zoom) // latest zoom for the (mount-stable) pinch handlers
  zoomRef.current = zoom
  const fitWidth = Math.max(280, width - 32)
  const pageWidth = Math.round(fitWidth * zoom)
  const estHeight = Math.round(pageWidth * 1.414) // A4-ish placeholder before a page is measured
  const zoomOut = useCallback(() => setZoom((z) => Math.max(MIN_ZOOM, Math.round((z - ZOOM_STEP) * 100) / 100)), [])
  const zoomIn = useCallback(() => setZoom((z) => Math.min(MAX_ZOOM, Math.round((z + ZOOM_STEP) * 100) / 100)), [])
  const zoomFit = useCallback(() => setZoom(1), [])

  const clampPage = useCallback((p: number, n: number) => Math.min(Math.max(1, p), n), [])

  // Content-space y of page p's top edge (1-based), from measured-or-estimated heights plus the
  // per-slot flow gap (the bottom margin, which is part of layout flow but NOT of a slot's
  // getBoundingClientRect height). Pages above the target are never mounted, so their height stays
  // the estimate (which scales with width) → this offset is exact for the target on open + resize.
  const prefixOffset = useCallback(
    (p: number): number => {
      let y = 0
      for (let i = 1; i < p; i++) y += (heights.current.get(i) ?? estHeight) + PAGE_GAP
      return y
    },
    [estHeight],
  )

  // The page occupying the viewport top (highest page whose slot top ≤ scrollTop). Re-pins zoom /
  // drag-resize at the player's current place. Reads the same measured-or-estimated heights as
  // prefixOffset, so it stays self-consistent even with stale above-anchor measurements.
  const topVisiblePage = useCallback((): number => {
    const c = scrollRef.current
    if (!c || !numPages) return clampPage(initialPage, numPages)
    const st = c.scrollTop + 1
    for (let p = numPages; p >= 1; p--) {
      if (prefixOffset(p) <= st) return clampPage(p, numPages)
    }
    return 1
  }, [numPages, initialPage, clampPage, prefixOffset])

  const onLoad = useCallback(({ numPages: n }: { numPages: number }) => {
    setError(null)
    setNumPages(n)
  }, [])

  // (Re)anchor when the requested page or document changes — including opening another question in
  // the SAME booklet (url unchanged → <Document> doesn't reload), which the old reload-gated logic
  // missed. The actual scroll placement happens in the layout effect once the window state applies.
  useEffect(() => {
    if (!numPages) return
    const t = clampPage(initialPage, numPages)
    landedRef.current = false // a fresh open / question → land on initialPage, not the prior view
    pendingAnchor.current = t
    setWin({ start: t, end: Math.min(numPages, t + WINDOW_BELOW) })
  }, [url, initialPage, numPages, clampPage])

  // Re-pin the target at a new width (drag-resize). Above-target pages are never mounted, so their
  // estimated heights scale with width and prefixOffset(target) stays exact — just re-place.
  useLayoutEffect(() => {
    if (prevWidthRef.current === pageWidth) return
    prevWidthRef.current = pageWidth
    if (!numPages) return
    // Re-pin at the last consistently-tracked top-visible page so zoom / drag-resize keeps the
    // player's place — except before the first open-settle has landed, when the intended target is
    // still initialPage (landedRef guards that pre-land window regardless of measure / load
    // ordering). Using the tracked page NUMBER (not a live derivation) avoids reading the old
    // scrollTop against the new page offsets.
    const t = landedRef.current ? clampPage(topPageRef.current, numPages) : clampPage(initialPage, numPages)
    pendingAnchor.current = t
    setWin({ start: t, end: Math.min(numPages, t + WINDOW_BELOW) })
  }, [pageWidth, numPages, initialPage, clampPage])

  // Deterministic landing — scroll the target's offset to the viewport top. Because win.start ===
  // target, no <Page> above the target is mounted, so nothing above it can reflow the landing.
  // WKWebView accepts the write then discards it a frame later (resetting scrollTop to 0), so a
  // single write + read-back check lands on blank placeholders. We re-assert every frame until the
  // offset HOLDS for SETTLE_HOLDS consecutive frames against a fully laid-out container; onScroll
  // growth + RO compensation stay frozen (openingRef) the whole time so the reset can't grow the
  // window.
  useLayoutEffect(() => {
    const t = pendingAnchor.current
    if (t == null || !numPages) return
    if (win.start !== clampPage(t, numPages)) return // window not applied yet
    if (!scrollRef.current) return
    openingRef.current = true
    pendingAnchor.current = null
    const target = clampPage(t, numPages)
    const fullSH = prefixOffset(numPages + 1) - estHeight // container is laid out to full height past this
    let holds = 0
    let frames = 0
    let rafId = 0
    const settle = () => {
      const c = scrollRef.current
      if (!c) return
      void c.scrollHeight // force a layout flush so reads/writes use up-to-date geometry
      const maxST = Math.max(0, c.scrollHeight - c.clientHeight)
      const want = Math.min(prefixOffset(target), maxST)
      const onTarget = Math.abs(c.scrollTop - want) < 2
      const laidOut = c.scrollHeight >= fullSH
      if (onTarget && laidOut) {
        holds += 1 // survived another frame without WebKit discarding the write
      } else {
        if (!onTarget) c.scrollTop = want // (re)assert
        holds = 0
      }
      lastTopRef.current = c.scrollTop
      frames += 1
      if (holds >= SETTLE_HOLDS || frames >= SETTLE_MAX_FRAMES) {
        openingRef.current = false
        landedRef.current = true // subsequent zoom / resize re-pins the current view, not initialPage
        topPageRef.current = target // seed the tracker so a zoom before any scroll re-pins here
        return
      }
      rafId = requestAnimationFrame(settle)
    }
    settle()
    return () => cancelAnimationFrame(rafId)
  }, [numPages, win.start, clampPage, prefixOffset, estHeight])

  // ResizeObserver is the single height source: react-pdf commits canvas and text layers in
  // separate frames, so onRenderSuccess can fire before the box settles. When a page whose box now
  // sits entirely ABOVE the viewport top changes height, shift scrollTop by the delta so the
  // visible content stays put. Deltas are batched into one scrollTop write per callback and gated
  // on a real (≥0.5px) change, so it cannot feed back on itself.
  useEffect(() => {
    const cont = scrollRef.current
    if (!cont) return
    const ro = new ResizeObserver((entries) => {
      const contTop = cont.getBoundingClientRect().top
      let dScroll = 0
      for (const e of entries) {
        const el = e.target as HTMLElement
        const p = Number(el.dataset.page)
        if (!p) continue
        const rect = el.getBoundingClientRect()
        const newH = rect.height
        const oldH = heights.current.get(p) ?? estHeight
        if (Math.abs(newH - oldH) < 0.5) continue // idempotent: ignore no-op resizes
        heights.current.set(p, newH)
        // Frozen during the open-settle so it cannot fight the landing loop.
        if (!openingRef.current && !pinchingRef.current && rect.bottom <= contTop + 0.5)
          dScroll += newH - oldH
      }
      if (dScroll !== 0) cont.scrollTop += dScroll
      if (entries.length) bumpHeights((v) => v + 1) // re-render placeholders at their new heights
    })
    roRef.current = ro
    for (const el of slots.current.values()) ro.observe(el)
    return () => {
      ro.disconnect()
      roRef.current = null
    }
  }, [estHeight])

  // Pinch-to-zoom (phone / tablet, add-neurons-pdf-pinch-zoom). Two-finger distance drives a LIVE
  // CSS transform preview on the <Document> wrapper (compositor-only, zero React state), committed
  // ONCE to app-state `zoom` on release — so the re-raster + the hard-won scroll-landing loop run
  // exactly once, not per frame. pinchingRef freezes onScroll growth + RO compensation; the
  // transform origin is the pinch centroid (in content space) so that point stays under the fingers.
  // Suppressing WebKit `gesturestart`/`gesturechange` is what actually stops Safari's Tab-Overview
  // pinch hijack (touch-action alone does not). Handlers read refs only, so mount-stable [] deps.
  useEffect(() => {
    const cont = scrollRef.current
    if (!cont) return
    const twoFingerDist = (t: TouchList): number =>
      Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY)
    let g: { startDist: number; startZoom: number; docEl: HTMLElement; live: number } | null = null

    const onStart = (e: TouchEvent): void => {
      if (e.touches.length !== 2 || openingRef.current) return
      const docEl = cont.firstElementChild as HTMLElement | null
      if (!docEl) return
      e.preventDefault()
      pinchingRef.current = true
      const cy = (e.touches[0].clientY + e.touches[1].clientY) / 2
      const originY = cont.scrollTop + (cy - cont.getBoundingClientRect().top)
      docEl.style.transformOrigin = `50% ${originY}px`
      docEl.style.willChange = 'transform'
      g = { startDist: twoFingerDist(e.touches), startZoom: zoomRef.current, docEl, live: 1 }
    }
    const onMove = (e: TouchEvent): void => {
      if (!g || e.touches.length !== 2) return
      e.preventDefault()
      const target = clampNum((g.startZoom * twoFingerDist(e.touches)) / g.startDist, MIN_ZOOM, MAX_ZOOM)
      g.live = target / g.startZoom
      g.docEl.style.transform = `scale(${g.live})`
    }
    const commit = (): void => {
      if (!g) return
      // Continuous zoom rounded to 0.05 (snapping to the 0.25 button ladder jumps away from the
      // fingers). The re-raster rides the existing width-repin → settle path (now anchored to the
      // top-visible page), so no second landing mechanism is invented.
      const finalZoom = Math.round(clampNum(g.startZoom * g.live, MIN_ZOOM, MAX_ZOOM) * 20) / 20
      g.docEl.style.transform = ''
      g.docEl.style.transformOrigin = ''
      g.docEl.style.willChange = ''
      g = null
      pinchingRef.current = false
      setZoom(finalZoom)
    }
    const onEnd = (e: TouchEvent): void => {
      if (g && e.touches.length < 2) commit()
    }
    const preventGesture = (e: Event): void => e.preventDefault()

    cont.addEventListener('touchstart', onStart, { passive: false })
    cont.addEventListener('touchmove', onMove, { passive: false })
    cont.addEventListener('touchend', onEnd)
    cont.addEventListener('touchcancel', onEnd)
    cont.addEventListener('gesturestart', preventGesture as EventListener, { passive: false })
    cont.addEventListener('gesturechange', preventGesture as EventListener, { passive: false })
    return () => {
      cont.removeEventListener('touchstart', onStart)
      cont.removeEventListener('touchmove', onMove)
      cont.removeEventListener('touchend', onEnd)
      cont.removeEventListener('touchcancel', onEnd)
      cont.removeEventListener('gesturestart', preventGesture as EventListener)
      cont.removeEventListener('gesturechange', preventGesture as EventListener)
    }
  }, [])

  const setSlot = useCallback((p: number, el: HTMLDivElement | null) => {
    const prev = slots.current.get(p)
    if (prev && roRef.current) roRef.current.unobserve(prev)
    if (el) {
      slots.current.set(p, el)
      roRef.current?.observe(el)
    } else {
      slots.current.delete(p)
    }
  }, [])

  // Grow the mounted window as the player scrolls: downward whenever they near the bottom edge
  // (natural reading direction), upward ONLY while actively scrolling up toward the window start —
  // so opening never pulls in above-target pages.
  const onScroll = useCallback(() => {
    if (openingRef.current || pinchingRef.current) return
    const cont = scrollRef.current
    if (!cont || !numPages) return
    const st = cont.scrollTop
    const vh = cont.clientHeight
    const goingUp = st < lastTopRef.current - 0.5
    lastTopRef.current = st
    topPageRef.current = topVisiblePage() // consistent space → safe anchor for a later zoom / resize
    const { start, end } = winRef.current
    let nextStart = start
    let nextEnd = end
    if (end < numPages && st + vh + EXPAND_MARGIN > prefixOffset(end + 1)) {
      nextEnd = Math.min(numPages, end + EXPAND_STEP)
    }
    if (goingUp && start > 1 && st - EXPAND_MARGIN < prefixOffset(start)) {
      nextStart = Math.max(1, start - EXPAND_STEP)
    }
    // Bound the mounted window so a long scroll through a 200-page booklet doesn't keep stacking
    // canvases; trim the side we are moving away from. Its slots keep their measured placeholder
    // height, so re-mounting them on a reverse scroll is seamless (no reflow/compensation).
    if (nextEnd > end) nextStart = Math.max(nextStart, nextEnd - MAX_WINDOW + 1)
    if (nextStart < start) nextEnd = Math.min(nextEnd, nextStart + MAX_WINDOW - 1)
    if (nextStart !== start || nextEnd !== end) setWin({ start: nextStart, end: nextEnd })
  }, [numPages, prefixOffset, topVisiblePage])

  if (error) {
    return (
      <div style={msgStyle}>
        <p>無法開啟此 PDF：{error}</p>
        <p style={{ color: '#6a5a45' }}>下方的文字版詳解仍可閱讀。</p>
      </div>
    )
  }

  return (
    // Relative flex column so the zoom toolbar floats over the scroller. The inner div is the
    // scroll container (bounded height from the flex panel body; react-pdf's <Document> wrapper has
    // no height and would otherwise break a height:100% chain). overflow-anchor:none keeps Blink
    // from ALSO native-anchoring (we anchor manually).
    <div style={viewerWrapStyle}>
      <div ref={scrollRef} style={scrollStyle} onScroll={onScroll}>
      <Document
        file={url}
        onLoadSuccess={onLoad}
        onLoadError={(e: Error) => setError(e.message)}
        loading={<div style={msgStyle}>載入中…</div>}
        error={<div style={msgStyle}>PDF 載入失敗</div>}
      >
        {Array.from({ length: numPages }, (_, i) => i + 1).map((p) => {
          const mounted = p >= win.start && p <= win.end
          const h = heights.current.get(p) ?? estHeight
          return (
            <div
              key={p}
              data-page={p}
              ref={(el) => setSlot(p, el)}
              // Unmounted placeholders use an explicit height (WebKit builds the scroll model more
              // reliably from explicit block sizes); mounted slots use minHeight so the rendered
              // page can exceed the estimate.
              style={{
                width: pageWidth,
                margin: `0 auto ${PAGE_GAP}px`,
                ...(mounted ? { minHeight: h } : { height: h }),
                overflowAnchor: 'none',
              }}
            >
              {mounted && (
                <Page
                  pageNumber={p}
                  width={pageWidth}
                  renderTextLayer
                  renderAnnotationLayer={false}
                  // Suppress react-pdf's default "Loading page…" text — the sized placeholder div
                  // already holds the space, so pages just fade in.
                  loading={null}
                />
              )}
            </div>
          )
        })}
      </Document>
      </div>
      <div style={zoomBarStyle} role="group" aria-label="PDF 縮放">
        <button type="button" onClick={zoomOut} disabled={zoom <= MIN_ZOOM} style={zoomBtnStyle} aria-label="縮小">
          －
        </button>
        <button type="button" onClick={zoomFit} style={zoomLabelStyle} aria-label="符合寬度（重設縮放）">
          {Math.round(zoom * 100)}%
        </button>
        <button type="button" onClick={zoomIn} disabled={zoom >= MAX_ZOOM} style={zoomBtnStyle} aria-label="放大">
          ＋
        </button>
      </div>
    </div>
  )
}

const viewerWrapStyle: CSSProperties = {
  position: 'relative',
  flex: 1,
  minHeight: 0,
  display: 'flex',
  flexDirection: 'column',
}
// Floating zoom toolbar — bottom-center, thumb-reachable, clear of the iPhone home indicator.
const zoomBarStyle: CSSProperties = {
  position: 'absolute',
  bottom: 'calc(env(safe-area-inset-bottom, 0px) + 12px)',
  left: '50%',
  transform: 'translateX(-50%)',
  display: 'flex',
  alignItems: 'center',
  gap: '2px',
  padding: '3px',
  borderRadius: 999,
  background: 'rgba(58, 42, 26, 0.88)',
  boxShadow: '0 2px 10px rgba(0,0,0,0.3)',
  zIndex: 2,
}
const zoomBtnStyle: CSSProperties = {
  cursor: 'pointer',
  border: 'none',
  borderRadius: 999,
  background: 'transparent',
  color: '#f6efe0',
  fontSize: '1.1rem',
  fontWeight: 700,
  lineHeight: 1,
  width: 38,
  height: 38,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
}
const zoomLabelStyle: CSSProperties = {
  cursor: 'pointer',
  border: 'none',
  borderRadius: 999,
  background: 'transparent',
  color: '#f6efe0',
  fontFamily: 'var(--font-legible)',
  fontSize: '0.78rem',
  fontWeight: 700,
  minWidth: 52,
  height: 38,
  padding: '0 4px',
}
const scrollStyle: CSSProperties = {
  flex: 1,
  minHeight: 0,
  overflow: 'auto',
  overflowAnchor: 'none',
  // Keep PDF scroll inside this container (no chaining to the page behind the overlay) +
  // momentum scroll on iOS. Secondary guard now that the body scroll-lock is gone (it bricked
  // one-finger scroll on iOS Safari).
  overscrollBehavior: 'contain',
  WebkitOverflowScrolling: 'touch',
  // Allow 1-finger pan on both axes (a zoomed page can exceed viewport width); pinch-zoom is ours
  // (touch-event tracking + a CSS-transform preview) so it is intentionally NOT in this list.
  touchAction: 'pan-x pan-y',
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
