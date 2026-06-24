# Tasks — add-neurons-explanation-tables

## 1. Core type (additive)

- [x] 1.1 `ExplanationBlock` type + optional `Question.explanationBlocks?` in `packages/core/src/types.ts`
- [x] 1.2 Bump `@study-rpg/core` 0.6.1 → 0.6.2 + CHANGELOG (pre-1.0 PATCH for additive optional field)
- [x] 1.3 npm publish — DEFERRED (neurons consumes core via workspace; publish only if 二階 needs the type)

## 2. Shared renderer

- [x] 2.1 `apps/neurons-tw/src/components/Explanation.tsx` — prose → text, table → real `<table>` in `overflow-x:auto` wrapper; falls back to flat `explanation` when no blocks
- [x] 2.2 Wire QuizModal / MockExamRunner / QuestionBankPage to `<Explanation question={q} textStyle={explanationBodyStyle} />`
- [x] 2.3 Build carries `explanationBlocks` through verbatim (normalizer untouched)

## 3. Reconstruction pipeline (faithful + validated)

- [x] 3.1 Reconstruct flattened tables via LLM agents → structured blocks (faithful reformat: no fact add/drop; drop footers; propagate group labels; skip-don't-guess on scrambled)
- [x] 3.2 Automated gate: row-width == columns AND ≤4 non-footer source tokens missing → apply; else quarantine
- [x] 3.3 Apply pilot 5 + wave-1 49 = **54 questions** with blocks; quarantine 1 pilot (104-2) + 15 wave-1 fails + 20 agent self-skips for human review
- [ ] 3.4 Remaining severe waves (chunks 06–17, ~188 questions) — pending (owner gating on token cost)
- [ ] 3.5 Human spot-check of the quarantined / scrambled set (e.g. 104-2 生理 Q7) — pending

## 4. Verify

- [x] 4.1 typecheck (core + app) clean; 664 neurons + 9 core vitest green
- [x] 4.2 Live: /bank renders real tables for a reconstructed question (112-2 寄生蟲 Q31, screenshot)

## 5. Deploy

- [ ] 5.1 Deploy neurons (Cloudflare Pages) via `pnpm run deploy:cf`
- [ ] 5.2 Prod spot-check: a reconstructed question renders a real table; a non-reconstructed one still renders flat text (fallback)
