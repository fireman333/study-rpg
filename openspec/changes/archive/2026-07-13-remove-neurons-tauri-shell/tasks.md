## 1. Delete Tauri-only files

- [x] 1.1 Delete the Rust/Tauri crate dir `apps/neurons-tw/src-tauri/` (tracked files + untracked `gen/` `target/` `.DS_Store`).
- [x] 1.2 Delete `apps/neurons-tw/src/platform/tauriBackend.ts`.
- [x] 1.3 Delete the fingerprint subsystem: `platform/fingerprint.ts`, `platform/fingerprint-runtime.ts`, `platform/fpCache.ts`, `scripts/build-fingerprint-manifest.ts`.
- [x] 1.4 Delete `packages/content-neurons-tw/provenance/fingerprint-manifest.json` (source) — build copies drop automatically once the copy step is removed (task 3.3).
- [x] 1.5 Delete Tauri-only tests: `apps/neurons-tw/src/__tests__/tauri-resolver.test.ts`, `apps/neurons-tw/src/__tests__/fingerprint.test.ts`.

## 2. Surgical edits — platform seam (keep the web path)

- [x] 2.1 `platform/index.ts`: remove `const DESKTOP = …VITE_TARGET…`; collapse each `if (DESKTOP) …` in `getStatus`/`grantFolder`/`hasProvenance`/`openExplanation`/`openExternalUrl`/`cleanupLegacyPdfStorage` to its web survivor; remove `isDesktop()`.
- [x] 2.2 `platform/manifest.ts`: remove `import type { BookletManifestEntry }`, `FingerprintManifest`, `manifestCache`, `loadFingerprintManifest`, `bookletForFile`, and the `manifestCache` line in `__resetManifestCaches`. KEEP `BookletLink`/`BookletLinkMap`/`linksCache`/`loadBookletLinks` (web-used).
- [x] 2.3 `scripts/build-provenance-map.mjs`: drop `'fingerprint-manifest.json'` from the public-copy loop; keep `'booklet-drive-links.json'`.

## 3. Surgical edits — build config + env + deps

- [x] 3.1 `apps/neurons-tw/package.json`: remove `dev:tauri` + `build:tauri` scripts and the 3 `@tauri-apps/*` deps. Root `package.json`: remove `dev:tauri` + `build:tauri` aliases.
- [x] 3.2 `apps/neurons-tw/vite.config.ts`: remove `isDesktop`; `base` → `process.env.VITE_DEPLOY_BASE || '/'`; `server.strictPort` → drop. `vite-env.d.ts`: remove `VITE_TARGET`.
- [x] 3.3 `.gitignore`: remove the `src-tauri/target/` + `src-tauri/gen/` block.

## 4. Surgical edits — bug-report `desktop-app`/`platform` seam (Option 2, core untouched)

- [x] 4.1 `components/BugReportModal.tsx`: remove `import { isDesktop }`, the `desktop-app`/`platform` labels, and unconditional-filter them out of the category/field lists.
- [x] 4.2 `lib/services/bug-report.ts`: remove `import { isDesktop }`, the `platform?` opt-out, `'platform'` from `AUTO_CONTEXT_FIELDS`, and the `isDesktop()` ctx block.
- [x] 4.3 `__tests__/local-pdf-provenance.test.ts`: remove `isDesktop` import + the `expect(isDesktop()).toBe(false)` assertion; trim the test title.
- [x] 4.4 Leave `packages/core` `NEURONS_BUG_REPORT_CATEGORIES` untouched (`desktop-app` stays a valid-but-unused fork-contract value — no republish).

## 5. Remove the capability spec

- [x] 5.1 Delete `openspec/specs/neurons-tauri-shell/spec.md` (the whole capability; its REMOVED delta rides in this change's `specs/`). Confirm roadmap `openspec/project.md` needs NO edit (verified: no Tauri row).

## 6. Verify web build stays green

- [x] 6.1 `pnpm install` (re-lock after dropping 3 deps).
- [x] 6.2 `pnpm -r typecheck` clean; `pnpm --filter @study-rpg/neurons-tw test` green (expect ~137 files: −tauri-resolver −fingerprint).
- [x] 6.3 `pnpm run build:cf` succeeds; confirm base `/neurons/` preserved + `grep -c @tauri-apps dist/**/*.js` = 0.
- [x] 6.4 Diff hygiene: only Tauri/fingerprint files deleted + the listed surgical edits; no web behavior file collaterally changed.

## 7. Wrap

- [x] 7.1 `openspec validate` + `/opsx:archive` (removes the capability from main specs).
- [x] 7.2 Commit to track-neurons; report. (Merge→main + deploy = separate gate; no prod-behavior change since Tauri was never in the web bundle.)
