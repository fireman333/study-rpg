## Why

The neurons corpus contains 承上題 (continuation) questions whose stem refers to a
preceding scenario — but neurons shows only the current question, so a 承上題 is
unanswerable without its context. The shared detection logic now lives in
`@study-rpg/core` (`isContinuationQuestion` / `resolvePrecedingChain`, shipped in the
lift). This change wires the neurons quiz UI to surface that preceding context, the
same feature 二階 has. Verified against the live corpus: 12 承上題 exist; 11 resolve a
preceding chain, 1 (`105-2-醫學二-病理學-Q75`) is a graceful orphan (its predecessor is
absent upstream → the box renders nothing, no error).

## What Changes

- ADD `apps/neurons-tw/src/components/PrecedingContext.tsx` — a self-contained box that
  takes `{ question }`, self-detects continuation questions via the core helper,
  resolves the chain from the FULL question bank, and renders nothing for ordinary or
  unresolvable questions (zero visual cost). Near-verbatim port of the 二階 component,
  adapted to neurons' inline-style idiom.
- ADD `apps/neurons-tw/src/lib/services/continuation-context.ts` — a module-memoized
  `loadQuestionsByIdMap()` that loads the pack once via `getContentPack(...)` and caches
  a `ReadonlyMap<string, Question>` built from `pack.questions`. (Mirrors the 二階
  `loadQuestionsByIdMap` so the preceding root resolves even when it isn't in the
  current quiz pool — e.g. the wrong-only 出征 pool.)
- EXTRACT the local `QuestionFigure` (currently inside `QuizModal.tsx`) into
  `apps/neurons-tw/src/components/QuestionFigure.tsx` and import it back, so
  `PrecedingContext` reuses identical image rendering (BASE_URL path + onError fallback
  + "[圖]" placeholder) instead of duplicating it.
- WIRE `<PrecedingContext question={q} />` into `QuizModal.tsx` immediately above the
  current question stem (`<p style={stemStyle}>{q.stem}</p>`), the single neurons answer
  entry — so every quiz mode (新題 / 出征 / 隨機 / per-family / 模考) gets it for free.
- ADD a node-env regression test asserting the corpus invariant (12 承上題, 11 resolved,
  1 known orphan) against the real `questions.json`.

## Capabilities

### New Capabilities

- `neurons-continuation-context`: the neurons quiz surfaces a 承上題 question's preceding
  scenario chain (resolved from the full bank, best-effort, root-first), rendering
  nothing for ordinary or unresolvable questions.

### Modified Capabilities

<!-- none — QuestionFigure extraction is a non-behavioral refactor; no spec change -->

## Impact

- **Code**: 2 new files (`PrecedingContext.tsx`, `continuation-context.ts`) + 1
  extracted file (`QuestionFigure.tsx`) + a 2-line wire into `QuizModal.tsx` + 1 test.
  Consumes `@study-rpg/core` via the workspace symlink (the lifted helpers are already on
  this branch — no npm publish needed for neurons).
- **Behavior**: additive UI; ordinary questions are visually unchanged (component returns
  null). One extra cached fetch of `questions.json` (browser-HTTP-cached; mirrors 二階).
- **No backend / schema / sync change**; no deploy in this change.
- **Out of scope**: 二階's own continuation consume-from-core swap (that's a `study-rpg-2nd`
  change); image rendering beyond reusing `QuestionFigure`.
