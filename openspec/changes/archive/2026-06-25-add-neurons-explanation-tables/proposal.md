# Render reconstructed tables in 詳解 via structured explanationBlocks

## Why

A corpus audit found ~250–860 explanations whose original PDF *tables* were
extraction-flattened to one cell per line, rendering as a vertical column of short
fragments (player-reported as 「表格被轉成文字」). A flat-string regex can't repair
them (column count is ambiguous; naive auto-rejoin corrupts — prior decision). The
fix (vetted with Codex) is to store a structured representation and render real
tables. Format chosen by the owner: structured `explanationBlocks` (over
markdown-in-string) because it is **machine-verifiable** — a validator can assert
each row's cell count and that every original cell token is accounted for, catching
the silent column-misalignment that is the main risk for medical content.

## What Changes

- **Core** (`@study-rpg/core`): add the `ExplanationBlock` type
  (`{type:'prose',text} | {type:'table',columns,rows,caption?}`) and an optional
  `Question.explanationBlocks?` field. Additive + optional (pre-1.0 PATCH bump
  `0.6.1 → 0.6.2`; 二階 fork unaffected — neurons consumes core via workspace).
- **Renderer**: a shared `<Explanation>` component (neurons) renders blocks — prose
  as text, tables as real `<table>` in an `overflow-x:auto` wrapper (mobile scrolls
  a genuine table, never card-ified). Falls back to the flat `explanation` string
  when no blocks. Wired into all 3 surfaces: QuizModal, MockExamRunner,
  QuestionBankPage.
- **Build**: `explanationBlocks` is carried through verbatim (the whitespace
  normalizer still only touches the `explanation` string).
- **Reconstruction (content data)**: flattened tables on the **severe** set
  (≥30 fragment lines) are faithfully regrouped into blocks by LLM agents and
  applied to `packages/content-neurons-tw/data/medexam-reconciled/questions.json`,
  gated by an automated validator (row-width == columns, ≤4 non-footer source
  tokens missing). Reconstructions that fail the gate (scrambled column order,
  destroyed OCR) are **quarantined** (left as flat text) for human review — never
  auto-applied. `id` / `answer` are never touched.

## Impact

- New capability: `neurons-explanation-tables`. MODIFIED: `core-npm-package`
  (new `ExplanationBlock` export + optional field).
- Code: `packages/core/src/types.ts`, `packages/core/{package.json,CHANGELOG.md}`,
  `apps/neurons-tw/src/components/Explanation.tsx` (new) + QuizModal /
  MockExamRunner / QuestionBankPage wiring, `packages/content-neurons-tw/scripts/build.ts`.
- Content: reconstructed `explanationBlocks` on the severe set (applied in waves;
  this checkpoint = 54 questions: 5 pilot + 49 wave-1; quarantined held back).
- Backward-compatible: questions without blocks render exactly as before.
- **Deploy**: neurons app only (Cloudflare Pages). No Worker / D1 / sync / Dexie /
  R2 change → no dexie-fixture-lint concern.
