## 1. Content rename

- [x] 1.1 Rename 「🎯 必中考古」 → 「🎯 高頻考古」 in 醫學一__解剖學.html / 醫學一__生理學.html / 醫學二__藥理學.html / 醫學二__免疫學.html / 醫學二__寄生蟲學.html
- [x] 1.2 Grep the whole `fragments/` dir for residual banned guarantee wording (保證/必中/100%/今年一定考/命中率) — none remain (「絕對厭氧」 is a microbiology term = obligate anaerobe, not guarantee language)

## 2. Close the enforcement gap (content/build only — no CramPage.tsx)

- [x] 2.1 Extend `verify-cram.ts` honesty grep to lint every 速看 block heading against `HONESTY_FORBIDDEN` (block bodies stay unlinted to avoid a false-positive on legit 100% medical stats)
- [x] 2.2 Update the stale D7-carve-out comments in `build-cram.ts` + `verify-cram.ts`

## 3. Rebuild + verify

- [x] 3.1 `pnpm run build:neurons-content` (80 速看 blocks, 0 skipped — no content loss) + `copy-content.mjs`
- [x] 3.2 `grep -c 必中 apps/neurons-tw/public/content/neurons-tw/cram.json` = 0 (dist also 0); 高頻考古 = 5/5 (dist + public)
- [x] 3.3 `verify:cram` PASS; negative test (reinject 必中 into gitignored dist) → validator FAILS with a 速看-heading violation → restored clean
- [x] 3.4 `pnpm -r typecheck` clean
- [x] 3.5 vitest 826/826 pass

## 4. Archive (owner-gated per project curator rules)

- [x] 4.1 Owner confirmed the spec-delta wording + approved archive + commit + merge (2026-07-06)
- [x] 4.2 Delta synced into `openspec/specs/neurons-cram-tab/spec.md`; change archived; committed with explicit per-file staging; merged track-neurons → main
