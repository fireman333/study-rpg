## Why

A systematic Phase-1 extraction health-check (2026-06-26) of the 陽明 PDF → `questions.json` pipeline found that the corpus's single biggest unrecovered gap is **embedded 詳解 figures**: the original `extract_exam.py` only set a page-level image boolean and **never saved image bytes**, so the 陽明 authors' hand-drawn diagrams and Netter textbook crops — the actual teaching content of most explanations — were dropped, leaving only flattened text. The deterministic inventory (3,624 / 4,600 questions scanned) found **~2,566 net-new questions with a recoverable explanation figure** (71% of scanned, ~7,271 crops, 1,749 multi-figure), versus only 49 recovered to date. Stem images (7), option images (9), and OCR (104-2 pair only) are near-empty side categories. Recovering these figures turns text-only explanations into the illustrated explanations students actually study from — a major content-quality upgrade.

This change is the **PILOT**: validate the full extract → lazy-load asset → render → QA pipeline on the 6 most-recent detailed booklets (112-1/2, 113-1/2, 114-1/2 ≈ 985 figure-questions) before scaling to the full ~2,566 in a follow-up change. The pilot exists because the full scale introduces a new delivery requirement (~108 MB of assets cannot be bundled) and a multi-figure attribution risk (1,749 questions) that must be de-risked on a bounded batch first.

## What Changes

- **Add a deterministic, repeatable Phase-1 inventory detector** (`packages/content-neurons-tw/reconcile/healthcheck/`) that, per question, locates the source PDF + card bbox + row-label y-bands and attributes each raster image to stem / option / explanation band — emitting a canonical inventory JSON (qid, content-type, block, severity, evidence, attribution confidence). Read-only; modifies no product data.
- **Add deterministic figure extraction** for the pilot id set: `doc.extract_image(xref)` for pure-raster figures (original bytes) and render-crop for composite / inner-table regions, per the codex-reviewed decision tree; outputs `webp` assets with recorded provenance (source PDF + page + bbox).
- **Add a lazy-load static-asset delivery path**: pilot figure assets live as static files under `packages/content-neurons-tw/explanation-figures/` → built into `dist/` → copied to `apps/neurons-tw/public/content/neurons-tw/explanation-figures/`, referenced by a `manifest.json` and **fetched on 詳解 expand** (NOT bundled into JS / `questions.json`). This is the key delta from the bundled 49-webp `neurons-explanation-table-images` precedent.
- **Extend `Explanation.tsx`** to render lazy-loaded explanation figures (after the explanation text), with a placeholder while loading and a graceful fallback if an asset is missing (no silent drop).
- **Attribution QA**: parallel agents verify figure→question attribution **only** for the multi-figure subset; auto-gate (asset-exists + bbox-overlap + min-size) + per-class human spot-sample for the rest.
- **No question-text change**: figure recovery is additive to explanation rendering only.

## Capabilities

### New Capabilities
- `neurons-explanation-figures`: end-to-end recovery of embedded 詳解 figures dropped at extraction — the deterministic inventory/detection contract, faithful PDF-region extraction (rasterized, never transcribed), lazy-loaded static-asset delivery + manifest, inline render after the explanation, and the additive invariant (`id` / `answer` / `stem` / `options` never change). Pilot-scoped to 112-114; the contract is explicitly batch-extensible so a follow-up scales coverage without changing it.

### Modified Capabilities
- `build-tooling`: the neurons-content build SHALL wire explanation-figure assets + manifest from the content package into `dist/` (mirroring the existing figure/table-image copy steps) and emit recovered/missing counts (no silent skip).
- `core-npm-package`: add a lazy-loaded explanation-figure reference type (figure id, source provenance, attribution confidence) distinct from the bundled `ExplanationTableImage` type.

## Impact

- **New**: `packages/content-neurons-tw/reconcile/healthcheck/` (detector + canonical inventory JSON), `packages/content-neurons-tw/explanation-figures/` (pilot webp assets + `manifest.json`).
- **Modified**: `packages/content-neurons-tw/scripts/build.ts` (wire + count figures), `apps/neurons-tw/scripts/copy-content.mjs` (copy figure dir), `apps/neurons-tw/src/components/Explanation.tsx` (lazy figure render), `packages/core/src/types.ts` (manifest-only figure-ref types, additive; no `Question` field), `CREDITS` (figure provenance + CC-BY-NC + 24h-takedown note — figures include 陽明 hand-drawn + Netter crops).
- **Untouched**: `questions.json` question text (`id`/`answer`/`stem`/`options`), the shipped bundled `neurons-explanation-table-images` 49-webp path, sync engine / Dexie / R2 / economy.
- **Boundary**: stem/option images (7+9) reuse the existing `neurons-question-figures` co-located `figures/<id>.png` path (separate tiny cleanup, out of this pilot's scope); OCR (104-2) deferred.
- **Deploy**: pilot adds a bounded number of static files to CF Pages (well under the per-project file-count limit at pilot scale); full-scale file-count budget is a follow-up design point.
