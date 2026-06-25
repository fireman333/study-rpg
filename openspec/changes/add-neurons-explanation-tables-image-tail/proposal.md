# Image-crop the remaining 29 destroyed-OCR 詳解 tables (tail of the Bucket C image tier)

## Why

`add-neurons-explanation-table-images` (archived 2026-06-25) shipped image crops for the 27
"Bucket C" severe-quarantine 詳解 — questions whose source-PDF table genuinely exists but whose
OCR scrambled the cell order beyond safe structured reconstruction (reconstructing would fabricate
medical facts). Its sibling `add-neurons-explanation-tables` (archived same day) closed out the
structured-block reconstruction with **29 questions still flat** — the destroyed-OCR tail that the
faithfulness gate correctly refused to auto-reconstruct. A shape check confirms all 29 are
fragment-heavy (23–73 short-fragment lines each), i.e. they carry a real flattened table — the
**same class** as the 27 already handled, just a second batch. They currently render as a vertical
fragment column (player-reported as 「表格被轉成文字」). The reliable, already-built fix is an image
crop, not more text reconstruction.

## What Changes

This change carries the 29 through the **existing** image-tier mechanism — **no new render code,
no new core type, no new capability**:

- **Triage** the 29 into *has-real-source-table* (image-crop candidate) vs *no-actual-table*
  (stays flat — e.g. the explanation is a prose list, not a table). Only candidates get cropped.
- **Crop** each candidate's 詳解 table region from the 陽明/考選部 source PDFs into WebP assets,
  following the workflow the owner settled on for the 27: auto-render candidate pages for review →
  **owner hand-crops** the precise table region (auto-vision banding was judged too loose last
  time) → `process_owner_crops.py` → committed `table-images/<qid>__N.webp` + appended
  `table-images/manifest.json`. A question may carry multiple table images.
- **Replace the garbled flattened-table text with clean prose** for each cropped question, exactly
  as the 27 did: prose-only `explanationBlocks` built from `table-images/prose.json`, gated by the
  existing exact NFKC+PUA-tolerant substring check (prose must be verbatim substrings of the
  original; only garbled-table runs removed). `id` / `answer` / source corpus json untouched.
- **Reuse** the shipped build wiring (`wireFigure` attaches `explanationTableImages` + prose
  blocks; `build.ts` copies `table-images/*.webp` → `dist/`; `copy-content.mjs` → app public) and
  the shipped renderer (`Explanation.tsx` already renders `explanationTableImages`). Nothing in
  `apps/` or `packages/core/` changes.

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `neurons-explanation-table-images`: extend the image-tier coverage from the 27 Bucket C pilot to
  also cover the 29-question destroyed-OCR tail (same render contract; coverage grows, contract
  unchanged). A small MODIFIED delta records the second batch; if the existing requirements are
  already count-agnostic, no delta is needed.

## Impact

- **Content / assets only**: `packages/content-neurons-tw/table-images/` (new `<qid>__N.webp`,
  appended `manifest.json` + `prose.json` + `table-image-overrides.json` provenance) + the
  `scripts/table-images/` owner-crop tooling (already present). Rebuild outputs to
  `apps/neurons-tw/public/content/neurons-tw/table-images/`.
- **No** change to `id` / `answer`, the source corpus `questions.json`, `@study-rpg/core`,
  `Explanation.tsx` (or any app component), Dexie, R2 bundle / sync engine, the sync Worker, D1,
  leaderboard, or any game economy. No `dexie-fixture-lint` concern.
- **Deploy**: neurons Cloudflare Pages only.
- **Owner-in-the-loop**: the crop step needs the owner's hand-cropping pass (the reliable path);
  the agentable parts are triage, candidate-page rendering, encoding, manifest/prose assembly, and
  verification. **Cost caution** (per the 27-batch incident): any multi-agent proofread must hard-
  bound its work-list length and per-agent token budget — that run mis-read its arg as 558 not 27
  and burned 19.5M tokens. Prefer owner-PDF-reread over agent fan-out for the disputed handful.
