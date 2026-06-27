# Design — docked PDF panel (viewer v2)

Architecture from a Codex consult (2026-06-27, gpt-5.5). Captured here so it survives compaction.

## D1 — Global docked panel, not a per-screen viewer
`PdfPanelProvider` (React context) owns `{ open, url, page, file, width }` + `openPdf({url,page,file})` / `closePdf()` / `setWidth(px)`. A single `<PdfPanelHost/>` mounted near the app root renders the panel when `open`. The 3 button sites only call `openPdf(...)`. Benefits: one place owns docking/width/persistence; Tauri reuse stays clean (platform resolves url → openPdf renders).

## D2 — Push layout via a `--pdf-panel-width` CSS variable
Provider writes `document.documentElement.style.setProperty('--pdf-panel-width', open ? width+'px' : '0px')`.
- App shell `<main style={pageStyle}>` (App.tsx): `width: calc(100vw - var(--pdf-panel-width))` (or `paddingRight`), so normal-flow pages (incl. the question bank) reflow.
- Full-screen fixed surfaces that host the button — `QuizModal` backdrop + `MockExamRunner` container — change `inset:0` → `top/left/bottom:0; right: var(--pdf-panel-width)` so they shrink beside the panel (a plain `margin-right` on `#root` does NOT reflow a `position:fixed` surface — this is the crux of #3).
- The panel itself: `position:fixed; right:0; width: var(--pdf-panel-width); height:100vh`. **No backdrop** (non-modal — you can answer + read PDF together).
- Other transient centered dialogs (ShareCard/BugReport/…) are left as overlays (rare to coexist; out of scope).

## D3 — react-pdf for rendering (with fallback)
Use `react-pdf` `<Document>` + `<Page renderTextLayer renderAnnotationLayer={false}>` → selectable text for free. Configure the worker the same bundled-asset way. **Risk**: react-pdf may not yet support pdfjs-dist v6 — at install, either let react-pdf pull its own pdfjs (drop our direct dep) or pin pdfjs to react-pdf's expected major. **Fallback** if alignment is painful: keep the hand-rolled pdfjs v6 renderer and add a `new pdfjs.TextLayer({...}).render()` over each page canvas — same external behavior, no new dep.

## D4 — Continuous scroll, IntersectionObserver lazy render
Scroll container with N page slots (N = numPages). `IntersectionObserver` (`rootMargin: '1200px 0px'`) mounts the real `<Page>` for visible ± buffer; far slots are placeholders with the last measured height (`pageHeights` map keyed by page). Open scrolls the target page into view. Avoids react-window (variable page heights) and rendering 200+ pages at once.

## D5 — Resize handle
6–10px handle on the panel's left edge. `pointerdown` → `setPointerCapture`; `pointermove` → `width = clamp(innerWidth - clientX, 360, min(900, innerWidth*0.7))` → live-set the CSS var; `pointerup` → persist `localStorage['neurons.pdfPanel.width.v1']`. Provider loads it on init. Global (not per-PDF).

## D6 — Default-collapse inline 詳解 when PDF available
Shared hook `useLocalPdfAvailable(questionId): boolean` = `isLocalPdfSupported() && await hasProvenance(id)` (map is cached → cheap to call twice). `LocalPdfButton` renders iff available; the 3 sites set `<details open={!available}>`. So: PDF action present → inline 詳解 starts collapsed (still expandable); no PDF action → inline stays open (it's the only source).

## Verification focus (layout risk)
- Panel closed → bank page + QuizModal + MockExamRunner pixel-unchanged from today.
- Panel open from bank → bank list reflows narrower, no horizontal scrollbar, panel docked right.
- Panel open from inside QuizModal → quiz modal shrinks to the left of the panel, both usable.
- Text selectable; drag-resize works + persists; scroll spans pages; inline 詳解 collapsed when button present.
