## 1. Build-script fix

- [x] 1.1 Add `extractGradingNote(text: string): { cleaned: string; note: string | null }` helper in `packages/content-medexam2-tw/scripts/build.ts` — regex `/\s*(※\s*第\s*\d+\s*題[^。]*給分。?)/u` (NOT anchored at end — some source MDs trail 醫/頁碼 after the directive; we drop both directive AND trailing junk wholesale)
- [x] 1.2 Extend `stripPdfExtractionJunk` with a new Pass 0 that strips the ※ directive precisely (not through to `**`/EOS) — pattern `/\s*※\s*第\s*\d+\s*題[^。]*給分。?/gu` — used to clean LLM echoes inside explanation bold blocks
- [x] 1.3 Add `gradingNote?: string` to `ParsedQuestion` interface
- [x] 1.4 In `parseQuestionBlocks` option-parse loop: call `extractGradingNote` BEFORE `stripPdfExtractionJunk`; capture note to block-scope `gradingNote` var; attach to ParsedQuestion after the loop
- [x] 1.5 In `buildQuestion`: when `parsed.gradingNote` is non-null, prepend `> 📋 考選部給分附註：<note>\n\n` to `explanationText` BEFORE assigning to `Question.explanation`; also set `meta.gradingNote = parsed.gradingNote`

## 2. Rebuild content pack

- [x] 2.1 Run `MEDEXAM2_ALLOW_SKIPS=1 pnpm --filter @study-rpg/content-medexam2-tw build` — expect 6080 imported / 0 skipped (unchanged)
- [x] 2.2 Confirm `dist/{questions,meta,stats}.json` + `apps/medexam2-hospital-tw/public/content/medexam2-tw/{questions,meta}.json` regenerated

## 3. Verify

- [x] 3.1 Spot-check `109-1-醫學三-內科-Q17` — `options.D` ends after「不會成為慢性帶原」, no ※
- [x] 3.2 Spot-check same Q's `explanation` — starts with `> 📋 考選部給分附註：※第17題答Ｂ、Ｄ給分。` blockquote, then `**A. ...**`
- [x] 3.3 Spot-check same Q's `meta.gradingNote` = `"※第17題答Ｂ、Ｄ給分。"`
- [x] 3.4 Spot-check `108-1-醫學五-外科-Q22` — `options.D` should be just `"糖尿病"` (※ stripped AND trailing `醫` stripped via existing pass)
- [x] 3.5 Full corpus sweep — options containing `※`: **0**
- [x] 3.6 Full corpus sweep — explanations containing `※第\d+題.*給分` outside the blockquote header: **0** (34 affected Q have prepended blockquote; 2 unrelated LLM-authored `※` commentaries preserved as-is)
- [x] 3.10 Coverage check — 34 Q with `meta.gradingNote` matches 34 ※ directives in source MDs (initially missed 5 cases where directive had trailing 醫/頁碼 junk — regex de-anchored to fix)
- [x] 3.7 `pnpm --filter @study-rpg/content-medexam2-tw typecheck` — clean
- [x] 3.8 Sanity: non-disputed Q's options + explanations unchanged (no over-strip)
- [x] 3.9 `pnpm -r typecheck` — confirm `meta.gradingNote` doesn't break any consumer

## 4. Archive

- [x] 4.1 Run `openspec validate fix-medexam2-grading-note-attribution --strict` — passes
- [x] 4.2 Sync delta into `openspec/specs/medexam2-corpus-ingestion/spec.md` via `/opsx:sync`
- [x] 4.3 Move change to `openspec/changes/archive/2026-05-19-fix-medexam2-grading-note-attribution/`
- [ ] 4.4 Stage **only** the change-scope files (build.ts + 2 app public artifacts + 1 main spec + 3 archived change files) — explicitly exclude parallel-session `add-reset-account-progress` WIP and unrelated untracked files
- [ ] 4.5 `git diff --cached --name-status` to verify staging cleanliness before commit
- [ ] 4.6 Commit (user explicit OK required) with message `spec(archive): merge fix-medexam2-grading-note-attribution — relocate ※給分 directive from option text to explanation blockquote`
