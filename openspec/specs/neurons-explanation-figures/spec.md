# neurons-explanation-figures Specification

## Purpose

The contract for recovering the embedded 詳解 figures (hand-drawn diagrams / textbook crops, incl. Netter) that the original 陽明 PDF → `questions.json` extraction dropped (it kept only text). Covers the deterministic inventory/detection step, faithful PDF-region extraction (rasterized, never transcribed), content-addressed lazy-loaded static-asset delivery with build-injected `explanationFigures` references, inline render after the explanation, multi-figure attribution verification, the source-and-build immutable-text gate, and the batch-extensible pilot contract (112-114 first; later batches under the identical contract). Complements the bundled `neurons-explanation-table-images` tier (the lazy figure tier is the convergence target) and `core-npm-package` (the `ExplanationFigure` type). Created by archiving change `recover-neurons-explanation-figures`.

## Requirements

### Requirement: Deterministic explanation-figure inventory

The system SHALL provide a deterministic, repeatable inventory detector (`packages/content-neurons-tw/reconcile/healthcheck/`) that, for each question, resolves its source PDF, locates the question's card bounding box and the row-label y-bands (題幹 / 選項 / 答案 / 詳解 / 資料出處), and attributes every raster image above a size threshold on the question's card pages to a content block (stem / option / explanation). The detector SHALL emit a canonical machine-readable inventory record per question (question id, source PDF, page range, per-block image counts, attribution confidence) and SHALL be read-only — it MUST NOT modify `questions.json` or any shipped product data.

#### Scenario: Detector emits a per-question inventory record

- **WHEN** the inventory detector runs over the source PDFs
- **THEN** it SHALL emit, for each scanned question, a record containing the question id, source PDF, resolved page range, the count of images attributed to the stem / option / explanation bands, and an attribution-confidence indicator

#### Scenario: Inventory run modifies no product data

- **WHEN** the inventory detector runs
- **THEN** it SHALL write only to the health-check inventory output and SHALL NOT alter `questions.json`, built content, or any app asset

#### Scenario: Detector reports coverage honestly

- **WHEN** the detector cannot resolve a question's page in the source PDF (e.g. a layout the question-start parser does not match)
- **THEN** that question SHALL be recorded as unscanned with a reason, and the run SHALL report the scanned vs unscanned counts (no silent skip)

### Requirement: Faithful explanation-figure extraction

Each recovered explanation figure SHALL be a rasterization of the original source-PDF region — either the embedded image's original bytes via `extract_image(xref)` for a pure-raster figure, or a render-crop of the figure region via `get_pixmap(clip=…)` for a composite / text-over-image / inner-table / vector-only region — and SHALL NEVER be a transcription or re-typesetting of the figure's content. The extractor SHALL classify each candidate into exactly one of `extract` / `render-crop` / `skip-with-reason`, and SHALL record the chosen path (and, for a skip, the reason) into the inventory, so the decision is auditable and the run is reproducible. The extractor SHALL handle the known edge cases explicitly: non-RGB images (CMYK / alpha / palette) SHALL be converted to RGB before encoding; a vector-only figure (no `xref`) SHALL go via `render-crop`; an `xref` reused legitimately across a few neighbouring questions SHALL NOT be treated as a logo (logo-filtering by repeated-xref applies only above the high page-frequency threshold); a figure that overflows onto a continuation page SHALL be attributed to the still-open card. Each shipped figure SHALL have recorded provenance (source PDF, page, region bbox, and source booklet/category). Figure recovery SHALL be additive: the question's `explanation` text, `id`, `answer`, `stem`, and `options` SHALL remain byte-identical.

#### Scenario: Pure-raster figure is extracted as original bytes

- **WHEN** a question's explanation figure is a single embedded raster covering the figure region with negligible overlaid text
- **THEN** the figure SHALL be produced via `extract_image(xref)` (original image bytes), converted to a web asset, with its source PDF / page / bbox recorded

