## Context

Tauri shell shipped as `add-neurons-tauri-shell` (archived 2026-06-27, commit `55358f4` on track-neurons) but never merged to a distributable. A footprint audit found it cleanly isolated: `platform/tauriBackend.ts` is the only `@tauri-apps/*` importer, and the content-fingerprint subsystem (`fingerprint.ts` / `fingerprint-runtime.ts` / `fpCache.ts` / `fingerprint-manifest.json`) is consumed **only** by `tauriBackend`. The web PDF path resolves booklets by `entry.driveFileId` (never by fingerprint) and already tree-shakes Tauri out of the bundle via the `VITE_TARGET` `define` constant.

## Goals / Non-Goals

**Goals:** delete every Tauri-only file/config/dep/spec; collapse the shared `DESKTOP` seam to its web survivors; keep the web build + `build:cf` (base `/neurons/`) provably green; no prod-behavior change.

**Non-Goals:** touching the web Drive-autofetch PDF path; changing `booklet-drive-links.json` or `loadBookletLinks()` (web-used); editing the roadmap or the `neurons-explanation-pdf-provenance` spec (verified: no Tauri references); republishing `@study-rpg/core`.

## Decisions

**D1 — Remove the fingerprint subsystem, not just the shell.** Every fingerprint importer is Tauri-only (`tauriBackend` + its deleted test). Once Tauri is gone it is pure orphan, so it goes too (per Surgical-Changes: clean up orphans the removal creates). The web never touched it.

**D2 — Option 2 for the `isDesktop()` / `desktop-app` seam.** `isDesktop()` is always `false` on web. Remove it + its two web call-sites (bug-report `desktop-app` category filter, `platform` auto-context field) so the web UI no longer offers a dead desktop option — BUT leave `NEURONS_BUG_REPORT_CATEGORIES` (with `desktop-app`) in `packages/core` untouched. Rationale: the core enum is the published fork-contract consumed by the standalone 二階 repo; dropping a member is a breaking change needing a CHANGELOG + republish for a purely cosmetic value. Keeping it as a valid-but-unused superset is web-safe and fork-safe. (Option 1 = keep the inert seam; Option 3 = also strip core — rejected as over-reach.)

**D3 — vite `base` safety.** `base: isDesktop ? './' : (VITE_DEPLOY_BASE || '/')` → `base: VITE_DEPLOY_BASE || '/'`. The web arm is unchanged; `build:cf` sets `VITE_DEPLOY_BASE=/neurons/`, so prod base is preserved. Verified by a post-build `grep base` + `@tauri-apps` = 0 in dist.

**D4 — Capability removal via OpenSpec.** `neurons-tauri-shell` is retired as a whole capability (8 requirements → REMOVED delta). Its web-relevant guarantees (official-link map, graceful degrade to official link, zero copyrighted bytes) are already independently spec'd in `neurons-explanation-pdf-provenance`, so removal loses no coverage. The main capability spec file is deleted on archive.

## Risks / Trade-offs

- **[Break the web build by over-deleting a shared file]** → Mitigation: surgical edits keep every web function in `index.ts`/`manifest.ts`; `pnpm -r typecheck` + `test` + `build:cf` gate before commit.
- **[Lockfile drift after dropping 3 deps]** → Mitigation: `pnpm install` re-locks; typecheck/build run against the fresh install.
- **[Orphaned `provenance.ts` `findByNfcName`/`nfc`]** → left in place (small, still unit-tested); harmless, avoids widening the diff.

## Migration Plan

Additive-deletion; no runtime migration (Tauri never in the web bundle). Rollback = `git revert` the change commit. Order: (1) OpenSpec artifacts, (2) delete Tauri-only files, (3) surgical edits, (4) `pnpm install` + verify, (5) archive + commit.
