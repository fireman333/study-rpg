## ADDED Requirements

### Requirement: 簡答 MAY be generated from richer sources when the text 詳解 is insufficient

When a question's text `explanation` is insufficient to produce a faithful per-option 簡答 (it failed the deterministic validator or QA in the initial text run), the 簡答 MAY be generated from a richer source: the original 詳解 PDF page (read by a vision model) for questions that have a PDF page mapping, or a strong text regeneration. Every generated 簡答 — regardless of source — SHALL still satisfy the existing per-option contract (every option covered; correct = why right, others = why wrong or the sentinel; 8–80 CJK chars; plain text; disputed not single-answer) and SHALL pass the same deterministic validator and QA gate before shipping. A 簡答 derived from the PDF page SHALL use only the region for that question; if that region is absent or unclear the generator SHALL decline rather than borrow another question's 詳解.

#### Scenario: A QA-failed question is regenerated from its 詳解 PDF page
- **WHEN** a question whose text-run 簡答 failed QA has a PDF page mapping
- **THEN** its 簡答 MAY be regenerated from the rendered 詳解 PDF page by a vision model
- **AND** the result SHALL pass the same deterministic validator + QA gate before being shipped

#### Scenario: A question without a usable source stays unshipped
- **WHEN** no source (text / PDF page / strong-regen) yields a 簡答 that passes the validator + QA after the bounded retries
- **THEN** the question SHALL remain in `manual-review.json` with no shipped 簡答 (no-簡答 over wrong-簡答)

### Requirement: Each generated 簡答 SHALL record its generation source

Each entry in the shipped sidecar SHALL record how it was generated via a `source` field — such as `text` (the original text-詳解 run), `text-compress`, `pdf-page-vision`, `text-strong-regen`, or a manual fix during a corpus-driven re-sync — plus the model used (and, for `pdf-page-vision`, the source PDF file, page, and render scale) — so a re-run or audit knows the provenance of every 簡答.

#### Scenario: Provenance recorded for a PDF-sourced 簡答
- **WHEN** a 簡答 is generated from a 詳解 PDF page
- **THEN** its sidecar entry SHALL record `source: 'pdf-page-vision'`, the model, and the PDF file + page it was read from
