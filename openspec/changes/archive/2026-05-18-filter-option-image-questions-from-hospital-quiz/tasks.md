## 1. Core schema field

- [x] 1.1 In `packages/core/src/types.ts`, add `hasOptionImages?: boolean` to the `Question` interface immediately below the existing `hasImage?: boolean` line.
- [x] 1.2 One short inline comment explaining `hasOptionImages` semantics: "Hint that at least one of `options` is an image (un-renderable in text-only UI)."
- [x] 1.3 `pnpm --filter @study-rpg/core build` and confirm `hasOptionImages` appears in `dist/index.d.ts`.

## 2. 二階 build script

- [x] 2.1 In `packages/content-medexam2-tw/scripts/build.ts`, extend `ParsedQuestion` interface to include `hasOptionImages: boolean`.
- [x] 2.2 Inside `parseQuestionBlocks`, after the existing option parsing loop and before pushing to `parsed`, compute `hasOptionImages = Object.values(options).some(v => OPTION_IMAGE_MARKER.test(v))` where `OPTION_IMAGE_MARKER = /_\(圖片或缺失\)_/`.
- [x] 2.3 In `buildQuestion`, emit `hasOptionImages: parsed.hasOptionImages` on the returned `Question` object.
- [x] 2.4 Run `MEDEXAM2_ALLOW_SKIPS=1 pnpm --filter @study-rpg/content-medexam2-tw build`. Confirm:
  - `imported / skipped / total` counter unchanged from prior baseline (no question dropped at build level).
  - `dist/questions.json` contains exactly 10 questions with `hasOptionImages: true` (verified via `jq`).
  - Build script does NOT crash on `_(選項缺失或為圖片題；參見原 PDF)_`-style blocks (existing `< 2 options` guard handles those).
- [x] 2.5 Verify `apps/medexam2-hospital-tw/public/content/medexam2-tw/questions.json` (copied by the build) has the same 10 flagged IDs.

## 3. 二階 random-pool filter

- [x] 3.1 In `apps/medexam2-hospital-tw/src/lib/quiz.ts`, inside `loadPack`'s post-fetch block, partition the fetched `pack.questions` into `playable` (those without `hasOptionImages === true`) and let `byId` still receive `pack.questions` (full set).
- [x] 3.2 Build `bySubject` and the returned `questions` array from `playable` only.
- [x] 3.3 Inline comment explaining that `byId` retains the full set so historical bookmark / SRS row hydration still resolves un-renderable question IDs into a `Question` object for fallback UX (the SRS scheduler then suppresses them at surface; see task 4).
- [x] 3.4 Typecheck: `pnpm -r typecheck` passes with no new errors.

## 4. 二階 SRS due-queue filter

- [x] 4.1 In `apps/medexam2-hospital-tw/src/lib/srs-scheduler.ts`, add an import `import { loadQuestionsByIdMap } from './quiz'` at the top.
- [x] 4.2 In `getDueQueueAllSubjects`, after `db.questionHistory.toArray()` returns, await `loadQuestionsByIdMap()` once (parallel `Promise.all`).
- [x] 4.3 Inside the existing per-row loop, after the `nextDueAt` due-check, also `continue` when the pack's `Question` for `row.questionId` has `hasOptionImages === true`. Rows whose questionId is missing from the pack (orphan) keep the existing path.
- [x] 4.4 Typecheck: `pnpm -r typecheck` passes.

## 5. Validate spec deltas

- [x] 5.1 `openspec validate filter-option-image-questions-from-hospital-quiz` returns success.
- [x] 5.2 `openspec validate --all` still returns 0 failures across all changes + specs.

## 6. Smoke verify (二階 only)

- [x] 6.1 `pnpm --filter @study-rpg/medexam2-hospital-tw dev` boots without error.
- [x] 6.2 Via Chrome MCP `javascript_tool`, fetch the served `questions.json`, count `hasOptionImages === true` → exactly 10; run 500 random picks restricted to 耳鼻喉科 against the filtered pool and confirm 0 leaks.
- [x] 6.3 Console clean — no new errors / warnings from the filter path (only pre-existing React Router v7 future-flag warnings).
- [x] 6.4 一階 dev server (`pnpm --filter @study-rpg/medexam-tw dev`) boots and loads its content pack — this confirms the optional schema field does not break the un-touched 一階 path.

## 7. Archive + follow-up filing

- [x] 7.1 User confirmed go-ahead; archive + commit on `track-m2`, then merge to `main` for prod deploy.
- [x] 7.2 一階 forward-compat mirror (build-script detection + `App.tsx` pool filter) — filed as a separate follow-up change after this one archives, naming suggestion `filter-option-image-questions-from-medexam-tw-pool`. Tracked in proposal § Why scope note.
- [x] 7.3 Phase 2 (per-option image extraction + render) — separate change to file only after Phase 1 ships and the 10-Q count proves stable. Tracked in proposal § Impact `Phase 2 deferral`.
