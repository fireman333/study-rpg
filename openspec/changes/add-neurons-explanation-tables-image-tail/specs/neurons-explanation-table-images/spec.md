## MODIFIED Requirements

### Requirement: Image-crop tier for unrecoverable 詳解 tables

The system SHALL provide a faithful image-crop fallback for 詳解 tables that cannot be reconstructed as
structured text without medical guessing (scrambled-cell "Bucket C" tables and tables that are embedded images
in the source PDF). For an in-scope question, the system SHALL attach one or more moderate-quality images of the
table(s), each cropped from the original source PDF, rendered inline after the explanation. The images SHALL be
additive: the question's text `explanation` string and its `id`/`answer` SHALL remain unchanged. The in-scope id
list SHALL be extensible across batches: the same contract SHALL govern questions added after the initial
Bucket C pilot (e.g. the destroyed-OCR severe-quarantine tail), so coverage grows without changing the contract.

#### Scenario: Bucket C question gains one or more table images

- **WHEN** a question in the curated in-scope id list has its 詳解 table(s) cropped from the source PDF
- **THEN** the question's per-question payload SHALL carry an ordered list of references to the cropped table
  image assets (a question may carry several images when its 詳解 contains multiple tables/figures)
- **AND** the text `explanation`, `id`, and `answer` fields SHALL be unchanged

#### Scenario: A crop that belongs to a different question is excluded

- **WHEN** a candidate crop is found to depict a neighbouring question's table rather than the target question's
- **THEN** it SHALL NOT be attached to the target question (set aside for the question it actually belongs to)

#### Scenario: Question that cannot be located stays flat text

- **WHEN** neither the table nor the question's page can be located in the source PDF
- **THEN** no image asset SHALL be attached and the question SHALL continue to render its existing flat text
  explanation (no fabricated or partial content)

#### Scenario: A later batch is attached under the same contract

- **WHEN** destroyed-OCR severe-quarantine questions beyond the initial Bucket C pilot are cropped and added to
  the in-scope id list
- **THEN** they SHALL be attached under the identical contract (rasterized owner-verified crop, clean prose
  replacing the garbled flattened text, `id`/`answer`/source corpus json unchanged)
- **AND** the questions already cropped in earlier batches SHALL be unaffected
