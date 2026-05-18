## Why

`filter-option-image-questions-from-hospital-quiz` (archived 2026-05-18) added `Question.hasOptionImages` to the `@study-rpg/core` contract + 二階 build script detection + 二階 pool filter. That change was scoped to 二階 only so it could ship without dragging 一階 along.

一階 (`apps/medexam-tw` + `packages/content-medexam-tw`) currently has **zero** option-image questions in its corpus, but inherits the same upstream PDF→Markdown extraction pipeline as 二階. If a future re-extraction run for 一階 produces `_(圖片或缺失)_` markers (the same string 二階 broke with), they would leak into the 一階 quiz pool unchecked — the schema field is defined but neither 一階 build nor 一階 app populates / filters it.

This is forward-compat insurance, not a current-bug fix. Code is small (~5 lines build + ~5 lines App.tsx) and was already pre-written + reverted at user request before the 二階 ship, so this proposal just records the spec contract for the parallel filter.

## What Changes

- 一階 build script (`packages/content-medexam-tw/scripts/build.ts`): mirror the 二階 detection — add `OPTION_IMAGE_MARKER` regex constant, compute `hasOptionImages` from `Object.values(options).some(...)` after the options parse loop, emit on the returned `Question`.
- 一階 host app (`apps/medexam-tw/src/App.tsx`): in the `getContentPack(...)` mount-effect, filter `pack.questions` for `q.hasOptionImages !== true` once before calling `setContent`. The filter is unconditional (no feature flag) so a future regression cannot bypass it.
- No new package, no schema change (`hasOptionImages` already exists in `@study-rpg/core`).
- No rebuild of historic 一階 `questions.json` necessary — the field defaults to `false` on old builds and the filter handles missing/false identically.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `quiz-runner`: add Requirement that the 一階 host app SHALL filter out `hasOptionImages` questions from `content.questions` before threading into `QuizModal` / `BossModal` / `MentorDialog`.

## Impact

- **Code (2 files)**:
  - `packages/content-medexam-tw/scripts/build.ts` — `OPTION_IMAGE_MARKER` const + `hasOptionImages` computation + emit (~6 lines).
  - `apps/medexam-tw/src/App.tsx` — one `.filter` in the `getContentPack(...).then(...)` handler (~5 lines).
- **Tests**: same posture as the 二階 sibling change — no test infra in monorepo; spec scenarios + `pnpm -r typecheck` + `pnpm --filter @study-rpg/content-medexam-tw build` showing 0 flagged questions serve as executable verify.
- **API surface**: zero — `Question.hasOptionImages` already part of `@study-rpg/core` since the previous change.
- **Built content**: 一階 `questions.json` rebuilt; every Q now emits `hasOptionImages: false` (none currently match). Bundle size delta ≈ 100 KB (3291 Qs × ~30 bytes for `"hasOptionImages":false,`).
- **Data**: no Dexie migration. No user-state implications (filter only affects fresh draws; existing `srs` rows in 一階 use SrsCard schema, not pack-derived).
- **Deploy**: 一階 GH Actions deploy picks up the filter at next build. No Supabase / cron changes.
- **Closes the loop**: with this change, both apps fully filter unrenderable option-image questions consistently. Phase 2 (per-option image extraction + render) remains explicitly deferred until 二階 dogfood justifies the investment.
