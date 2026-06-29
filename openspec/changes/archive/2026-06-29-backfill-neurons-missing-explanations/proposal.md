## Why

After `backfill-neurons-simplified-explanations` (2026-06-29), **12 of 4,600 questions still render nothing inline** — they have an empty `explanation` (詳解), so the build never produced a per-option 簡答 for them (the 簡答 pipeline only runs on questions with a non-empty 詳解). They show only the 正解 + the 「看原始詳解 PDF」 button. The 12: `106-1-醫學二-生物化學` Q37/Q38/Q45/Q46/Q47/Q48, `107-1-醫學二-寄生蟲學` Q34/Q35, `107-1-醫學二-公共衛生學` Q36, `111-1-醫學一-生理學` Q74/Q75, `112-2-醫學二-藥理學` Q75. All have 4 options + a valid 考選部 answer; only the 詳解 is missing.

**Re-examination of the source PDFs (2026-06-29) shows the 詳解 is usually NOT actually missing — it was dropped in extraction.** Rendering the two page-mapped ones proves 陽明 wrote real 詳解 cards for these blocks: `106-1醫學(二).pdf` p31 shows a full AMPK 詳解 card; `111-1醫學(一).pdf` p117 shows a disulfide-bond 詳解 card. So the empty `explanation` is an **extraction gap, not a 陽明 gap** → the right move is **recover-first**, and AI-generate only where 陽明 genuinely skipped a question.

## What Changes

- **Complete all 12 via recover-first, AI-fallback:**
  - **Recover** the authoritative 陽明 詳解 from the original PDF page wherever a card for that exact 題號 exists (transcribe faithfully; not AI-tagged).
  - **AI-generate** a 詳解 only for any question 陽明 genuinely skipped (no card for that number) or whose recovered 詳解 is too thin to be useful. The AI 詳解 uses the **exact 115年 convention**: `正解：(X)` + per-option prose + the footer line `（本詳解由 AI 生成，未經陽明審定）`, and the question gets `explanationSource: 'ai-generated'` (the app already renders the 🤖 AI-note for that flag, identical to the 200 115年 questions).
- **Generate a per-option 簡答** for all 12 (derived from the now-present 詳解) via the existing 簡答 pipeline, so they display inline exactly like the other 4,588.
- **Never touch `id` / `options` / `answer`** — those are 考選部 official. This change only fills the missing `explanation` (+ `explanationSource` for AI ones) and adds 簡答 sidecar entries.

## Capabilities

### Modified Capabilities
- `neurons-corpus-ingestion`: ADD that a question left with an empty `explanation` by extraction MAY have its 詳解 recovered from the original 陽明 PDF page, or AI-generated and tagged (`explanationSource: 'ai-generated'` + footer) in the 115年 convention when 陽明 has none.
- `neurons-simplified-explanations`: these 12 now carry a per-option 簡答 like every other eligible question (the per-option contract + validator + QA gate are unchanged; the 簡答 for an AI-tagged 詳解 is derived from that 詳解).

## Impact

- **Content pack**: 12 `explanation` fields filled in `data/medexam-reconciled/questions.json` (+ `explanationSource` on the AI-generated subset); 12 new entries in `provenance/option-explanations.generated.json`. Reuses the committed backfill scripts + a per-question vision workflow.
- **App**: none (display is the existing `Explanation.tsx` + the existing `explanationSource==='ai-generated'` AI-note path; these questions simply start rendering once 詳解 + 簡答 are present).
- **Storage/deploy**: zero Dexie / R2 / Worker / D1 / economy; ships via the existing content-build → CF Pages pipeline.
- **Source PDFs**: the 4 papers at `~/Desktop/國考/一階國考/陽明國考考古/` (`106-1醫學(二).pdf`, `107-1醫學(二).pdf`, `111-1醫學(一).pdf`, `112-2醫學二(全)_merged.pdf`).
- **Cost**: tiny (~12 vision recoveries + a handful of AI 詳解 + 12 簡答, one-time).
