## MODIFIED Requirements

### Requirement: Mastery-only application scope

The system SHALL apply the specialty bonus multiplier to **two scopes**:

1. `mastery.correct` (existing behavior — unchanged)
2. **Quiz-driven `revenue` and `reputation` grants computed by the `applyQuizReward` service** (see `hospital-quiz` capability — `revenuePerCorrect = BASE × specialtyMultiplier × buff`, `reputationPerCorrect = BASE × specialtyMultiplier × buff`)

Other counters and state SHALL NOT be affected:
- Affinity counters (`affinity.correctCount`) increment by exactly 1 per correct answer (no multiplier)
- SRS state (`interval`, `easeFactor`, `nextDueAt`) follows binary SM-2 rules unchanged
- Recruitment unlock thresholds (`RECRUITMENT_THRESHOLDS[subjectId]`) compare against raw affinity, not multiplied
- XP / other future reward systems SHALL NOT inherit this multiplier without an explicit spec amendment
- Tier upgrade reputation gate compares against `gameCounters.reputation` which already includes any multiplier-affected quiz grants (no double-application)

The `getSpecialtyMultiplier()` function in `packages/content-medexam2-tw/src/specialty.ts` SHALL remain the single source of truth — both the mastery write path (in `apps/medexam2-hospital-tw/src/lib/mastery.ts`) and the quiz-reward grant path (in `apps/medexam2-hospital-tw/src/services/quiz-rewards.ts`) SHALL call this same function with identical arguments. No duplicate multiplier table SHALL exist.

#### Scenario: Mastery correct delta still multiplied by specialty bonus

- **GIVEN** a same-subject P1 partner is bound
- **WHEN** the player answers correctly
- **THEN** `mastery.correct` SHALL increment by `1.5` (existing behavior preserved)

#### Scenario: Quiz revenue / reputation delta also multiplied by specialty bonus

- **GIVEN** a same-subject P1 partner is bound, session inactive
- **WHEN** the player answers correctly
- **THEN** `revenue` SHALL increase by `ROUND(80 × 1.5) = 120`
- **AND** `reputation` SHALL increase by `120`

#### Scenario: Affinity counter unchanged on same-subject correct (still 1.0)

- **WHEN** a same-subject partner answers correctly (any rarity)
- **THEN** `affinity[subjectId].correctCount` MUST increment by exactly `1`
- **AND** no multiplier SHALL apply to affinity even though mastery and quiz-revenue do receive the multiplier

#### Scenario: SRS state unchanged on same-subject correct

- **WHEN** a same-subject partner answers correctly
- **THEN** the SRS update for that questionHistory row MUST follow binary SM-2 rules unchanged

#### Scenario: Cross-subject partner produces 1.0× across all multiplied scopes

- **GIVEN** a cross-subject partner is bound
- **WHEN** the player answers correctly
- **THEN** `mastery.correct` SHALL increment by exactly `1.0`
- **AND** `revenue` SHALL increase by exactly `80` (no multiplier)
- **AND** `reputation` SHALL increase by exactly `80`

#### Scenario: No partner produces 1.0× across all multiplied scopes

- **GIVEN** no doctor is bound (boundDoctor = null) — this can happen on a fresh save before any doctor recruited / during partner-switch UI states
- **WHEN** the player answers correctly (assuming the existing answer-gating allows this; refer to `hospital-quiz` capability for the partner-required precondition)
- **THEN** the specialty multiplier SHALL be `1.0`
- **AND** mastery / revenue / reputation all receive the unmultiplied base values

#### Scenario: Wrong answer never applies multiplier in either scope

- **WHEN** the player answers any quiz wrong
- **THEN** `mastery.correct` SHALL remain unchanged (existing behavior)
- **AND** `revenue` SHALL receive zero quiz-revenue grant from this answer (no multiplier path entered at all per `hospital-quiz` spec)
- **AND** `reputation` SHALL receive zero quiz-reputation grant
