## Context

`@study-rpg/core` now exports `isContinuationQuestion` / `resolvePrecedingChain` (the
lift, already on this branch). 二階 (study-rpg-2nd, PR #1) has a proven
`PrecedingContext` + `loadQuestionsByIdMap` pattern. neurons loads its full pack once at
startup via `getContentPack(${BASE_URL}content/neurons-tw)` (App.tsx) and passes a
`pool: Question[]` (not the pack, not a by-id map) into the single answer entry,
`QuizModal`. neurons quiz UI uses inline style objects, not CSS classes. `QuestionFigure`
is a local (non-exported) function inside `QuizModal.tsx`.

Live-corpus check (run this session against `public/content/neurons-tw/questions.json`,
4600 questions): 12 承上題; 11 resolve a chain; 1 orphan (`105-2-醫學二-病理學-Q75`, its
predecessor Q74 absent upstream). Ids use `<year>-<sitting>-<book>-<subject>-Q<n>`,
identical to 二階 — so `resolvePrecedingChain`'s same-subject-prefix walk applies unchanged.

## Goals / Non-Goals

**Goals:**
- Surface a 承上題's preceding scenario above the current question in every quiz mode,
  with zero cost for ordinary questions and graceful nothing-rendered for orphans.
- Reuse the lifted core logic and 二階's proven component shape; touch QuizModal minimally.

**Non-Goals:**
- No new test infra (neurons vitest is node-env, no jsdom/testing-library — not added).
- No backend/schema/sync/deploy change. No change to quiz pool ordering or rewards.

## Decisions

### D1 — Self-loading component + module-memoized by-id loader (mirror 二階)
`PrecedingContext` takes only `{ question }` and self-loads the by-id map, so QuizModal's
prop signature and all its call sites stay untouched. The loader memoizes a single
`Promise<ReadonlyMap>` at module scope (one `getContentPack` call, browser-HTTP-cached).
Rationale: the preceding root is often NOT in the current pool (wrong-only 出征 pool only
holds wrong questions), so resolution must use the FULL bank, not the passed `pool`.
Alternative (thread a by-id prop from App through QuizModal) rejected: invasive prop
drilling across many call sites.

### D2 — Extract `QuestionFigure` into its own module and reuse it
Move `QuestionFigure` (+ its 3 style consts) out of `QuizModal.tsx` into
`components/QuestionFigure.tsx`, export it, import it back into QuizModal, and reuse it in
`PrecedingContext` for the preceding question's image. Rationale: identical image handling
(BASE_URL path + onError fallback + "[圖]" placeholder) without duplication. This is a
non-behavioral refactor (no spec change) — QuizModal renders the same `<QuestionFigure>`.

### D3 — Inline styles, not CSS classes
`PrecedingContext` uses inline `React.CSSProperties` objects to match the neurons QuizModal
idiom (no global `styles.css` churn, self-contained). The 二階 original used `.preceding-
context*` classes; we adapt rather than copy.

### D4 — Mount above the current stem
Place `<PrecedingContext question={q} />` inside the `bodyStyle` scroll container, directly
above `<p style={stemStyle}>{q.stem}</p>`, so the 前文情境 box reads before the 承上題 stem.

### D5 — Verification without component-test infra
Correctness is gated by (a) the already-passing core unit tests for the helpers, and (b) a
new node-env vitest that reads the REAL `questions.json`, asserting 12 承上題 / 11 resolved
/ the 1 known orphan — a deterministic regression lock against corpus drift or logic
regression. The component render (a near-verbatim 二階 port) is covered by Chrome MCP boot
smoke (app loads, quiz answers, no console errors); forcing a specific 承上題 in the random
pool is non-deterministic and not attempted as a gating check.

## Risks / Trade-offs

- [Second fetch of questions.json from the loader] → memoized after first call + HTTP-cached;
  same trade-off 二階 already ships. Negligible.
- [Orphan 承上題 renders nothing] → intended best-effort behavior (predecessor absent
  upstream); the regression test pins the known orphan so a future corpus fix that adds Q74
  would surface as a test update, not a silent change.
- [QuestionFigure extraction touches QuizModal] → surgical move + re-import; typecheck +
  Chrome smoke confirm the current-question image still renders identically.

## Open Questions

- None. (The 承上題 count may drift as the corpus is re-ingested; the regression test reads
  the live file, so it self-reports the actual count rather than hard-coding 12 forever —
  see test task for the exact assertion shape.)
