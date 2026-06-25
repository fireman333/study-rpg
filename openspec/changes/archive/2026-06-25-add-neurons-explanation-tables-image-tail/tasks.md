# Tasks — add-neurons-explanation-tables-image-tail

> Batch 2 of the image-crop tier (27 done in `add-neurons-explanation-table-images`). The 29 ids =
> archived `2026-06-25-add-neurons-explanation-tables/quarantine-severe.json` ∖ the 27 already in
> `table-images/manifest.json`. Resolved via Codex vision review (montage + full-res adjudication)
> rather than owner hand-crop — Codex confirmed all 22 IMAGE crops are well-framed (0 re-crop).

## 1. Resolve the 29 → source PDF + page

- [x] 1.1 Loaded the 29 tail ids (quarantine-severe ∖ manifest) — asserted count == 29
- [x] 1.2 Page resolution in `scripts/table-images/_work/segments-tail.json` (15 exam-numbered + 10
  content-matched + 1 manual + 3 prose) — verified
- [x] 1.3 Codex-built `extract_tail.py` (pure-raster `extract_image` vs render-crop) run on all 29

## 2. Triage (Codex vision: image vs text-recover)

- [x] 2.1 Codex montage + 5-case full-res adjudication → **22 IMAGE / 7 TEXT** (text-recover, no
  image). Codex corrected the handoff's 3 "known prose": only 108-1 寄生 Q30 is text; 105-2 病理 Q87
  (WBC comparison table) + 106-2 寄生 Q32 (life-cycle figure) are real images. Found 3 more TEXT
  (105-1 解剖 Q17 / 110-1 公衛 Q41 / 111-1 解剖 Q17)
- [x] 2.2 Codex confirmed 0 re-crop / 0 unsure; 都要 dual = 104-2 解剖 Q22 (leg figure + 上肢 nerve schematic)

## 3. Crop + encode (Codex-validated auto-crops)

- [x] 3.1 22 IMAGE auto-crops from `auto-crop-tail/` (Q22 = `__1` leg + `__3` arm); Codex-verified framing
- [x] 3.2 Converted → `table-images/<qid>__N.webp` (q≈82, ~45 KB avg, 23 files) + appended
  `table-images/manifest.json` (27 → **49** entries / **70** images)

## 4. Clean prose for each question (verbatim)

- [x] 4.1 prose.json entries for all 29 (27 → **56**): 22 IMAGE via bounded helper (`clean_prose_tail.py`,
  drops footer + fragment runs), 7 TEXT hand-curated via verbatim keep-ranges (figure debris removed)
- [x] 4.2 Verbatim NFKC+PUA gate: 0 non-verbatim lines (drops only; no fabrication). No agent fan-out
  (per Decision 4 — used a bounded helper + hand curation)

## 4b. 簡解 surfacing (Option C — Codex-recommended)

- [x] 4b.1 `build.ts wireFigure` prepends the restored 簡解 (extracted from the explanation string) as
  the first prose block for block-rendered questions → 17 questions (10 tail + **7 already-shipped
  regressions fixed**); prose.json stays clean-詳解-only (single source = explanation string)

## 5. Build + integrity test

- [x] 5.1 `pnpm run build:neurons-content` 4600/0 — 49 table-images wired / 70 webp copied → app public
- [x] 5.2 Extended `explanation-table-images.test.ts` (49/70 + new prose-coverage test) →
  `pnpm --filter @study-rpg/neurons-tw test` **677/677** green
- [x] 5.3 `pnpm -r typecheck` clean

## 6. Verify + ship

- [x] 6.1 `/verify` — Chrome MCP `/bank`: image-tier renders clean prose + webp loads (Q29 527×563),
  garbled text gone; 簡解 block render path = shipped prose-block path
- [ ] 6.2 Deploy neurons (Cloudflare Pages) via bundled `track-neurons` → `main` merge; prod-verify a
  sample webp (HTTP 200) + 簡解/image render
- [ ] 6.3 `/opsx:archive` (sync the `neurons-explanation-table-images` delta) + commit (explicit
  per-file `git add` of content/asset + scripts + openspec paths only — never `git add -A`)
