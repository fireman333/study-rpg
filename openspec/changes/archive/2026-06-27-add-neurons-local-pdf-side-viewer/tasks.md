# Tasks — add-neurons-local-pdf-side-viewer

## 1. Dependency + PDF.js plumbing

- [x] 1.1 Add `pdfjs-dist` (v4) to `apps/neurons-tw/package.json`; `pnpm install`.
- [x] 1.2 Wire the worker as a bundled Vite asset (`import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'` → `GlobalWorkerOptions.workerSrc`); confirm `pnpm --filter @study-rpg/neurons-tw build` emits the worker chunk (grep dist for `pdf.worker`).

## 2. Adapter: resolve instead of open

- [x] 2.1 `platform/types.ts`: extend `OpenResult` ok-variant with `url: string` + `file: string` (keep `page`); failure variants unchanged.
- [x] 2.2 `platform/index.ts`: `openExplanation` returns the resolved `{ ok:true, url, page, file }` (create the blob URL) and **no longer** calls `window.open`. Same gating/permission/NFC-match/error logic otherwise. Guard a future `revokeIfBlob(url)` helper (`url.startsWith('blob:')`).

## 3. Viewer component

- [x] 3.1 New `components/LocalPdfViewer.tsx`: props `{ url, page, file, onClose }`; lazy `import('pdfjs-dist')`; render the mapped page to a DPR-aware canvas at fit-to-width; ◀/▶ + "p N / total" nav clamped to bounds.
- [x] 3.2 Drawer chrome: right panel via `createPortal(document.body)`, `role="dialog"` + `aria-label`, Esc + backdrop + X close, focus in on open / restore on close; loading + error states (error keeps the inline 詳解 reminder).
- [x] 3.3 Revoke the blob URL on unmount/close (guarded for non-blob Tauri URLs).

## 4. Wire the button

- [x] 4.1 `LocalPdfButton.tsx`: on click → `openExplanation` → on `ok` set drawer state `{url,page,file}` (revoke any prior url first) and render `<LocalPdfViewer>`; on failure keep the existing non-blocking note. No change to the 3 render sites (QuizModal / MockExamRunner / QuestionBankPage).

## 5. Verify + ship

- [x] 5.1 `pnpm -r typecheck` + `pnpm --filter @study-rpg/neurons-tw build` clean (worker asset emitted).
- [x] 5.2 Unit: resolver (mocked `FileSystemDirectoryHandle` — NFC match / file-not-found / permission-denied) + viewer mount/render/revoke (pdfjs mocked).
- [x] 5.3 Chrome MCP boot smoke: app loads, no console errors, button renders for a mapped question. (Pick→render end-to-end = owner-manual; note in report.)
- [ ] 5.4 `/opsx:verify` + `/opsx:archive` (sync spec delta) → explicit per-file commit on `track-neurons` → `--no-ff` merge to main → push → watch Deploy CF Pages → prod boot-smoke. (Owner confirms pick→render with their PDFs.)
