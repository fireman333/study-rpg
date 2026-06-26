## MODIFIED Requirements

### Requirement: 更正答案 SHALL map to `disputed` or `acceptedAnswers`

Official 更正答案 SHALL be applied to EVERY included sitting using the existing convention, decoded from that sitting's 答案更正 (`MOD`) file 備註:

- 「一律給分」 / 「除未作答者…其餘均給分」 (any selection correct) SHALL set `disputed: true`.
- 「答Ｘ、Ｙ給分」 / 「答Ｘ或Ｙ…均給分」 (a specific set of letters accepted) SHALL set `acceptedAnswers: [<letters>]` (each individually-credited option letter).
- 「答Ｘ給分」 (single 更正) SHALL set `answer` to the credited option.

This SHALL hold for the official 備註 of every sitting, not only the latest. A question whose official 備註 grants 送分 SHALL NOT be left ungraded-for-送分 (the standard `answer` letter remains the official 標準答案).

#### Scenario: 115 醫學一 corrections applied

- **WHEN** 115-1 醫學一 is reconciled with its 更正答案 (Q66 答 A 或 D 或 AD 均給分; Q95 一律給分)
- **THEN** Q66 SHALL carry `acceptedAnswers` containing `A` and `D`
- **AND** Q95 SHALL carry `disputed: true`

#### Scenario: Earlier-sitting 送分 missed by the initial ingestion is encoded

- **WHEN** a 107–114 question's official 備註 grants 送分 but the corpus had not encoded it (107-2 醫學二 Q85 「答Ａ、Ｃ給分」; 111-1 醫學二 Q49 「一律給分」; 111-2 醫學一 Q65 「除未作答者不給分外，其餘均給分」)
- **THEN** Q85 SHALL carry `acceptedAnswers` containing `A` and `C`
- **AND** Q49 and Q65 SHALL carry `disputed: true`

## ADDED Requirements

### Requirement: Image-only-option questions SHALL be flagged hasOptionImages

A question whose options are presented only as images in the official PDF (no recoverable option text, so all four option strings are empty) SHALL be flagged `hasOptionImages: true`. The quiz SHALL exclude `hasOptionImages` questions from its pools so they are never presented with four blank, unanswerable options.

#### Scenario: Blank-option question is excluded from the quiz

- **WHEN** a question's four option strings are all empty because its options are images (e.g. chemical structures or DNA sequences)
- **THEN** the question's corpus entry has `hasOptionImages: true`
- **AND** the quiz pool excludes it (it is never shown with blank options)
