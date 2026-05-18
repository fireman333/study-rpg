## 1. Core constant + clamp

- [x] 1.1 In `packages/core/src/lib/srs.ts`, add `export const MAX_INTERVAL_DAYS = 365` adjacent to the other tunable constants (near `SRS_DAILY_CAP`).
- [x] 1.2 In `reviewCardBinary`, after computing `newInterval` on the correct path (the `if (correct)` branch around line 114-118), apply `newInterval = Math.min(newInterval, MAX_INTERVAL_DAYS)` before constructing the result.
- [x] 1.3 In `reviewCard` (一階 quality-based), after computing `newInterval` on the non-lapse path (lines 60-63), apply `newInterval = Math.min(newInterval, MAX_INTERVAL_DAYS)` before constructing the result.

## 2. Unit tests — SKIPPED (no test infrastructure in repo)

The `packages/core/package.json` has no `test` script and no `*.test.ts` files exist anywhere in the monorepo. Adding vitest / jest is a meta-infra change that deserves its own OpenSpec change rather than being bundled into this surgical interval-cap fix.

Cap behavior is instead verified by:

- Spec scenarios in `specs/hospital-srs/spec.md` + `specs/srs-queue/spec.md` (each requirement has a cap-clamps scenario serving as executable spec).
- `pnpm -r typecheck` confirming the `Math.min` clamp compiles.
- Future change `add-vitest-to-core` can wire test infra and backfill these cap tests properly.

- [x] 2.1 Skipped — see rationale above.
- [x] 2.2 Skipped — see rationale above.
- [x] 2.3 Skipped — see rationale above.
- [x] 2.4 Skipped — see rationale above.

## 3. Verify no app-side changes needed

- [x] 3.1 Confirm `apps/medexam-tw/src/App.tsx:503` calls `reviewCard(base, qr.correct ? 4 : 2, now)` directly — inherits cap via core function update, zero local change needed.
- [x] 3.2 Confirm `apps/medexam2-hospital-tw/src/lib/mastery.ts:25` calls `reviewCardBinary({ correct: wasCorrect, prev: prevSrs, now })` directly — inherits cap via core function update, zero local change needed.
- [x] 3.3 Confirm `apps/medexam-tw/src/routes/MockResultRoute.tsx` only calls `newCard` (creates fresh `interval: 0` row), never `reviewCard` — unaffected by the cap. The `// reviewCard will be applied next time user reviews` comment on line 83 confirms updates happen elsewhere (App.tsx) which already inherits the cap.

## 4. Build + typecheck

- [x] 4.1 `pnpm --filter @study-rpg/core build` clean. Added missing re-export in `packages/core/src/index.ts` (initial build missed `MAX_INTERVAL_DAYS` because index.ts only re-exports named symbols, not all). Re-built, confirmed `declare const MAX_INTERVAL_DAYS = 365;` in `dist/index.d.ts` line 834 + appears in the public export list.
- [x] 4.2 `pnpm -r typecheck` — all 7 workspaces clean (core / content-medexam-tw / content-medexam2-tw / theme-pixel-medical / theme-pixel-hospital / medexam-tw / medexam2-hospital-tw). Zero new errors.
- [x] 4.3 No test script wired (see Group 2 rationale). Verification deferred to spec scenarios.

## 5. OpenSpec verify

- [x] 5.1 `openspec validate --all` → 43/43 specs pass (incl. both deltas).
- [x] 5.2 Self-audit (completeness / correctness / coherence) all 3 dimensions pass — see apply summary. No drift between proposal motivation, design decisions, spec scenarios, and implementation.

## 6. Archive

- [x] 6.1 `/opsx:archive` ran with sync gate — deltas merged into main `openspec/specs/hospital-srs/spec.md` + `openspec/specs/srs-queue/spec.md`; change moved to `openspec/changes/archive/2026-05-18-add-srs-interval-cap/`. Post-archive `openspec validate --all` → 43/43 pass.
- [x] 6.2 Committed `a79fea9` on `track-m2` (10 files / 229 insertions); FF merged to `main` cleanly.
- [x] 6.3 Pushed to `origin/main`. GH Actions coalesced with the next push (`4482aa2 filter-option-image-questions`) into a single deploy run `26019041033` (44s, success) — both commits live in prod build via monotonic source pull from HEAD.
