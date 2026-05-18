## MODIFIED Requirements

### Requirement: Quiz answer creates or updates an SrsCard

After every question answered in QuizModal, the engine SHALL upsert a corresponding `SrsCard` to `db.srs` keyed by `questionId`. If no card exists, `newCard(questionId)` SHALL create one; then `reviewCard(card, quality)` SHALL update it. The correct-path `interval` MUST be clamped to `MAX_INTERVAL_DAYS` (365) to prevent runaway expansion on long streaks of quality ≥ 3 answers.

The quality value mapping SHALL be:

| Answer outcome | Quality (0–5) | Effect |
|---|---|---|
| Correct | `4` | "Good" — interval grows by ease factor (SM-2 standard), capped at 365 days |
| Wrong | `2` | "Lapse" — interval resets to 1 day, lapses counter bumps |

#### Scenario: First-time correct answer creates a card with non-zero interval

- **WHEN** a question with no prior `SrsCard` record is answered correctly in QuizModal
- **THEN** `db.srs.get(questionId)` SHALL return a card with `interval > 0` (first correct review → `interval = 1` day per SM-2)
- **AND** `dueAt` SHALL be approximately `now + 1 day`
- **AND** `lapses` SHALL be `0`

#### Scenario: First-time wrong answer creates a lapse card

- **WHEN** a question with no prior `SrsCard` is answered wrong
- **THEN** `db.srs.get(questionId)` SHALL return a card with `interval === 1`, `lapses === 1`
- **AND** `dueAt` SHALL be approximately `now + 1 day` (lapse next-day review)

#### Scenario: Long correct streak clamps interval at 365-day cap

- **WHEN** a correct answer (quality ≥ 3) would compute `newInterval > MAX_INTERVAL_DAYS` (365) via `round(card.interval × newEase)`
- **THEN** `reviewCard` MUST clamp `interval` to `MAX_INTERVAL_DAYS` (365) and set `dueAt = now + 365 × DAY`
- **AND** `ease` SHALL still update normally (the cap only constrains `interval`, not the easeFactor trajectory)

#### Scenario: Pre-existing over-cap card clamps on next correct review

- **WHEN** an existing `SrsCard` has `interval = 500` (legacy value from before the cap was added) and the user answers correctly
- **THEN** `reviewCard` MUST clamp the next update to `interval = MAX_INTERVAL_DAYS` (365), regardless of the legacy starting value
