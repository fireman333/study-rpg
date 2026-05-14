## MODIFIED Requirements

### Requirement: Quiz modal presents N random questions

The QuizModal SHALL pick N questions (default 5) from the available content pack pool, optionally filtered by subject, presenting them one at a time.

Selection SHALL be **due-card-biased** per the `srs-queue` capability:
1. Compute `dueInPool` = questions whose `questionId` is in `dueQuestionIds` (an SRS-filtered list passed in as a prop)
2. Compute `freshInPool` = remaining pool questions
3. Pick all due questions first (shuffled), then fill remainder from shuffled fresh
4. If both pools exhausted, render however many questions are available (may be fewer than N)

#### Scenario: Opens with N due-biased questions

- **WHEN** the player clicks "開始答題"
- **AND** the SRS queue contains 3 due questions for the active subject
- **THEN** the QuizModal SHALL render with 5 questions: 3 due + 2 fresh
- **AND** the first question SHALL be one of the 3 due (shuffled, not deterministic which)

#### Scenario: Empty SRS queue falls back to pure random

- **WHEN** the player clicks "開始答題" and no SRS cards are due
- **THEN** the QuizModal SHALL render 5 random questions from the fresh pool (legacy MVP behavior)
