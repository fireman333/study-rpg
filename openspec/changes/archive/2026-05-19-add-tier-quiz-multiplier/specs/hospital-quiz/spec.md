## MODIFIED Requirements

### Requirement: Correct answer SHALL grant revenue and reputation rewards

The `QuizModal`'s correct-answer side-effect chain SHALL grant `revenue` and `reputation` deltas to `gameCounters.singleton` via the `applyQuizReward` service (`apps/medexam2-hospital-tw/src/services/quiz-rewards.ts`). The grant SHALL fire on every correct answer, including questions where `question.disputed === true` (送分題, which the existing `recordCorrectAnswer` logic treats as correct regardless of option chosen). Incorrect answers SHALL NOT grant any revenue or reputation.

The base per-correct reward constants SHALL be locked literals exported from `packages/content-medexam2-tw/src/recruitment.ts`:

- `QUIZ_REVENUE_PER_CORRECT_BASE = 80`
- `QUIZ_REPUTATION_PER_CORRECT_BASE = 80`

**The tier-scaled multiplier `QUIZ_TIER_MULTIPLIER: Record<HospitalTier, number>` SHALL be exported from the same module with locked literal values (`// TUNED 2026-05-19 — first dogfood pass; revisit after 1-2 weeks of telemetry`):**

| Tier | Multiplier |
|---|---|
| 診所 | 1.0 |
| 區域醫院 | 1.3 |
| 醫學中心 | 1.6 |
| 國家級教學醫院 | 2.0 |

The final granted amounts SHALL be computed by the formula:

```
revenuePerCorrect = ROUND(
  QUIZ_REVENUE_PER_CORRECT_BASE
  × getSpecialtyMultiplier(boundDoctor.subjectId, boundDoctor.rarity, currentSubjectId)
  × (gameCounters.currentSessionStartedAt !== null ? READING_SESSION_BUFF_MULTIPLIER : 1.0)
  × QUIZ_TIER_MULTIPLIER[gameCounters.tier]
)

reputationPerCorrect = ROUND(
  QUIZ_REPUTATION_PER_CORRECT_BASE
  × getSpecialtyMultiplier(boundDoctor.subjectId, boundDoctor.rarity, currentSubjectId)
  × (gameCounters.currentSessionStartedAt !== null ? READING_SESSION_BUFF_MULTIPLIER : 1.0)
  × QUIZ_TIER_MULTIPLIER[gameCounters.tier]
)
```

The `gameCounters.tier` SHALL be read inside the same Dexie transaction as the existing `currentSessionStartedAt` read — both reads happen on the same gameCounters singleton row, so consistency is guaranteed without separate locks.

The `getSpecialtyMultiplier` function SHALL remain the same single source of truth used by mastery accrual (see `hospital-specialty-bonus` capability, modified scope). The grant SHALL happen in the same Dexie transaction as the mastery / affinity / questionHistory writes performed by `recordCorrectAnswer`, to maintain atomicity across all correct-answer side effects.

The HomePage revenue / reputation chips SHALL reflect the new value within one render cycle (existing `useLiveQuery` reactivity).

**The HomePage 「淨收 / 分鐘」 cell sublabel SHALL apply `READING_IDLE_RATE_REDUCTION` to the displayed throughput value (matching the tick-loop math). The sublabel SHALL render as `毛 {ROUND(throughput × READING_IDLE_RATE_REDUCTION)} − 薪 {ROUND(salary)}` — not the raw throughput. The net cell value SHALL likewise compute `(throughput × READING_IDLE_RATE_REDUCTION) − salary` so the displayed integer matches the tick-loop accrual.**

#### Scenario: Correct answer at 診所 tier with no doctor partner grants base reward (×1.0 tier multiplier)

- **GIVEN** `gameCounters.tier === '診所'`, `currentSessionStartedAt = null`, no doctor is bound (boundDoctor = null)
- **WHEN** the player answers the current question correctly
- **THEN** `revenue` SHALL increase by exactly `80` (= `80 × 1.0 × 1.0 × 1.0`)
- **AND** `reputation` SHALL increase by exactly `80`

#### Scenario: Correct answer at 區域醫院 tier with no doctor partner applies 1.3× tier multiplier

- **GIVEN** `gameCounters.tier === '區域醫院'`, session inactive, no doctor partner
- **WHEN** the player answers correctly
- **THEN** `revenue` SHALL increase by exactly `ROUND(80 × 1.0 × 1.0 × 1.3) = 104`
- **AND** `reputation` SHALL increase by exactly `104`

#### Scenario: Correct answer at 醫學中心 tier with same-subject P1 partner applies all multipliers

- **GIVEN** `gameCounters.tier === '醫學中心'`, session inactive, doctor partner = same-subject P1 (specialty multiplier = 1.5)
- **WHEN** the player answers correctly
- **THEN** `revenue` SHALL increase by exactly `ROUND(80 × 1.5 × 1.0 × 1.6) = 192`
- **AND** `reputation` SHALL increase by exactly `192`

