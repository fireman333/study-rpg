> Guided phased apply. ⏸ = owner checkpoint (stop, report, wait for confirmation). All `git add` explicit per-file; `git diff --cached --name-status` before any commit (shared neurons worktree).

## 0. Phase 0 — Investigation & setup ⏸ ✅ DONE 2026-06-03

- [x] 0.1 Inspect all 8 陽明 104/105 PDFs per-format. **Findings**: 3 explanation formats — (a) 104-1 醫一/醫二 + 105-1 醫一/醫二 = inline `Ans：(X)`, text-readable; (b) 105-2 醫一/醫二 = structured `題目/答案/科目/答題要訣/參考詳解`, text-readable; (c) **104-2 醫一/醫二 = scrambled-ToUnicode (subset cmap stripped, SB-Estd cut ≠ installed W5 → no lossless re-decode); pages render clean → macOS Vision OCR (`ocrmac`, zh-Hant) validated high-quality; 104-2 uses the SAME structured format as 105-2**. ~100 Q/book.
- [x] 0.2 考選部 reachable (`curl -k`, BASE `wHandExamQandA_File.ashx`). **115-1 coords locked: code=115020, c=301, s1=0101, s2=0102.** 104/105 codes still to discover in Phase 2 (method proven; expect 104020/104100?/105020/105100? + c=301).
- [x] 0.3 115 parses clean: 醫一/醫二 試題 100 Q each (4-opt), 醫一 答案 (MOD1301) 100 letters, **醫二 標準答案 now fetched** → `reconcile/pdf/115/115-1_醫學二_答案.pdf` (100 letters). 115 fully data-complete; only 詳解 generation remains.
- [x] 0.4 ⏸ Phase 0 findings reported; owner confirmed 104-2 → 考選部 Q/A + OCR 詳解.

## 1. Phase 1 — 104/105 陽明 詳解 extraction → `_extracted/` ✅ DONE 2026-06-03

- [x] 1.1 `reconcile/parse_ym_104_105.py` built + robust. **Key finding: 104/105 are OLD grouping (like 106-1)** — 醫一 holds 微免/寄生/公衛; 105-2+104-2 carry per-Q 科目 labels. 3 formats: inline-104-1 (`N `+`(A)`), inline-105-1 (`N.`+`A.`), structured-105-2 (`題目/答案/科目/參考詳解`), OCR-104-2. Segmentation anchors on `Ans：`(inline)/`題目`(structured), qNum by order. Fixes that landed: control-char strip (105-1 `\x90`-prefixed numbers), `A.` option pattern (no trailing space), `sect()` inline-label support (105-2 `答題要訣 <content>` same-line).
- [x] 1.2 All 8 written to real `~/Desktop/國考/一階國考/陽明國考考古/_extracted/醫學{一→解剖學,二→生理學}/{104-1,104-2,105-1,105-2}.md`. Counts: 104-1 醫一/醫二 100Q/0bad/full expl ✓✓; 104-2 OCR 醫一/醫二 100Q (5/9 option-bad — irrelevant, 考選部 authoritative), expl 97%; 105-1 醫一/醫二 97Q/100Q (1 bad each); 105-2 醫一/醫二 100Q/99Q + per-Q 科目. **`**科目**：` preserved for 105-2/104-2** (→ OLD blocks). reconcile `parse_ym_md` confirmed reads all.
- [x] 1.3 Verified: 104-1 perfect; 104-2 OCR explanations usable (some figure-label noise; stems clean → qNum-match works); 105-1's 3 missing 醫一 Qs lack clean `Ans：` (figure-only) → empty 詳解, 考選部 fills the question. Acceptable residuals.

## 2. Phase 2 — 104/105 考選部 reconcile + 舊分組 subject blocks ⏸

