## MODIFIED Requirements

### Requirement: Provenance map is generated as a build artifact from manifest
The system SHALL provide a build-time builder that derives a question-to-PDF-page map `{ questionId: { file, page } }` from four committed sources: (1) the `explanation-figures/manifest.json` figure provenance (bbox-precise), (2) a committed `provenance/question-page-map.json` of text-question pages produced by the base deterministic resolver, (3) a committed `provenance/question-page-map-residual.json` of additional pages produced by a second-layer resolver (`resolve_residual.py`) for questions the base resolver left unresolved, and (4) a committed `provenance/verified-overrides.json` of human/agent-verified pages that bypass the automated gates (highest priority). The builder SHALL be deterministic, SHALL take the minimum page when a question's figures span multiple pages, SHALL let the verified-overrides source win for any question it lists and otherwise SHALL not let a later source override an earlier one for the same question, and SHALL write its output to a gitignored `public/` path that is regenerated on every build and deploy (never hand-committed).

The base text-question resolver SHALL locate each born-digital question's page via its 題號 anchor, gate the result by within-booklet page monotonicity, and cross-check it against an independent signal (the corpus stem's distinctive token searched in the PDF). The second-layer resolver SHALL additionally resolve residual born-digital questions by (a) multi-token stem voting constrained to the within-booklet monotonic window (for booklets with a usable CJK text layer, including booklets the base resolver skipped merely because its 題號-anchor pattern matched few anchors), and (b) numeric question-anchor plus Latin-token cross-check (for booklets whose CJK text layer is garbled by a broken custom font but whose page images and Latin terms remain intact), and MAY fold in agent-verified pages supplied as an explicit input. Every second-layer resolution SHALL be re-gated for within-booklet monotonicity and for the question's content actually appearing on the chosen page. A question SHALL be included in the map only when its resolution passes these gates; questions whose signals conflict, whose page breaks monotonicity, whose page genuinely lacks a usable text layer for that question (no token hit), or that have no source PDF SHALL be excluded (left unmapped → action hidden), not guessed.

#### Scenario: Map covers every figure-provenance question
- **WHEN** the builder runs against the current `manifest.json`
- **THEN** the output map contains a `{ file, page }` entry for every questionId present in the manifest with a `sourcePdf` + `page`
- **AND** each `file` equals the manifest's `sourcePdf` string verbatim (the real on-disk filename)

#### Scenario: Map covers deterministically-resolved text questions
- **WHEN** a text question's 題號 anchor and its stem cross-check resolve to the same page (±1) in a born-digital booklet
- **THEN** the output map contains a `{ file, page }` entry for that question
- **AND** the figure manifest's page wins for any question present in both sources

#### Scenario: Map covers second-layer-resolved residual questions
- **WHEN** a residual born-digital question is resolved by multi-token stem voting within its monotonic window, or by numeric-anchor + Latin cross-check in a garbled-text-layer booklet, and the resolution passes the monotonicity + on-page-content gate
- **THEN** the output map contains a `{ file, page }` entry for that question
- **AND** the base text map and figure manifest win for any question already present in them

#### Scenario: Booklet with a usable text layer is resolved even if the base resolver skipped it
- **WHEN** a booklet was excluded by the base resolver only because its 題號-anchor pattern matched few anchors, yet its pages carry a usable CJK text layer (or a garbled-font layer with surviving Latin terms and page numbers)
- **THEN** the second-layer resolver attempts it via stem-run (clean) or numeric-anchor + Latin / vision (garbled), and maps each question whose resolution passes the content + monotonicity gate

#### Scenario: Agent-verified page is accepted only after re-gating
- **WHEN** an agent-supplied page for a residual question is folded into the second-layer resolver
- **THEN** it is added to the map only if it passes the same within-booklet monotonicity + on-page-content gate
- **AND** otherwise the question stays unmapped (action hidden) rather than mapped to an unverified page

#### Scenario: Human-verified override bypasses the automated gates
- **WHEN** a question's card cannot be gated by the automated pipeline — its stem/options are rendered as an embedded image (no extractable text for the stem-run check) or its 陽明 booklet's physical card order differs from the 考選部 qNumber (breaking the monotonicity fallback) — and a human/agent has confirmed the correct page by reading the actual rendered card
- **THEN** the page is recorded in `provenance/verified-overrides.json` and the builder maps that question to it, winning over all other sources
- **AND** questions NOT listed in the overrides are unaffected (still gated normally)

#### Scenario: Conflicting, textless, or un-sourced resolutions are excluded
- **WHEN** a question's signals disagree, its page breaks within-booklet monotonicity, its page genuinely lacks a usable text layer for that question (no token hit and no vision confirmation), or its booklet has no source PDF on disk
- **THEN** the question is NOT added to the map (its action stays hidden) rather than mapped to a guessed page

#### Scenario: Multi-page figures collapse to the first page
- **WHEN** a question's figures reference more than one page in the manifest
- **THEN** the map entry's `page` is the minimum of those pages

#### Scenario: Map output is a regenerated build artifact
- **WHEN** the content build chain (`prebuild` / `predev`) runs
- **THEN** the map is (re)written to the gitignored `public/provenance/` path
- **AND** no `public/` map JSON is tracked in git
