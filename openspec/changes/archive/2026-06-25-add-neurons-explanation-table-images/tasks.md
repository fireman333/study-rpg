# Tasks — add-neurons-explanation-table-images

> Pilot scope = the 27 Bucket C ids (see `../add-neurons-explanation-tables/quarantine-review.md`).
> Build happens in a focused follow-up session. STOP after propose in the originating session.

## 1. id → PDF → page mapping

- [x] 1.1 Build the fuzzy `{year,session,book}` → source-PDF-filename map over the 45 PDFs in
  `~/Desktop/國考/一階國考/陽明國考考古/` (handle `醫學(一)` vs `醫學一`, `合併檔案`, `詳解 (校正)`, `（修）` variants)
- [x] 1.2 Confirm the ~1-page-per-question ordering per PDF and derive a candidate page window for a given qNumber
  (use clean digit extraction; account for the ~6 layout formats in `_extracted/_extraction_log.txt`)
- [x] 1.3 Load the 27 Bucket C ids and resolve each to (PDF file, candidate page window)

## 2. Locate table bbox (vision-primary)

- [x] 2.1 Render candidate pages with `fitz.get_pixmap` (~150 dpi) — verify they render legibly despite the broken CMap
- [x] 2.2 Vision-bbox locator: feed candidate page image(s) to a vision model → "is this question N? return the
  詳解 table bounding box" (frame-only, NO content transcription). Wire OAuth/availability per project tooling rules
- [x] 2.3 `fitz.find_tables()` geometry assist where it fires (optional cross-check); record confidence
- [x] 2.4 Fallback ladder per id: vision bbox → whole-question-region crop (qN→qN+1 span) → leave flat (record method)

## 3. Crop + encode

- [x] 3.1 Crop bbox (pad 6–16px) via `fitz.get_pixmap(clip=...)` at ~150–160 dpi
- [x] 3.2 Encode WebP q≈82; assert each file is on the order of tens of KB; total pilot < ~1.5 MB
- [x] 3.3 Emit a debug-preview PNG per id (crop, or full page with chosen bbox outlined)
- [x] 3.4 Write the `table-image-overrides.json` provenance sidecar (`qid → {pdf,page,bbox,dpi,method}`)

## 4. Owner verification gate

