# Tasks — add-neurons-explanation-table-images

> Pilot scope = the 27 Bucket C ids (see `../add-neurons-explanation-tables/quarantine-review.md`).
> Build happens in a focused follow-up session. STOP after propose in the originating session.

## 1. id → PDF → page mapping

- [ ] 1.1 Build the fuzzy `{year,session,book}` → source-PDF-filename map over the 45 PDFs in
  `~/Desktop/國考/一階國考/陽明國考考古/` (handle `醫學(一)` vs `醫學一`, `合併檔案`, `詳解 (校正)`, `（修）` variants)
- [ ] 1.2 Confirm the ~1-page-per-question ordering per PDF and derive a candidate page window for a given qNumber
  (use clean digit extraction; account for the ~6 layout formats in `_extracted/_extraction_log.txt`)
- [ ] 1.3 Load the 27 Bucket C ids and resolve each to (PDF file, candidate page window)

## 2. Locate table bbox (vision-primary)

- [ ] 2.1 Render candidate pages with `fitz.get_pixmap` (~150 dpi) — verify they render legibly despite the broken CMap
- [ ] 2.2 Vision-bbox locator: feed candidate page image(s) to a vision model → "is this question N? return the
  詳解 table bounding box" (frame-only, NO content transcription). Wire OAuth/availability per project tooling rules
- [ ] 2.3 `fitz.find_tables()` geometry assist where it fires (optional cross-check); record confidence
- [ ] 2.4 Fallback ladder per id: vision bbox → whole-question-region crop (qN→qN+1 span) → leave flat (record method)

## 3. Crop + encode

- [ ] 3.1 Crop bbox (pad 6–16px) via `fitz.get_pixmap(clip=...)` at ~150–160 dpi
- [ ] 3.2 Encode WebP q≈82; assert each file is on the order of tens of KB; total pilot < ~1.5 MB
- [ ] 3.3 Emit a debug-preview PNG per id (crop, or full page with chosen bbox outlined)
- [ ] 3.4 Write the `table-image-overrides.json` provenance sidecar (`qid → {pdf,page,bbox,dpi,method}`)

## 4. Owner verification gate

- [ ] 4.1 Owner reviews all 27 debug previews; mark each approve / re-crop / drop-to-flat
- [ ] 4.2 Re-crop the rejected ones (adjust bbox / switch to whole-question-region); leave un-fixable as flat

## 5. Data model + build wiring

- [ ] 5.1 Decide the field shape (an `explanationTableImage` field vs an `{type:"image",src,caption}` block in
  `explanationBlocks`) — confirm with owner; keep the text `explanation` intact (additive only)
- [ ] 5.2 Add the field to the corpus source for the approved ids (surgical edit; never touch `id`/`answer`)
- [ ] 5.3 Update `packages/content-neurons-tw/scripts/build.ts` to carry the field through + copy the WebP assets
  into `apps/neurons-tw/public/content/neurons-tw/` (mirror the existing 19-figure copy step)

## 6. Renderer

- [ ] 6.1 Add the image-table branch to `apps/neurons-tw/src/components/Explanation.tsx`: lazy `<img>` in an
  `overflow-x:auto` light-framed container + caption「原始詳解表格」+ descriptive alt
- [ ] 6.2 Verify text-table blocks and plain-prose explanations are unchanged (no regression)
- [ ] 6.3 Unit test: a question with a table image renders the framed lazy image; one without renders as before

## 7. Verify + ship

- [ ] 7.1 `pnpm run build:neurons-content` (4600/0) + `pnpm --filter @study-rpg/neurons-tw test` green
- [ ] 7.2 Chrome MCP / Playwright spot-check: a Bucket C question shows the framed table image inline on `/bank`
  and in QuizModal; mobile width h-scrolls without page overflow
- [ ] 7.3 `/opsx:verify` → merge track-neurons → `pnpm run deploy:cf` → push → confirm GH Actions green → prod verify
- [ ] 7.4 Archive this change

## 8. Follow-up (out of scope here)

- [ ] 8.1 Extend the pipeline to the larger "table-is-an-image" no-table skips across all batches (separate change)
- [ ] 8.2 Consider the order/locality faithfulness check (Codex's L2 idea) for any future text-table re-runs
