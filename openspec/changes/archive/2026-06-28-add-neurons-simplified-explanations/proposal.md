## Why

The inline 詳解 (flat 陽明/AI explanation text) was hidden behind `SHOW_INLINE_EXPLANATION=false` (commit `928b494`) because its quality — PDF-flatten 跑版 + AI drift — was unreliable to surface verbatim. Players now see only 正解 + the authoritative 「看原始詳解 PDF」 button, with no fast in-app reading aid. We can recover that aid cheaply: the existing 詳解 already explains why the answer is correct, so an LLM can condense it into a **per-option 簡答** (one short line per option — why the correct one is right, why each wrong one is wrong) that is faster to scan than prose and avoids the table/figure 跑版 entirely (those stay in the PDF feature).

## What Changes

- **NEW per-option 簡答 content**: for every question, a short text explanation of each option A/B/C/D… derived from the existing `explanation` + `options` + `answer`. Text only — no tables/figures.
- **NEW offline generation pipeline** (build-time, not shipped to players): a deterministic Workflow orchestrator fans out **Claude Haiku 4.5** agents to generate the per-option 簡答 from each question's authoritative 詳解, gated by a three-layer QA (100% deterministic validator + risky-subset LLM QA + per-subject random sample), resumable via content-hash. Output is a committed sidecar JSON.
- **NEW `optionExplanations` Question field**: `build.ts` merges the QA-passed sidecar into each question as `optionExplanations?: Record<string,string>` (additive; never alters `id`/`answer`/`stem`/`options`/`explanation`). Field added to the core `Question` interface.
- **CHANGED inline display**: the inline explanation slot on all 3 surfaces (QuestionBankPage / QuizModal / MockExamRunner) is re-enabled but now renders **only** a clean per-option list (`(A) …` / `(B) …` / …) — the prose/table 詳解 is no longer shown inline. The correct option's row is visually marked. The 「看原始詳解 PDF」 button stays alongside as the authoritative source.
- A question with no `optionExplanations` (not yet generated / failed QA) shows nothing inline — no regression vs. today's hidden state.

## Capabilities

### New Capabilities
- `neurons-simplified-explanations`: per-option 簡答 for the neurons corpus — the offline Haiku generation pipeline + QA gate + sidecar→build merge into `Question.optionExplanations`, and the per-option inline display on the three answer surfaces. Sibling to `neurons-explanation-figures` / `neurons-explanation-table-images` (each an additive, build-injected explanation enrichment).

- `neurons-explanation-tables`: REMOVE the inline structured-block (prose/real-table) rendering requirement — superseded by the per-option 簡答; `explanationBlocks` data/build retained, reached via the PDF.
- `neurons-explanation-table-images`: REMOVE the inline image-table rendering requirement — superseded; data/assets/build retained, reached via the PDF.
- `neurons-explanation-figures`: REMOVE the inline figure rendering requirement — superseded; data/assets/build retained, reached via the PDF.

<!-- These three retire only the INLINE RENDERING (which was already flag-hidden since 928b494); their extraction/data/build requirements are untouched. The single shared renderer (Explanation.tsx) now shows the per-option 簡答; the figures/tables are reached via the 「看原始詳解 PDF」 button. The `optionExplanations` field itself is additive and does not change `neurons-corpus-ingestion`. -->
**Note**: the build still injects `explanationBlocks` / `explanationTableImages` / `explanationFigures` onto questions (those capabilities' data contracts are unchanged) — this change only removes their inline rendering from the shared component.

## Impact

- **Core**: `packages/core/src/types.ts` — add `optionExplanations?: Record<string, string>` to `Question` (additive, optional).
- **Content pack**: new `packages/content-neurons-tw/provenance/option-explanations.generated.json` (+ `.meta.json` + `.manual-review.json`) sidecar; `packages/content-neurons-tw/scripts/build.ts` merges it into baked `questions.json`. New generation script(s) under `packages/content-neurons-tw/scripts/` (offline only; not in the app bundle or CI deploy path).
- **App**: `apps/neurons-tw/src/lib/feature-flags.ts` (`SHOW_INLINE_EXPLANATION` re-enabled / repointed), `apps/neurons-tw/src/components/Explanation.tsx` (or a new per-option list component), and the three surfaces that render it (QuestionBankPage / QuizModal / MockExamRunner).
- **Storage**: zero Dexie / zero R2 change — pure static content with no per-user state (mirrors the provenance-map precedent).
- **Deploy**: no new CI step; the 簡答 is baked into `questions.json` at content build, shipped via the existing CF Pages pipeline.
- **Cost**: ~4,600 questions × Haiku 4.5 batched 4/call ≈ ~1,150 generation calls + ~10–20% LLM QA; a one-time offline run, re-runnable as deltas only.