#### Scenario: Composite or inner-table figure is render-cropped

- **WHEN** a question's explanation figure is a composite (text over image) or a rendered inner table region
- **THEN** the figure SHALL be produced by render-cropping the region from the source PDF page, with provenance recorded

#### Scenario: Question text is never altered by figure recovery

- **WHEN** an explanation figure is attached to a question
- **THEN** that question's `id`, `answer`, `stem`, `options`, and `explanation` text SHALL be unchanged

#### Scenario: A candidate the extractor cannot confidently handle is skipped with a reason

- **WHEN** a candidate figure cannot be confidently extracted or cropped (e.g. ambiguous region, non-recoverable encoding)
- **THEN** it SHALL be recorded as `skip-with-reason` in the inventory and the question SHALL retain its flat-text explanation (never a partial or fabricated figure)

#### Scenario: Non-RGB image is converted before encoding

- **WHEN** an extracted figure is CMYK / palette / has an alpha channel
- **THEN** it SHALL be converted to RGB before being encoded to the web asset (no colour-broken or failed encode shipped)

### Requirement: Lazy-loaded static-asset delivery

Recovered explanation figures SHALL be delivered as static asset **files** (web image format, e.g. webp), content-addressed and copied into the app's public asset path, and SHALL be fetched **lazily** by the client (`loading="lazy"`) only when the question's explanation figure scrolls into view — figure **image bytes** SHALL NOT be inlined into `questions.json` nor bundled into the application JavaScript. The figure **references** (asset `src` paths) SHALL be build-injected onto the question as `explanationFigures` in the BUILT `questions.json` from the content-package figure manifest (mirroring the `explanationTableImages` tier), while the **source** `questions.json` is never edited. Provenance (source PDF / page / bbox / booklet / category) SHALL stay in the manifest, not the rendered payload.

#### Scenario: Figure asset bytes are fetched lazily on display, not in the corpus payload

- **WHEN** a user opens a question whose explanation has one or more recovered figures
- **THEN** the figure asset **bytes** SHALL be fetched from the static asset path lazily at display time (not in the initial corpus payload, not in the JS bundle)

#### Scenario: Figure image bytes are absent from the corpus payload

- **WHEN** the built `questions.json` is produced
- **THEN** it SHALL carry the figure `src` references (build-injected `explanationFigures`) but SHALL NOT embed figure image bytes; the source `questions.json` SHALL carry no `explanationFigures` field

### Requirement: Multi-figure attribution verification

For questions whose explanation has more than one candidate figure (the multi-figure subset), the attribution of each crop to its question SHALL be verified before the figure is shipped. The verification SHALL emit a structured per-crop record `{qid, asset, verdict: accept | reject | uncertain, reason}`; only `accept` crops SHALL ship, `uncertain` SHALL NOT ship, and the verifier (including any agent) SHALL NOT edit the manifest directly — it produces verdict records that a deterministic step applies. A crop found to depict a neighbouring question's explanation SHALL be set aside for the question it actually belongs to. For single-figure questions, the geometry gate alone is NOT sufficient evidence of correct attribution: the owner SHALL review a full debug-preview sheet covering EVERY pilot single-figure question (feasible at pilot scale), and any discovered mis-attribution SHALL trigger a fail-stop that escalates that booklet/decision-path to 100% review. A question whose page or figure cannot be located SHALL ship no figure and retain its flat-text explanation.

#### Scenario: Multi-figure question's crops are verified before shipping

- **WHEN** a question has multiple candidate explanation figures
- **THEN** each crop's attribution to that question SHALL be verified, and only verified crops SHALL be attached in reading order

#### Scenario: A crop depicting a neighbouring question is excluded

- **WHEN** a candidate crop is found to depict a neighbouring question's explanation rather than the target's
- **THEN** it SHALL NOT be attached to the target question

#### Scenario: Unlocatable question stays flat text

