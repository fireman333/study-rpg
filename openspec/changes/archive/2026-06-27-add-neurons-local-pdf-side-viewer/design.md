# Design — side-panel PDF.js viewer

## Decision 1 — PDF.js via `pdfjs-dist` v4 (ESM), worker bundled as a Vite asset
Use `pdfjs-dist` (the canonical renderer; no-wheels — building a PDF renderer is absurd). v4 is ESM-native and Vite-friendly. The worker is loaded as a hashed asset, not from a CDN (offline + CF-Pages-safe + Tauri-safe):
```ts
import * as pdfjs from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
pdfjs.GlobalWorkerOptions.workerSrc = workerUrl
```
Lazy-load the library inside the viewer (`import()` on first open) so the ~1 MB chunk is code-split and never in the main bundle. CMap/standard fonts: the 陽明 PDFs are mostly raster/embedded-font; enable `cMapUrl`/`standardFontDataUrl` from bundled assets only if a test PDF shows missing glyphs (defer unless needed).

## Decision 2 — Adapter *resolves*, viewer *renders* (the Tauri seam)
`platform/index.ts:openExplanation` stops calling `window.open`. It does the platform-specific work — FSA folder → enumerate → NFC filename match → `URL.createObjectURL(file)` — and returns `{ ok: true, url, page, file }`. The viewer is pure rendering and platform-agnostic. Phase 2 Tauri swaps only the resolver (returns a `tauri://`/asset URL or bytes for the same `{url, page}` contract); the `LocalPdfViewer` component is reused unchanged. This is the whole point of doing the viewer first.

`OpenResult` ok-variant gains `url: string` and `file: string` (the page field already exists). Failure variants are untouched → `LocalPdfButton`'s existing error mapping still compiles.

## Decision 3 — `LocalPdfButton` owns the drawer (local state + portal)
The button already exists at 3 sites; lifting drawer state to a global store/context is over-engineering for "one PDF open at a time per click". The button holds `viewer: {url,page,file} | null` and renders `<LocalPdfViewer>` through a `createPortal(document.body)` so the drawer escapes the QuizModal/MockExam stacking context. Only one viewer per button instance; opening a new question closes the prior (revoke old URL first).

## Decision 4 — Blob URL lifecycle
`URL.createObjectURL` leaks until revoked. The viewer revokes its `url` on unmount/close, and the button revokes any prior url before opening a new one. (Tauri later returns a non-blob URL → revoke is a no-op guarded by `url.startsWith('blob:')`.)

## Decision 5 — Rendering: one page on a canvas, fit-to-width, prev/next
Render the current page to a `<canvas>` at `scale = drawerWidth / viewport.width` (devicePixelRatio-aware for crisp CJK). Open on the mapped `page`; ◀ / ▶ + "p N / total" nav; clamp at bounds. No continuous scroll / no text layer (not needed — this is a "see the original layout" viewer, not a reader). Re-render on page change + on drawer resize (debounced).

## Decision 6 — Degradation, a11y, RWD
- Unsupported platform / unmapped → button stays hidden (unchanged; FSA gating already limits to Chromium desktop).
- Resolve failure → existing non-blocking note under the button (unchanged); drawer never opens.
- PDF load/render error inside the drawer → in-drawer error message + reminder that the inline 詳解 remains (No Silent Errors).
- Drawer: `role="dialog"`, `aria-label`, focus moves to it on open, Esc + backdrop close, focus restored to the button on close.
- Width: fixed right drawer (e.g. `min(560px, 92vw)`); on a narrow viewport it becomes near-full-width. (Moot in practice today — FSA is desktop-only — but keeps the component Tauri-mobile-ready.)

## Verification
- `pnpm -r typecheck` + `pnpm --filter @study-rpg/neurons-tw build` clean (worker asset emits).
- Unit: `openExplanation` resolver with a mocked `FileSystemDirectoryHandle` (NFC match, file-not-found, permission-denied) — extends existing platform tests if present.
- Unit/jsdom: `LocalPdfViewer` mounts, calls pdfjs with the url, renders the mapped page, revokes url on close (pdfjs mocked).
- Chrome MCP boot smoke: app loads, no console errors, the 看原始詳解 PDF button still renders for a mapped question. **End-to-end pick→render is owner-manual** — `showDirectoryPicker` needs a native dialog + user gesture Chrome MCP can't complete, and requires the owner's actual 陽明 PDFs. Flag clearly in the ship report.

## Alternatives considered
- **Keep new-tab, just for web** → dead-ends Tauri (WKWebView `#page` unreliable) and wastes this de-risking opportunity. Rejected.
- **`<iframe src="blob#page">` browser viewer in a drawer** (memory option A) → still depends on the browser PDF viewer (not Tauri-portable) and can't be controlled (no programmatic page nav). Rejected in favour of PDF.js (memory option B, the planned Tauri viewer).
- **Global drawer context/store** → unnecessary indirection for single-open-at-a-time. Rejected (Decision 3).
