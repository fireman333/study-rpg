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
  × QUIZ_TIER_MULTIPLIER[gameCounters.tier]
)

reputationPerCorrect = ROUND(
  QUIZ_REPUTATION_PER_CORRECT_BASE
  × getSpecialtyMultiplier(boundDoctor.subjectId, boundDoctor.rarity, currentSubjectId)
  × QUIZ_TIER_MULTIPLIER[gameCounters.tier]
)
```

**`READING_SESSION_BUFF_MULTIPLIER` SHALL NOT appear in this formula** — the reading-session buff is now applied to the tick-loop idle income (see `hospital-tycoon-engine` capability), not to quiz reward. `applyQuizReward` SHALL NOT read `gameCounters.currentSessionStartedAt` — quiz reward is independent of session state.

The `gameCounters.tier` SHALL be read inside the same Dexie transaction as the mastery write — both reads happen on the same gameCounters singleton row, so consistency is guaranteed without separate locks.

The `getSpecialtyMultiplier` function SHALL remain the same single source of truth used by mastery accrual (see `hospital-specialty-bonus` capability, modified scope). The grant SHALL happen in the same Dexie transaction as the mastery / affinity / questionHistory writes performed by `recordCorrectAnswer`, to maintain atomicity across all correct-answer side effects.

The HomePage revenue / reputation chips SHALL reflect the new value within one render cycle (existing `useLiveQuery` reactivity).

**The HomePage 「淨收 / 分鐘」 cell sublabel SHALL apply `READING_IDLE_RATE_REDUCTION` to the displayed throughput value when no session is active, OR `READING_SESSION_BUFF_MULTIPLIER` when a session is active (matching the tick-loop math). The sublabel SHALL render as `毛 {ROUND(throughput × multiplier)} − 薪 {ROUND(salary)}` where `multiplier = currentSessionStartedAt !== null ? READING_SESSION_BUFF_MULTIPLIER : READING_IDLE_RATE_REDUCTION`. The net cell value SHALL likewise compute `(throughput × multiplier) − salary` so the displayed integer matches the tick-loop accrual.**

#### Scenario: Correct answer at 診所 tier with no doctor partner grants base reward (×1.0 tier multiplier)

- **GIVEN** `gameCounters.tier === '診所'`, no doctor is bound (boundDoctor = null)
- **WHEN** the player answers the current question correctly
- **THEN** `revenue` SHALL increase by exactly `80` (= `80 × 1.0 × 1.0`)
- **AND** `reputation` SHALL increase by exactly `80`

#### Scenario: Correct answer at 區域醫院 tier with no doctor partner applies 1.3× tier multiplier

- **GIVEN** `gameCounters.tier === '區域醫院'`, no doctor partner
- **WHEN** the player answers correctly
- **THEN** `revenue` SHALL increase by exactly `ROUND(80 × 1.0 × 1.3) = 104`
- **AND** `reputation` SHALL increase by exactly `104`

#### Scenario: Correct answer at 醫學中心 tier with same-subject P1 partner applies all (specialty + tier) multipliers

- **GIVEN** `gameCounters.tier === '醫學中心'`, doctor partner = same-subject P1 (specialty multiplier = 1.5)
- **WHEN** the player answers correctly
- **THEN** `revenue` SHALL increase by exactly `ROUND(80 × 1.5 × 1.6) = 192`
- **AND** `reputation` SHALL increase by exactly `192`

#### Scenario: Correct answer at 國家級教學醫院 tier with same-subject P1 partner gives max stacked reward (NO session buff applied)

- **GIVEN** `gameCounters.tier === '國家級教學醫院'`, doctor partner = same-subject P1 (specialty multiplier = 1.5), **session is active**
- **WHEN** the player answers correctly
- **THEN** `revenue` SHALL increase by exactly `ROUND(80 × 1.5 × 2.0) = 240` (NOT 360 — session state is irrelevant to quiz reward)
- **AND** `reputation` SHALL increase by exactly `240`

#### Scenario: Session state is irrelevant to quiz reward

- **GIVEN** `gameCounters.tier === '區域醫院'`, no doctor partner
- **WHEN** the player answers correctly with `currentSessionStartedAt !== null` (session active)
- **THEN** `revenue` SHALL increase by exactly `ROUND(80 × 1.0 × 1.3) = 104`
- **AND** the same answer with `currentSessionStartedAt === null` (session inactive) SHALL produce the same `104` delta
- **AND** the `applyQuizReward` Dexie transaction SHALL NOT read `currentSessionStartedAt`

#### Scenario: Correct answer with same-subject P5 partner at 醫學中心 — specialty + tier only

- **GIVEN** `gameCounters.tier === '醫學中心'`, doctor partner = same-subject P5 (specialty multiplier = 1.05)
- **WHEN** the player answers correctly
- **THEN** `revenue` SHALL increase by exactly `ROUND(80 × 1.05 × 1.6) = 134`
- **AND** `reputation` SHALL increase by exactly `134`

#### Scenario: Wrong answer grants zero quiz reward regardless of tier

- **GIVEN** `gameCounters.tier === '醫學中心'`, same-subject P3 partner
- **WHEN** the player selects an incorrect option
- **THEN** `revenue` SHALL remain unchanged by quiz-reward path
- **AND** `reputation` SHALL remain unchanged by quiz-reward path
- **AND** mastery / questionHistory side effects (per existing `hospital-quiz` requirements) SHALL still fire

#### Scenario: Disputed (送分題) question grants tier-scaled reward regardless of option chosen

- **GIVEN** `question.disputed === true`, `gameCounters.tier === '區域醫院'`, no partner
- **WHEN** the player selects any option
- **THEN** `revenue` SHALL increase by exactly `ROUND(80 × 1.0 × 1.3) = 104`
- **AND** the existing `recordCorrectAnswer` mastery side effect SHALL fire
