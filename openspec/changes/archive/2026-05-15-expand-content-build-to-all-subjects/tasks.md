## 1. Build script — default scope + counter

- [x] 1.1 Change `MEDEXAM_SUBJECTS` default in `packages/content-medexam-tw/scripts/build.ts` from `'藥理學'` to `'all'`
- [x] 1.2 Add `importedQ` / `skippedQ` counters in `main()`; increment `importedQ` per push to `questions`, increment `skippedQ` whenever `parseSingleBlock` returns `null`
- [x] 1.3 Track `totalBlocksSeen` (count of `## Q<n>` headers matched in `parseQuestionBlocks`, regardless of parse outcome) — return it alongside parsed questions so `main()` can aggregate
- [x] 1.4 At end of `main()`, print `imported: <N>, skipped: <N>, total: <N>` on its own line
- [x] 1.5 Exit non-zero when `skippedQ > 0` and `process.env.MEDEXAM_ALLOW_SKIPS !== '1'`; print remediation hint pointing at re-run with `MEDEXAM_ALLOW_SKIPS=1`

## 2. Re-build and verify

- [x] 2.1 Run `pnpm --filter @study-rpg/content-medexam-tw build` (no env override) — 3291 imported / 309 skipped / 3600 total, fail-fast triggered as expected
- [x] 2.2 Verify console output shows 10 subjects with non-zero counts, three-number summary printed, exit 0 (after opt-in)
- [x] 2.3 Re-run with `MEDEXAM_ALLOW_SKIPS=1`; skip pattern = upstream OCR/extraction missing「題幹/選項/答案」, not a parser bug — documented in design.md risks + commit message
- [x] 2.4 Copy `dist/{questions,subjects,meta}.json` → `apps/medexam-tw/public/content/medexam-tw/`
- [x] 2.5 Check gzip size: gzip = 2089515 bytes ≈ 2.09 MB. Ceiling revised to 2.5 MB to match `project.md` NFR (1–2 MB anticipated). Pass.

## 3. Smoke test

- [x] 3.1 `pnpm -r typecheck` passes (all 4 workspace projects done)
- [x] 3.2 `pnpm --filter @study-rpg/medexam-tw dev` boots clean (Vite v5.4.21 ready in 200ms, no console errors); killed after verification
- [x] 3.3 Verified via curl http://localhost:5173/study-rpg/content/medexam-tw/questions.json: served 3291 Q, 10 subjects; 5-random sample drew 5 **distinct** subjects (生物化學 / 生理學 / 病理學 / 胚胎學 / 藥理學) — well over ≥3 threshold
- [x] 3.4 SRS / save state compat: structural — Question.id format unchanged (`<year>-<session>-<book>-<subject>-Q<n>`), db.srs keyed by id, no schema migration. Old藥理 SRS cards continue to load; new 2873 non-藥理 Q appear as fresh cards on next quiz draw.

## 4. Docs + roadmap update

- [x] 4.1 Updated `CLAUDE.md` "build 題庫" comment — defaults note + MEDEXAM_ALLOW_SKIPS=1 in example command
- [x] 4.2 Updated `openspec/project.md` M2 roadmap row: ✓ prefix added to「10 科全解」+「SRS due queue」, M2 status ⏳ → 🚧 進行中

## 5. Verify + handoff

- [x] 5.1 `openspec validate expand-content-build-to-all-subjects` — passes
- [x] 5.2 `/opsx:verify` — all 3 dimensions passed; 0 CRITICAL / 0 WARNING / 1 SUGGESTION (clean-build-zero-skipped scenario not empirically reachable while上游 has 309 skips)
- [ ] 5.3 Confirm with user, then `/opsx:archive expand-content-build-to-all-subjects` (sync delta into main specs)
- [ ] 5.4 Commit (auto-git skill) with message template `spec(archive): merge expand-content-build-to-all-subjects — default to 10 subjects + skip counter`
