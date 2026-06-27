## Why

The side-panel PDF viewer (`add-neurons-local-pdf-side-viewer`) shipped and provenance is correct, but owner dogfooding surfaced 4 UX gaps + 1 request (Codex consult 2026-06-27 informed the architecture):

1. **No text selection** — the viewer rendered a canvas only (no PDF.js text layer).
2. **Not resizable** — fixed `min(560px,94vw)` width.
3. **Overlays the page** — it's a modal overlay with a backdrop; the owner wants the underlying app to reflow into the remaining width (a true docked side panel), including when opened from the full-screen QuizModal.
4. **No continuous scroll** — one page at a time; can't scroll across pages of a 200+ page PDF.
5. **Inline 詳解 should default collapsed when the PDF action is available** — when a question has the「看原始詳解 PDF」action, the original-layout PDF is the better source, so the inline text 詳解 should start collapsed (still expandable).

## What Changes

Reframe the per-screen viewer into a **global docked document panel** (Codex's recommendation — also makes the future Tauri reuse cleaner: platform code resolves a URL, the panel renders + docks).

- **Adopt `react-pdf`** (wraps pdfjs-dist) for the rendered pages → built-in **text layer (selectable text)** + ergonomic multi-page `<Page>`. (Fallback if react-pdf can't align with the installed pdfjs-dist v6: keep the hand-rolled pdfjs renderer and add a `TextLayer` + multi-page list manually — same external behavior.)
- **Continuous scroll** via a scroll container with **IntersectionObserver lazy page rendering** (mount `<Page renderTextLayer>` only for visible ± buffer pages of a 200+ page doc; far pages become measured-height placeholders). No virtualization library.
- **`PdfPanelProvider` + single `PdfPanelHost`** near app root: owns `{open, url, page, file, width}` + `openPdf()/closePdf()/setWidth()`; writes a `--pdf-panel-width` CSS variable on `:root` (panel width when open, `0px` when closed); persists width to `localStorage`. The 3 button sites just call `openPdf(...)`; the panel is **non-modal** (no backdrop).
- **Push layout (#3)** via the `--pdf-panel-width` variable: the app shell (`App.tsx` `<main>`) and the two full-screen button-host modals (`QuizModal` backdrop, `MockExamRunner`) read `right: var(--pdf-panel-width)` / width `calc(... - var(--pdf-panel-width))` so content reflows beside the panel. (`margin-right` on `#root` cannot reflow a `position:fixed; inset:0` modal — the variable on each fixed surface is the fix.)
- **Resizable (#2)** via a left-edge pointer-drag handle (`setPointerCapture`, width = `innerWidth − clientX`, clamp `[360, min(900, 70vw)]`), persisted in `localStorage`.
- **Default-collapse inline 詳解 (#5)**: a shared `useLocalPdfAvailable(questionId)` hook (= `isLocalPdfSupported() && hasProvenance(id)`) drives both whether `LocalPdfButton` renders AND `<details open={!available}>` at all 3 sites.

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `neurons-explanation-pdf-provenance`: the open-the-PDF behaviour is upgraded from "in-app viewer with page nav" to "**resizable docked side panel** with selectable text, continuous cross-page scrolling, and underlying-content reflow (non-modal)"; and a new requirement makes the **inline explanation default to collapsed whenever the local-PDF action is available**.

## Impact

- **New dep**: `react-pdf` (peers on pdfjs-dist, already present; align versions at install). pdfjs still dynamically imported / code-split behind the open-PDF path.
- **New**: `PdfPanelProvider` + `PdfPanelHost` (+ the docked panel content), `useLocalPdfAvailable` hook. **Modified**: `LocalPdfViewer.tsx` → render-only multi-page; `LocalPdfButton.tsx` → calls `openPdf`; `App.tsx` shell width var; `QuizModal.tsx` + `MockExamRunner.tsx` fixed-surface `right: var(--pdf-panel-width)`; `<details open>` → conditional at the 3 sites (QuizModal/MockExamRunner/QuestionBankPage).
- **Layout risk**: touching the two full-screen modals' fixed positioning — must Chrome-MCP verify each modal does not break (open with panel closed = unchanged; open with panel docked = reflows beside it). FSA gates the panel to Chromium desktop, so push-layout is desktop-only.
- **No** change to provenance map / folder grant / sync / inline 詳解 content. Build artifact unchanged.
- **Verification**: typecheck/build/unit + Chrome MCP (text selectable, drag-resize, panel pushes bank page AND quiz modal, continuous scroll across pages, inline 詳解 collapsed when PDF available). pick→render with real PDFs = owner-manual.
