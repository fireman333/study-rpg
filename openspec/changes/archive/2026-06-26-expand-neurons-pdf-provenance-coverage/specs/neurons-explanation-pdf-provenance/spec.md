## MODIFIED Requirements

### Requirement: Provenance map is generated as a build artifact from manifest
The system SHALL provide a build-time builder that derives a question-to-PDF-page map `{ questionId: { file, page } }` from two committed sources: (1) the `explanation-figures/manifest.json` figure provenance (bbox-precise; authoritative on overlap), and (2) a committed `provenance/question-page-map.json` of text-question pages produced by a deterministic resolver that reuses the figure-detector primitives. The builder SHALL be deterministic, SHALL take the minimum page when a question's figures span multiple pages, and SHALL write its output to a gitignored `public/` path that is regenerated on every build and deploy (never hand-committed).

The text-question resolver SHALL locate each born-digital question's page via its 題號 anchor, gate the result by within-booklet page monotonicity, and cross-check it against an independent signal (the corpus stem's distinctive token searched in the PDF). A question SHALL be included in the map only when the two signals agree (`verified`) or when the stem is absent from the 詳解 text but the anchor is monotonic (`anchoronly`). Questions whose signals conflict, whose anchor breaks monotonicity, or that lie in a scanned (no-text-layer) booklet SHALL be excluded (left unmapped → action hidden), not guessed.

#### Scenario: Map covers every figure-provenance question
- **WHEN** the builder runs against the current `manifest.json`
- **THEN** the output map contains a `{ file, page }` entry for every questionId present in the manifest with a `sourcePdf` + `page`
- **AND** each `file` equals the manifest's `sourcePdf` string verbatim (the real on-disk filename)

#### Scenario: Map covers deterministically-resolved text questions
- **WHEN** a text question's 題號 anchor and its stem cross-check resolve to the same page (±1) in a born-digital booklet
- **THEN** the output map contains a `{ file, page }` entry for that question
- **AND** the figure manifest's page wins for any question present in both sources

#### Scenario: Conflicting or scanned resolutions are excluded
- **WHEN** a text question's anchor and stem signals disagree, or its anchor breaks within-booklet monotonicity, or it lies in a scanned (no-text-layer) booklet
- **THEN** the question is NOT added to the map (its action stays hidden) rather than mapped to a guessed page

#### Scenario: Multi-page figures collapse to the first page
- **WHEN** a question's figures reference more than one page in the manifest
- **THEN** the map entry's `page` is the minimum of those pages

#### Scenario: Map output is a regenerated build artifact
- **WHEN** the content build chain (`prebuild` / `predev`) runs
- **THEN** the map is (re)written to the gitignored `public/provenance/` path
- **AND** no `public/` map JSON is tracked in git
