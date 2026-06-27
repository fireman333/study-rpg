## Why

The local-PDF provenance feature (`add-neurons-local-pdf-provenance`) currently opens a player's source PDF in a **new browser tab** via `window.open(blobURL#page=N)`. That works but is jarring (leaves the app), can't be styled, and relies on the browser's built-in PDF viewer honouring the `#page` fragment — which is exactly the behaviour that is **unreliable in a Tauri WKWebView** (the locked Phase 2 desktop plan, see memory `neurons-explanation-pdf-provenance-options`). So the new-tab approach is a dead end for the desktop app and a sub-par web UX today.

Replacing it with an **in-app side-panel PDF.js viewer** ships a better web experience now AND builds the single hardest shared piece of Tauri Phase 2 ahead of any Rust toolchain: the platform adapter already isolates source *resolution* (web FSA today, Tauri/Rust later) from *rendering*; a PDF.js viewer is the rendering half and is platform-agnostic, so Phase 2 reuses it verbatim. This is the owner-chosen first bite of Tauri Phase 2 (de-risk the viewer with zero Rust).

## What Changes

- **Add `pdfjs-dist`** (v4, ESM) to `apps/neurons-tw`, with the worker bundled as a Vite asset (`?url`) so it ships on CF Pages.
- **`platform/index.ts`: `openExplanation` no longer opens a tab.** It resolves the source (FSA folder → NFC filename match → blob URL) and returns `{ ok: true, url, page, file }` so a React viewer can render it. All existing failure reasons (`unsupported`/`unmapped`/`no-folder`/`file-not-found`/`permission-denied`/`error`) are unchanged — the Tauri seam is preserved (Phase 2 fills the same resolver to return a Tauri-served URL).
- **New `LocalPdfViewer.tsx`**: a right-side drawer that renders the resolved PDF with PDF.js, opening on the mapped page, with page nav (prev/next + page N/total), close (X / Esc / backdrop), and loading/error states. Revokes the blob URL on close (no leak). This is the shared viewer Tauri Phase 2 will reuse.
- **`LocalPdfButton.tsx`**: on click, resolve → open the drawer with `{url, page, file}` instead of a tab. Self-gating + non-blocking error notes unchanged. (Rendered in QuizModal / MockExamRunner / QuestionBankPage — no change at those 3 sites; the button owns the drawer.)

Out of scope: the Tauri shell / Rust backend / signing / CI (later Phase 2 increments); any change to the provenance map, folder-grant persistence, or inline 詳解 fallback.

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `neurons-explanation-pdf-provenance`: the "open the local source PDF at the mapped page" behaviour is refined from "open in a new tab" to "render in an in-app PDF viewer opened at the mapped page", and the viewer is declared the platform-agnostic rendering surface shared with the future Tauri backend.

## Impact

- **New dep**: `pdfjs-dist` (~no runtime cost unless the viewer opens — worker + page render are lazy; library chunk code-split).
- **Modified**: `apps/neurons-tw/src/platform/index.ts` (resolve, not open), `apps/neurons-tw/src/platform/types.ts` (`OpenResult.ok` adds `url`/`file`), `apps/neurons-tw/src/components/LocalPdfButton.tsx` (open drawer). **New**: `apps/neurons-tw/src/components/LocalPdfViewer.tsx`.
- **No** change to the provenance map (gitignored build artifact), Dexie/folder-handle store, R2 sync, or inline 詳解. FSA gating already limits the button to Chromium desktop, so the viewer is effectively desktop-web today (and the exact component Tauri reuses).
- **Verification note**: the FSA folder grant uses a native picker + user gesture that Chrome MCP cannot drive end-to-end; full pick→render verification is owner-manual with their PDFs. Automatable: typecheck, build, the resolver logic (mocked handle), PDF.js rendering of a known blob at a page, and a boot smoke that the button still renders for a mapped question with a clean console.