- **WHEN** neither the figure nor the question's page can be located in the source PDF
- **THEN** no figure SHALL be attached and the question SHALL continue to render its existing flat-text explanation

#### Scenario: Verification emits structured verdicts and only accepts ship

- **WHEN** crops are verified (geometry and/or agent)
- **THEN** each crop SHALL have a `{qid, asset, verdict, reason}` record; `accept` ships, `reject`/`uncertain` do not, and the verdicts are applied by a deterministic step rather than the verifier mutating the manifest

#### Scenario: Single-figure mis-attribution triggers fail-stop

- **WHEN** the owner's full single-figure debug-preview review finds any crop attributed to the wrong question
- **THEN** that booklet / decision-path SHALL escalate to 100% review before any of its figures ship

### Requirement: Source-and-build immutable-text gate

The change SHALL assert that figure recovery did not alter question text in EITHER the hand-maintained source corpus or the built corpus. Before applying figure work, a baseline of the source `questions.json` SHALL be captured; after, the change SHALL assert that `id` / `answer` / `stem` / `options` / `explanation` (and any `explanationBlocks`) are byte-identical to that baseline in both the source `questions.json` and the built `questions.json`. This guards against another concurrent session having edited the shared source file (a self-consistent build is not sufficient evidence).

#### Scenario: Source and built corpora are both asserted unchanged

- **WHEN** the figure-recovery change is applied
- **THEN** for every affected question, `id`/`answer`/`stem`/`options`/`explanation`/`explanationBlocks` SHALL be byte-identical to the pre-apply source baseline in BOTH the source `questions.json` and the built `questions.json`; any diff SHALL fail the change

#### Scenario: Concurrent source edit is detected, not masked

- **WHEN** the source `questions.json` differs from the captured baseline in question-text fields
- **THEN** the gate SHALL fail rather than pass on a self-consistent rebuild

### Requirement: Pilot scope and batch-extensible contract

The in-scope id set SHALL cover the **106-114** booklets: the original pilot booklets (112-1, 112-2, 113-1, 113-2, 114-1, 114-2) plus the follow-up booklets 106-1 through 111-2 — EXCEPT the two booklets 109-1 醫學一 and 111-1 醫學二, which (like the 104-105 booklets) lack `題號` row-label anchors so the detector's region-split degenerates; those two, together with 104-105, are deferred to a later follow-up that adds a no-`題號`-anchor layout-parser fallback. The contract SHALL be extensible across batches: questions added in a later batch (e.g. 104-105 and the deferred reflow booklets once their layout-parser fallback lands) SHALL be governed by the identical contract (rasterized provenance-recorded crop, lazy-loaded, question text byte-identical) without changing it, and earlier-shipped figures SHALL be unaffected by later batches. A question outside the in-scope set SHALL NOT gain a figure.

#### Scenario: In-scope booklets gain figures, deferred booklets do not

- **WHEN** the 106-111 follow-up batch has shipped on top of the 112-114 pilot
- **THEN** recovered figures SHALL cover the in-scope 106-114 booklet questions, and no question in a deferred booklet (104-105, 109-1 醫學一, 111-1 醫學二) or outside the in-scope set SHALL gain a figure

#### Scenario: A later batch is attached under the same contract

- **WHEN** a later batch of figure-questions is added (e.g. 104-105 / the deferred reflow booklets after the no-anchor fallback lands)
- **THEN** it SHALL be attached under the identical contract (rasterized provenance-recorded crop, lazy-loaded, question text unchanged) and earlier batches' already-shipped figures SHALL be unaffected

#### Scenario: Earlier-shipped pilot figures are unaffected by the follow-up batch

- **WHEN** the 106-111 batch is extracted and merged into the figure manifest
- **THEN** the already-shipped 112-114 pilot figures SHALL remain attached and unchanged (the extractor merges by question id rather than overwriting the manifest)
