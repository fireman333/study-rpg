## Why

The `add-neurons-simplified-explanations` ship left **80 of 4,588 questions without a per-option 簡答** (recorded in `provenance/option-explanations.manual-review.json`): 26 deterministic-fail (the generated lines were fine but one option exceeded the 80-CJK cap — math / multi-mechanism answers) and 54 QA-major-fail (the text 詳解 was too poor — PDF-flatten 跑版 / garbled tables / didn't explain the wrong options — so the model couldn't produce a faithful 簡答). Those questions show only the 正解 + the 「看原始詳解 PDF」 button. We can now finish them by regenerating from a **richer source — the original 陽明 詳解 PDF page** (the authoritative human-authored 詳解, including the tables/figures the text extraction mangled), which we already map per question.

## What Changes

- **Backfill the 80 via three queues** (not one path — Codex-advised, 2026-06-29):
  - **26 over-length → text-compress** (Haiku, "shorten only, keep the judgment, no new facts"): a formatting fix, no PDF needed.
  - **54 QA-fail → original-PDF-page vision**: for those with a page map (`question-page-map.json` / `…-residual.json` cover **44/54** of the QA-fails — verify at apply), render the PDF page (PyMuPDF, 2.5× PNG) and feed it to **Claude Sonnet vision** with the qid / question-number / stem / options / answer; the model locates THIS question's 詳解 region and writes the per-option 簡答, returning `NEEDS_REVIEW` if the region is absent.
  - **fallback (the ~18 with no page map, + any still-failing) → Sonnet text strong-regen** from stem/options/answer + the original text 詳解 (may reason from the stem + medical sense for unsupported wrong options, must NOT claim PDF support); still-failing → stay in manual-review.
- **Reuse the existing pipeline** end-to-end: the same deterministic validator (`scripts/option-explanations/validate.ts`), the same QA judge, the same `option-explanations.generated.json` sidecar (content-hash keyed), the same build merge + display. Only QA-passed results are merged; the rest stay in `manual-review.json`.
- **Record generation provenance** per entry: `source: 'pdf-page-vision' | 'text-compress' | 'text-strong-regen'` (+ model / pdf file / page / scale) so re-runs and audits know how each 簡答 was made.

## Capabilities

### New Capabilities
<!-- None. -->

### Modified Capabilities
- `neurons-simplified-explanations`: ADD that a 簡答 MAY be generated from the original 詳解 PDF page (vision) or by compression / strong-regeneration when the text 詳解 is insufficient, and that each entry records its generation `source`. The per-option contract (coverage / framing / length / no-invention / disputed) is unchanged — only the permitted generation inputs widen.

## Impact

- **Content pack**: new offline scripts under `packages/content-neurons-tw/scripts/option-explanations/` (PDF-page render + the 3-queue backfill orchestration); merges into the SAME `provenance/option-explanations.generated.json`; updates `manual-review.json`. New dev dep PyMuPDF (`pip install pymupdf`, offline only — not in app/CI).
- **App**: none (the 簡答 displays through the existing `Explanation.tsx`; backfilled questions simply start rendering once present).
- **Storage/deploy**: zero Dexie/R2; ships via the existing content-build → CF Pages pipeline (rebuild bakes the new entries).
- **Cost**: tiny (~62 Sonnet-vision + ~26 Haiku-compress + ~18 Sonnet-text, one-time).
- **Source PDFs**: 44 local at `~/Desktop/國考/一階國考/陽明國考考古/*.pdf`; page map 0-based.