> **Pivot (owner decision, 2026-06-24).** After reviewing the auto-crop debug previews the owner judged the
> vision-band framing too loose and **hand-cropped all 27 tables himself** (precise screenshots → `from-owner/`,
> filenames carry each table's title). This is strictly better (exact framing, domain-expert verified) and lets a
> question carry **multiple** images (Q4×4, Q48×3, Q61×5, …; 47 images total). The owner also flagged 2 crops that
> were actually the NEXT question's table (Q83/Q94) → set aside in `_work/owner-foreign.json`. Owner then chose
> **image (not text-table reconstruction)** for all, and to **remove the garbled flattened-table text** from what's
> shown (keep clean prose). `process_owner_crops.py` turns the crops → committed `table-images/<qid>__N.webp`
> + `table-images/manifest.json`.

- [x] 4.1 Owner reviewed; opted to hand-crop all 27 precisely (the reliable path) rather than accept auto-bands
- [x] 4.2 Owner-cropped tables ingested (47 webp); foreign (next-question) crops set aside; captions from filenames

## 5. Data model + build wiring

- [x] 5.1 Field shape decided (owner-confirmed): additive `Question.explanationTableImages?: ExplanationTableImage[]`
  (`{src, caption?}`, a LIST — questions have multiple tables) in `@study-rpg/core` (0.6.2 → 0.6.3 PATCH + CHANGELOG);
  flat `explanation` / `id` / `answer` untouched. PLUS clean prose-only `explanationBlocks` so the garbled flattened
  text is replaced by readable prose (prose = verbatim substrings of the original, garbled-table runs removed,
  gated by an exact NFKC+PUA-tolerant substring check — `table-images/prose.json`).
- [x] 5.2 Build attaches `explanationTableImages` (from `manifest.json`) + prose-only `explanationBlocks`
  (from `prose.json`) via the `wireFigure` chokepoint — never touches `id`/`answer`; source corpus json unedited.
- [x] 5.3 `build.ts` copies `table-images/*.webp` → `dist/table-images/`; `copy-content.mjs` → app public
  (mirrors the 19-figure copy). 27 questions wired / 47 webp copied (build log confirms).

## 6. Renderer

- [x] 6.1 `Explanation.tsx` renders `explanationTableImages` AFTER the explanation: lazy `<img>` in an
  `overflow-x:auto` light-framed container + caption (filename title, default「原始詳解表格」) + descriptive alt.
- [x] 6.2 No-image path preserved byte-for-byte (existing blocks / flat prose unchanged); prose-only blocks render
  as clean paragraphs. Live-verified on `/bank`: Q90 shows clean prose + 2 table images, garbled text gone, 0 page overflow.
- [x] 6.3 Repo has no component-test harness (vitest node-env, `.ts` only) → renderer verified by live browser smoke
  (per the sibling change's pattern). Added a CI-safe manifest-integrity test instead
  (`explanation-table-images.test.ts`: 27 qids / 47 assets resolve, additive invariant). 668 vitest green.

## 6b. Prose proofreading (owner-requested 2026-06-24)

- [x] 6b.1 Multi-agent proofread of the 27 prose narratives vs 原文. ⚠️ The Workflow over-ran (args arrived as 558
  not 27 → ~139 batches → 356 agents / 19.5M tokens, hit the account monthly spend limit; codex + most 2nd-opinion
  escalations failed). Salvaged: the over-run gave 14–40 independent reviews/question → used as a vote. Applied **14
  safe OCR/junk fixes** (SOz→SO₂, 03→O₃, Thl→Th1, 2a26→2a2b, Y球蛋白→γ球蛋白, **乙烯膽鹼→乙醯膽鹼** [acetylcholine
  content fix], typel→Type I/II, OT→QT, MgS04→MgSO4, derpession→depression, drop English TABLE caption, strip PDF
  page-#) via targeted surgical replacements. Left risky deletions for owner (Q61 emphasized bullets, etc.).
- [x] 6b.2 The 2 genuine disputes (Q59 antiTB 33/33-disputed, Q93 PLA2R 17-disputed) — escalation failed on spend
  limit, so owner chose to recover the clean prose **directly from the source PDF** (no agents): re-rendered the
  narrative regions @3x, read the clean pixels, and replaced the garbled blocks (Q59「酶」×6 → 酵素/較慢/slow
  acetylators/drug-induced SLE/會影響視力的是 Ethambutol; Q93 full PLA2R paragraph + casual intro). Verified clean.

## 7. Verify + ship

- [x] 7.1 `pnpm run build:neurons-content` (4600/0, 27 wired / 47 webp) + `pnpm --filter @study-rpg/neurons-tw test`
  (668 green) + `pnpm -r typecheck` (0 errors) + `openspec validate --strict` (pass) + Dexie fixture lint (no-op).
- [x] 7.2 Chrome MCP live smoke on `/bank`: Q90 renders clean prose + 2 framed lazy table images, garbled text gone,
  `pageOverflow:0`, assets served 200 image/webp. (Multi-image / spanning render uniform via the same component.)
- [ ] 7.3 Merge track-neurons → main (triggers CF Pages deploy) → confirm GH Actions green → prod verify.
- [x] 7.4 Archive this change (spec delta synced into `specs/neurons-explanation-table-images/`).

## 8. Follow-up (out of scope here)

- [ ] 8.1 Extend the pipeline to the larger "table-is-an-image" no-table skips across all batches (separate change)
- [ ] 8.2 Consider the order/locality faithfulness check (Codex's L2 idea) for any future text-table re-runs
