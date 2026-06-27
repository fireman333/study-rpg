# Tasks — fix-neurons-pdf-provenance-base-offbyone

## 1. Verification (owner-requested 44-PDF check)
- [x] 1.1 Sample mapped questions from each of the 44 陽明 PDFs against the **live prod map**; stem-run-verify the page. 36 PDFs fully clean; 6 had a run<8 sample → investigated.
- [x] 1.2 Full-map stem-run audit by source: manifest 0, override 0, residual 78 (garbled, correct), base 109 → 77 off-by-one + 19 image-card + 13 garbled.

## 2. Fix
- [x] 2.1 Re-resolve the 77 off-by-ones to the longest-stem-run page in the booklet; 65 land a clear winner (run≥10, mostly +1) → `provenance/base-corrections.json`. 12 image-rendered (no extractable stem) deferred.
- [x] 2.2 Builder reads `base-corrections.json` as a 5th source (wins over base/residual).
- [x] 2.3 Rebuild + re-verify: 65/65 corrected pages now stem-run≥10; the sampled failures (106-1二 Q61, 113-1二 Q44, 113-2二 Q61, …) confirmed fixed. count unchanged (4384).

## 3. Ship
- [ ] 3.1 `pnpm --filter @study-rpg/neurons-tw typecheck`; commit on `track-neurons` (explicit staging); merge → `main`; CF Pages deploy.
- [ ] 3.2 Prod-smoke: re-run the off-by-one samples against the deployed map; assert the corrected pages.

## 4. Archive
- [ ] 4.1 `/opsx:archive` (sync delta).
- [ ] 4.2 Memory note: 44-PDF verification method + base off-by-one finding + base-corrections mechanism. Deferred: 12 image-rendered + 13 garbled base entries (vision pass).
