## Why

~600 國考 詳解 originally contained tables that the upstream PDF→text extraction flattened into garbled
streams. The sibling change `add-neurons-explanation-tables` faithfully reconstructed **477** of them as
structured text tables (best UX: searchable, reflows on mobile, inherits the pixel theme). But a hard tail
**cannot** be reconstructed as text without injecting medical guesses:

- **Bucket C (27 questions)**: a real table exists but the OCR scrambled/interleaved its cells so that
  aligning columns correctly would require external medical knowledge (e.g. an antiarrhythmic class↔drug↔ECG
  matrix where cells are out of order). Agents correctly refuse to guess — a wrong cell alignment is a wrong
  medical fact. These currently render as flat (garbled) text.
- Plus a larger set of questions skipped as "no-table" specifically because **the table was an embedded image**
  in the PDF (figure-OCR), never recoverable as text.

A Codex fusion consult (2026-06-24) + a feasibility spike concluded: for this tail, don't reconstruct the table
as *data* — present the *original* table as an **image crop** from the source PDF. This is **faithful by
construction** (it's literally the original), eliminating the medical cell-swap risk; the residual risk drops
from "is the medical content right" to "did we crop the right region" (owner-verifiable from a debug preview).

## What Changes

- A new build-time tool that, for a curated id list, locates each question's table in the original 陽明 source
  PDF, crops it, and emits a moderate-quality WebP image plus a debug-preview PNG for owner verification.
- A new optional field on a question/explanation that points to a table-image asset, carried through the
  content build into the per-question payload (reusing the existing figure-asset lazy-load pipeline).
- The shared `Explanation` renderer gains an image-table block: rendered inside an `overflow-x:auto` light-framed
  container with caption「原始詳解表格」and alt text, lazy-loaded.
- **Pilot scope = the 27 Bucket C ids** (listed in `add-neurons-explanation-tables/quarantine-review.md`).
  Extending to the "table-is-an-image" skips is an explicit follow-up, out of scope here.
- Non-goal: this does **not** replace any of the 477 text-table reconstructions; text tables remain the
  preferred tier wherever faithful text reconstruction succeeded.

## Capabilities

### New Capabilities
- `neurons-explanation-table-images`: a faithful image-crop fallback tier for 詳解 tables that cannot be
  reconstructed as text without medical guessing — locate the table in the source PDF, crop to a moderate WebP,
  attach as a lazy-loaded per-question asset, and render it inline with a framed caption.

### Modified Capabilities
<!-- The text-table rendering / corpus-ingestion specs live in the still-active `add-neurons-explanation-tables`
     change (not yet in openspec/specs/), so there is no archived main spec to delta here. The renderer change
     is captured as a requirement of the new capability above. -->

## Impact

- **New build tooling** (Python, PyMuPDF/`fitz` — already the project's default PDF tool): page-locate + crop +
  WebP + debug-preview. Likely a vision-model call for bbox-framing (broken PDF font CMap blocks text-search
  page location; see design.md). Lives alongside `packages/content-neurons-tw/scripts/`.
- **Content build** (`packages/content-neurons-tw/scripts/build.ts`): carry the new table-image field through;
  copy table-image assets into `apps/neurons-tw/public/content/neurons-tw/` (mirror the existing 19-figure copy).
- **Renderer** (`apps/neurons-tw/src/components/Explanation.tsx`): new image-table block branch.
- **Assets**: ~27 WebP files (~20–60 KB each, < ~1.5 MB total), lazy-loaded — negligible bundle impact.
- **Data integrity**: read-only against the source PDFs; never alters `id`/`answer`; the text `explanation`
  string is untouched (the image is additive). No Dexie/R2/sync/economy impact (pure content + presentation).
- **Source dependency**: requires the 45 source PDFs at `~/Desktop/國考/一階國考/陽明國考考古/` at build time
  (owner's machine only — like the existing `MEDEXAM_SOURCE_ROOT` corpus dependency; CI uses the baked output).
