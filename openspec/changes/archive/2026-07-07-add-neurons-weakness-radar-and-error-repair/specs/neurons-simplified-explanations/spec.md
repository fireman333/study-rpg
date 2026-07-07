## ADDED Requirements

### Requirement: Wrong answers SHALL actively replay the chosen distractor's explanation and the correct option's key

When the player answers a question incorrectly, the QuizModal reveal SHALL actively surface, without requiring the player to expand the passive「簡答」disclosure, two pieces sourced from the existing per-option `optionExplanations`: (1) the explanation of the **option the player chose** framed as the misconception ("你選了 X → …"), and (2) the explanation / key of the **correct option** ("正解 Y → …"). This error-cause replay SHALL render only after an incorrect answer (a correct answer SHALL NOT trigger it). When `optionExplanations` for the chosen or correct option is absent, that piece SHALL degrade gracefully (omit it) rather than render an empty block.

#### Scenario: Wrong answer surfaces chosen-vs-correct replay

- **WHEN** the player answers a question incorrectly and the reveal renders
- **THEN** the QuizModal SHALL show the chosen wrong option's `optionExplanation` as the misconception AND the correct option's explanation/key
- **AND** this SHALL be visible without expanding the passive「簡答」disclosure

#### Scenario: Correct answer does not trigger error-cause replay

- **WHEN** the player answers correctly
- **THEN** the error-cause replay block SHALL NOT render

#### Scenario: Missing option explanation degrades gracefully

- **GIVEN** a question whose chosen option has no `optionExplanation`
- **WHEN** the wrong-answer reveal renders
- **THEN** the missing piece SHALL be omitted with no empty placeholder block

### Requirement: Error-cause replay SHALL offer an add-to-quick-review action

The error-cause replay SHALL present a「加入快速複習」CTA that enqueues the just-missed question into a **transient device-local quick-review queue** (in-memory / `localStorage`, NOT a new synced Dexie table and NOT a schema bump). The next quick-review launch (the existing ≤5-question review mini-batch) SHALL draw from this queue first. The queue is a convenience buffer, not durable cross-device state.

#### Scenario: Add-to-quick-review enqueues the question locally

- **WHEN** the player taps「加入快速複習」on the error-cause replay
- **THEN** the current question SHALL be added to the transient device-local quick-review queue (no new synced table, no schema bump)
- **AND** the CTA SHALL reflect that the question is now enqueued

#### Scenario: Next quick-review draws from the queue first

- **GIVEN** the player has enqueued 2 questions via「加入快速複習」
- **WHEN** the player next launches a quick-review mini-batch
- **THEN** the batch SHALL include the enqueued questions ahead of other candidates
