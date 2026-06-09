## ADDED Requirements

### Requirement: Session question pool is fixed at session start
The QuizModal SHALL derive its session question pool exactly once, when the session begins, and SHALL NOT re-derive or re-shuffle it for the lifetime of that session — even when the upstream pool input changes reference (e.g. the caller rebuilds it because `questionHistory` updated after an answer). A new session (a fresh modal mount) re-derives the pool from current state; within a session the question order is immutable. This holds for both shuffled modes (新題 / 隨機 / 出征) and the order-preserving 錯題 review mode.

#### Scenario: Answering does not reorder the session
- **WHEN** the player answers a question (which writes `questionHistory` and may mint a variant, updating the live query the caller's pool is derived from)
- **THEN** the currently displayed question and the remaining session order SHALL stay unchanged (the question does not "jump")

#### Scenario: Advancing serves the next question in the fixed order
- **WHEN** the player clicks 下一題 after answering
- **THEN** the modal SHALL advance to the next question in the session's fixed order, not a freshly re-shuffled one

#### Scenario: A new session re-derives the pool
- **WHEN** the player closes the modal and starts a new quiz session
- **THEN** the new session SHALL derive its pool from current `questionHistory` (a fresh shuffle, or the current oldest-due-first order for review mode)
