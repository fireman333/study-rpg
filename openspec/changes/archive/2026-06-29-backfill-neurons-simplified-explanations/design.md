## Context

`add-neurons-simplified-explanations` (shipped 2026-06-28, main `9fc41da`) generated per-option 簡答 for 4,508/4,588 questions from the text 詳解. 80 remain in `provenance/option-explanations.manual-review.json`. The reusable pipeline (`packages/content-neurons-tw/scripts/option-explanations/`) — `hash.ts`, `validate.ts` (MIN_LEN 8 / MAX_LEN 80 / sentinel-exempt / markup-reject / sourceHash), `consolidate-and-validate.ts`, `finalize-full-run.ts` — and the committed sidecar + build merge + `Explanation.tsx` display are all in place and unchanged. This change only adds the generation paths to FINISH the 80. Architecture per a Codex consult (2026-06-29).

Facts verified at handoff: 80 = **26 deterministic-fail (over-length)** + **54 qa-major-fail**. Of the 80, **62 have a PDF page map** (42 `question-page-map.json` + 20 `question-page-map-residual.json`), **18 have none**. (At apply, recompute the page-map ∩ qa-fail split — the 26 over-length usually don't need the PDF.) 44 source PDFs at `~/Desktop/國考/一階國考/陽明國考考古/`; page index is **0-based**; render `page.get_pixmap(matrix=fitz.Matrix(2.5,2.5), alpha=False)`. PyMuPDF not yet installed (`pip install pymupdf`).

## Goals / Non-Goals

**Goals**: ship valid, QA-passed 簡答 for as many of the 80 as possible, from the richest source available per question; reuse the existing validator / QA / sidecar / display unchanged; never ship an unverified 簡答 (no-簡答 beats wrong-簡答).

**Non-Goals**: not re-generating the 4,508 already-shipped; not changing the per-option contract; not OCR-first; not all-80-through-vision; not adding a runtime/app dependency on the PDF (the 簡答 is still baked text).

## Decisions

### D1. Three queues, not one path (Codex-advised)
- **compress_queue** = the 26 deterministic over-length fails → **Haiku 4.5 text**, "shorten only: keep each option's existing judgment, add no facts, ≤80 CJK chars, drop secondary clauses". A formatting fix; sending these through vision risks new reading errors. Second-round "shorten harder" retry on still-over-length.
- **pdf_queue** = qa-fails WITH a page map → **Claude Sonnet vision** over the rendered page.
- **fallback_queue** = qa-fails with NO page map (+ any pdf/compress item that fails twice) → **Claude Sonnet text** strong-regen.

### D2. PDF path: render whole page → Sonnet vision (NOT OCR-first, NOT Haiku-vision)
- Render the mapped page (PyMuPDF 2.5× PNG; retry at 3.5× if the page is dense/tabular and the model returns low confidence). Cache to `tmp/pdf-pages/{qid}.png`.
- Feed the WHOLE page (no crop heuristic in v1) + qid + question-number + stem + options + answer. Prompt: "This page may hold several questions' 詳解 — use ONLY the region for Q{n}; if its region is absent/unclear return `NEEDS_REVIEW`; do not borrow other questions' 詳解." Pass stem+options because 詳解 pages often don't repeat the question.
- **Crop only as a retry**: if QA flags "grabbed the neighbouring question", segment the page text-blocks between Q{n} and Q{n+1} and re-render that band.
- Sonnet (not Haiku) vision is primary: dense CJK + tables + multi-question pages — a wrong read costs more (manual/QA) than Haiku saves at N≈62.

### D3. The ~18 with no page map — layered fallback
- **A. Sonnet text strong-regen** from stem/options/answer + original text 詳解 (may reason from stem + medical sense for wrong options the 詳解 omits, but MUST NOT claim PDF support; `source='text-strong-regen'`).
- **B. Derive a page** (only for still-QA-failing): search the qid's PDF for the question number / a stem keyword, or local-offset from a neighbouring mapped qid → then run the PDF path.
- **C. Leave in manual-review** if validator/QA still fail. No-簡答 beats wrong-簡答.

### D4. Reuse the whole existing pipeline; add only generation + provenance
- Every output → the SAME deterministic `validateEntry` → the SAME QA judge → merged into the SAME `option-explanations.generated.json` (content-hash `sourceHash` keyed; rebuild bakes them). Per-entry add `source: 'pdf-page-vision'|'text-compress'|'text-strong-regen'` (+ model / pdf file / page / scale / attempt). Still-failing → `manual-review.json`.
- Per question budget: generate → deterministic-repair ×1 → QA-repair ×1 → still fail → manual-review.

### D5. Engine recap
compress = Haiku 4.5 text · pdf = Sonnet vision · fallback/QA-repair = Sonnet text · QA judge = existing (add a Sonnet QA arbitration round only for PDF-path fails). **Gemini/agy = optional fallback only, not primary** — at N=80 the orchestration risk isn't worth the marginal saving (mirrors the main run's Haiku-over-agy call).

## Risks / Trade-offs

- **Wrong-question region on a multi-question page** → Mitigation: give the question number + stem + options; require `NEEDS_REVIEW` over guessing; crop-retry on QA "neighbour" flags.
- **Vision invents beyond the page** → Mitigation: same prompt discipline (source-only; sentinel for genuinely-unexplained wrong options); same QA judge gates it.
- **PyMuPDF / page-map drift** (0-based, residual map) → Mitigation: spot-check 3 rendered pages against the question before the batch; the map is the same one the live 「看原始詳解 PDF」 button uses.
- **18 fallback questions may stay blank** → acceptable (they already show nothing + the PDF button).

## Migration Plan

1. `pip install pymupdf`; recompute the 3 queues from `manual-review.json` ∩ page maps; spot-check 3 rendered pages.
2. Run compress_queue (Haiku) → validate.
3. Render pdf_queue pages → Sonnet-vision Workflow → validate → QA.
4. Run fallback_queue (Sonnet text) → validate → QA; optional derive-page retry.
5. Merge pass-pass into `option-explanations.generated.json` (+ `source`); update `manual-review.json`; rebuild content; `verify:option-explanations` gate; report shipped/remaining + a few samples.
6. Ship via existing flow: commit → archive → merge track-neurons → main → CF Pages → prod spot-check a backfilled qid.
**Rollback**: the merge is additive; a bad entry is fixed by re-running its queue (content-hash). The display already handles present/absent.

## Open Questions
- Exact pdf_queue size after recomputing page-map ∩ qa-fail (handoff estimate: ~44 of the 54 qa-fails are mapped; the 26 over-length are mostly unmapped but go to compress anyway).
- Whether the existing QA judge (Haiku) is strict enough for vision outputs, or add a Sonnet arbitration round (decide after a 10-question pdf_queue pilot).
