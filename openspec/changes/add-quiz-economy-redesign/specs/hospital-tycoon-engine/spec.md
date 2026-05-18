## MODIFIED Requirements

### Requirement: Tick loop SHALL accumulate revenue + reputation only during active study session

The system SHALL run a tick function every 5 seconds **only while a study session is active** (see `hospital-study-session` capability). When no session is active, the tick interval SHALL NOT be scheduled, and counters SHALL NOT change. Each session-active tick SHALL:

1. Read `gameCounters.singleton` (revenue, reputation, lastTickAt, totalStudyMinutes)
2. Compute `elapsedSec = max(0, min((now - lastTickAt) / 1000, MAX_OFFLINE_TICK_SEC))` where `MAX_OFFLINE_TICK_SEC = 300`
3. For each room with `assignedDoctorId !== null`, sum `throughput = baseRate × doctor.powerMultiplier × roomFacility × affinityBonus`, where `affinityBonus = getAffinityBonus(doctor.rarity, doctor.subjectId, room.type)` per the `hospital-reputation` capability
4. **Apply the idle-rate reduction multiplier `READING_IDLE_RATE_REDUCTION = 0.3` to the throughput before computing deltas:** `effectiveIdleThroughput = totalThroughput × READING_IDLE_RATE_REDUCTION`
5. Compute `deltaRevenueGross = effectiveIdleThroughput × elapsedSec / 60`
6. Compute `deltaSalary` per `hospital-finances` (ALL owned doctors × tier-staged salary rate). **Salary SHALL NOT be reduced by `READING_IDLE_RATE_REDUCTION`** — salary drain stays at full rate to maintain payroll pressure
7. Compute `deltaReputation = effectiveIdleThroughput × elapsedSec / 60`
8. Compute `deltaTotalStudyMinutes = elapsedSec / 60`
9. Write `revenue = max(0, revenue + deltaRevenueGross - deltaSalary)` (clamp at 0 floor), `reputation += deltaReputation`, `totalStudyMinutes += deltaTotalStudyMinutes`, `lastTickAt = now` in a single Dexie transaction

All counter mutations from tick SHALL go through this tick function. Direct writes to `revenue` / `reputation` / `totalStudyMinutes` from UI code SHALL NOT be permitted, **except via the spend actions defined in `doctor-training` / `hospital-finances` / `hospital-events` / `hospital-fate-cards`, AND via quiz reward grants defined in the `hospital-quiz` capability (`applyQuizReward` service)**.

`READING_IDLE_RATE_REDUCTION` SHALL be exported from `packages/content-medexam2-tw/src/recruitment.ts` (or co-located tunable-constants module) as a locked literal value `0.3`. Subsequent tuning SHALL replace it via a new change, not silently recompute.

#### Scenario: Tick accumulates idle revenue at 30% of throughput during active session

- **GIVEN** `gameCounters.lastTickAt` was 60 seconds ago, study session is `'active'`, `totalThroughput = 40`, no salary
- **WHEN** the next tick fires
- **THEN** `effectiveIdleThroughput` SHALL equal `40 × 0.3 = 12`
- **AND** `revenue` SHALL increase by approximately `12`
- **AND** `reputation` SHALL increase by approximately `12`
- **AND** `totalStudyMinutes` SHALL increase by approximately `1`

#### Scenario: Tick zero when session idle

- **GIVEN** study session is `'idle'`
- **WHEN** 60 seconds pass
- **THEN** the tick interval SHALL NOT have been scheduled
- **AND** `revenue` / `reputation` / `totalStudyMinutes` SHALL all be unchanged

#### Scenario: Tick zero for empty rooms during active session

- **GIVEN** session active, all rooms have `assignedDoctorId = null`
- **WHEN** the tick fires
- **THEN** `totalThroughput` SHALL be `0`
- **AND** `effectiveIdleThroughput` SHALL be `0` (any number × 0.3 = 0)
- **AND** `revenue` SHALL remain unchanged
- **AND** `reputation` SHALL remain unchanged
- **AND** `totalStudyMinutes` SHALL still increment by the elapsed minutes

