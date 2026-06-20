## ADDED Requirements

### Requirement: Exam-content text wraps long tokens without horizontal page overflow at mobile widths

Exam-content prose — the question `stem`, `option` text, and `explanation` body — SHALL break long unbroken tokens (a long Latin word, URL, or bracketed citation) so the text wraps within its container, and SHALL NOT cause page-level horizontal overflow at viewport widths down to **375px**, on every surface that renders this content: `QuizModal`, `MockExamRunner`, `QuestionBankPage` (`/bank`), `BookmarksPage`, and `PrecedingContext` (承上題). The behavior SHALL be achieved with `overflow-wrap: anywhere` (breaking only when a token cannot otherwise fit), so CJK wrapping and the desktop (≥ 768px) layout are unchanged.

#### Scenario: Question bank does not overflow at mobile width

- **GIVEN** the `/bank` page rendered at 390px viewport width with explanations expanded
- **WHEN** a question's explanation contains a long unbroken token (e.g. a citation like `Ref：[First Choice …`)
- **THEN** the document SHALL NOT have horizontal scroll (no element exceeds the content box)
- **AND** the long token SHALL wrap within its explanation container rather than paint past it

#### Scenario: Quiz and mock-exam explanations wrap at mobile width

- **GIVEN** `QuizModal` (after answering) or `MockExamRunner` (review) showing an explanation at 375px
- **WHEN** the stem, an option, or the explanation contains a long unbroken token
- **THEN** that text SHALL wrap to fit and SHALL NOT introduce horizontal page scroll
