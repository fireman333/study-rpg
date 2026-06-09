## 1. Lift the helpers into core

- [x] 1.1 Create `packages/core/src/lib/continuation.ts` with `isContinuationQuestion` + `resolvePrecedingChain`, ported verbatim from the Phase 1 source (`study-rpg-2nd` worktree `claude/exciting-faraday-979df7`), changing only the `Question` import to relative `../types`. Keep `CONTINUATION_PREFIX='承上題'`, `MAX_CHAIN_STEPS=20`, `ID_PATTERN`, the same-subject-prefix walk, and the JSDoc.
- [x] 1.2 Add `export { isContinuationQuestion, resolvePrecedingChain } from './lib/continuation'` to `packages/core/src/index.ts` (place near the other `./lib/*` re-exports).

## 2. Test infrastructure + ported cases

- [x] 2.1 Add `vitest` to `packages/core/package.json` `devDependencies` and a `"test": "vitest run"` script. Run `pnpm install` so the workspace resolves it.
- [x] 2.2 Create `packages/core/src/lib/__tests__/continuation.test.ts` — port the 9 cases (3 `isContinuationQuestion` + 6 `resolvePrecedingChain`), importing the helpers from `../continuation` and `Question` from `../../types`. Adjust the `mkQ` helper's `subject` cast to a valid core `SubjectId` if needed.
- [x] 2.3 `pnpm --filter @study-rpg/core test` → all 9 green.

## 3. Version bump + CHANGELOG

- [x] 3.1 Bump `packages/core/package.json` `version` `0.6.0` → `0.6.1`.
- [x] 3.2 Add a `## [0.6.1]` CHANGELOG entry under `### Added` covering BOTH (a) the shoutout exports first shipping to npm (`SHOUTOUT_BLOCKLIST_SEED`, `normalizeShoutoutText`, `validateShoutoutMessage`, `shoutoutContentHash`, types `ShoutoutAvatar` / `ShoutoutMessage` / `ShoutoutBoard`) and (b) the new `isContinuationQuestion` / `resolvePrecedingChain` helpers. Note the publish targets the `latest` dist-tag.

## 4. Verify (no publish)

- [x] 4.1 `pnpm --filter @study-rpg/core typecheck` → exit 0.
- [x] 4.2 `cd packages/core && pnpm pack` → `tar -tzf` lists only `package/dist/`, `package/README.md`, `package/LICENSE`, `package/package.json`; no `.test.ts`, no `src/`. Delete the generated `.tgz` after inspecting.
- [x] 4.3 `pnpm -r typecheck` from repo root → exit 0 (confirms no consumer breaks from the additive export). Confirm `npm publish` was NOT run (registry still shows `0.6.0`).