#### Scenario: Salary drain is NOT reduced by idle rate multiplier

- **GIVEN** active session, 4 P3 doctors owned (3 assigned to rooms, 1 on bench), tier 區域醫院
- **AND** the tick fires after 60 seconds
- **WHEN** salary deduction is computed
- **THEN** the deduction SHALL equal `4 × powerMultiplier(P3) × SALARY_BASE × TIER_SALARY_RATE(區域醫院) × elapsedMin`
- **AND** the salary deduction SHALL NOT be multiplied by `READING_IDLE_RATE_REDUCTION` (salary stays at full rate)

#### Scenario: Quiz reward grants bypass tick-only invariant

- **GIVEN** active or idle session (state independent)
- **WHEN** the QuizModal `applyQuizReward` service runs after a correct answer
- **THEN** the service MAY write directly to `gameCounters.revenue / reputation` outside the tick loop
- **AND** the write SHALL NOT conflict with the tick loop's lastTickAt cursor (independent counter update)

## ADDED Requirements

### Requirement: Reading session buff SHALL multiply quiz reward when session is active

The system SHALL expose `READING_SESSION_BUFF_MULTIPLIER` (locked literal `1.5`) in `packages/content-medexam2-tw/src/recruitment.ts`. When `gameCounters.currentSessionStartedAt !== null` at the moment a quiz answer is graded correct, the `applyQuizReward` service (see `hospital-quiz` capability) SHALL multiply the granted `revenuePerCorrect` and `reputationPerCorrect` by this buff multiplier. The buff state SHALL be read fresh on every quiz answer event — no snapshotting; if the session ends mid-quiz the next answer SHALL receive the unbuffed reward.

The buff SHALL apply only to quiz-driven `revenue / reputation` grants. The buff SHALL NOT alter the tick-loop idle accrual rate (which stays at `READING_IDLE_RATE_REDUCTION × throughput` regardless of buff state).

#### Scenario: Quiz answered correctly with reading session active receives 1.5× reward

- **GIVEN** `gameCounters.currentSessionStartedAt = 1234567890000` (non-null, session active)
- **AND** the base quiz reward for the current correct answer would be `revenuePerCorrect = 80, reputationPerCorrect = 80` (before buff)
- **WHEN** `applyQuizReward` finalizes the grant
- **THEN** the persisted `revenue` delta SHALL be `80 × 1.5 = 120`
- **AND** the persisted `reputation` delta SHALL be `80 × 1.5 = 120`

#### Scenario: Quiz answered correctly with reading session inactive receives unbuffed reward

- **GIVEN** `gameCounters.currentSessionStartedAt = null` (session inactive)
- **AND** the base quiz reward would be `revenuePerCorrect = 80`
- **WHEN** `applyQuizReward` finalizes the grant
- **THEN** the persisted `revenue` delta SHALL be exactly `80` (no buff applied)

#### Scenario: Session ends mid-quiz, subsequent answer receives unbuffed reward

- **GIVEN** the player is mid-QuizModal, answered question A while session active (received 120 rev), question B is now on screen
- **WHEN** the player clicks 結束 session (`currentSessionStartedAt` set to null)
- **AND** the player then answers question B correctly
- **THEN** the reward for B SHALL be the base unbuffed amount (e.g. 80 rev), reflecting current buff state at grant time

#### Scenario: Idle tick rate is independent of session buff

- **GIVEN** `READING_IDLE_RATE_REDUCTION = 0.3` and `READING_SESSION_BUFF_MULTIPLIER = 1.5`
- **AND** session is active, `totalThroughput = 100`
- **WHEN** a tick fires
- **THEN** the idle accrual SHALL be `100 × 0.3 = 30` per minute (NOT `100 × 0.3 × 1.5 = 45`)
- **AND** the buff multiplier SHALL be irrelevant to tick-loop accrual
