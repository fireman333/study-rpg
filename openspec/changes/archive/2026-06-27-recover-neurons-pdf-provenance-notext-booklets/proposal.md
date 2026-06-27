## Why

`raise-neurons-pdf-provenance-agent-coverage` deferred 500 questions as "scanned (no-text-layer) booklets needing OCR". Investigation showed that framing was **wrong**: 4 of the 5 booklets (104-1一, 104-1二, 105-1一, 105-1二) carry a **clean CJK text layer with clear 題號 markers** — they were flagged `notext` only because the base resolver's `find_question_starts` matched <30 anchors in their (different) layout, then **excluded** them from resolution entirely. The 5th (104-2 醫學一) is garbled-font mojibake like 104-2二 (Latin + numbers survive; pages render fine). **None of the five actually need OCR.**

Running the existing stem-run resolver on the 4 clean booklets resolves **96–98%** each; the garbled 104-2一 resolves like 104-2二 (numeric-anchor + Latin, then vision agents for the remainder). This recovers ~450 questions for near-zero cost.

This change also records two investigations prompted by the owner:
- **Era book-layout difference (104-106 vs 107-115)**: in 104-106, 醫學一 = 解剖/胚胎/組織/微生物免疫/寄生蟲/公衛 and 醫學二 = 生理/生化/藥理/病理; 107-115 swapped 生理/生化 into 醫學一 and 微生物/寄生蟲/公衛 into 醫學二. Verified the corpus subject/book labels are **era-correct** (104-1/106-1 match the old layout, 110-1 matches the new), the 陽明 PDFs follow the same convention, and **0 of the unresolved 104-105 questions are findable in the sibling book** — so the era difference is correctly accounted for end-to-end and is NOT a source of mapping failures.
- **The 12 leftover born-digital gaps**: cross-checked against the official 考選部 papers (`一階國考104-106` / `一階國考107-115`) — every one matches the corpus exactly at its (year, session, book, qNumber). They are unmapped purely because 陽明's volunteer 詳解 set never wrote those specific questions up (their distinctive terms appear in none of the 44 陽明 PDFs). No corpus error; provenance correctly hides them.

## What Changes

- **`resolve_residual.py` no longer skips `notext` booklets.** They flow through the normal clean (stem-run ≥8 gate) / garbled (numeric-anchor + Latin, then vision) paths. A genuinely textless page still yields no token hit → worklist (button hidden), never a guessed page. (The `notext` flag was an anchor-count heuristic, not a real "no text layer" signal.)
- **Vision agent pass** for the truly garbled booklets (104-2一 ~90 questions + the leftover 104-2二) — rendered-page reading, identical to the prior 104-2二 pattern. Results committed to `provenance/agent-resolved.json` and folded via `--agent-results`, re-gated for monotonicity.
- **New committed `provenance/verified-overrides.json`** + a 4th builder source: a handful of human/agent-VERIFIED pages that bypass the automated gates because the pipeline cannot gate them — the card's **stem + options are rendered as embedded IMAGES** (no extractable text → stem-run can't confirm) and/or the 陽明 booklet's physical card order ≠ 考選部 qNumber (breaks the monotonicity fallback). Each was confirmed by reading the actual rendered card (題號 + stem + options + 答案 + figure). Highest-priority source.
- **Coverage**: 3881 → **4384 / 4600 — the true ceiling** (every question whose 詳解 actually exists in the 陽明 PDFs is now mapped). The remaining **16** are confirmed to have **no original 陽明 詳解 page**: 7 cards 陽明 simply skipped (104-2一), 4 where 陽明 mis-filed 醫學一 microbiology 詳解 into the 106-1 醫學二 biochem slots 45-48 (biochem 詳解 absent), and 5 questions 陽明 never wrote up (107-1二 Q34/35/36, 111-1一 Q74, 112-2二 Q75). Plus 200 no-source-115-1 (no PDF). All keep the button hidden (graceful). The 5 never-written are candidates for a separate AI-generated-inline-詳解 change (NOT provenance).

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `neurons-explanation-pdf-provenance`: a booklet is excluded only when its page genuinely lacks a usable text layer for the question (no token hit) or has no source PDF — not merely because the anchor detector matched few anchors. Booklets previously dismissed as "scanned" are resolved by stem-run (clean text) or numeric-anchor + Latin + vision (garbled font).

## Impact

- **Modified**: `reconcile/healthcheck/resolve_residual.py` (drop the `notext`/scanned skip) · `provenance/question-page-map-residual.json` (regenerated, +499 entries) · `provenance/agent-resolved.json` (adds 104-2一 + leftover 104-2二 vision pages) · `provenance/residual-agent-worklist.json` (refreshed) · `apps/neurons-tw/scripts/build-provenance-map.mjs` (4th source = verified-overrides, highest priority).
- **New**: `provenance/verified-overrides.json` (4 human/agent-verified pages bypassing the automated gates — image-rendered stems / non-qNumber card order).
- **No** runtime/UI/sync change (`LocalPdfButton` + adapter unchanged — bigger map only). Public map stays a gitignored build artifact; CI builds it from committed JSON without PDFs.
- **Deferred** (separate changes): (1) the 200 115-1 questions (blocked until a 115-1 PDF exists); (2) AI-generated inline 詳解 for the 5 questions 陽明 never wrote (a content-gen change, not provenance — accuracy-reviewed against the official answer + evidence, labelled AI-generated). macOS Vision OCR was confirmed available but **unnecessary** (none of the booklets are image-only).
