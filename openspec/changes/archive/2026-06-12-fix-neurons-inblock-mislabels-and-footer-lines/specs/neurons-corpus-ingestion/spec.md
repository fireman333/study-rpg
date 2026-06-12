## MODIFIED Requirements

### Requirement: Explanation whitespace SHALL be normalized at build time (safe subset)

The build SHALL normalize each question's `explanation` to remove upstream PDF→text extraction whitespace cruft, applied uniformly to every question. The normalization is a SAFE SUBSET that SHALL: strip per-line trailing whitespace; drop isolated bare 2–3-digit page-number lines (the answer-key page numbers, e.g. a line containing only `82`); drop standalone book-name footer lines (a line that is exactly `醫學一` or `醫學二`, the extraction page footer); collapse runs of blank lines to a single blank line; and trim leading/trailing blank lines. Normalization SHALL NOT add, remove, or alter any content line — only whitespace, stray bare page-number lines, and standalone book-name footer lines. Multi-character section headers (e.g. `參考資料`, `補充`, `筆者的話`, `校稿補充`) SHALL NOT be matched or removed. Vertical single-character-per-line extraction runs (e.g. `依\n栓\n塞`) SHALL be left intact (out of scope for the safe subset; they are a mix of table-column cells and word-splits, so auto-rejoining risks corrupting content).

#### Scenario: Whitespace and footer cruft is removed without touching content

- **WHEN** a question explanation contains trailing whitespace, 3+ consecutive blank lines, an isolated bare page-number line, or a standalone `醫學一`/`醫學二` footer line
- **THEN** the built explanation SHALL have per-line trailing whitespace stripped, blank-line runs collapsed to a single blank line, and isolated bare 2–3-digit page-number lines and standalone book-name footer lines removed
- **AND** no content line (any line that is not blank, not an isolated bare page-number, and not a standalone book-name footer) SHALL be added, removed, or altered

#### Scenario: Legitimate section headers are preserved

- **WHEN** an explanation contains a standalone section-header line such as `參考資料` or `補充`
- **THEN** the build SHALL leave that line unchanged

#### Scenario: Vertical single-char runs are preserved

- **WHEN** an explanation contains a vertical single-character-per-line run from extraction
- **THEN** the build SHALL leave that run unchanged (the safe subset does not auto-rejoin it)
