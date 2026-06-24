# Tasks — add-neurons-explanation-footer-cleanup

## 1. Extend the build normalizer

- [x] 1.1 Add 4 footer drop-regexes to `normalizeExplanation` in `packages/content-neurons-tw/scripts/build.ts` (陽明醫學系NNN 級 / NNN 第N次（暑/寒）醫學一二 / 陽明醫學系歷屆國考詳解 / 回目錄), in the same safe-subset loop
- [x] 1.2 Update the function's doc comment + the `neurons-corpus-ingestion` normalizer requirement to describe the new drops
- [x] 1.3 Deliberately do NOT drop bare single-digit lines (table-cell fragments, high FP risk) — documented in proposal

## 2. Verify

- [x] 2.1 Rebuild: `pnpm run build:neurons-content` → 4600/4600 imported, 0 skipped
- [x] 2.2 Corpus scan: all 4 footer patterns → 0 residual lines in the rebuilt `dist/questions.json`
- [x] 2.3 Spot-check the 3 reported micro/immuno questions no longer carry 陽明…級 / 第N次…醫學 footers

## 3. Deploy

- [ ] 3.1 Deploy neurons (Cloudflare Pages) via `pnpm run deploy:cf` from the deploy worktree `~/coding-scratch/study-rpg`
- [ ] 3.2 Prod spot-check: a 106–109 explanation (e.g. `108-2-醫學二-微生物暨免疫學-Q2`) renders without the 陽明…級 / 第N次…醫學 footer lines
