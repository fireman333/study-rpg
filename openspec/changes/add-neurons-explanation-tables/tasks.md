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
- [x] 3.3 Apply pilot + waves 1–3 = **175 questions** with blocks (173 of the 256-severe set + 2 pilot outside it)
- [x] 3.4 All severe waves done (chunks 00–17, 252 questions processed across 18 agents)
- [ ] 3.5 Human spot-check of the **83 quarantined** severe questions (scrambled cell order / dropped-OCR / row-width fail) — list at `quarantine-severe.json`; they render flat text until reviewed

## 4. Verify

- [x] 4.1 typecheck (core + app) clean; 664 neurons + 9 core vitest green
- [x] 4.2 Live: /bank renders real tables for a reconstructed question (112-2 寄生蟲 Q31, screenshot)

## 5. Deploy

- [x] 5.1 Deployed neurons (Cloudflare Pages) via `pnpm run deploy:cf` (waves 1–3); main pushed (`35280f4`), GH Actions Deploy CF Pages + Dexie lint green
- [x] 5.2 Prod verified: `med-study-rpg.com/neurons/` serves 175 explanationBlocks; 題庫 112-2 Q31 renders 2 real tables; control question falls back to flat text

## 6. Follow-up (separate work — see handoff)

- [~] 6.1 Severe quarantine (83) — TRIAGED via 6 agents (2026-06-24): 25 no-table (flat text correct, no action), **13 recovered+applied** (zero content loss), 70 remain in `quarantine-severe.json`. Owner-review queue in `quarantine-review.md`: Bucket A (11 quick-verify), Bucket B (7 dropped-content), Bucket C (27 needs-human medical-judgment alignment)
- [x] 6.2 Moderate-flagged tables (heuristic 15–29 fragment lines, 263 q) — DONE: all 19 chunks (00–18) processed across 3 waves = **+148 applied** → total **323 explanationBlocks**; ~25 gate-quarantined (dropped scrambled figure-OCR / row-width fail), render flat text as before
- [x] 6.3 Mild-flagged tables (heuristic 8–14 fragment lines, 395 q) — DONE: all 29 chunks (00–28) processed across 5 waves = **+106 applied** → total **442 explanationBlocks**; lower yield than moderate (~27% — many short spans are prose lists / image-only tables, agents correctly skip as no-table)
- [ ] 6.4 Archive this change once the batch is closed (or split 6.x into a new change)
