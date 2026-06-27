# Design — recover-neurons-pdf-provenance-notext-booklets

## Decision 1 — "notext" was an anchor-count heuristic, not a real text-layer signal

The base resolver marks a booklet `notext` when `find_question_starts` matches <30 題號 anchors, then excludes it. But anchor-pattern misses ≠ no text. Empirically, of the 5 excluded booklets:
- **104-1一/二, 105-1一/二** — clean CJK text layer, clear 題號 markers ("44.", "48."); 96–98% resolve via the existing stem-run≥8 gate (content-based, anchor-independent).
- **104-2一** — garbled custom font (CJK → mojibake) but Latin terms + page numbers survive and pages render correctly; resolves like 104-2二 (numeric-anchor + Latin, then vision).

Fix: the second-layer resolver stops skipping `notext` booklets and lets them flow through the clean / garbled paths. The stem-run≥8 content gate is the safety net — a genuinely textless page yields no token hit → worklist (button hidden), never a guessed page. So enabling these booklets cannot ship a wrong page; it can only recover real ones.

OCR is therefore unnecessary for these five. macOS Vision (Swift, zh-Hant) is a viable fallback if a truly image-only booklet ever appears, but none here are.

## Decision 2 — Era book-layout difference is real but already handled

104-106 and 107-115 split the two exam books by different subject sets (生理/生化 moved 醫學二→醫學一; 微生物/寄生蟲/公衛 moved 醫學一→醫學二 across the boundary). This could in principle send a question's provenance search to the wrong 陽明 booklet. Verified it does not: the corpus subject/book labels are era-correct (104-1/106-1 carry the old layout, 110-1 the new), the 陽明 PDFs follow the same convention, and a sibling-book search of every unresolved 104-105 question returns **0** hits. The era difference is consistently reflected on all three sides (official 考選部 papers, corpus, 陽明 詳解), so mapping by `book` is correct.

## Decision 3 — The leftover born-digital gaps are 陽明-incompleteness, not corpus errors

The questions that remain unmapped after this pass were cross-checked against the official 考選部 papers and match the corpus exactly at their (year, session, book, qNumber). They are absent from the 陽明 詳解 PDFs (distinctive terms appear in none of the 44 files) — the volunteer 詳解 set simply never covered them. Provenance correctly hides them; there is no original page to open. (A broader corpus subject-audit for other potential mislabels remains a separate, unrelated track.)

## Outcome

Coverage 3881 → ~4330 / 4600. Residual unmapped (button hidden): 200 no-source-115-1 (no PDF) + a small 陽明-incomplete / reworded born-digital set + any truly textless page.
