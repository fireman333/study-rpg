# Tasks — recover-neurons-pdf-provenance-notext-booklets

## 1. Investigation (owner-prompted)
- [x] 1.1 Confirm the 5 "scanned" booklets aren't image-only: 4/5 (104-1一/二, 105-1一/二) have clean CJK text + 題號; only 104-2一 is garbled-font.
- [x] 1.2 Era layout: verify corpus subject/book labels are era-correct (104-106 vs 107-115) and 0 unresolved 104-105 questions hide in the sibling book (no era book-mismatch).
- [x] 1.3 The 12 leftover gaps: cross-check vs official 考選部 papers — all match corpus exactly; unmapped only because 陽明 詳解 lacks them (no corpus error).

## 2. Resolver + deterministic recovery
- [x] 2.1 Drop the `notext`/scanned skip in `resolve_residual.py`; let booklets flow through clean (stem-run≥8) / garbled (numeric+Latin) paths.
- [x] 2.2 Re-run → residual map 922 entries (738 cjk-vote + 14 latin-vote + 40 numeric+latin + 130 prior agent); 67 garbled → vision worklist.

## 3. Vision pass + verified overrides
- [x] 3.1 Prep rendered-page context (104-2一 101 pages + 104-2二), chunked.
- [x] 3.2 Run vision Workflow + direct agents; collect `{id, page0}`. Resolved most of 104-2一; agents also CONFIRMED 陽明 skipped 7 cards (booklet jumps card numbers) and mis-filed 醫學一 micro 詳解 into 106-1 醫學二 biochem slots 45-48.
- [x] 3.3 Fold into `agent-resolved.json`; `resolve_residual.py --agent-results` re-gates.
- [x] 3.4 Add `provenance/verified-overrides.json` (4 image-rendered / non-qNumber-order cards) + builder 4th source → maps 106-1二 Q37 (image card) + 104-2一 Q8/Q51/Q53.
- [x] 3.5 Gap accounting toward 4400: every unmapped question categorized recoverable vs 陽明-absent (cross-checked vs official 考選部 papers). Located the 3 owner-found reworded cards (image-rendered stems) + 104-1一 Q13.

## 4. Validate + ship
- [x] 4.1 Full validation: 400 newly-enabled clean entries all stem-run≥8; 104-2一 garbled monotonic; 0 cross-source duplicates; override visually spot-checked.
- [x] 4.2 Rebuild public map: **count 3881 → 4384** (residual 982 + override 4); newly-mapped questions verified.
- [ ] 4.3 `pnpm --filter @study-rpg/neurons-tw typecheck`.
- [ ] 4.4 Commit on `track-neurons` (explicit per-file staging; exclude others' WIP); merge → `main`; CF Pages deploy.
- [ ] 4.5 Prod-smoke: `fetch()` the public map on prod, assert `parseOk` + `count` 4384 + a newly-mapped id present.
- [ ] 4.6 **Owner-requested 44-PDF verification**: per 陽明 PDF, sample one mapped question, fetch its page from the live map, open the PDF at that page, confirm 題號+stem are there (validates the +1 conversion end-to-end).

## 5. Archive
- [ ] 5.1 `/opsx:verify` → `/opsx:archive` (sync delta into `neurons-explanation-pdf-provenance`).
- [ ] 5.2 Update project memory (coverage 4384 = true ceiling; era-layout finding; 16 = 陽明-absent/skipped/mis-filed not corpus error; verified-overrides mechanism).
