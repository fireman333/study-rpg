# hospital-specialty-bonus Specification

## Purpose

Rarity-tiered mastery multiplier for the hospital (二階) track's quiz flow when the bound partner doctor's subject exactly matches the active quiz subject. Encourages users to deploy specialty-matched partners by rewarding `mastery.correct` accrual with a multiplier ranging from 1.05× (P5) to 1.5× (P1). Scope is mastery-only — affinity, SRS, recruitment unlocks, and XP rewards are untouched. Tunable constants live in `packages/content-medexam2-tw/src/specialty.ts` so dogfood-driven adjustments do not touch `@study-rpg/core`.

## Requirements

### Requirement: Specialty match predicate

The system SHALL define an exact-match predicate that returns true when a quiz partner doctor's subject equals the active quiz subject, and false otherwise. The predicate MUST NOT perform fuzzy / cluster / partial matching in this change.

#### Scenario: Partner subject equals quiz subject

- **WHEN** a partner doctor with `subjectId = "內科"` is paired with a quiz whose `subjectId = "內科"`
- **THEN** the specialty match predicate MUST return true

#### Scenario: Partner subject differs from quiz subject

- **WHEN** a partner doctor with `subjectId = "外科"` is paired with a quiz whose `subjectId = "內科"`
- **THEN** the specialty match predicate MUST return false (no cluster fallback applies)

#### Scenario: No partner attached to quiz session

- **WHEN** a quiz session has no bound partner doctor (`partner === null`)
- **THEN** the specialty match predicate MUST return false

### Requirement: Tier-based mastery multiplier table

The system SHALL apply a rarity-tiered multiplier to mastery accrual when the specialty match predicate returns true, using the following table (and 1.0 otherwise). The multiplier MUST be sourced from a named export in `packages/content-medexam2-tw/src/specialty.ts` so dogfood-driven tuning lives in one place.

| Rarity | Multiplier |
|---|---|
| P1 (夯) | 1.50 |
| P2 (頂級) | 1.30 |
| P3 (人上人) | 1.20 |
| P4 (NPC) | 1.10 |
| P5 (拉完了) | 1.05 |
| (predicate false) | 1.00 |

#### Scenario: P1 same-subject partner answering correctly

- **WHEN** a P1 doctor whose subject matches the quiz subject is the bound partner and the user answers correctly
- **THEN** the mastery write MUST apply a 1.5 multiplier to the correct delta (i.e. `mastery.correct += 1.5` instead of `+= 1`)

#### Scenario: P5 same-subject partner answering correctly

- **WHEN** a P5 doctor whose subject matches the quiz subject is the bound partner and the user answers correctly
- **THEN** the mastery write MUST apply a 1.05 multiplier (`mastery.correct += 1.05`)

#### Scenario: Cross-subject partner answering correctly

- **WHEN** any rarity doctor whose subject does NOT match the quiz subject is the bound partner and the user answers correctly
- **THEN** the mastery write MUST apply a 1.0 multiplier (`mastery.correct += 1` exactly, no bonus)

#### Scenario: Wrong answer never applies multiplier

- **WHEN** the user answers any quiz wrong (regardless of partner rarity / subject match)
- **THEN** the multiplier MUST NOT apply to any field; mastery.total bumps by 1 and mastery.correct remains unchanged (the existing wire-hospital-quiz-ui behavior is preserved)

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

### Requirement: Float storage for mastery.correct (no schema migration)

The system SHALL store the post-multiplier `mastery.correct` value as a JavaScript number (IEEE-754 double), reusing the existing v4 schema column. No Dexie version bump or upgrade hook is required.

#### Scenario: Pre-existing int correct upgrades to float in place

- **WHEN** an existing v4 save has `mastery.correct = 3` (integer) and the user answers a same-subject P1 quiz correctly
- **THEN** the system MUST write `mastery.correct = 4.5` to the same row without a schema migration

### Requirement: Partner specialty chip UI

The system SHALL render a partner specialty chip inside the QuizModal partner section displaying `✨ {multiplier}×` whenever the specialty match predicate returns true. The chip MUST NOT render when the predicate returns false (no chip for cross-subject or absent partner).

#### Scenario: Same-subject P1 partner renders 1.5× chip

- **WHEN** a P1 same-subject partner is bound to the quiz
- **THEN** the QuizModal partner section MUST render a chip with text `✨ 1.5×`

#### Scenario: Cross-subject partner hides chip

- **WHEN** a cross-subject partner is bound (predicate false)
- **THEN** the QuizModal partner section MUST NOT render any specialty chip (visual stays clean)

#### Scenario: Multiplier value matches the rarity in the tier table

- **WHEN** the chip is rendered for a partner of rarity R
- **THEN** the multiplier text MUST equal `SPECIALTY_MATCH_MULTIPLIER[R]` formatted to one decimal place (e.g. `1.5×`, `1.3×`, `1.2×`, `1.1×`, `1.05×`)

### Requirement: Partner section rarity color border

The system SHALL render a rarity-colored left border on the QuizModal partner section so users can visually distinguish partner tier independently of the chip / sprite. This requirement bundles the deferred polish from the `wire-hospital-quiz-ui` decisions log (2026-05-15 21:35).

#### Scenario: Partner section gets rarity-colored border-left

- **WHEN** a partner doctor is bound to the quiz modal
- **THEN** the partner section MUST render a `border-left: 4px solid var(--rarity-{rarity})` (or equivalent rarity-tone CSS variable already defined in `styles.css`)

#### Scenario: No-partner state has no border accent

- **WHEN** no partner is bound (the empty partner state showing "請先招募醫師")
- **THEN** the rarity border MUST NOT render (the empty-state visual stays as-is)

### Requirement: Tunable constants in content-medexam2-tw

The system SHALL keep `SPECIALTY_MATCH_MULTIPLIER` and the match predicate helper inside `packages/content-medexam2-tw/src/specialty.ts` as named exports re-exported through the package barrel. The `@study-rpg/core` public API surface MUST NOT be extended for this mechanic.

#### Scenario: Constants exported from content pack barrel

- **WHEN** an app imports `@study-rpg/content-medexam2-tw`
- **THEN** `SPECIALTY_MATCH_MULTIPLIER` and `getSpecialtyMultiplier` MUST be available as named imports from the package root

#### Scenario: Engine core API surface unchanged

- **WHEN** an external consumer imports `@study-rpg/core@0.1.0`
- **THEN** the consumer MUST NOT see `SPECIALTY_MATCH_MULTIPLIER` or `getSpecialtyMultiplier` in the engine API (specialty matching is a content-pack-level concept, not engine-generic)
