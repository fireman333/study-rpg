# Decision capture — neurons 簡答 (LLM per-option simplified explanations)

> Captured 2026-06-28 before a context handoff. NOT yet proposed/implemented. On `/spec resume`,
> run `/opsx:propose add-neurons-simplified-explanations` using this as the brief, then `/opsx:apply`.

## Goal
Replace the now-hidden inline 詳解 (hidden behind `SHOW_INLINE_EXPLANATION=false` in
`apps/neurons-tw/src/lib/feature-flags.ts`, 2026-06-28 commit `928b494`) with an LLM-generated
**per-option 簡答**: for each question, a short text explanation of **each option A/B/C/D…**, for fast
reading. **Text only — no images/tables.**

## Requirements (from owner)
1. **Content**: reference the ORIGINAL 詳解 (the existing `explanation` / `explanationBlocks` text +
   the option text + answer) and produce a concise per-option explanation covering every option
   (A/B/C/D…). Text only — explicitly NO figures/tables (those live in the original-PDF feature now).
2. **Generation pipeline**: use **agy (Gemini CLI)** OR **parallel Haiku agents** to read each
   question's original 詳解 + options and generate the per-option 簡答. **Also dispatch QA agents** to
   verify the generated 簡答 (correctness vs the official answer, no hallucination, each option
   covered, concise). Owner-confirmed approach.
3. **Display**: surface the 簡答 where the inline 詳解 used to be, on all 3 surfaces
   (QuestionBankPage / QuizModal / MockExamRunner). Either flip `SHOW_INLINE_EXPLANATION` back on
   (if 簡答 writes into the existing `explanation` field) OR add a new field (e.g.
   `optionExplanations` / `simplifiedExplanation`) and point `Explanation.tsx` (or a new component)
   at it + re-enable. Keep the 「看原始詳解 PDF」 button (authoritative source) alongside.

## Open questions to GRILL / discuss with Codex on resume
- **Data shape**: new `Question` field? Per-option map `{ A: string, B: string, ... }` vs a single
  block? Stored in the content pack JSON (`packages/content-neurons-tw`) baked at build time? (likely
  yes — static, mirrors `explanation`.) Does it need a Dexie/R2 change? (almost certainly NO — pure
  content, no per-user state.)
- **Generation source of truth**: which corpus file holds the original 詳解 to feed the LLM, and
  where do generated 簡答 get written (a sidecar JSON merged at build, like the provenance maps?).
- **agy vs Haiku-agents**: agy headless (`"$HOME/.local/bin/agy" -p ...`) for cost/throughput vs
  parallel Haiku agents for control + structured output + built-in QA fan-out. ~4600 questions →
  batching + QA gate strategy (mirror the 詳解-table-rebuild waves: ~6 agents/wave + auto-verify gate
  + per-batch checkpoint). Consider a Workflow (fan-out generate → QA verify → synthesize).
- **QA criteria**: each option covered; answer-consistent (the marked-correct option's rationale must
  be "why correct", others "why wrong"); concise (length cap?); no invented facts; flag low-confidence
  for human review. Disputed/送分 questions handled.
- **Display component**: reuse `Explanation.tsx` or new per-option list UI (A/B/C/D rows)?

## Pointers (where things are)
- Flag: `apps/neurons-tw/src/lib/feature-flags.ts` → `SHOW_INLINE_EXPLANATION`
- Renderer: `apps/neurons-tw/src/components/Explanation.tsx`
- 3 surfaces: `routes/QuestionBankPage.tsx`, `components/QuizModal.tsx`, `components/MockExamRunner.tsx`
- Content pack: `packages/content-neurons-tw/` (build → `apps/neurons-tw/public/content/neurons-tw/`)
- Prior art for batched agent content work + QA gates: the 詳解 flattened-table rebuild handoff
  (`~/.claude/scratch/handoff-neurons-explanation-tables-2026-06-24.md`).
