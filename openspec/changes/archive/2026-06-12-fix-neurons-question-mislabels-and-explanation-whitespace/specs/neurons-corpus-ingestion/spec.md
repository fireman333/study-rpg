## ADDED Requirements

### Requirement: Explanation whitespace SHALL be normalized at build time (safe subset)

The build SHALL normalize each question's `explanation` to remove upstream PDF→text extraction whitespace cruft, applied uniformly to every question. The normalization is a SAFE SUBSET that SHALL: strip per-line trailing whitespace; drop isolated bare 2–3-digit page-number lines (the answer-key page numbers, e.g. a line containing only `82`); collapse runs of blank lines to a single blank line; and trim leading/trailing blank lines. Normalization SHALL NOT add, remove, or alter any content line — only whitespace and stray bare page-number lines. Vertical single-character-per-line extraction runs (e.g. `依\n栓\n塞`) SHALL be left intact (out of scope for the safe subset; auto-rejoining risks merging legitimately short lines).

#### Scenario: Whitespace cruft is removed without touching content

- **WHEN** a question explanation contains trailing whitespace, 3+ consecutive blank lines, or an isolated bare page-number line
- **THEN** the built explanation SHALL have per-line trailing whitespace stripped, blank-line runs collapsed to a single blank line, and isolated bare 2–3-digit page-number lines removed
- **AND** no content line (any line that is not blank and not an isolated bare page-number) SHALL be added, removed, or altered

#### Scenario: Vertical single-char runs are preserved

- **WHEN** an explanation contains a vertical single-character-per-line run from extraction
- **THEN** the build SHALL leave that run unchanged (the safe subset does not auto-rejoin it)
