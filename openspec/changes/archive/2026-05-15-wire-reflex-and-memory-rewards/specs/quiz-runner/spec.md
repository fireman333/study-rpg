## ADDED Requirements

### Requirement: QuizModal tracks per-question elapsed time

The QuizModal SHALL record a `startedAt` timestamp every time it advances to a new question (including the initial question on modal open). When the player selects an MCQ option, the modal SHALL compute `elapsedMs = Date.now() - startedAt` and include it in the `onAnswer` callback payload so the host (App.tsx) can dispatch fast-answer rewards.

The `elapsedMs` value SHALL refer to the time between question-render and option-click — re-clicking another option after reveal MUST NOT reset or extend the elapsed time, since the question is already "answered" at the first click.

#### Scenario: Elapsed time captured on first click

- **WHEN** a new question is rendered in QuizModal at time T0
- **AND** the player clicks an MCQ option at time T1
- **THEN** the `onAnswer` callback SHALL receive `elapsedMs ≈ (T1 - T0)`
- **AND** the value SHALL be a non-negative integer in milliseconds

#### Scenario: Switching modes resets the per-question timer

- **WHEN** QuizModal advances to the next question (via "下一題")
- **THEN** the per-question `startedAt` SHALL be reset to the new question's render time
- **AND** the previous question's elapsed time SHALL NOT bleed into the new question's measurement

#### Scenario: Skip path emits no elapsed time

- **WHEN** the player presses "跳過此題" on a hasImage question (per existing skip requirement)
- **THEN** no `elapsedMs` SHALL be reported (skip is not an answer event)
- **AND** the per-question `startedAt` SHALL still reset for the next question rendered after skip
