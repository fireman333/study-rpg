## ADDED Requirements

### Requirement: A 詳解 dropped by extraction MAY be recovered from the original 陽明 PDF

When a reconciled question has an empty `explanation` but the original 陽明 詳解 PDF contains a 詳解 card for that exact question (matching its 題號 and stem), that 詳解 MAY be recovered and written into `explanation` by transcribing the PDF card faithfully. A recovered 詳解 SHALL NOT be marked `ai-generated`. Recovery SHALL match the question's own card only; if no card for that exact question number exists in the located PDF region, the question SHALL NOT borrow a neighbouring question's 詳解.

#### Scenario: An empty-詳解 question whose 陽明 card exists is recovered
- **WHEN** a question has an empty `explanation` and the 陽明 詳解 PDF has a card for that 題號
- **THEN** its `explanation` SHALL be filled from that card (faithful transcription)
- **AND** `explanationSource` SHALL remain unset (it is authoritative 陽明 content)

### Requirement: When 陽明 has no 詳解, the 詳解 MAY be AI-generated and tagged

When a question has an empty `explanation` and the 陽明 詳解 PDF genuinely has no card for it (the question was skipped), a 詳解 MAY be AI-generated and written into `explanation` using the established 115年 convention: `正解：(X)` followed by one prose line per option (affirming the official `answer`, conservative, no invented specifics) and the footer line `（本詳解由 AI 生成，未經陽明審定）`. Such a question SHALL set `explanationSource: 'ai-generated'` so the existing UI renders the AI-source note. The official `id`, `options`, and `answer` SHALL never be altered.

#### Scenario: A 陽明-skipped question gets a tagged AI 詳解
- **WHEN** a question has an empty `explanation` and no 陽明 詳解 card exists for it
- **THEN** its `explanation` MAY be AI-generated in the 115年 format with the AI footer
- **AND** `explanationSource` SHALL be set to `'ai-generated'`
- **AND** the rendered surfaces SHALL show the 🤖 AI-source note (same as 115年 questions)
