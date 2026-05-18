## MODIFIED Requirements

### Requirement: Binary-input SM-2 review on answer

The system SHALL update each question's `interval`, `easeFactor`, and `nextDueAt` after every quiz answer using a binary (correct / wrong) input variant of SM-2. Mastery, affinity, and SRS state updates MUST happen in a single atomic Dexie transaction. The correct-path `interval` MUST be clamped to `MAX_INTERVAL_DAYS` (365) to prevent runaway expansion on long streaks of correct answers.

#### Scenario: First correct answer on a fresh question

- **WHEN** a user answers a question correctly for the first time (existing row has `interval: 0`, `easeFactor: 2.5`, `nextDueAt: null`)
- **THEN** the system MUST set `interval = 1` (days), `easeFactor` unchanged (2.5), and `nextDueAt = now + 1 day` (in ms epoch)

#### Scenario: Second consecutive correct answer

- **WHEN** a user answers correctly and the existing row has `interval = 1`
- **THEN** the system MUST set `interval = 6`, `easeFactor` unchanged, and `nextDueAt = now + 6 days`

#### Scenario: Subsequent correct answer expands interval by easeFactor

- **WHEN** a user answers correctly and the existing row has `interval ≥ 6`
- **THEN** the system MUST set `interval = round(prev.interval × prev.easeFactor)`, `easeFactor` unchanged, and `nextDueAt = now + newInterval × DAY`

#### Scenario: Correct answer clamps interval at 365-day cap

- **WHEN** a correct answer would compute `newInterval > MAX_INTERVAL_DAYS` (365) via the standard expansion
- **THEN** the system MUST set `interval = MAX_INTERVAL_DAYS` (365), `easeFactor` unchanged, and `nextDueAt = now + 365 days`

#### Scenario: Pre-existing over-cap row clamps on next correct answer

- **WHEN** an existing row has `interval = 500` (legacy value from before the cap was added) and the user answers correctly
- **THEN** the system MUST clamp the next update to `interval = MAX_INTERVAL_DAYS` (365), regardless of the legacy starting value
