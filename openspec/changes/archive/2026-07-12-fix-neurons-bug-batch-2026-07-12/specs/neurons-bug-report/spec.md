## ADDED Requirements

### Requirement: Submission modal resets to a fresh form on reopen

The HelpMenu bug-report modal (`BugReportModal`) SHALL present a fresh, empty form each time it opens.
The component stays mounted and renders null while closed, so it SHALL clear its transient state — the
post-submit success/error result and every input field — whenever it transitions to open, letting a
player file consecutive reports without reloading the page. (The inline `QuizBugReportSheet` /
`QuestionBugReportSheet` are conditionally mounted and unmount on close, so they already start fresh.)

#### Scenario: Reopening after a successful submit shows a fresh form

- **GIVEN** the player has submitted a report, seen the 「已送出」 success screen, and closed the modal
- **WHEN** the player opens the bug-report modal again
- **THEN** the modal SHALL show the empty submission form, NOT the previous success screen
- **AND** the category, severity, and description fields SHALL be reset to their defaults
