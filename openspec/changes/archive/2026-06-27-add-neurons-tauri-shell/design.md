## Context

`add-neurons-local-pdf-provenance` + `rework-neurons-pdf-viewer-docked-panel` already shipped the web half of "看原始詳解 PDF":
- A platform adapter `apps/neurons-tw/src/platform/index.ts` with a stable, platform-agnostic surface (`isDesktop` / `getStatus` / `grantFolder` / `openExplanation` / `releaseExplanationUrl` / `hasProvenance`).
- The resolution result is a discriminated union `OpenResult = { ok:true, page, url, file } | { ok:false, reason, message? }` (`platform/types.ts`).
- A platform-agnostic docked viewer (`PdfPanelProvider` / `PdfPanelHost` / `PdfDocumentView`) that renders any `{url,page,file}` with react-pdf v10 + a **bundled** pdfjs worker (`pdfjs-dist 5.4.296`, imported as a Vite asset, not CDN). `releaseExplanationUrl` already revokes `blob:` URLs.
- Pure helpers `loadProvenanceMap` / `lookupEntry` / `findByNfcName` (`platform/provenance.ts`) — no DOM/FSA, fully reusable across platforms.

The existing `neurons-explanation-pdf-provenance` spec **already anticipates** this work: "Phase 1 = File System Access API; a Tauri desktop backend is a deferred Phase 2 behind the same surface … a future desktop (Tauri) backend reuses the same panel by supplying a source URL through the same resolver contract." So this change is purely *additive*: a new platform backend that satisfies the unchanged contract.

Toolchain is ready: `cargo 1.94.1`, `rustc 1.94.1`, `cargo-tauri 2.10.1` (invoke as `cargo tauri`). `apps/neurons-tw/src-tauri/` does not exist yet.

## Goals / Non-Goals

**Goals:**
- Scaffold `apps/neurons-tw/src-tauri/` (Tauri 2) and boot the **existing** neurons web app in a desktop window via `cargo tauri dev` on the owner's Mac.
- Let the player pick their OWN 陽明 PDF folder (read-only) and open a mapped question's source PDF at its page **inside the existing docked panel**, reusing the viewer verbatim — only the resolver (`openExplanation` desktop branch) differs.
- Keep the web build and `med-study-rpg.com/neurons/` deploy byte-for-byte unaffected; the desktop branch only activates under `VITE_TARGET==='desktop'`.

**Non-Goals (deferred to later changes):**
- Offline `questions.json` bundling / offline-playable MVP.
- `medstudyrpg://` custom-protocol system-browser OAuth.
- Code signing / Apple notarize (owner-gated: Apple Dev $99/yr + repo secrets).
- GH Actions CI build matrix (macOS arm64/x64 + Windows) and any distributable installer.
- Windows verification (this spike is macOS-local only).

## Decisions

### D1 — Tauri 2 (not Electron)
Locked 2026-06-26 (memory `neurons-explanation-pdf-provenance-options.md`). Smaller binary, official deep-link/updater/CI tooling, Rust footprint is Claude-Code-able. Electron rejected (bundle size + no benefit here). Toolchain already installed.

### D2 — Boot the existing web app; no second frontend
`tauri.conf.json` points `build.devUrl` at the app's Vite dev server (`http://localhost:5175`) and `build.frontendDist` at `../dist`. `beforeDevCommand` / `beforeBuildCommand` run the existing `pnpm dev` / `pnpm build` with `VITE_TARGET=desktop` inherited from the parent env. One codebase, one build; the desktop window is just another consumer.
- *Alternative considered*: a separate Tauri-specific entry HTML — rejected, defeats the "reuse verbatim" goal.

