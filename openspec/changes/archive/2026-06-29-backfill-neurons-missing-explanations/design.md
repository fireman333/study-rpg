## Context

12 questions have an empty `explanation` so the 簡答 pipeline (which requires a non-empty 詳解) never covered them; they render nothing inline. The reusable 簡答 pipeline (`packages/content-neurons-tw/scripts/option-explanations/`: `hash.ts`, `validate.ts`, `backfill-prep.ts`, `render-backfill-pages.py`, `backfill-finalize.ts`, `resync-sidecar-hashes.ts`) + the committed sidecar + build merge + display are all in place from the prior change. The 115年 AI-詳解 precedent (200 questions, `explanationSource: 'ai-generated'`, text format `正解：(X)` + per-option prose + footer `（本詳解由 AI 生成，未經陽明審定）`, app renders a 🤖 note) is the template for the AI-fallback subset.

Re-examination (2026-06-29): the two page-mapped questions render real 陽明 詳解 cards (`106-1醫學(二).pdf` p31, `111-1醫學(一).pdf` p117), so the missing 詳解 is an extraction gap → recover-first.

## Goals / Non-Goals

**Goals**: give all 12 a faithful 詳解 (recovered from 陽明 where it exists, AI-generated + clearly tagged where it doesn't) and a per-option 簡答, so they display like the other 4,588; never ship unverified content silently.

**Non-Goals**: not re-running extraction for the whole corpus; not changing `id`/`options`/`answer` (考選部 official); not changing the per-option 簡答 contract; not auditing the other 4,588.

## Decisions

### D1. Recover-first, AI-generate only as fallback (per the re-examination)
Each question is resolved by a vision agent over its 陽明 詳解 PDF window:
- **Card for this exact 題號 exists** (matches qNumber + stem) → transcribe the 陽明 詳解 faithfully into `explanation`. NOT `ai-generated`. This is the expected path for most of the 12.
- **陽明 genuinely skipped this question** (the cards jump over its number) OR the recovered 詳解 is too thin/garbled to be useful → AI-generate (D3).

### D2. Locate each question's PDF window by interpolating neighboring mapped questions
The 12 are mostly unmapped, but their same-paper neighbors are in `question-page-map.json` / `…-residual.json`. For each, estimate the page from the nearest-by-qNumber mapped neighbors in the same paper and render a window (estimated page ±3, PyMuPDF 2.5×, isolated venv). The agent finds the exact card in the window (the 2-page-spillover lesson from the prior change still applies). The 2 already-mapped questions (Q38, Q75-生理) seed their own neighbors.

### D3. AI-fallback uses the exact 115年 convention
For the genuinely-missing subset: generate `explanation` = `正解：(X)\n\n(A) …\n(B) …\n(C) …\n(D) …\n\n（本詳解由 AI 生成，未經陽明審定）` (per-option prose affirming the official answer; conservative, no invented specifics), and set `explanationSource: 'ai-generated'`. The app's three surfaces already render the 🤖 AI-note for that flag — zero UI change, identical to 115年. Model: the parallel Sonnet vision agents generate it inline (they already hold the question + PDF-confirmation context); gemini/codex is an option if the owner prefers an independent model — decided at apply based on how many actually need AI (expected few). The official `answer` is never changed; the AI 詳解 must affirm it.

### D4. Then run the existing 簡答 pipeline on the 12
Once `explanation` is present, run `backfill-prep` → a gen+QA vision/text workflow → `backfill-finalize` (committed deterministic validator + QA + merge into `option-explanations.generated.json`) so each gets a per-option 簡答 (8–80 CJK, plain text, correct=why-right / others=why-wrong-or-sentinel). For AI-tagged 詳解, the 簡答 is derived from that 詳解; faithfulness over completeness. Still-failing → stay unshipped (no-簡答 over wrong-簡答), but with a now-present 詳解 they at least show the AI/recovered 詳解 via the PDF/AI path.

### D5. Corpus + sidecar ship together (the prior lesson)
Editing `questions.json` (`explanation`/`explanationSource`) changes the `sourceHash` of these 12, so their 簡答 sidecar entries are generated against the final corpus in the same change. Run `resync-sidecar-hashes.ts` + `verify:option-explanations` to guarantee the whole sidecar is consistent before shipping. No `id`/`options`/`answer` change → the 4,588 existing entries are unaffected.

## Risks / Trade-offs
- **Wrong-card on a multi-question page** → give the agent the qNumber + stem + options; require it to match the exact 題號 and return "no card" rather than grab a neighbour.
- **AI 詳解 medically wrong** → conservative prose affirming only the official answer; clearly tagged `ai-generated` (🤖 note) so users know it is unverified, exactly as 115年.
- **Page interpolation misses the window** → render a generous ±3 window; agent reports "not found in window" → widen once, else treat as 陽明-skipped → AI-generate.

## Migration Plan
1. Compute each question's 詳解 PDF file + estimated page window from neighbors; render windows.
2. Parallel vision agents: recover (faithful transcribe) or mark for AI-generate.
3. AI-generate the skipped subset (115 format + `explanationSource:'ai-generated'`).
4. Write `explanation` (+ `explanationSource`) into `questions.json` (id/options/answer untouched).
5. Run the 簡答 pipeline on the 12 → merge into the sidecar; `resync-sidecar-hashes.ts`.
6. Rebuild content; `verify:option-explanations` green; typecheck + vitest; Chrome dev smoke.
7. Ship: commit → archive → merge track-neurons→main → CF Pages → prod spot-check.
**Rollback**: additive; revert the 12 `explanation` edits + their sidecar entries (content-hash keyed).

## Open Questions
- Exact recover-vs-AI split (known only after the vision pass; expected mostly recover).
- Whether to route AI-fallback to gemini/codex vs the inline Sonnet agent (decide at apply by count).
