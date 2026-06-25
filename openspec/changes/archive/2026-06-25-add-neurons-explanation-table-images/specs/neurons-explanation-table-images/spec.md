## ADDED Requirements

### Requirement: Image-crop tier for unrecoverable 詳解 tables

The system SHALL provide a faithful image-crop fallback for 詳解 tables that cannot be reconstructed as
structured text without medical guessing (scrambled-cell "Bucket C" tables and tables that are embedded images
in the source PDF). For an in-scope question, the system SHALL attach one or more moderate-quality images of the
table(s), each cropped from the original source PDF, rendered inline after the explanation. The images SHALL be
additive: the question's text `explanation` string and its `id`/`answer` SHALL remain unchanged.

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

### Requirement: Faithful, owner-verified crop production

Each table image SHALL be a rasterization of the original source-PDF region (never a transcription or
re-typesetting of table content), so the result is faithful by construction. Crops SHALL be verified by the
owner before being wired into shipped content — either by reviewing a generated debug-preview, or by the owner
hand-cropping the precise region. Each shipped image SHALL have recorded provenance.

#### Scenario: Crop is a rasterized region, not transcribed content

- **WHEN** a table image is generated
- **THEN** it SHALL be a rasterized crop of the source-PDF page region (optionally padded), with no
  machine-typed or model-transcribed table cell text substituted for the original pixels

#### Scenario: Owner verification precedes wiring

- **WHEN** a table image is prepared for a question
- **THEN** it SHALL NOT be wired into shipped content until the owner has verified its framing (via a
  debug-preview, or by having produced the crop directly)

#### Scenario: Provenance is recorded

- **WHEN** the shipped table images are assembled
- **THEN** a sidecar manifest SHALL map each question id to its ordered image assets (and captions), so the
  wiring is reproducible and auditable

### Requirement: Garbled flattened-table text is replaced by clean prose

When a question carries table images, the flattened-table gibberish that the image now depicts SHALL NOT be
shown as text. The system SHALL render a clean prose-only explanation for such a question — the narrative prose
of the original explanation with the flattened-table runs removed — while keeping the original flat
`explanation` string unchanged (retained for search and as a fallback). Every prose passage shown SHALL be
faithful to the source (no invented or paraphrased content).

#### Scenario: Clean prose renders instead of the flattened table text

- **WHEN** a Bucket C question with table images is shown
- **THEN** its rendered explanation SHALL be the narrative prose (flattened-table runs removed), followed by the
  table image(s)
- **AND** the original `explanation` string SHALL remain unchanged in the data

#### Scenario: Prose is faithful to the source

- **WHEN** the clean prose is produced
- **THEN** each passage SHALL be verbatim from the original explanation, except for corrections sourced from the
  original PDF (e.g. fixing an OCR garble such as `SOz`→`SO₂` or `乙烯膽鹼`→`乙醯膽鹼`); no content SHALL be
  invented, paraphrased, or re-added as machine-typed table text

### Requirement: Inline image-table rendering

The shared explanation renderer SHALL display each attached table image inline, lazy-loaded, inside a
horizontally scrollable framed container with a caption (the table's source title, defaulting to
「原始詳解表格」) and descriptive alternative text. Rendering image tables SHALL NOT alter how text-table
reconstructions or plain prose explanations are rendered.

#### Scenario: Image table renders with frame, caption, and lazy loading

- **WHEN** a question with attached table image(s) is shown in any explanation surface (QuizModal,
  MockExamRunner, QuestionBankPage)
- **THEN** each image SHALL render lazily inside an `overflow-x:auto` framed container with a caption and
  descriptive alt text, without causing horizontal page overflow on a narrow screen
- **AND** questions without table images SHALL render exactly as before (text-table blocks or flat prose)

#### Scenario: Moderate quality and file size

- **WHEN** a table image asset is produced for shipping
- **THEN** it SHALL be encoded in a web format chosen for legible CJK text at small size (WebP), and a typical
  single-table crop SHALL be on the order of tens of kilobytes