### D3 — `VITE_TARGET=desktop` + relative `base`
`vite.config.ts` becomes target-aware: when `process.env.VITE_TARGET === 'desktop'`, set `base: './'` (so built `index.html` references assets relatively, served by Tauri from `frontendDist` under `tauri://localhost`); otherwise keep `process.env.VITE_DEPLOY_BASE || '/'` unchanged. `isDesktop()` already reads `import.meta.env.VITE_TARGET === 'desktop'`, which Vite inlines at build/dev when the env var is present. Web builds (no `VITE_TARGET`) are unchanged.

### D4 — Folder grant + file read via a thin, read-only Rust command (not the fs-plugin scope dance)
The desktop backend uses:
- `@tauri-apps/plugin-dialog` (JS) for the folder picker (`open({ directory: true })`).
- **Custom Rust commands** for enumeration + reading, holding the granted folder in Tauri managed state:
  - `set_pdf_folder(path)` — record the user-granted folder root in session state.
  - `list_pdf_files() -> Vec<String>` — names of `*.pdf` directly in the granted folder (for NFC matching).
  - `read_pdf_file(file) -> tauri::ipc::Response` (bytes) — read `<granted>/<file>` **read-only**, guarded: `file` must contain no path separators / `..`, must end in `.pdf`, and the resolved path must stay within the granted folder (canonicalize + prefix check). No write commands exist.

Rationale: Rust `std::fs` is not subject to the webview fs scope, so this sidesteps Tauri v2's dynamic-fs-scope wiring (a known friction point) while being *more* restrictive (exactly one allowed root, read-only, traversal-guarded, .pdf-only). It also matches the proposal's "Rust read-only folder-grant command".
- *Alternative considered*: `tauri-plugin-fs` + `tauri-plugin-persisted-scope` + `convertFileSrc`. Rejected for the spike — more moving parts, scope persistence across restart is fiddly, and `asset:`-protocol fetch adds a CORS/CSP surface. Can revisit if IPC byte transfer proves too heavy.

### D5 — Bytes → `blob:` URL → unchanged viewer
`read_pdf_file` returns raw bytes over IPC; the desktop `openExplanation` wraps them in `new Blob([bytes], { type:'application/pdf' })` → `URL.createObjectURL` → returns `{ ok:true, page, url, file }`. The viewer and `releaseExplanationUrl` (already `blob:`-aware) need **zero** changes. Reuses the shared `loadProvenanceMap` / `lookupEntry` / `findByNfcName` helpers for resolution + CJK filename matching — identical logic to the web path.

### D6 — Folder path persists device-local, never synced
The granted folder **path string** persists in `localStorage` (e.g. `neurons.desktop.pdfFolder.v1`) and is re-registered via `set_pdf_folder` on launch. This mirrors the web `folderStore` principle (device-bound, structurally kept out of cloud sync — D6 of the provenance design). No Dexie table, no schema bump, no R2/Supabase touch.

### D7 — Backend isolation in a dedicated module
The desktop implementation lives in a new `apps/neurons-tw/src/platform/tauriBackend.ts`; `index.ts` branches on `isDesktop()` at each surface function and delegates. Web (FSA) code path is untouched. Tauri JS deps (`@tauri-apps/api`, `@tauri-apps/plugin-dialog`) are imported only from `tauriBackend.ts` so a web bundle doesn't pull them in (dynamic import within the desktop branch if tree-shaking needs help).

### D8 — Re-pin the mapped page until heights settle (WebKit has no scroll anchoring) [found in smoke]
The 5.2 desktop smoke showed mapped questions landing ~1 page early (104-1 醫學一 公衛 Q83→Q78 etc.) on desktop while the web path was correct — same map, same file, same viewer. Root cause: `PdfDocumentView` virtualizes with *estimated* page heights and did a one-shot `scrollIntoView` to the target; when pages above the target reflow from estimate→real height the target drifts. Chrome masks this with scroll anchoring (`overflow-anchor`); **WebKit (the Tauri webview) has no scroll anchoring**, so the drift is visible. Fix: keep re-pinning the target page until it and every active page above it have measured heights (no further reflow can move it), then release scroll to the player. Platform-agnostic and strictly more robust on web too.
- *Alternative considered*: force-render a window of pages around the target before scrolling — heavier change to the virtualization; the re-pin is minimal and addresses any height-estimate mismatch (DPR/aspect), not just scroll anchoring.

