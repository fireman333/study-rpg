## ADDED Requirements

### Requirement: Users SHALL be able to report a wrong concept label via the existing report flow

The existing in-app bug-report flow (QuizModal 🐞 report sheet) SHALL offer a "概念標籤錯誤" report target, and the `bug_reports` category set SHALL include a corresponding value, so users can flag an incorrect concept tag on a question. This SHALL reuse the existing report sheet and pipeline — no separate report UI or entry point is added.

#### Scenario: Report a mistagged concept
- **WHEN** a user opens the existing 🐞 report sheet for a question
- **THEN** "概念標籤錯誤" SHALL be selectable as the report target, and submitting SHALL store a `bug_reports` row with the corresponding category and the `question_id`, via the existing pipeline (no new UI)

#### Scenario: Reuse, do not rebuild
- **WHEN** the concept-label report path is added
- **THEN** it SHALL extend the existing report sheet and `bug_reports` schema with one option / one enum value, and MUST NOT introduce a separate reporting interface
