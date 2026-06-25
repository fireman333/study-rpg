## Context

詳解 tables were flattened by upstream PDF→text extraction. Sibling change `add-neurons-explanation-tables`
reconstructed 477 as text blocks; a tail cannot be (Bucket C scrambled cells = 27 ids + figure/image tables).
This change adds a faithful image-crop tier for that tail.

**Feasibility spike findings (2026-06-24 — these drive every decision below):**

1. **Source PDFs render perfectly but their text layer is unusable.** PyMuPDF (`fitz` 1.27.2, has
   `find_tables()`) `get_pixmap()` rasterizes the true visual page regardless of encoding. BUT the embedded
   fonts have a **broken ToUnicode CMap** → `page.get_text()` returns mojibake (`ǡĒÌʮ̸̮`) and
   `page.search_for("中文")` returns nothing. **Cannot locate a page by Chinese string.** (This broken CMap is
   also the root cause of the whole garbled-table corpus — upstream had to OCR these PDFs, and OCR is what
   scrambled the cells.)
2. **Digits extract cleanly** ("104", "38" decode) → qNumber-based location is *possible* but the corpus spans
   **~6 PDF layout formats** (`P1-continuous-old` / `P4s-inline-107` / `P4n-modern` / `P5b-第N題` /
   `P3-no-label` / `unknown`; per `_extracted/_extraction_log.txt`), so a pure digit-scan locator is fragile.
3. **No `meta.pageRef`** (0/4600) — no shortcut from question → page.
4. PDF filenames are inconsistent (`104-2醫學(一).pdf` / `113-1醫學二.pdf` / `111-2醫學一合併檔案.pdf` /
   `112-1醫學二 詳解 (校正).pdf`) → the year/session/book→file map needs fuzzy matching.
5. The app already lazy-loads 19 figure PNGs per-question (`hasImage`/`imagePath` + build copy to
   `public/content/neurons-tw/`) — reuse this exact pipeline; no new image infra.

## Goals / Non-Goals

**Goals:**
- For the 27 Bucket C ids, render the original 詳解 table from its source PDF into a moderate-quality WebP,
  attach it as a lazy per-question asset, and display it inline — faithful by construction, no medical guessing.
- Emit a human-verifiable debug preview per crop so the owner confirms framing BEFORE anything is applied.
- Keep the data-model invariant clean: the image is **additive** to the text `explanation` (never replaces or
  alters it); `id`/`answer` untouched.

**Non-Goals:**
- NOT replacing any of the 477 text-table reconstructions (text tier stays preferred where it succeeded).
- NOT (this change) auto-processing the larger "table-is-an-image" no-table skips — explicit follow-up.
- NOT a general OCR/transcription of table content (the whole point is to avoid transcription risk).
- NOT shipping the source PDFs or running PDF extraction in CI (owner-machine build step, like the existing
  corpus source dependency; CI consumes baked output).

## Decisions

**D1 — Page location: vision-model bbox-framing is the primary locator; qNumber-digit scan is a cheap pre-filter.**
Because the text layer is unsearchable (broken CMap), the robust path is: narrow to a candidate page window via
the ~1-page-per-question ordering + clean digit extraction, render those pages, and ask a vision model "which
page is question N, and what is the bounding box of its 詳解 table?" The vision model only **frames** (returns a
bbox) — it does **not** transcribe table content — so it cannot introduce a medical error. Rationale: sidesteps
the broken text layer and the 6-format fragility in one move. `fitz.find_tables()` may be used as a
geometry-based assist where it fires, but is not relied upon (it needs correct text positions to score grids).

**D2 — Render/crop recipe.** `fitz.get_pixmap(matrix=Matrix(zoom,zoom), clip=bbox)` at ~150–160 dpi
(`zoom≈2.1–2.2`), bbox padded 6–16px, exported **WebP quality ≈ 82**. Expected ~20–60 KB/table (page-region
fallbacks 80–180 KB). White background preserved. Avoid JPEG (CJK stroke ringing); avoid AVIF (toolchain weight).

**D3 — Locate→crop fallback ladder (per id):** (a) vision bbox on the located page → crop; (b) if no confident
table bbox, crop the whole question region (qN→qN+1 vertical span) — bigger but still faithful; (c) if even the
page can't be located, leave the question as flat text (honest floor). Each id records which method was used.

**D4 — Owner-in-the-loop before apply.** The tool writes, per id, the WebP **plus a debug-preview PNG** (the
crop, or the full page with the chosen bbox outlined). The owner eyeballs the previews; only owner-approved ids
get their asset wired into the content. No silent apply (mirrors the gate discipline of the text-table work).

**D5 — Data model: additive image field, reuse the figure pipeline.** Add an optional table-image reference
(e.g. an `explanationTableImage` field, or an `{type:"image",src,caption}` block in the existing
`explanationBlocks` array — final shape decided at apply time). Build copies the WebP into
`apps/neurons-tw/public/content/neurons-tw/` exactly like the 19 figures. The text `explanation` string is left
intact, so even with the image present the original (garbled-but-readable) text remains as a fallback / for
search — no data loss, unlike applying a lossy text reconstruction.

**D6 — Renderer.** `Explanation.tsx` gains an image-table branch: `<img loading="lazy">` inside an
`overflow-x:auto` container with a light rounded frame + caption「原始詳解表格」and descriptive `alt`. The
white-bg image reads as an intentional "scanned excerpt" against the dark/pixel theme (do NOT invert — harms
legibility).

**D7 — Provenance.** A sidecar map (e.g. `table-image-overrides.json`) records `qid → {pdf, page, bbox, dpi,
method}` for every produced image, so crops are reproducible and auditable.

## Risks / Trade-offs

- **Vision bbox cost / availability.** ~27 vision calls for the pilot (cheap). If vision is unavailable, fall
  back to D3(b) whole-question-region crops (uglier, bigger, but faithful and fully offline).
- **Mis-crop risk.** A wrong bbox could drop a row or include a neighbour question. Mitigated by D4 (owner
  eyeballs every debug preview before apply) — the failure mode is visible, not silent.
- **Mobile UX regression vs text tables.** Image tables don't reflow (pinch/h-scroll) and aren't searchable.
  Accepted *only* because this tier is reserved for the unrecoverable tail; the 477 text tables are unaffected.
- **Theme clash.** White table on dark theme — mitigated by the framed-caption treatment (D6).
- **Source-PDF dependency at build.** Like the existing corpus source dependency; the produced WebP assets are
  committed (baked), so CI/redeploy never needs the PDFs.
- **Raster/scanned tables.** If a source table is itself a low-quality scan, the crop inherits that quality;
  if illegible, fall back to flat text (D3c). Honest floor, no fabrication.