#### Scenario: Correct answer at 國家級教學醫院 tier with same-subject P1 partner + session active stacks all four multipliers

- **GIVEN** `gameCounters.tier === '國家級教學醫院'`, `currentSessionStartedAt !== null`, doctor partner = same-subject P1 (specialty multiplier = 1.5)
- **WHEN** the player answers correctly
- **THEN** `revenue` SHALL increase by exactly `ROUND(80 × 1.5 × 1.5 × 2.0) = 360`
- **AND** `reputation` SHALL increase by exactly `360`

#### Scenario: Correct answer with reading session active at 區域醫院 receives both buff and tier multiplier

- **GIVEN** `gameCounters.tier === '區域醫院'`, `currentSessionStartedAt !== null`, no doctor partner
- **WHEN** the player answers correctly
- **THEN** `revenue` SHALL increase by exactly `ROUND(80 × 1.0 × 1.5 × 1.3) = 156`
- **AND** `reputation` SHALL increase by exactly `156`

#### Scenario: Correct answer with same-subject P5 partner + reading session + tier multiplier at 醫學中心

- **GIVEN** `gameCounters.tier === '醫學中心'`, session active, doctor partner = same-subject P5 (specialty multiplier = 1.05)
- **WHEN** the player answers correctly
- **THEN** `revenue` SHALL increase by exactly `ROUND(80 × 1.05 × 1.5 × 1.6) = 202`
- **AND** `reputation` SHALL increase by exactly `202`

#### Scenario: Wrong answer grants zero quiz reward regardless of tier

- **GIVEN** `gameCounters.tier === '醫學中心'`, session active, same-subject P3 partner
- **WHEN** the player selects an incorrect option
- **THEN** `revenue` SHALL remain unchanged by quiz-reward path
- **AND** `reputation` SHALL remain unchanged by quiz-reward path
- **AND** mastery / questionHistory side effects (per existing `hospital-quiz` requirements) SHALL still fire

#### Scenario: Disputed (送分題) question grants tier-scaled reward regardless of option chosen

- **GIVEN** `question.disputed === true`, `gameCounters.tier === '區域醫院'`, session inactive, no partner
- **WHEN** the player selects any option
- **THEN** `revenue` SHALL increase by exactly `ROUND(80 × 1.0 × 1.0 × 1.3) = 104`
- **AND** the existing `recordCorrectAnswer` mastery side effect SHALL fire

#### Scenario: Tier upgrade mid-modal applies new multiplier on next answer

- **GIVEN** the player is in QuizModal at 區域醫院 tier
- **AND** a tier upgrade fires from background tick (`gameCounters.tier` changes to `醫學中心`)
- **WHEN** the player answers the next question correctly (cross-subject partner, session inactive)
- **THEN** `revenue` SHALL increase by `ROUND(80 × 1.0 × 1.0 × 1.6) = 128` (using new 醫學中心 multiplier)
- **AND** the previous question's revenue grant (if any) SHALL NOT be retroactively adjusted

#### Scenario: HomePage 「淨收 / 分鐘」 sublabel reflects idle-adjusted throughput at 醫學中心

- **GIVEN** `gameCounters.tier === '醫學中心'`, total room throughput from `computeThroughput` summed across rooms = 210, total salary drain from `computeSalaryDrain` = 132
- **WHEN** HomePage renders
- **THEN** the 「淨收 / 分鐘」 sublabel SHALL show `毛 63 − 薪 132` (= `ROUND(210 × 0.3) = 63`)
- **AND** the cell value SHALL show `-69` (= `63 - 132`)
- **AND** the displayed values SHALL match the actual tick-loop accrual rate

#### Scenario: HomePage 「淨收 / 分鐘」 display at 診所 with empty rooms

- **GIVEN** `gameCounters.tier === '診所'`, no doctors assigned to rooms (throughput = 0), salary = 0
- **WHEN** HomePage renders
- **THEN** the 「淨收 / 分鐘」 cell SHALL show `0`
- **AND** the sublabel SHALL show `毛 0 − 薪 0` (or be hidden per existing conditional rendering for salary === 0)

#### Scenario: Reward writes are atomic with mastery / affinity writes (tier read included)

- **GIVEN** session active, P3 same-subject partner, tier = 醫學中心
- **WHEN** the player answers correctly
- **THEN** within a single Dexie transaction the system SHALL read: `gameCounters.tier` and `gameCounters.currentSessionStartedAt`; then update: `gameCounters.revenue / reputation`, `mastery[subjectId].correct / total`, `affinity[subjectId].correctCount`, `questionHistory[questionId]` (SRS fields)
- **AND** if any one fails, all SHALL roll back
- **AND** the tier read SHALL be consistent with the tier value used for the multiplier (no torn read across the upgrade boundary)
