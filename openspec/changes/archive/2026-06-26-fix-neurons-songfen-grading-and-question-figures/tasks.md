## 0. Probes (read-only; evidence kept in PROBE_RESULTS.md + probes/)

- [x] 0.1 Id-mapping cross-validation → 98.1% (3335/3400); the 65 drifts were subject-label only. The corpus is already 考選部-sourced (reconcile.py) and id-stable
- [x] 0.2 Answer-file spike → `parse_moex_official.py` (spatial grid + 備註); re-verified 2970/2970 standard answers, 0 conflicts; found 3 送分 the old positional `parse_answers` (59% wrong on MOD) had missed
- [x] 0.3 詳解 coverage → 3394/3400 real; 詳解 are 陽明-sourced, not re-sourced here
- [x] 0.4 Question-image volume → 35 questions with a raster image; only ~5 are genuine 題幹 figures, 2 are image-only-option, rest decorative/inline
- [x] 0.5 Orphan-safety → moot (no 104-106 drop, full corpus kept)
- [x] 0.6 **Premise check** → a full official re-source reproduces existing 107-115 stems (3266/3400 identical; 134 cosmetic whitespace; 0 garble fixes; ~3 superscript regressions). 104-106 equally clean. → descoped the full rebuild (owner-confirmed)

## 1. 送分/更正 grading fixes (content-data)

- [x] 1.1 `107-2-醫學二-病理學-Q85` → `acceptedAnswers: ["A","C"]` (備註「第85題答Ａ、Ｃ給分」)
- [x] 1.2 `111-1-醫學二-公共衛生學-Q49` → `disputed: true` (備註「第49題，一律給分」)
- [x] 1.3 `111-2-醫學一-生理學-Q65` → `disputed: true` (備註「除未作答者…其餘均給分」)
- [x] 1.4 Surgical edits only — 4595/4600 questions byte-identical; count unchanged at 4600

## 2. Question figures + image-only-option flags

- [x] 2.1 Extract 4 genuine 題幹 figures → `figures/<id>.png` (visually QA'd): `111-1-醫學一-解剖學-Q29`, `111-2-醫學一-解剖學-Q29`, `108-2-醫學二-公共衛生學-Q40`, `114-2-醫學二-公共衛生學-Q38`. **Live-render QA caught a 2-column mis-attribution**: a naive y-based extractor put Q13's 視野缺損 figure on Q29 (甲乙丙椎骨); re-extracted **column-aware** (image owned by nearest-preceding 題號 in the SAME column) → Q29 now correctly shows the 甲乙丙 vertebrae. A column-aware sweep of all 34 PDFs confirmed all 17 genuine (>80px) figures are correctly attributed (only Q29 was wrong)
- [x] 2.2 Flag 2 image-only-option questions `hasOptionImages: true`: `109-1-醫學一-生物化學-Q100`, `114-1-醫學一-生物化學-Q77`
- [x] 2.3 Skip decorative/inline raster (e.g. `(Pco₂)` symbol) and the 6 remaining `[圖]` = 104-105 figures with no official PDF source

## 3. Build + verify

- [x] 3.1 `pnpm run build:neurons-content` → imported 4600 / skipped 0; figures wired 23 (+4); dist carries the 5 field edits + 4 imagePaths
- [x] 3.2 `pnpm --filter @study-rpg/content-neurons-tw typecheck` green; `pnpm --filter @study-rpg/neurons-tw test` → 677/677 (the 3 failing `explanation-figures.test.ts` are a pre-existing unrelated manifest-expansion WIP, shipped separately)
- [x] 3.3 `/verify` — Chrome MCP: served data carries all 5 edits; 4 figure assets 200 + browser-decode to valid dims; quiz pool excludes both `hasOptionImages` questions (0 in pool); the figure renders live in the MockExamRunner (第 29/100, `naturalWidth` loaded, visible). This pass found + fixed the Q29 mis-attribution above

## 4. Ship

- [ ] 4.1 `/opsx:verify` → `/opsx:archive` → commit (explicit per-file: `questions.json` + 4 `figures/*.png` + `reconcile/parse_moex_official.py` + `reconcile/rebuild_official.py`) → merge `track-neurons`→`main` → `deploy:cf` → prod-verify
