## Context

Sister change to `filter-option-image-questions-from-hospital-quiz` (archived 2026-05-18 14:34). That change:

- Added `hasOptionImages?: boolean` to `Question` in `@study-rpg/core` (optional, opt-in).
- Wired 二階 build script to detect `_(圖片或缺失)_` marker in option text and emit the flag.
- Wired 二階 pack-load (`apps/medexam2-hospital-tw/src/lib/quiz.ts`) to filter the random pool, and 二階 SRS scheduler to suppress due rows for flagged questions.
- Intentionally did NOT touch 一階 (`apps/medexam-tw` + `packages/content-medexam-tw`) so 二階 could ship without dragging 一階 deploy gating.

Current 一階 corpus: 3291 questions imported, 0 with the option-image marker. Confirmed by `MEDEXAM_ALLOW_SKIPS=1 pnpm --filter @study-rpg/content-medexam-tw build` followed by `jq '[.[]|select(.hasOptionImages==true)]|length' = 0`.

## Goals / Non-Goals

**Goals**

- Mirror the 二階 detection + filter logic into 一階, idempotent and forward-compat.
- Keep the change surface minimal — re-use the schema field already defined in `@study-rpg/core`.
- Record the parallel filter contract on `quiz-runner` so the two apps' spec deltas stay symmetrical.

**Non-Goals**

- Touch `@study-rpg/core` types — `hasOptionImages` already there.
- Touch 一階 SRS path. The 一階 `srs-queue` capability uses `SrsCard` schema written by `reviewCard` / `newCard`, not pack-derived. Filtering the pack at `App.tsx` level means new cards are never created for flagged Qs; existing cards (none exist today since 0 affected Qs) would orphan naturally.
- Backfill or migrate any data. Pure additive code change.
- Modify `QuizModal` / `BossModal` / `MentorDialog`. They consume `pool: Question[]` as-is and the filter happens upstream.

## Decisions

**Decision 1: Filter at `App.tsx` content-load, not in each picker.**

Same rationale as 二階's `loadPack` choice. `App.tsx:147` (`getContentPack(...)`) is the single choke point for the entire 一階 quiz UI surface. One `.filter` after the fetch resolves cascades to:

- `QuizModal pool={content.questions}` — random reading-mode + review-mode draws
- `BossModal pool={content.questions}` — mini-boss subject-filtered subset
- `MentorDialog` (consumes `content.questions` for mentor daily question pick)
- Any future picker added against `content.questions`

Three sites consolidated, one cannot drift from the other.

**Decision 2: Filter happens unconditionally, no feature flag.**

This is forward-compat insurance, not a gated experimental feature. A `?filter-option-images=off` URL param or similar would mean "future PDF extractor regression accidentally re-enabled, and a curious user trips into broken state without realizing." Hard-coded means any future regression manifests at build/spec layer, not at user UX.

**Decision 3: Don't rebuild and ship 一階 with no actual content change.**

The corpus build emits a `hasOptionImages: false` field on every Q now. With current corpus, this is a 100% no-op for users (no filter ever fires). Whether to rebuild now or wait for the next natural rebuild:

- **Pro rebuild now**: ensures `questions.json` is consistent with the new build-script invariant; small bundle-size cost (~100 KB pre-gzip, ~10 KB gzipped); future developers grepping the JSON for `hasOptionImages` find consistent records.
- **Pro defer**: zero user-visible change, no urgency; next dogfood build will pick it up; saves a deploy cycle.

Decision: **rebuild + ship now** — the OpenSpec workflow already commits + deploys; adding `questions.json` to the same commit keeps the spec-vs-artifact reality coherent.

**Decision 4: One capability delta (`quiz-runner`), not two.**

The 一階 SRS-queue (`srs-queue` capability) reads via `SrsCard` keyed by `questionId`. Since the filter at `App.tsx` prevents new cards for flagged Qs, `srs-queue` behavior is unchanged (no new requirement). The 二階 sibling needed a `hospital-srs` delta because 二階 SRS surface reads via cross-ref to pack at the scheduler — that's a different architecture. 一階 doesn't need symmetric spec text for the SRS surface.

| Capability | Direction | Why |
|---|---|---|
| `quiz-runner` | ADDED Requirement | 一階 host app filters `hasOptionImages` from pool |

## Risks / Trade-offs

- **[Risk]** Future upstream extractor changes the marker string for 一階 only (e.g. localizes to `_(image missing)_`). → **Mitigation:** marker `_(圖片或缺失)_` is a single regex constant shared by intention with 二階 (`OPTION_IMAGE_MARKER`). If 一階 corpus ever uses a different marker, a follow-up updates both build scripts in lockstep.
- **[Risk]** Bundle-size growth from `hasOptionImages: false` appearing on every Q in `questions.json`. → **Mitigation:** ~100 KB raw / ~10 KB gzipped on 3291 Qs. Below the M3 lazy-load threshold. Acceptable.
- **[Trade-off]** Adds spec scope to `quiz-runner` for a 0-affected case today. → **Acceptable:** documents the contract for future-extending content packs (e.g., third-party fork) — same justification as the 二階 sibling.
