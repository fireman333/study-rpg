## MODIFIED Requirements

### Requirement: Explanation side-car SHALL be merged per-question with graceful fallback

For each question file `<basename>.md`, the build script SHALL look for `<basename>.explanations.md`:

- If side-car exists: for each `Q<n>` in the question file, find the matching `## Q<n>` block in the side-car. If found, the **body of** the `### 選項詳解` block (the markdown content **below** the `### 選項詳解` header line, NOT the header line itself) SHALL be assigned as `Question.explanation` AND `meta.explanationStatus` SHALL be `"ok"`. The `### 選項詳解` header line itself SHALL be stripped because host apps (`QuizModal` / `BookmarksPage` / `ERConsultDialog` via `ExplanationMarkdown`) render their own outer section label (e.g. 「解析」) — including the header would produce a visually redundant double-heading.
- If side-car exists but the specific Q<n> is not in it: `Question.explanation` SHALL be a non-empty placeholder string `"詳解生成中（pending LLM generation）。原始題目 / 答案完整可用。"` AND `meta.explanationStatus` SHALL be `"pending"`
- If side-car does not exist at all: same fallback as above

`meta.explanationModel` (if available from side-car frontmatter), `meta.oeHitRate`, and `meta.explanationConfidence` (P1–P5 label extracted from the explanation header) SHALL be carried through into `Question.meta`.

#### Scenario: Question with explanation merged from side-car

- **GIVEN** `108_第一次.md` contains Q1 and `108_第一次.explanations.md` contains a `## Q1` block with `### 選項詳解`
- **WHEN** the build runs
- **THEN** `questions.json` entry for Q1 SHALL have `explanation` = the markdown content **below** the `### 選項詳解` header line (typically starting with `**A. ...**`)
- **AND** `explanation` SHALL NOT start with `### 選項詳解`
- **AND** `meta.explanationStatus` = `"ok"`
- **AND** `meta.explanationModel` SHALL be set from side-car frontmatter `model` field

#### Scenario: Question without side-car coverage falls back gracefully

- **GIVEN** `108_第一次.md` contains Q1 but `108_第一次.explanations.md` does NOT exist
- **WHEN** the build runs
- **THEN** `questions.json` entry for Q1 SHALL have `explanation` = `"詳解生成中（pending LLM generation）。原始題目 / 答案完整可用。"`
- **AND** `meta.explanationStatus` = `"pending"`
- **AND** Q1 SHALL still be `importedQ` (counted as imported, NOT skipped)
