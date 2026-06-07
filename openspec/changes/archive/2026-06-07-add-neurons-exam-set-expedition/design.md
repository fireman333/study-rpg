## Context

Today's only expedition (`neurons-study-squad`): the homepage 出征 button (`OverviewPage.tsx:264`) opens a QuizModal over `buildWrongQuestionPool(pack.questions, questionHistory)` (`expedition.ts:26`) with `onComplete={onExpeditionComplete}` (`OverviewPage.tsx:342`). `onExpeditionComplete({total, correct})` (`expedition.ts:73`) calls `creditExpeditionDraws(total, correct)` (`dmn-trigger.ts:164`), which grants 0–2 DMN draws via the `DMN_EXPEDITION_MILESTONES` clamp (`[{pct:.25,min:3,max:15},{pct:.5,min:6,max:30}]`) under a shared 2/day expedition-axis cap.

Questions carry `q.meta.year` (number) and `q.meta.session` (number; 1=第一次, 2=第二次) — the `/bank` page (`QuestionBankPage.tsx:24,27`) already derives year/session lists and filters by them, read-only. `quiz-pool.ts` has pure `filterPoolByYear` / `filterPoolByNewOnly(pool, history)` helpers. `QuizModal` accepts `{ pool, onClose, onComplete?, preserveOrder? }`. The `questionHistory` table (one row per answered question, any mode) is the answer-coverage source of truth.

## Goals / Non-Goals

**Goals:**
- A resumable "year + 次別, all questions in order" expedition, co-equal with 錯題遠征, rewarding via the same DMN chain.
- Maximum reuse, **zero schema/sync surface** (derive everything from `questionHistory` + `q.meta`).

**Non-Goals:**
- A separate per-run progress store / expedition-scoped answer tracking (would bump Dexie + need an upgrade fixture). We derive coverage from global `questionHistory` instead.
- A special completion bonus beyond the per-session DMN draws ("同制" = same mechanism; a finish-the-paper bonus is a possible follow-up).
- Subjecting this expedition to the homepage year-filter (it has its own picker; the homepage year-filter governs the random quiz only — `neurons-quiz-year-filter` unchanged).
- Touching the 錯題遠征 pool/behavior (only its entry point gains a sibling).

## Decisions

**D1 — Progress/coverage is DERIVED from `questionHistory`; no new persistence.** A (year, session) question is "done" once it has any `questionHistory` row. `examSetCoverage(pool, history, year, session) → { answered, total }` powers the picker; the per-session pool is the **unanswered** remainder. This resolves the grilled "分次累計答完 + 進度保存" requirement with **no Dexie `.version()` bump, no upgrade fixture, no R2 bundle bump, no Worker change** — the single biggest scope reduction. (Trade-off in Risks.)

**D2 — Per-session pool builder** `buildExamSetExpeditionPool(pool, history, year, session)`:
1. filter `q.meta.year === year && q.meta.session === session`,
2. exclude questions already in `history` (mirror `filterPoolByNewOnly`'s answered-set check),
3. sort by **question order** (parse the trailing `-Q(\d+)` of the question id; fall back to stable pool order if the suffix is absent).
Returns `Question[]` (empty ⇒ paper complete). Launched via `QuizModal pool={examSetPool} preserveOrder onComplete={onExpeditionComplete} onClose={...}` — `preserveOrder` keeps question order (no shuffle).

**D3 — Reward reuses `onExpeditionComplete` verbatim.** On close, `{total = examSetPool.length, correct}` → `creditExpeditionDraws` → same milestone clamp + the **shared** expedition-axis daily cap (`dmnTimeAxisDrawsConsumedToday`). 錯題遠征 and 年份回數遠征 therefore share one 2/day expedition-axis budget — intended (one "expedition axis"). No new reward code, no new meta key.

**D4 — Homepage 遠征選單.** `OverviewPage`'s single 出征 button opens a small chooser: **錯題遠征** (existing path, unchanged — disabled when `wrongCount === 0`) and **年份回數遠征** (→ a year + 次別 picker reusing the `QuestionBankPage` chip pattern; each (year, session) row shows `examSetCoverage` as `已答 X / Y`, and "✓ 完成" when answered === total). Selecting a paper launches the QuizModal over its unanswered pool. New small state vars in OverviewPage (mutually exclusive with `quizEntry` / `expeditionOpen`), no new route.

**D5 — Anti-cheese.** Pool excludes already-answered ⇒ monotonically shrinks per paper (no re-answer farming); the shared 2/day cap bounds draws — same protection profile as 錯題遠征. `log()`/note that coverage counts answers from *any* mode (a question answered in the random quiz already counts as covered) so the behavior is explicit, not silent.

## Risks / Trade-offs

- **Coverage counts cross-mode answers.** Because progress derives from global `questionHistory`, a player who already answered some of a paper's questions via the random quiz sees that paper partly "done" — they can't grind those for fresh draws. This is the intended "coverage of the set" reading of 分次累計答完, and it's what buys us the zero-schema simplification. If telemetry later shows players want an *expedition-scoped* fresh run, that needs a per-run table (Dexie bump + fixture) — explicitly deferred.
- **`q.meta.session` population.** If the neurons content pack doesn't populate `session` for every paper, the 次別 dimension is sparse. Apply Task verifies; the picker degrades to year-only (or year + "全部") if session is absent — no crash (absence ⇒ excluded from the session chip list, mirroring QuestionBankPage).
- **Question-order sort.** Relies on the `-Q(\d+)` id suffix; if a paper's ids don't follow it, fall back to pool order (still deterministic). Apply Task confirms on a sample paper.
- **Shared daily cap surprise.** A player who already spent the 2/day expedition cap on 錯題遠征 gets 0 draws from a 年份回數 run that day. Acceptable (one axis) but worth a one-line note in the 遠征選單 copy.
