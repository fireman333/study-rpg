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
- [x] 3.5 Human spot-check of the **83 quarantined** severe questions — DONE: all triaged + dispositioned (`quarantine-review.md`). 25 no-table (correct flat) · 27 recovered+applied (incl. Bucket A) · 27 Bucket C → **table images** (shipped as `add-neurons-explanation-table-images`, archived `a32395f`) · **29 destroyed-OCR** (un-reconstructable without fabricating medical facts) kept flat text → deferred to follow-up change `add-neurons-explanation-tables-image-tail` (owner decision 2026-06-25). None left in an undecided state.

## 4. Verify

- [x] 4.1 typecheck (core + app) clean; 664 neurons + 9 core vitest green
- [x] 4.2 Live: /bank renders real tables for a reconstructed question (112-2 寄生蟲 Q31, screenshot)

## 5. Deploy

- [x] 5.1 Deployed neurons (Cloudflare Pages) via `pnpm run deploy:cf` (waves 1–3); main pushed (`35280f4`), GH Actions Deploy CF Pages + Dexie lint green
- [x] 5.2 Prod verified: `med-study-rpg.com/neurons/` serves 175 explanationBlocks; 題庫 112-2 Q31 renders 2 real tables; control question falls back to flat text

## 6. Follow-up (separate work — see handoff)

- [~] 6.1 Severe quarantine (83) — TRIAGED via 6 agents (2026-06-24): 25 no-table (flat correct), **27 recovered+applied** (13 zero-loss + 14 severe Bucket A via upgraded gate), 56 remain in `quarantine-severe.json`. Owner-review queue `quarantine-review.md`: Bucket A DONE; Bucket B (4 dropped real content — purine/Netter-figure/drug-name, correctly stay flat); Bucket C (27 needs-human medical-judgment alignment, deferred to image-crop side-quest)
- [x] 6.5 Gate upgrade + Bucket A apply (2026-06-24, post-Codex fusion consult): faithfulness gate switched from `≤4 multiset-miss` → `entirely-absent non-furniture content token == 0` (+ row-width). Recovered **+35 gate-failed-but-faithful** tables (21 mild + 14 severe Bucket A); 477 total. Both Claude+Codex independently endorsed the metric (multiset over-rejects de-dup/footer noise). Position-blind precision gap acknowledged (can't catch cell-swap) — mitigated by agent skip-discipline; structural fix = image-crop for the unrecoverable tail (next change).
- [x] 6.2 Moderate-flagged tables (heuristic 15–29 fragment lines, 263 q) — DONE: all 19 chunks (00–18) processed across 3 waves = **+148 applied** → total **323 explanationBlocks**; ~25 gate-quarantined (dropped scrambled figure-OCR / row-width fail), render flat text as before
- [x] 6.3 Mild-flagged tables (heuristic 8–14 fragment lines, 395 q) — DONE: all 29 chunks (00–28) processed across 5 waves = **+106 applied** → total **442 explanationBlocks**; lower yield than moderate (~27% — many short spans are prose lists / image-only tables, agents correctly skip as no-table)
- [x] 6.4 Archive this change — batch closed (severe/moderate/mild waves + quarantine triage done; 477 explanationBlocks live). The 29 destroyed-OCR flat-text tables split into follow-up change `add-neurons-explanation-tables-image-tail`.
