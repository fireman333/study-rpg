## ADDED Requirements

### Requirement: 陽明-reconcile-path explanations SHALL belong to their question, recovered from source when extraction failed

A question on the 陽明-reconcile path (a sitting with published 陽明 詳解) SHALL carry the explanation that belongs to *that* question. When the upstream `_extracted` step failed to capture a question's 詳解 (the source `.md` marks it `未從 PDF 擷取到此題`, leaving the reconciled `explanation` empty or populated with another question's text), the explanation SHALL be recovered from the original 陽明 source PDF (`陽明國考考古/*.pdf`) rather than shipped empty or mis-paired. Recovery SHALL change only the `explanation` field (and, where the same extraction gap also produced a wrong `subject`, the `subject` field); the `id` and the 考選部-authoritative `answer` SHALL NOT change.

#### Scenario: An empty 陽明-path explanation is filled from source

- **WHEN** a 陽明-reconcile-path question has an empty `explanation` because its source block was `未從 PDF 擷取到此題`
- **THEN** the explanation SHALL be recovered from the original 陽明 詳解 PDF for that sitting/subject
- **AND** the recovered text SHALL match the question's own stem/options (not another question's 詳解)
- **AND** `id` and `answer` SHALL remain unchanged

#### Scenario: A mis-paired explanation is replaced with the question's own

- **WHEN** a 陽明-reconcile-path question carries an explanation whose content does not match its stem (a paste from a different question)
- **THEN** the explanation SHALL be replaced with that question's own 詳解 recovered from source
- **AND** if the same gap also placed the question under a subject absent from its paper (e.g. 微生物暨免疫學 in a 醫學一 paper), the `subject` SHALL be corrected to the hand-confirmed contiguous block for that qNumber