## Risks / Trade-offs

- **Large PDF over IPC** (source PDFs up to ~96 MB) → returning bytes via `tauri::ipc::Response` is fine for a local desktop spike (RAM-bound, no network). Mitigation: if it stalls, fall back to D4's alternative (`asset:` protocol streaming). Acceptable for spike scope.
- **fs-scope friction avoided, but custom Rust must be airtight** → path-traversal guard (canonicalize + prefix check + reject separators/`..`, `.pdf`-only, read-only) is the security boundary. Mitigation: unit-test the guard in Rust + keep the allowlist to a single granted root.
- **macOS NFC/NFD CJK filenames** → directory enumeration must NFC-compare (`findByNfcName`), never `getFileHandle(exactName)`. Mitigation: reuse the existing helper; do enumeration in Rust returning raw names, NFC-match on the JS side with the shared helper (or NFC-match in Rust — decide at apply; JS reuse is simpler).
- **WKWebView `#page` unreliable** → never rely on the OS webview PDF viewer; render via the bundled pdfjs worker (already the case). The desktop `base: './'` must keep the worker asset resolvable under `tauri://localhost`. Mitigation: smoke-verify the worker loads (no CDN fetch) in the desktop window.
- **Tauri deps in the web bundle** → guard imports so the web build stays lean (D7). Mitigation: verify web `vite build` output unchanged / no `@tauri-apps/*` in the web bundle.

## Migration Plan

Purely additive, no deploy/runtime migration:
1. Add `src-tauri/` + deps + scripts + `vite.config.ts` target-awareness + `tauriBackend.ts` + `index.ts` branching.
2. `.gitignore` `apps/neurons-tw/src-tauri/target/` + `src-tauri/gen/` (build artifacts).
3. Verify locally with `cargo tauri dev`; verify web `pnpm build` + `pnpm typecheck` + `vitest` still green.
4. **Rollback** = revert the change; nothing ships to prod (no CI/deploy wiring touched). The web app is unaffected throughout.

## Open Questions

- NFC matching home: enumerate-in-Rust + match-in-JS (reuse `findByNfcName`) vs match-in-Rust. Lean JS-reuse; finalize at apply.
- Exact Tauri window chrome (size/title/menu) — cosmetic, decide at apply; default to a single resizable window titled like the app.

## Deferred Decision — auto-download 陽明 PDFs (raised by owner, NOT in this change)

The owner is considering having the desktop app, with user consent, auto-download the 陽明 exam PDFs so a player's folder is never missing files (today the player must manually obtain the right files with the right filenames). This is **explicitly out of scope for this spike** and is recorded here so it isn't lost:

- It **reopens the 2026-06-26 LOCKED decision** ("user-supplied PDF, distribute ZERO copyrighted bytes") and hits the project's stated **biggest gate = PDF licensing, not tech** (memory `neurons-explanation-pdf-provenance-options.md`).
- Licensing risk depends entirely on the **download source**: (a) a project-hosted mirror (R2 / GitHub Releases) = the *project* redistributes copyrighted bytes → needs 陽明小組 permission + breaks the 24h takedown SLA (un-recallable local copies); (b) automating a fetch from 陽明's own public site = the *user* downloads from source, lower risk but fragile (unstable URLs) and the project becomes a download curator.
- This spike's folder-grant + read-only read path is a **prerequisite for any download approach** (whatever fills the folder, reads go through the same backend), so building the spike first is correct regardless.
- **Next step if pursued**: a separate change, gated on resolving the download-source fork and (for option a) a conversation with 陽明小組 first.
