## ADDED Requirements

### Requirement: Explanation-figure type, build-injected like the table-image tier

`@study-rpg/core` SHALL export an `ExplanationFigure` type (`{ src; caption? }`, distinct from `ExplanationTableImage`) and an optional `Question.explanationFigures?: ExplanationFigure[]` field. The type and field SHALL be additive and MUST NOT change the existing `Question` / `ExplanationBlock` / `ExplanationTableImage` fields; the field SHALL be optional so existing consumers are unaffected. Mirroring the shipped `explanationTableImages` tier, figure references are **build-injected into the built `questions.json`** from the content-package figure manifest — the **source `questions.json` is never edited** (the immutable invariant) and the renderer reads `question.explanationFigures` (no separate manifest fetch). The asset `src` SHALL be content-addressed (filename includes a content hash) so a re-cropped figure produces a new path and never serves a stale cached image.

#### Scenario: Figure type is exported and additive

- **WHEN** a consumer imports `@study-rpg/core`
- **THEN** `ExplanationFigure` SHALL be available and `Question.explanationFigures` SHALL be an optional field, with the existing `Question` / `ExplanationBlock` / `ExplanationTableImage` fields unchanged

#### Scenario: Source questions.json is never edited; refs are build-injected

- **WHEN** the build wires figures
- **THEN** `explanationFigures` SHALL appear only in the BUILT `questions.json` (injected from the figure manifest), and the source `questions.json` SHALL carry no `explanationFigures` field

#### Scenario: Asset path is content-addressed

- **WHEN** a figure asset's pixels change (re-crop / re-extract)
- **THEN** its `src` path SHALL change (content-hash component), so caches never serve a stale image for an unchanged path