- [x] 2.1 ✅ Extended `reconcile/manifest.json` with 104-1/104-2/105-1/105-2. **Codes discovered via 考選部 search-platform enum (ASP.NET postback) + Chrome MCP drill**: 104-1=`104030` **c=101 s1=0101 s2=0102** (西醫師 一階 is bundled into the combined 醫師中醫師分階段 exam, indexed under c=101 — NOT c=301; round-code probes all 302'd); 104-2=`104090`, 105-1=`105020`, 105-2=`105100` all c=301 s1=55 s2=66. Helper `find_104_105.py` (untracked).
- [x] 2.2 ✅ `download_all.py 104-1 104-2 105-1 105-2` → all Q/S/M fetched. 104-2/105-1/105-2 parse 100Q/100ans clean with standard `parse_moex`. **104-1 needs a dedicated parser** (試題代號 1101: bare-number question starts + PUA option glyphs ``–``=Ⓐ–Ⓓ + column-major answer grid). Built `parse_moex_1101.py` (fitz stems+PUA-map / `pdftotext -layout` answer grid) → 100Q/100ans/0bad both books. Wired into `reconcile_all.load_moex` via `SPECIAL_PARSERS={(104,1):parse_moex_1101}`. **Bucket fix**: 醫二 104/105 陽明 files live in a `生理學` placeholder folder not in modern `BOOK_SUBJECTS['醫學二']` → added `EXTRA_YM_BUCKETS`; reconcile now fills 384/400 (104) + 382/400 (105) explanations (~16-18 gaps = figure-only/missing 陽明 Qs).
- [x] 2.3 ✅ Drafted subject blocks. **醫一 = uniform across all 4 papers** (stem-verified for 104-1/105-1, label-confirmed for 104-2/105-2): 解剖(1-28) 胚胎(29-32) 組織(33-41) 微免(42-74) 寄生(75-82) 公衛(83-100). **醫二 = 生理/生化/藥理/病理 with ±1 per-paper boundary**: 104-1/104-2/105-1 = 生理(1-25) 生化(26-50) 藥理(51-75) 病理(76-100); 105-2 = 生理(1-24) 生化(25-50) 藥理(51-74) 病理(75-100). (Classifier `predict_old_paper` wrongly merged 胚胎→解剖 + fuzzed 寄生/公衛; corrected by direct stem inspection + 科目-label evidence.)
- [x] 2.4 ✅ Owner confirmed (2026-06-03) after boundary spot-check. 醫一 uniform; 醫二 104-1/104-2/105-1 = 1-25/26-50/51-75/76-100, 105-2 = 1-24/25-50/51-74/75-100. Labels + stems agree on every cut.
- [x] 2.5 ✅ Generalized `finalize.py`: replaced hardcoded `OLD_106_1`/`subject_106_1` with `OLD_BLOCKS` dict + `old_subject(year,sess,book,qn)`; baked OLD_104_1..105_2 (醫一 uniform `_MED1_OLD`; 醫二 `_MED2_104_105_A` for 104-1/104-2/105-1, `_MED2_105_2` for 105-2). Main loop extended to `[104,105]+range(106,115)`.
- [x] 2.6 ✅ Reconcile runs for 104/105: every Q resolves to exactly one subject (**None-subject = 0**). 更正答案 → 104: 13 disputed + 16 multiAnswer; 105: 9 disputed + 17 multiAnswer. microImmune split (87/45 across 104/105). +800 Q (104/105).

## 3. Phase 3 — 115 parse + 醫二 answer + subject classification ⏸ ✅ DONE 2026-06-03

- [x] 3.1 115 醫一/醫二 試題 parsed (100 Q each, clean). **Answer source corrected**: base from t=S 標準答案 (clean, positional) NOT the MOD grid (MOD has `＃` at Q66/Q95 → positional shift; pilot caught this). 醫一 corrections: Q66 → `acceptedAnswers:['A','D']`, Q95 → `disputed`. 醫二 has no 更正.
- [x] 3.2 ✅ All 115 answer files fetched → `reconcile/pdf/115/` (醫一 標準答案+更正, 醫二 標準答案; 醫二 更正 = none). 115-1 coords: code=115020, c=301, s1=0101, s2=0102.
- [x] 3.3 Subjects assigned via historical-block prior (rock-stable across 113-2/114-1/114-2) + boundary-verified against actual 115 stems. Blocks baked into `generate_115.py SUBJECT_BLOCKS`.
- [x] 3.4 ⏸ Subject blocks presented to owner (2 mild-ambiguity Qs noted: 醫一 Q32, 醫二 Q78). High-confidence, awaiting any objection.

## 4. Phase 4 — 115 AI-generated explanations + verification ⏸ IN PROGRESS

- [x] 4.1 ✅ `reconcile/generate_115.py` + `115_prompt.md` built (mirrors 二階 explainer: bare `gemini -m` stdin, NO -y, grounded, 3-model fallback, concurrent, per-Q cache/resume). Gemini INDEPENDENTLY answers + per-option 詳解 + P1–P5 confidence. `explanationSource:'ai-generated'` + distinct `sourceCredit`. **200/200 generated, 199/199 independent answer-agreement** with 考選部 (+ Q66 multi-accepted, Q95 disputed).
- [x] 4.2 ✅ Two verification layers: (a) Gemini pick vs authoritative (self-confidence collapsed to all-P1 → unusable filter, but answer-agreement strong); (b) **owner-chosen cross-model adversarial pass** `reconcile/verify_115.py` (gemini-2.5-flash critic hunts errors) → `out/115/115_verify_flags.json`. **This pass caught a real data bug** (see 4.5).
- [x] 4.3 ✅ Owner reviewed flag list. Adjudicated: Q3 (medial-lemniscus relay) = genuine fix applied; Q32 (FSH 2nd-peak) = precision tighten applied; Q29 (考選部 stem 第三期 vs L1) = clarifier note added; Q62 = **critic false-positive** (misread option B), explanation correct, no change; Q66 = non-issue (multi-accepted correction already covers). Fixes patched into cache + reassembled.
- [x] 4.4 ✅ 115 emitted via `finalize.load_115_records()`: merges `out/115/115_explanations.json` (answer/subject/詳解/provenance) with stems/options from owner 試題 PDFs (`~/Downloads/115020_{1301,2301}.pdf`, parsed via layout parser). `explanationSource:'ai-generated'` + `AI_115_CREDIT`. 200 Q, Q95 disputed, Q66 [A,D]. 微免 split via stem-regex.
- [x] 4.5 ✅ **DATA BUG found + fixed**: 11 醫一 Q (Q30–35, Q59–63) had truncated stems+options — PyMuPDF detaches wrapped 2nd-lines on this PDF layout (Q35/Q63 even had orphan fragments from other Qs). Built `reconcile/parse_moex_layout.py` (`pdftotext -layout`), re-extracted, regenerated the 11. 醫二 unaffected. **`generate_115` now uses the layout parser.**

## 7. Phase 7 — 106–114 existing-corpus truncation audit (owner-requested, merged into this change)

- [x] 7.1 ✅ `reconcile/audit_106_114.py` ran (36/36 papers, 0 download fails). **Only 3 questions truncated in all of 106–114: 112-2 醫學一 Q62/Q63/Q64** (one page, same wrapped-line cause). 35/36 papers clean. Detail in `out/audit_106_114.json`.
- [x] 7.2 ✅ Fixed. **Layout parser is NOT strictly better** (whitespace diffs on 40 clean 112-2 stems; some worse e.g. "knee jerkreflex"). So instead of a global switch, scoped a per-question override `LAYOUT_FIX={(112,2):{'一':[62,63,64]}}` in `reconcile_all.load_moex` — re-extracts only those 3 from `parse_questions_layout`, keeps standard (cleaner) parse for everything else. **Diff confirmed: regenerated 106-114 vs committed = EXACTLY 3 records changed** (112-2-醫學一-生理學-Q62/63/64, now complete stems), nothing else.

## 5. Phase 5 — Finalize, build, propagate, audit

- [x] 5.1 ✅ `finalize.py` emits 104/105/115 + 106-114; meta `papers` now computed (46), `builtAt` 2026-06-03, new `aiGenerated` stat. Regenerated → `data/medexam-reconciled/{questions,subjects,meta}.json`. **Total 3600 → 4600** (104/105 +800, 115 +200). Downloaded full 106-114 set first (gitignored pdf/ was incomplete in worktree).
- [x] 5.2 ✅ `pnpm --filter @study-rpg/content-neurons-tw build` → **imported 4600 / skipped 0**; 微免 split 369/307; `copy-content.mjs` → app public (4600). app meta.stats confirmed 4600.
- [x] 5.3 ✅ Audited. Coverage/mastery use live per-family `total` (auto-adjust); `family.totalQuestions` from pack; achievement thresholds are **absolute counts** (`correctAtLeast(1000)`, `quiz-master-3000`) → larger corpus only makes them marginally more attainable, never broken. No code change for counts. **BUT smoke caught a hardcoded year LIST** (next task).
- [x] 5.4 ✅ Chrome MCP smoke (localhost:5175): corpus loads 4600, years [104..115], 104/105=400 each + 115=200, AI-115 explanation present, console clean. **Caught 2 bugs, both fixed**: (a) `year-filter.ts ALL_YEARS` hardcoded 106-114 → dropped 104/105/115 from the filter; extended to `[104,105,...,115]` (verified: 12 year chips render). (b) AI provenance was tagged in data but surfaced nowhere → added `QuizModal` disclaimer badge 「🤖 此詳解由 AI 生成，未經陽明國考小組審定，僅供參考」 gated on `explanationSource==='ai-generated'` (local cast, no core-contract change). typecheck ✓, 257/257 app tests ✓, validators 6+7 ✓.

## 6. Phase 6 — Verify, archive, commit

- [x] 6.1 ✅ `/opsx:verify` (completeness / correctness / coherence) for this change
- [x] 6.2 ✅ Updated `reconcile/README.md` (23 卷/46 書卷/4600, 104-1 1101 format, 115 AI path, 112-2 LAYOUT_FIX, new scripts table) + `CREDITS.md` (new AI-generated-explanations section with provenance + caveat).
- [ ] 6.3 `/opsx:archive` (sync delta spec → `openspec/specs/neurons-corpus-ingestion/spec.md`)
- [ ] 6.4 Explicit per-file `git add` (reconcile scripts + data JSON + app public JSON + openspec) → `git diff --cached --name-status` review → commit (owner-confirmed); push per owner
