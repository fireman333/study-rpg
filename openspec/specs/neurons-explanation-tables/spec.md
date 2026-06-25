# neurons-explanation-tables Specification

## Purpose

How the neurons app renders a question's 詳解 when its original PDF table was extraction-flattened into a one-cell-per-line fragment column. Defines the shared `<Explanation>` render contract across the three surfaces that show 詳解 (`QuizModal`, `MockExamRunner`, `QuestionBankPage`), the structured-block vs flat-string fallback, mobile horizontal-scroll behavior for real tables, and the faithful-and-validated discipline governing how flattened tables become structured `explanationBlocks` content data (gate, quarantine, never touch `id` / `answer`).

## Requirements

### Requirement: Explanations SHALL render structured blocks as real tables, with a flat-string fallback

The neurons app SHALL render a question's 詳解 through one shared component used by all three
surfaces that show it (`QuizModal`, `MockExamRunner`, and `QuestionBankPage` at `/bank`). When
the question carries `explanationBlocks`, the component SHALL render them: a `prose` block as
text (preserving line breaks), and a `table` block as a genuine HTML `<table>` (header row from
`columns`, body from `rows`). When `explanationBlocks` is absent or empty, the component SHALL
render the flat `explanation` string exactly as before (the fallback). Block order SHALL be
preserved (prose before a table stays before it; prose after stays after).

#### Scenario: A reconstructed question renders real tables

- **GIVEN** a question whose `explanationBlocks` contains prose and table blocks
- **WHEN** its 詳解 is shown on any of the three surfaces
- **THEN** each table block SHALL render as an HTML `<table>` with the given columns and rows
- **AND** the surrounding prose SHALL render in its original reading-order position

#### Scenario: A non-reconstructed question is unchanged

- **GIVEN** a question with no `explanationBlocks`
- **WHEN** its 詳解 is shown
- **THEN** the flat `explanation` string SHALL render exactly as before this change

### Requirement: Reconstructed tables SHALL be horizontally scrollable on narrow screens

A rendered table block SHALL sit in a horizontally scrollable container (`overflow-x: auto`) so
that on a narrow (mobile) viewport the table scrolls sideways as a genuine table rather than
collapsing into a fragment column or being card-ified. Cell text SHALL wrap within cells
(`word-break: keep-all` for CJK) and the desktop layout SHALL be unchanged.

#### Scenario: A wide table on a phone scrolls instead of breaking

- **GIVEN** a table block with more columns than fit a 390px viewport
- **WHEN** it renders on that viewport
- **THEN** the table SHALL be horizontally scrollable within its container
- **AND** SHALL NOT force page-level horizontal overflow

### Requirement: Table reconstruction SHALL be a faithful, validated, content-data transform

Reconstruction of a flattened-table explanation into `explanationBlocks` SHALL be a faithful
reformat of existing content: it SHALL NOT add, remove, or alter any medical fact, and SHALL use
only words already present in the source `explanation` (page-furniture footers excepted, which
are dropped). It SHALL never change a question's `id` or `answer`. Each produced reconstruction
SHALL pass an automated gate before being applied: every table row's cell count SHALL equal its
`columns` length, and no non-footer source token SHALL be dropped beyond a small tolerance.
A reconstruction that fails the gate — or whose source table has scrambled/ambiguous cell order —
SHALL be quarantined (left as the flat `explanation` string) for human review, never auto-applied.

#### Scenario: A low-confidence reconstruction is quarantined, not shipped

- **GIVEN** a flattened table whose column alignment is ambiguous (scrambled cell order) or whose reconstruction drops source tokens beyond tolerance
- **WHEN** the automated gate evaluates it
- **THEN** the reconstruction SHALL NOT be applied
- **AND** that question SHALL continue to render its flat `explanation` until a human review resolves it

#### Scenario: id and answer are never touched

- **WHEN** a question's explanation is reconstructed into blocks
- **THEN** only `explanationBlocks` (and never `id` or `answer`) SHALL be added to that question record
