## Why

The Tauri desktop shell (`add-neurons-tauri-shell`, 2026-06-27) was scaffolded and owner-smoked but **never merged to a distributable / never deployed** — the web app on `med-study-rpg.com/neurons/` is the only shipped target, and the web「看原始詳解 PDF」 Drive-autofetch flow fully covers PDF viewing on desktop + mobile. The owner has decided to drop the desktop product, so the Tauri shell + its Tauri-only support code (the content-fingerprint local-folder resolver) are now dead weight. Removing them shrinks the surface, deletes an unused Rust crate + 3 npm deps, and drops a capability spec that no longer reflects the product.

## What Changes

- **BREAKING (dev-only, no shipped target):** remove the Tauri desktop shell — delete `apps/neurons-tw/src-tauri/` (Rust crate + config + icons), `platform/tauriBackend.ts`, and the `dev:tauri` / `build:tauri` scripts + `@tauri-apps/*` deps.
- **Remove the Tauri-only fingerprint subsystem** (orphaned once Tauri is gone; the web resolves booklets by `driveFileId`, never by content fingerprint): `platform/fingerprint.ts`, `fingerprint-runtime.ts`, `fpCache.ts`, `scripts/build-fingerprint-manifest.ts`, `provenance/fingerprint-manifest.json`, and the fingerprint half of `platform/manifest.ts` + the manifest copy step in `build-provenance-map.mjs`.
- **Collapse the `DESKTOP` seam in `platform/index.ts`** to its web survivors (every `if (DESKTOP) …` drops to the web path) and remove the always-false `isDesktop()` seam from the web UI (bug-report `desktop-app` category + `platform` auto-context field), **without touching the core fork-contract enum** (`packages/core` `NEURONS_BUG_REPORT_CATEGORIES` keeps `desktop-app` as a valid-but-unused value → no npm republish, no 二階 break).
- Remove the `VITE_TARGET=desktop` branch from `vite.config.ts` (web `base = VITE_DEPLOY_BASE || '/'` unchanged) + the `VITE_TARGET` env type.
- Delete the Tauri-only tests (`tauri-resolver.test.ts`, `fingerprint.test.ts`) + trim the desktop assertion from `local-pdf-provenance.test.ts`.

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `neurons-tauri-shell`: **REMOVED** — the entire capability is retired. Its web-relevant concerns (official-link map, graceful degrade to the official Drive link, zero-copyrighted-bytes distribution) are already owned by `neurons-explanation-pdf-provenance`, so no coverage is lost.

## Impact

- **Deleted code**: `apps/neurons-tw/src-tauri/` (whole crate); `platform/{tauriBackend,fingerprint,fingerprint-runtime,fpCache}.ts`; `scripts/build-fingerprint-manifest.ts`; `provenance/fingerprint-manifest.json`; tests `tauri-resolver.test.ts` + `fingerprint.test.ts`; spec `openspec/specs/neurons-tauri-shell/spec.md`.
- **Surgical edits**: `apps/neurons-tw/package.json` (scripts + 3 deps) + root `package.json`; `vite.config.ts`; `vite-env.d.ts`; `platform/index.ts`; `platform/manifest.ts`; `scripts/build-provenance-map.mjs`; `.gitignore`; `components/BugReportModal.tsx`; `lib/services/bug-report.ts`; `__tests__/local-pdf-provenance.test.ts`.
- **Unchanged / preserved**: the web Drive-autofetch PDF path (`driveFetch.ts`, `byteStore`, docked viewer), `booklet-drive-links.json` + `manifest.ts` `loadBookletLinks()` (web offline-all download), `provenance.ts`, the whole `neurons-explanation-pdf-provenance` capability, roadmap (`openspec/project.md`), and the core package. No runtime/prod behavior change (Tauri was never in the web bundle — it tree-shook out via `VITE_TARGET`).
- **Gates**: `pnpm install` (lockfile), `pnpm -r typecheck`, `pnpm --filter @study-rpg/neurons-tw test`, `pnpm run build:cf` (base `/neurons/` preserved), `grep -c @tauri-apps dist` = 0. Deploy to prod is a separate 對外發布 gate (this change has no prod-behavior effect).
