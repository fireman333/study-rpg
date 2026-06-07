# Handoff — 年份回數遠征 改為「單本」(per-book) 顆粒度

**Date**: 2026-06-07
**Status**: NOT STARTED — next session picks this up (owner: 「年份回數遠征我是指藥單年份單次的醫學一或是二（一次100題而已）」)
**Type**: refinement of the just-shipped `neurons-exam-set-expedition` (live in prod @ `med-study-rpg.com/neurons/`).

## What the owner wants

The 年份回數遠征 "paper" unit shipped as the **whole (year, 次別) sitting = 200 題** (醫學一 100 + 醫學二 100, combined). The owner actually wants it **per-book**: a "paper" = **(year, 次別, book)** where `book ∈ {醫學一, 醫學二}` → **~100 題, one book**. So the picker should let you drill e.g. 「115 第1次 · 醫學一」 (100 題) separately from 「115 第1次 · 醫學二」.

Everything else about the feature stays: drill the **unanswered** questions of that paper **in 題號 order**, resumable, coverage derived from `questionHistory` (a question is covered once answered in ANY mode), reward via the shared `onExpeditionComplete → creditExpeditionDraws` chain, **zero schema/sync change**.

## Current shipped state (what to modify)

Shipped 2026-06-07 (commits `511693a`/`2fe2c85`/`99d5ceb`, merge `92247f8` → prod). The exam-set code lives in:

- **`apps/neurons-tw/src/lib/services/expedition.ts`** — pure helpers (the core change site):
  - `examMeta(q)` already reads `year` / `session` / `qNumber` / `paper` (and the content also has `q.meta.book` = 醫學一/醫學二). Add `book` to `ExamMeta` + the read.
  - `buildExamSetExpeditionPool(pool, history, year, session)` → add a `book` param; filter `m.book === book` too. Sort stays (paper, qNumber) — within one book it's just qNumber.
  - `examSetCoverage(pool, history, year, session)` → add `book` param.
  - `listExamPapersWithCoverage(pool, history)` → group by **(year, session, book)** instead of (year, session); each row ~100 total. Add `book` to `ExamPaperCoverage`. Keep ordering years-desc / session-asc, then book (醫學一 before 醫學二 — sort by `paper` `medexam-1` < `medexam-2`).
- **`apps/neurons-tw/src/routes/OverviewPage.tsx`** — the 遠征選單 picker:
  - `examSelection` state: `{ year, session } → { year, session, book }`.
  - `chooseExamPaper(year, session)` → `chooseExamPaper(year, session, book)`.
  - `examSetPool` memo → pass `examSelection.book`.
  - Picker row label: 「{year} 第{session}次 · {book}」 (e.g. 「115 第1次 · 醫學一」); coverage 已答 X/100. Rows now ~46 (12 年 × 2 次 × 2 本, minus any gaps) — consider grouping visually by year, or year→次別→本; a flat 2-col grid of 46 is also acceptable (current grid is `1fr 1fr`; may want year section headers if it feels long).
- **`apps/neurons-tw/src/__tests__/exam-set-expedition.test.ts`** — update fixtures + assertions for the `book` dimension (the test corpus `q(year, session, paper, qNumber)` already carries paper=medexam-1/2 → map to book; add book param to the helper calls).

## Spec to MODIFY

`openspec/specs/neurons-exam-set-expedition/spec.md` (shipped capability) — MODIFY the requirements/scenarios that say a paper = (year, 次別) sitting to **(year, 次別, book)**. Specifically:
- "Year + 次別 full-question-set expedition picker" → picker keys on (year, 次別, **book**); coverage `已答 X/100`.
- "Resumable per-session pool in question order" → pool filters book too.
- "Coverage derives from questionHistory…" + "Reward via the shared expedition-axis chain" → unchanged in substance (just the unit is per-book; `total` ≈ 100).
Do this as a new `/opsx:propose` change (suggest name **`refine-neurons-exam-set-per-book`**) → MODIFIED delta on `neurons-exam-set-expedition` + MODIFIED `neurons-study-squad` only if the 遠征選單 copy changes. NO Dexie/R2/Worker change (still derives from `questionHistory`).

## Content facts (verified 2026-06-07)

`apps/neurons-tw/public/content/neurons-tw/questions.json` — 4600 Q. Each `q.meta`: `year` (104–115), `session` (1=第一次 / 2=第二次), `book` (醫學一 / 醫學二), `paper` (`medexam-1` / `medexam-2`), `qNumber`. Each **(year, session) = 200 Q = 醫學一 100 + 醫學二 100**, so per-book = **100 Q exactly**. All ids end `-Q<n>`. 23 (year,session) combos × 2 books ⇒ ~46 per-book papers.

## Workflow for the next session

1. `/spec resume` (reads this doc).
2. `/opsx:propose refine-neurons-exam-set-per-book` (MODIFIED delta, per above).
3. `/opsx:apply` → edit the 3 code files + test (per-book param threading).
4. Verify: `pnpm --filter @study-rpg/neurons-tw test` + `pnpm -r typecheck` + `pnpm lint:dexie-fixtures` (must stay no-op — zero schema) + Chrome MCP dev smoke (出征 → 遠征選單 → 年份回數 → pick 「115 第1次 · 醫學一」 → drill opens at 第 1/~100 題, 醫學一 only, in order).
5. `/opsx:archive` → commit (explicit per-file) → merge `track-neurons → main` (= deploy) → prod smoke. (Owner has been approving the full pipeline incl. deploy.)

## Session context (for resume)

- **All 3 prior grill items SHIPPED + deployed + prod-verified today** (leaderboard auto-upsert `511693a`, first-pull deferred reveal `2fe2c85`, exam-set expedition `99d5ceb`; merge `92247f8`).
- **Verification gotcha** (saved to memory `neurons-dev-r2-push-fails-localhost`): localhost dev R2 push fails (`r2_push_exhausted`) → `onPushComplete` never fires in dev (so the leaderboard auto-upsert positive path is prod-only); dev pushes failing also means dev smoke can't pollute prod cloud. Prefer `__sync.pause()` + revert local writes when smoking on the owner's signed-in account.
- This worktree (`track-neurons`) is currently 1 behind `main` (the `92247f8` merge bubble) — a `git merge main` here re-syncs before starting the new change (recommended first step so the new change branches from the deployed state).
