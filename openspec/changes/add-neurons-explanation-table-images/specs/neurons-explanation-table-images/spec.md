## ADDED Requirements

### Requirement: Image-crop tier for unrecoverable 詳解 tables

The system SHALL provide a faithful image-crop fallback for 詳解 tables that cannot be reconstructed as
structured text without medical guessing (scrambled-cell "Bucket C" tables and tables that are embedded images
in the source PDF). For an in-scope question, the system SHALL attach a moderate-quality image of the table
cropped from the original source PDF, rendered inline in the explanation. The image SHALL be additive: the
question's text `explanation` string and its `id`/`answer` SHALL remain unchanged.

#### Scenario: Bucket C question gains a table image

- **WHEN** a question in the curated in-scope id list is processed and its table region is successfully located
  and cropped from the source PDF
- **THEN** the question's per-question payload SHALL carry a reference to the cropped table image asset
- **AND** the text `explanation`, `id`, and `answer` fields SHALL be byte-for-byte unchanged

#### Scenario: Question that cannot be located stays flat text

- **WHEN** neither the table bbox nor the question's page can be located in the source PDF
- **THEN** no image asset SHALL be attached and the question SHALL continue to render its existing flat text
  explanation (no fabricated or partial content)

### Requirement: Faithful, owner-verified crop production

The build-time tool SHALL produce each table image by rasterizing the original source-PDF region (never by
transcribing or re-typesetting table content), so the result is faithful by construction. For every produced
image the tool SHALL also emit a debug-preview artifact, and an image SHALL be wired into the content only after
owner approval of its preview.

#### Scenario: Crop is a rasterized region, not transcribed content

- **WHEN** a table image is generated
- **THEN** it SHALL be a rasterized crop of the source-PDF page region (optionally padded), with no
  machine-typed or model-transcribed table cell text substituted for the original pixels

#### Scenario: Debug preview precedes apply

- **WHEN** the tool generates a table image for a question
- **THEN** it SHALL also write a debug-preview image (the crop, or the source page with the chosen bounding box
  outlined) for that question
- **AND** an image asset SHALL NOT be wired into the shipped content until the owner has approved its preview

#### Scenario: Provenance is recorded

- **WHEN** a table image is produced
- **THEN** the tool SHALL record its provenance (source PDF, page, bounding box, render DPI, and location method)
  in a sidecar map so the crop is reproducible and auditable

### Requirement: Inline image-table rendering

The shared explanation renderer SHALL display an attached table image inline, lazy-loaded, inside a horizontally
scrollable framed container with a caption identifying it as the original 詳解 table, and with descriptive
alternative text. Rendering an image table SHALL NOT alter how text-table reconstructions or plain prose
explanations are rendered.

#### Scenario: Image table renders with frame, caption, and lazy loading

- **WHEN** a question with an attached table image is shown in any explanation surface (QuizModal,
  MockExamRunner, QuestionBankPage)
- **THEN** the image SHALL render lazily inside an `overflow-x:auto` framed container with the caption
  「原始詳解表格」and descriptive alt text
- **AND** questions without a table image SHALL render exactly as before (text-table blocks or flat prose)

#### Scenario: Moderate quality and file size

- **WHEN** a table image asset is produced for shipping
- **THEN** it SHALL be encoded in a web format chosen for legible CJK text at small size (WebP), and a typical
  single-table crop SHALL be on the order of tens of kilobytes (not hundreds)
