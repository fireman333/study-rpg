# Tasks — rework-neurons-pdf-viewer-docked-panel

## 1. Rendering library (react-pdf, with fallback)
- [x] 1.1 Add `react-pdf`; align with pdfjs-dist (let react-pdf own pdfjs, or pin to its major). Wire the worker as a bundled Vite `?url` asset. Build emits worker; pdfjs stays dynamically imported / code-split. (Fallback per design D3 if alignment fails.)

## 2. Global docked panel
- [x] 2.1 `features/localPdf/PdfPanelProvider.tsx`: context `{open,url,page,file,width}` + `openPdf/closePdf/setWidth`; writes `--pdf-panel-width` on `:root` (width when open else `0px`); loads/persists width `localStorage['neurons.pdfPanel.width.v1']`.
- [x] 2.2 `features/localPdf/PdfPanelHost.tsx`: mounted once near app root; renders the docked panel when open (header with filename + ✕, left-edge drag-resize handle, NO backdrop). Revokes the blob url on close (`releaseExplanationUrl`).
- [x] 2.3 Wrap the app in `<PdfPanelProvider>` (main.tsx/App.tsx) and mount `<PdfPanelHost/>`.

## 3. Viewer = render-only, multi-page, selectable, scrollable
- [x] 3.1 Rewrite `LocalPdfViewer.tsx` as render-only: react-pdf `<Document>` + a scroll container of page slots; `<Page renderTextLayer renderAnnotationLayer={false}>` for visible±buffer via IntersectionObserver (`rootMargin:1200px`); measured-height placeholders for far pages; scroll the initial `page` into view on open. DPR-crisp; fit panel width.

## 4. Resize (#2)
- [x] 4.1 Left-edge handle: pointer drag → clamp `[360, min(900, innerWidth*0.7)]` → live CSS var → persist on pointerup.

## 5. Push layout (#3)
- [x] 5.1 App shell (`App.tsx` `pageStyle`/`<main>`): `width: calc(100vw - var(--pdf-panel-width))` (or paddingRight) so normal-flow pages reflow.
- [x] 5.2 `QuizModal` backdrop + `MockExamRunner` full-screen container: `inset:0` → `right: var(--pdf-panel-width)` so they shrink beside the panel.
- [x] 5.3 Confirm `--pdf-panel-width` defaults to `0px` globally (define on `:root` in index.css) so closed-state layout is byte-identical to today.

## 6. Wire buttons + default-collapse (#5)
- [x] 6.1 `useLocalPdfAvailable(questionId)` hook (`isLocalPdfSupported() && hasProvenance(id)`).
- [x] 6.2 `LocalPdfButton`: render iff available; onClick resolve via `openExplanation` → `openPdf({url,page,file})` (no local drawer state anymore).
- [x] 6.3 The 3 sites (QuizModal:726 / MockExamRunner:261 / QuestionBankPage:597): `<details open>` → `<details open={!available}>` using the hook.

## 7. Verify + ship
- [x] 7.1 `pnpm -r typecheck` + `pnpm --filter @study-rpg/neurons-tw build` clean (worker emitted; react-pdf chunk code-split).
- [x] 7.2 Unit: `useLocalPdfAvailable` (supported+mapped → true; unsupported/unmapped → false); openPdf/closePdf provider state + CSS-var write; releaseExplanationUrl on close.
- [x] 7.3 Chrome MCP (localhost): closed-state unchanged; open from bank → bank reflows; open from QuizModal → modal shrinks beside panel; text selectable; drag-resize persists; scroll spans pages; inline 詳解 collapsed when button present, open when not. No console errors.
- [ ] 7.4 `/opsx:archive` (sync delta) → explicit per-file commit on `track-neurons` → `--no-ff` merge main → push → watch Deploy CF Pages → prod boot-smoke (panel opens, assets 200). pick→render = owner-manual. **Do NOT merge to main until 7.1–7.3 all green.**
