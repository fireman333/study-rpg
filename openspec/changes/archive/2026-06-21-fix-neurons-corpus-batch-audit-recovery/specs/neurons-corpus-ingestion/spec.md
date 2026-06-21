## ADDED Requirements

### Requirement: Subject labels SHALL match the authoritative 陽明 PDF 科目 classification

A question's `subject` SHALL match the 科目 label assigned to that question in the original 陽明 詳解 PDF for its sitting — that label is the authoritative source-of-truth for which exam subject block the question belongs to, and it SHALL take precedence over a content-only classification guess. Where the reconciled corpus carried a non-canonical label (e.g. `免疫學` or `微生物學` instead of `微生物暨免疫學`) or a content-wrong label, the `subject` SHALL be corrected to the PDF 科目 (normalized to one of the 10 canonical subjects). The `id` and `answer` SHALL NOT change. When the PDF 科目 agrees with the current label, the label SHALL be kept even if a content-only heuristic would suggest otherwise (e.g. a tick-borne bacterial-pathogen question that 陽明 files under 寄生蟲學).

#### Scenario: A content-wrong subject is corrected to the PDF 科目

- **WHEN** a question's `subject` disagrees with the 科目 label assigned to it in the original 陽明 PDF
- **THEN** the `subject` SHALL be set to the PDF 科目 (normalized to a canonical subject)
- **AND** `id` and `answer` SHALL remain unchanged

#### Scenario: A PDF-confirmed current label is not changed by a content guess

- **WHEN** an automated content audit flags a question's subject as mismatched, but the original 陽明 PDF 科目 label matches the current `subject`
- **THEN** the current `subject` SHALL be kept (the PDF 科目 is authoritative over the content guess)

#### Scenario: Non-canonical labels are normalized

- **WHEN** a question carries a `subject` that is not one of the 10 canonical subjects (e.g. `免疫學`, `微生物學`)
- **THEN** the `subject` SHALL be normalized to its canonical form (e.g. `微生物暨免疫學`)
