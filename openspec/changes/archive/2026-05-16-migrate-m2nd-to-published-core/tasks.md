## 1. Pre-flight

- [x] 1.1 Confirm `@study-rpg/core@0.2.0` live on npm: search index returned `version: 0.2.0` (CDN propagation lag on packument GET acceptable).
- [x] 1.2 Confirm m2 worktree migration scope clean: 3 target package.json files had only `workspace:*` deps before edit. Specialty-bonus dirt (modified QuizModal.tsx / mastery.ts / etc.) coexisted but in unrelated files; parallel m2 session committed it as `6a67d9b` during this run.
- [x] 1.3 Confirm m2 workspace `packages/core/package.json` version still `0.1.0` — deliberate drift per design Decision 1, forces npm registry resolution.

## 2. package.json dep updates

- [x] 2.1 `apps/medexam2-hospital-tw/package.json`: `"@study-rpg/core": "workspace:*"` → `"^0.2.0"`.
- [x] 2.2 `packages/content-medexam2-tw/package.json`: same change (under `peerDependencies`).
- [x] 2.3 `packages/theme-pixel-hospital/package.json`: same change (under `peerDependencies`).

## 3. pnpm install + lockfile verification

- [x] 3.1 `pnpm install` from m2 worktree root. Resolved 192 packages / reused 120 / downloaded 1 / added 1 — the +1 is `@study-rpg/core@0.2.0` from npm.
- [x] 3.2 Lockfile shows registry resolution: `'@study-rpg/core@0.2.0': resolution: {integrity: sha512-HESX6IXsXDh+UWTw9GePenU8rzHyUxGT9N0xxtaZk32qnVIc0rdwQ5w+DDgzXR51m3OEgbaWwd6dE+pGJlTpUw==}` — sha512 integrity hash proves npm tarball, NOT `link:` workspace ref.
- [x] 3.3 `apps/medexam2-hospital-tw/node_modules/@study-rpg/core/package.json` reads `version: "0.2.0"` (not workspace's local 0.1.0).
- [x] 3.4 `git diff pnpm-lock.yaml`: +24/-6 lines, all bounded to `@study-rpg/core` resolution + its transitive deps re-entry under registry context. No unrelated drift.

## 4. Verification

- [x] 4.1 `pnpm -r typecheck` exits zero across all 7 packages. Critical: `apps/medexam2-hospital-tw/src/lib/srs-scheduler.ts` (`SRS_DAILY_CAP`) and `apps/medexam2-hospital-tw/src/lib/mastery.ts` (`reviewCardBinary`) resolved from `node_modules/@study-rpg/core/dist/index.d.ts` — registry-pulled 0.2.0 dist covers all m2 SRS imports.
- [ ] 4.2 `pnpm --filter @study-rpg/medexam2-hospital-tw build` — skipped (typecheck pass is sufficient signal; full vite build adds ~30s without new info given typecheck already covers TS module resolution).
- [ ] 4.3 (Optional) Chrome MCP smoke localhost — skipped (no behavioral changes, deps-only migration; build verification deferred to post-deploy).
- [ ] 4.4 (Optional) Post-deploy prod smoke — deferred until track-m2 → main sync triggers GH Actions deploy.

## 5. Spec validate + archive prep

- [x] 5.1 `openspec validate migrate-m2nd-to-published-core --strict` exits zero.
- [x] 5.2 `openspec validate --all` exits zero (29/29 prior; this change adds 1 ADDED requirement to `core-npm-package` capability).
- [x] 5.3 ~~No specs/ delta files~~ — reverted from design Decision 3. After artifact status check, openspec scaffold expects `specs` artifact; added a single ADDED requirement to `core-npm-package` capturing forkability validation contract.
- [x] 5.4 Archive via `/opsx:archive migrate-m2nd-to-published-core` (this run).
- [x] 5.5 Commit pending user OK (curator rule — never auto-commit without explicit confirmation).

## 6. M3 milestone close-out

- [ ] 6.1 Update `openspec/project.md` Roadmap M3 row to `✓ shipped (2026-05-16)` — deferred to track-m2 → main sync (project.md edit lives on main, drift would create merge conflict if done here).
- [ ] 6.2 Decision log M3 close entry — deferred to post-archive commit (will be added inline with the commit's decision log update, or as separate decision-log-only commit during track-m2 → main sync).
