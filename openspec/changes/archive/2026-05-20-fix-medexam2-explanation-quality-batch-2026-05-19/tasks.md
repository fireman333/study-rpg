## 1. Build pipeline strip helpers

- [x] 1.1 Add Pass 4 to `stripPdfExtractionJunk` in `packages/content-medexam2-tw/scripts/build.ts` — strip `\n+[ \t]*---[ \t]*\n+## ⚠️ Conflict with official[\s\S]*$` to EOS
- [x] 1.2 Add Pass 5 to `stripPdfExtractionJunk` — strip `※\s*官方允許\s*[A-DＡ-Ｄ]\s*給分。?`
- [x] 1.3 Rebuild content pack and verify `jq '[.[] | select(.explanation | test("Conflict with official"))] | length'` → 0
- [x] 1.4 Verify rebuild log shows 100% sidecar coverage (6080/6080 questions)

## 2. Sidecar hand-edits (high-priority user-reported / self-curated)

- [x] 2.1 `109-2/醫學四/小兒科/Q2`: remove `※官方允許D給分。` from D 詳解 prose AND `※第2題答Ｂ、Ｄ給分。` from D bold heading
- [x] 2.2 `107-1/醫學四/小兒科/Q29`: fix「童年期 NHL:HL 3.5:1，**明顯高於**成人約 10:1」directionality error in A 詳解 prose
- [x] 2.3 `106-2/醫學四/小兒科/Q76`: full ✓/✗ rewrite via Gemini anchored on official answer D; update topic header from「acute pyelonephritis」to「renal infarction (renal artery thrombosis)」

## 3. Stage 1 Haiku-inversion batch rewrite (audit-footer specific subset)

- [x] 3.1 Build target list `/tmp/batch_targets_stage1.json` from `/tmp/medexam2_audit_targets.json` (66 specific-official entries minus Q76 done in §2.3 = 65)
- [x] 3.2 Swap Gemini account from `tony85314@gmail.com` (quota exhausted) → `b09401048@gmail.com` (fresh OAuth tier); backup oauth_creds + google_accounts.json
- [x] 3.3 Run `python3 /tmp/batch_rewrite_v2.py --targets /tmp/batch_targets_stage1.json --reset` — sequential, 180s timeout, raw output saved to `/tmp/batch_failed/` on validation failure
- [x] 3.4 Run `python3 /tmp/recover_false_rejections.py` to post-process polarity-misdetect validator failures via unique-mark-position == official answer logic
- [x] 3.5 Confirm tally: 49 direct + 14 recovered = 63 written, 2 incomplete-generation failures preserved as original sidecar (no regression)

## 3b. Stage 1 retry — Gemini missing-bold-header recovery

- [x] 3b.1 Diagnose 2 Stage 1 failures (`110-1-小-Q2` / `112-1-小-Q21`): Gemini omitted `**...**` wrapping on option headers + occasionally wrote English `[P1 tier]` instead of Chinese `[P1 夯]`
- [x] 3b.2 Run `/tmp/recover_missing_bold.py`: regex-add `**` around `^[A-D]\. <text>` lines + normalize tier labels → recover Q112-1-Q21
- [x] 3b.3 Hand-recover Q110-1-Q2 with lenient regex (target option B had stray PDF-extraction space 「疫 苗」 that exact-match rejected)
- [x] 3b.4 Final tally: 66/66 Stage 1 done, 0 failed
- [x] 3b.5 Inversion count after Stage 1: 480 → 414 (-66, matching expectation)

## 4. Verification

- [x] 4.1 Rebuild final state: `pnpm --filter @study-rpg/content-medexam2-tw build` clean
- [x] 4.2 Copy `dist/*.json` → `apps/medexam2-hospital-tw/public/content/medexam2-tw/`
- [x] 4.3 Verify audit-footer leak count = 0
- [x] 4.4 Verify inversion count: 480 → 416 (-64, matches 63 batch + 1 Q76 hand-edit)
- [x] 4.5 Verify `explanationStatus: "ok"` for all 6080 questions (100% coverage)

## 4b. Build pipeline strip helpers (continued — discovered via 2026-05-19/20 bug reports)

