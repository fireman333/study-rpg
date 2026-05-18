## Why

Some 二階 國考 questions have **options that are themselves images** (e.g. `109-2-醫學六-耳鼻喉科-Q27`：「左耳鼓室圖（tympanogram），最可能為下列何者？」with A/B/D 是不同 tympanogram 圖、C 是文字「點」). The upstream PDF extraction pipeline rendered these unrenderable options as the literal placeholder `_(圖片或缺失)_` inside option lines.

Today's `hasImage` regex tests only the stem, so it does not catch the「鼓室圖」/「下列何者」-style stems that defer the picture to the option list. The result: 10 二階 questions in 9 papers across 7 subjects enter the quiz pool with options the user cannot read → unanswerable card → effectively gambling. SRS write-back also pollutes `questionHistory` with cards that will never have meaningful answer data.

Phase 1 fix = **detect + filter at pool-load** so these questions don't reach the player. Phase 2 (deferred, separate change) = extract option-level PNGs and render per-option `<img>` — a larger UI / PDF-parser change.

**Scope = 二階 only.** The current project plan ships 二階 (`apps/medexam2-hospital-tw`) first; 一階 (`apps/medexam-tw`) currently has 0 affected questions and will get a parallel forward-compat filter in a follow-up change so 二階 deploy is not gated on it.

## What Changes

- Add `hasOptionImages?: boolean` (optional) to the `Question` interface in `@study-rpg/core`. Mirrors `hasImage?: boolean` shape — a passive hint, not a behavior gate, so older content packs (and the unchanged 一階 build) that omit the field still validate.
- 二階 build script (`packages/content-medexam2-tw/scripts/build.ts`): after option parsing, set `hasOptionImages = true` when any option value matches `/_\(圖片或缺失\)_/`. Emit into `questions.json`.
- 二階 random picker (`apps/medexam2-hospital-tw/src/lib/quiz.ts`): `loadPack` filters `bySubject` + `questions` to exclude `hasOptionImages === true`. `byId` keeps the full set so bookmark / SRS row hydration of historical answers still works (a stale row simply won't be resurfaced).
- 二階 SRS due-queue (`apps/medexam2-hospital-tw/src/lib/srs-scheduler.ts`): `getDueQueueAllSubjects` cross-references the loaded content pack and drops rows whose `questionId` has `hasOptionImages === true`. The row stays in `questionHistory` (no hard delete); it just stops surfacing in the「🔴 N due」chip and the due-first picker.
- Spec record on four capabilities (one schema, one ingestion, two filter surfaces).
- 一階 (`packages/content-medexam-tw`, `apps/medexam-tw`) is **NOT touched** by this change. A future change will mirror the build-script detection + `App.tsx` pool filter as forward-compat insurance once 二階 ships.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `content-pack-contract`: extend `Question` interface field table with optional `hasOptionImages` flag (used by 二階 today, opt-in for other content packs).
- `medexam2-corpus-ingestion`: add Requirement for option-image marker detection + `hasOptionImages` emission.
- `hospital-quiz`: add Requirement that the 二階 random-pool picker SHALL exclude `hasOptionImages` questions.
- `hospital-srs`: add Requirement that the 二階 due-queue surface SHALL exclude `hasOptionImages` questions (historical rows preserved).

## Impact

- **Code (4 files)**:
  - `packages/core/src/types.ts` — one optional field on `Question`.
  - `packages/content-medexam2-tw/scripts/build.ts` — detection + emit (~6 lines).
  - `apps/medexam2-hospital-tw/src/lib/quiz.ts` — filter inside `loadPack` (~4 lines).
  - `apps/medexam2-hospital-tw/src/lib/srs-scheduler.ts` — cross-ref filter (~6 lines).
- **Built content**: 二階 `questions.json` retains 10 flagged questions tagged `hasOptionImages: true`; the host app filters them out of every quiz pool. 一階 `questions.json` is untouched (no 一階 build script change in this scope).
- **Tests**: no test infra in the monorepo (parity with `add-srs-interval-cap` rationale); spec scenarios + `pnpm -r typecheck` + Chrome MCP smoke serve as executable verify.
- **API surface**: `Question.hasOptionImages` becomes part of the `@study-rpg/core` exported type. Additive optional field → patch-level bump on next npm publish. 一階 build will simply not emit the field until its follow-up change lands; downstream consumers treating the missing field as `false` already match desired behavior.
- **Data**: no Dexie migration. Existing `questionHistory` rows for the 10 affected 二階 IDs stay on disk; they are simply not re-surfaced as due cards. The user's prior progress is not destroyed.
- **Deploy**: 二階 GH Actions deploy picks up the filter at next build. 一階 deploy unaffected. No Supabase / cron changes.
- **Follow-up coupling**: the future 一階 change re-uses the same `@study-rpg/core` schema field plus mirrors the build-script regex; nothing in this change blocks or pre-decides it.
- **Phase 2 deferral**: explicit non-goal. Option-level image rendering needs PDF coordinate extraction + per-option `<img>` UI + image bundle expansion. Re-evaluate after Phase 1 ships and the 10-Q count proves stable.
