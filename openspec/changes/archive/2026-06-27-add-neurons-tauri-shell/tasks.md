## 1. Scaffold Tauri 2 shell

- [x] 1.1 Add `apps/neurons-tw/src-tauri/` (Tauri 2): `Cargo.toml` (`tauri` 2.x + `tauri-plugin-dialog`), `build.rs`, `src/main.rs`, `tauri.conf.json`, `capabilities/` — authored to match this app
- [x] 1.2 Configure `tauri.conf.json`: `build.devUrl = http://localhost:5175`, `build.frontendDist = ../dist`, `build.beforeDevCommand = pnpm dev`, `build.beforeBuildCommand = pnpm build`, single resizable window (`label: main`, title ≈ app name)
- [x] 1.3 Add `.gitignore` entries `apps/neurons-tw/src-tauri/target/` + `apps/neurons-tw/src-tauri/gen/`
- [x] 1.4 Add scripts: app `package.json` `dev:tauri` (`VITE_TARGET=desktop cargo tauri dev`) + `build:tauri`; root `package.json` convenience aliases

## 2. Build-target awareness (no web regression)

- [x] 2.1 Make `apps/neurons-tw/vite.config.ts` target-aware: when `process.env.VITE_TARGET === 'desktop'` set `base: './'` (+ `server.strictPort`); else keep `process.env.VITE_DEPLOY_BASE || '/'` unchanged
- [x] 2.2 `isDesktop()` (`platform/index.ts`) reads `import.meta.env.VITE_TARGET === 'desktop'` via a statically-replaced `DESKTOP` const; `false` in web builds (no behavior change)

## 3. Rust read-only folder-grant + file read

- [x] 3.1 Tauri managed state `GrantedFolder` + commands `set_pdf_folder(path)`, `list_pdf_files() -> Vec<String>` (`*.pdf` directly in the root), `read_pdf_file(file) -> ipc::Response` (bytes)
- [x] 3.2 Harden `read_pdf_file` via `safe_path`: reject separators / `..`, require `.pdf`, canonicalize + assert within the granted root; read-only (`std::fs::read`); no write/delete command exists
- [x] 3.3 Register `tauri-plugin-dialog` + the custom commands in the builder; grant `core:default` + `dialog:default` in `capabilities/default.json`
- [x] 3.4 Rust unit test for the path-traversal guard (separator/`..`/non-pdf rejected, valid `.pdf` accepted) — `cargo test` (4/4 pass; bin compiles, config wiring valid)

## 4. Desktop platform backend (TS)

- [x] 4.1 `apps/neurons-tw/src/platform/tauriBackend.ts` implements `getStatus` / `grantFolder` / `openExplanation`, importing `@tauri-apps/api` + `@tauri-apps/plugin-dialog` only here
- [x] 4.2 `grantFolder`: native folder picker (`@tauri-apps/plugin-dialog` `open({directory:true})`) → `set_pdf_folder` → persist path in `localStorage` (`neurons.desktop.pdfFolder.v1`, device-local, never synced); re-register on launch
- [x] 4.3 `openExplanation`: reuse `loadProvenanceMap`/`lookupEntry`, `list_pdf_files` + `findByNfcName` for CJK-safe matching, `read_pdf_file` → `Blob` → `URL.createObjectURL` → `{ ok:true, page, url, file }`; failures → `{ ok:false, reason, message? }` (No Silent Errors)
- [x] 4.4 Branch `platform/index.ts` on `DESKTOP` (gated dynamic `import('./tauriBackend')`) at `getStatus`/`grantFolder`/`openExplanation`; `isLocalPdfSupported()` → true on desktop; web (FSA) path untouched
- [x] 4.5 `releaseExplanationUrl` already revokes `blob:` URLs (no change); the docked viewer (`PdfPanelHost`/`PdfDocumentView`) renders the desktop `OpenResult` unchanged

## 5. Verify locally

- [x] 5.1 `cargo tauri dev` (`VITE_TARGET=desktop`) boots the app in a native window; home/quiz/explanation render — **OWNER-CONFIRMED**
- [x] 5.2 End-to-end: grant the owner's 陽明 PDF folder → open a mapped question's source PDF → renders in the docked panel at the mapped page (selectable text + continuous scroll); pdfjs worker loads from the local bundled asset (no CDN) — **OWNER-CONFIRMED (page-landing fixed via §6, re-smoked OK)**
- [x] 5.3 Negative paths: unmapped question (action hidden), file-not-found (non-blocking note + inline 詳解 stays), restart re-registers the folder without re-prompting — **OWNER-CONFIRMED**
- [x] 5.4 No web regression: `typecheck` + `vitest` (698) green; web `pnpm build` base unchanged (`/`) and bundle free of `@tauri-apps/*` (0 hits); pdfjs worker bundled as a local asset

## 6. Fix WebKit page-landing drift (found in 5.2 smoke)

- [x] 6.1 `PdfDocumentView` re-pins the mapped page until the target + active pages above it have measured heights, instead of a one-shot `scrollIntoView`. Root cause: the viewer virtualizes with estimated page heights; the estimate→real reflow drifts the target, which Chrome masks via scroll anchoring but WebKit (Tauri) does not. Platform-agnostic, strictly more robust for web too. typecheck + 698 vitest green.
- [x] 6.2 Re-smoke on desktop: mapped questions land on the correct page (e.g. 104-1 醫學一 公衛 Q83–Q86) — **OWNER-CONFIRMED**
