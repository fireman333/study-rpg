## ADDED Requirements

### Requirement: Correct answer SHALL grant revenue and reputation rewards

The `QuizModal`'s correct-answer side-effect chain SHALL grant `revenue` and `reputation` deltas to `gameCounters.singleton` via a new `applyQuizReward` service (`apps/medexam2-hospital-tw/src/services/quiz-rewards.ts`). The grant SHALL fire on every correct answer, including questions where `question.disputed === true` (送分題, which the existing `recordCorrectAnswer` logic treats as correct regardless of option chosen). Incorrect answers SHALL NOT grant any revenue or reputation.

The base per-correct reward constants SHALL be locked literals exported from `packages/content-medexam2-tw/src/recruitment.ts`:

- `QUIZ_REVENUE_PER_CORRECT_BASE = 80`
- `QUIZ_REPUTATION_PER_CORRECT_BASE = 80`

The final granted amounts SHALL be computed by the formula:

```
revenuePerCorrect = ROUND(
  QUIZ_REVENUE_PER_CORRECT_BASE
  × getSpecialtyMultiplier(boundDoctor.subjectId, boundDoctor.rarity, currentSubjectId)
  × (gameCounters.currentSessionStartedAt !== null ? READING_SESSION_BUFF_MULTIPLIER : 1.0)
)

reputationPerCorrect = ROUND(
  QUIZ_REPUTATION_PER_CORRECT_BASE
  × getSpecialtyMultiplier(boundDoctor.subjectId, boundDoctor.rarity, currentSubjectId)
  × (gameCounters.currentSessionStartedAt !== null ? READING_SESSION_BUFF_MULTIPLIER : 1.0)
)
```

The `getSpecialtyMultiplier` function SHALL be the same single source of truth used by mastery accrual (see `hospital-specialty-bonus` capability, modified scope). The grant SHALL happen in the same Dexie transaction as the mastery / affinity / questionHistory writes performed by `recordCorrectAnswer`, to maintain atomicity across all correct-answer side effects.

The HomePage revenue / reputation chips SHALL reflect the new value within one render cycle (existing `useLiveQuery` reactivity).

#### Scenario: Correct answer with no doctor partner grants base reward

- **GIVEN** `gameCounters.currentSessionStartedAt = null` and no doctor is bound (boundDoctor = null)
- **WHEN** the player answers the current question correctly
- **THEN** `revenue` SHALL increase by exactly `80`
- **AND** `reputation` SHALL increase by exactly `80`

#### Scenario: Correct answer with same-subject P1 partner applies 1.5× specialty multiplier

- **GIVEN** session inactive, doctor partner = same-subject P1 (specialty multiplier = 1.5)
- **WHEN** the player answers the current question correctly
- **THEN** `revenue` SHALL increase by exactly `ROUND(80 × 1.5) = 120`
- **AND** `reputation` SHALL increase by exactly `120`

#### Scenario: Correct answer with cross-subject partner uses 1.0× multiplier

- **GIVEN** session inactive, doctor partner = different subject (specialty multiplier = 1.0)
- **WHEN** the player answers correctly
- **THEN** `revenue` SHALL increase by exactly `80`
- **AND** `reputation` SHALL increase by exactly `80`

#### Scenario: Correct answer with reading session active receives 1.5× buff

- **GIVEN** `gameCounters.currentSessionStartedAt !== null`, no doctor partner
- **WHEN** the player answers correctly
- **THEN** `revenue` SHALL increase by exactly `ROUND(80 × 1.0 × 1.5) = 120`
- **AND** `reputation` SHALL increase by exactly `120`

#### Scenario: Correct answer with same-subject P5 partner + reading session stacks multipliers

- **GIVEN** session active, doctor partner = same-subject P5 (specialty multiplier = 1.05)
- **WHEN** the player answers correctly
- **THEN** `revenue` SHALL increase by exactly `ROUND(80 × 1.05 × 1.5) = 126`
- **AND** `reputation` SHALL increase by exactly `126`

#### Scenario: Wrong answer grants zero quiz reward

- **GIVEN** session active, same-subject P3 partner
- **WHEN** the player selects an incorrect option
- **THEN** `revenue` SHALL remain unchanged by quiz-reward path
- **AND** `reputation` SHALL remain unchanged by quiz-reward path
- **AND** mastery / questionHistory side effects (per `hospital-quiz` existing requirements) SHALL still fire

#### Scenario: Disputed (送分題) question grants reward regardless of option chosen

- **GIVEN** `question.disputed === true`, session inactive, no partner
- **WHEN** the player selects any option (correct or incorrect by `question.answer`)
- **THEN** `revenue` SHALL increase by exactly `80`
- **AND** `reputation` SHALL increase by exactly `80`
- **AND** the existing `recordCorrectAnswer` mastery side effect SHALL fire

#### Scenario: Reward writes are atomic with mastery / affinity writes

- **GIVEN** session active, P3 same-subject partner
- **WHEN** the player answers correctly
- **THEN** within a single Dexie transaction the system SHALL update: `gameCounters.revenue / reputation`, `mastery[subjectId].correct / total`, `affinity[subjectId].correctCount`, `questionHistory[questionId]` (SRS fields)
- **AND** if any one fails, all SHALL roll back
