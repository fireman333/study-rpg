## 1. Build-script fix

- [x] 1.1 Add `stripPdfExtractionJunk(text: string): string` helper in `packages/content-medexam2-tw/scripts/build.ts` covering 3 passes: (P1) marker-anchored strip for `測驗式?試?題?標準答案` / `【版權所有` / `--\d+--` / `醫\s+護` through to `**` or EOS; (P2) lone trailing `\s+[醫護]` before EOS; (P3) lone trailing `\s+[醫護]` before closing `**`
- [x] 1.2 Apply helper to `optMatch[2]` in `parseQuestionBlocks` before `options[optMatch[1]] = ...` assignment
- [x] 1.3 Apply helper to assembled `text` in `parseExplanationsFile` before storing in `exps` map
- [x] 1.4 Add comment explaining upstream PDF extractor quirk + why lone-char strip requires preceding whitespace (guard against false-matching「就醫」/「保護」/「照護」)

## 2. Rebuild content pack

- [x] 2.1 Run `MEDEXAM2_ALLOW_SKIPS=1 pnpm --filter @study-rpg/content-medexam2-tw build` — 6080 imported / 0 skipped / 100% coverage (unchanged from baseline)
- [x] 2.2 Confirm `dist/{questions,meta,stats}.json` + `apps/medexam2-hospital-tw/public/content/medexam2-tw/{questions,meta}.json` are regenerated

## 3. Verify

- [x] 3.1 Spot-check `113-2-醫學三-家醫科-Q80` — `options.D` clean, no appendix
- [x] 3.2 Spot-check `109-1-醫學三-家醫科-Q71` — `options.B` clean, trailing「 護」stripped
- [x] 3.3 Spot-check `112-2-醫學三-家醫科-Q80` (測驗式 variant) — clean
- [x] 3.4 All 76 Q80s in corpus — option/explanation junk hits: **0**
- [x] 3.5 Full corpus sweep — options containing any of `測驗.*標準答案` / `考試名稱` / `【版權所有` / `--數字--` / `醫 護` / 尾巴 `醫`/`護`: **0** (all 7 patterns)
- [x] 3.6 Full corpus sweep — same 7 patterns in explanations: **0**
- [x] 3.7 `pnpm --filter @study-rpg/content-medexam2-tw typecheck` — clean
- [x] 3.8 No over-strip — 0 options <2 chars (the 37 hits are legit single-char numeric/熱量 options, not regressions)
- [ ] 3.9 Chrome MCP smoke at dev server — optional; data-only fix verified at JSON layer

## 4. Archive

- [ ] 4.1 Run `/opsx:verify` for 3-dim check (completeness / correctness / coherence)
- [ ] 4.2 Run `/opsx:archive` to sync delta into `openspec/specs/medexam2-corpus-ingestion/spec.md`
- [ ] 4.3 Stage **only** the change-scope files (build.ts + 4 content artifacts + archive metadata) — exclude unrelated untracked `supabase/sanity/capacity_monitor.sql`
- [ ] 4.4 `git diff --cached --name-status` to verify staging cleanliness before commit
- [ ] 4.5 Commit (user explicit OK required) with message `spec(archive): merge fix-medexam2-trailing-answer-key — strip 測驗題標準答案 appendix from Q80 options + explanations`