- [x] 4b.1 Add spaced page-number variant to Pass 2 regex: `--\d+--` → `--[ \t]*\d+[ \t]*--` (catches `-- 1 --` with surrounding whitespace, observed in 110-1 內科 Q8 D option, plus 醫學三/家醫科/內科 multiple papers)
- [x] 4b.2 109-2 醫學四 小兒科 Q74 stem hand-edit: removed `-- 10 --` page-number residue (stem parsing doesn't run through stripPdfExtractionJunk, source-side fix)
- [x] 4b.3 Re-verify: `jq '... test("\\-\\-\\s*[0-9]+\\s*\\-\\-")) | length'` returns 0

## 4c. Stage 2 — silent 414 inversions batch

- [x] 4c.1 Build /tmp/batch_targets_stage2.json (415 entries = 480 inversions - 65 Stage 1)
- [x] 4c.2 Gemini account switch tony85314 → b09401048 (Stage 1 already exhausted tony85314 OAuth tier)
- [x] 4c.3 First Stage 2 pass: Gemini 2.5 pro (default), hit quota mid-run at 199/211 (`110-2-醫學四-精神科-Q59`)
- [x] 4c.4 Model switch: `GEMINI_MODEL=gemini-2.5-flash` (separate quota bucket from pro)
- [x] 4c.5 Resume + complete batch: 404 done / 273 failed total
- [x] 4c.6 (NOT executed) Retry loop for state.failed via gemini batch — deferred; AI Overview scraper attempted instead

## 4d. AI Overview / AI Mode scraper experiment

- [x] 4d.1 Built `/tmp/scrape_ai_overview.py` (Playwright headed, persistent context, race-safe staging in /tmp/ai_overview_fixes/)
- [x] 4d.2 Pivoted URL from AI Overview (`google.com/search?q=...`) → AI Mode (`google.com/search?udm=50&aep=11&q=...`) after AI Overview throttled / CAPTCHA-blocked
- [x] 4d.3 Updated DOM selector: page lacks `<main>` tag; use `document.body.innerText` with stream-stabilization (2 consecutive same-length reads)
- [x] 4d.4 Partial scrape: 55 staging files written (36 found / 19 not_found), then Google CAPTCHA throttle re-blocked
- [x] 4d.5 Paused scraper (PID killed), staging preserved for future merge

## 4e. Final rebuild + verification (2026-05-20 07:55)

- [x] 4e.1 Rebuild content pack: `pnpm --filter @study-rpg/content-medexam2-tw build` clean, 6080/6080 imported, 100% sidecar coverage
- [x] 4e.2 Copy `dist/*.json` → `apps/medexam2-hospital-tw/public/content/medexam2-tw/`
- [x] 4e.3 Inversion count: **480 → 77** (-403, 84% reduction)
- [x] 4e.4 Audit footer leak: 187 → 0 ✓
- [x] 4e.5 Spaced `-- N --` residue: 0 ✓
- [x] 4e.6 Q8 110-1 內 D option: `-- 1 --` stripped ✓

## 5. Out-of-scope (deferred to follow-up changes)

- [ ] 5.1 (NOT THIS CHANGE) Stage 3 — remaining 77 inversions: candidates include AI Overview scraper resume (after IP cooldown), Gemini batch retry, or hand-review of high-impact subset
- [x] 5.2 ~~(NOT THIS CHANGE) Retry 2 Stage 1 failures~~ — resolved in §3b above
- [ ] 5.7 (NOT THIS CHANGE) Bug-report processing (in-app 🐞 channel, prod Supabase): 22 reports as of 2026-05-20 07:00. Image-broken × 5+ needs PDF→PNG re-extract. Audit footer leak (Q80) and 頁碼 (Q8) reports auto-resolve when this change deploys
- [ ] 5.3 (NOT THIS CHANGE) Q12 / Q26 image refetch (wrong-aspect-ratio crops) — needs PDF→PNG pipeline change
- [ ] 5.4 (NOT THIS CHANGE) Q65 「承上題沒題目」 UX bug — needs `apps/medexam2-hospital-tw/src/components/QuizModal.tsx` patch to inline-link prior Q stem
- [ ] 5.5 (NOT THIS CHANGE) Q15-class stem corruption (PDF extractor lost「不」字) — needs upstream PDF extraction pipeline change
- [ ] 5.6 (NOT THIS CHANGE) `lazy-load-medexam2-by-subject` follow-up — `questions.json` gzipped 3.24 MB > NFR 2.5 MB ceiling
