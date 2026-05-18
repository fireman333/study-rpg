## MODIFIED Requirements

### Requirement: Tick loop SHALL accumulate revenue + reputation only during active study session

The system SHALL run a tick function every 5 seconds **only while a study session is active** (see `hospital-study-session` capability). When no session is active, the tick interval SHALL NOT be scheduled, and counters SHALL NOT change. Each session-active tick SHALL:

1. Read `gameCounters.singleton` (revenue, reputation, lastTickAt, totalStudyMinutes, currentSessionStartedAt)
2. Compute `elapsedSec = max(0, min((now - lastTickAt) / 1000, MAX_OFFLINE_TICK_SEC))` where `MAX_OFFLINE_TICK_SEC = 300`
3. For each room with `assignedDoctorId !== null`, sum `throughput = baseRate × doctor.powerMultiplier × roomFacility × affinityBonus`, where `affinityBonus = getAffinityBonus(doctor.rarity, doctor.subjectId, room.type)` per the `hospital-reputation` capability
4. **Determine `sessionMultiplier` based on `currentSessionStartedAt`:**
   - If `currentSessionStartedAt !== null` (session active): `sessionMultiplier = READING_SESSION_BUFF_MULTIPLIER` (1.5)
   - If `currentSessionStartedAt === null` (session inactive): `sessionMultiplier = READING_IDLE_RATE_REDUCTION` (0.3)
5. **Apply the session multiplier to the throughput before computing deltas:** `effectiveIdleThroughput = totalThroughput × sessionMultiplier`
6. Compute `deltaRevenueGross = effectiveIdleThroughput × elapsedSec / 60`
7. Compute `deltaSalary` per `hospital-finances` (ALL owned doctors × tier-staged salary rate). **Salary SHALL NOT be multiplied by `sessionMultiplier`** — salary drain stays at full rate to maintain payroll pressure
8. Compute `deltaReputation = effectiveIdleThroughput × elapsedSec / 60`
9. Compute `deltaTotalStudyMinutes = elapsedSec / 60`
10. Write `revenue = max(0, revenue + deltaRevenueGross - deltaSalary)` (clamp at 0 floor), `reputation += deltaReputation`, `totalStudyMinutes += deltaTotalStudyMinutes`, `lastTickAt = now` in a single Dexie transaction

All counter mutations from tick SHALL go through this tick function. Direct writes to `revenue` / `reputation` / `totalStudyMinutes` from UI code SHALL NOT be permitted, **except via the spend actions defined in `doctor-training` / `hospital-finances` / `hospital-events` / `hospital-fate-cards`, AND via quiz reward grants defined in the `hospital-quiz` capability (`applyQuizReward` service)**.

`READING_IDLE_RATE_REDUCTION` SHALL be exported from `packages/content-medexam2-tw/src/recruitment.ts` (or co-located tunable-constants module) as a locked literal value `0.3`. `READING_SESSION_BUFF_MULTIPLIER` SHALL be exported from the same module as a locked literal value `1.5`. Subsequent tuning of either SHALL replace it via a new change, not silently recompute.

#### Scenario: Tick accumulates idle revenue at 1.5× throughput during active session

- **GIVEN** `gameCounters.lastTickAt` was 60 seconds ago, study session is `'active'` (`currentSessionStartedAt !== null`), `totalThroughput = 40`, no salary
- **WHEN** the next tick fires
- **THEN** `sessionMultiplier` SHALL equal `READING_SESSION_BUFF_MULTIPLIER` = `1.5`
- **AND** `effectiveIdleThroughput` SHALL equal `40 × 1.5 = 60`
- **AND** `revenue` SHALL increase by approximately `60`
- **AND** `reputation` SHALL increase by approximately `60`
- **AND** `totalStudyMinutes` SHALL increase by approximately `1`

#### Scenario: Tick accumulates idle revenue at 0.3× throughput during inactive session

- **GIVEN** `gameCounters.lastTickAt` was 60 seconds ago, study session is `'idle'` or `'paused'` (`currentSessionStartedAt === null`), `totalThroughput = 40`, no salary
- **WHEN** the next tick fires (if scheduled — see below)
- **THEN** `sessionMultiplier` SHALL equal `READING_IDLE_RATE_REDUCTION` = `0.3`
- **AND** `effectiveIdleThroughput` SHALL equal `40 × 0.3 = 12`
- **AND** `revenue` SHALL increase by approximately `12`

#### Scenario: Tick zero when session idle and interval not scheduled

- **GIVEN** study session is `'idle'`
- **WHEN** 60 seconds pass
- **THEN** the tick interval SHALL NOT have been scheduled (per existing requirement "Tick loop SHALL pause whenever study session is paused or idle")
- **AND** `revenue` / `reputation` / `totalStudyMinutes` SHALL all be unchanged
- **AND** the inactive-session multiplier (0.3) SHALL be applicable only to UI projections (HomePage 淨收/分鐘 chip), NOT to any actual tick-loop write

#### Scenario: Tick zero for empty rooms during active session (any multiplier × 0 = 0)

- **GIVEN** session active, all rooms have `assignedDoctorId = null`
- **WHEN** the tick fires
- **THEN** `totalThroughput` SHALL be `0`
- **AND** `effectiveIdleThroughput` SHALL be `0` (any multiplier × 0 = 0)
- **AND** `revenue` SHALL remain unchanged
- **AND** `reputation` SHALL remain unchanged
- **AND** `totalStudyMinutes` SHALL still increment by the elapsed minutes

#### Scenario: Salary drain is NOT multiplied by session buff or idle penalty

- **GIVEN** active session, 4 P3 doctors owned (3 assigned to rooms, 1 on bench), tier 區域醫院
- **AND** the tick fires after 60 seconds
- **WHEN** salary deduction is computed
- **THEN** the deduction SHALL equal `4 × powerMultiplier(P3) × SALARY_BASE × TIER_SALARY_RATE(區域醫院) × elapsedMin`
- **AND** the salary deduction SHALL NOT be multiplied by `READING_SESSION_BUFF_MULTIPLIER` (salary stays at full rate)
- **AND** the salary deduction SHALL NOT be multiplied by `READING_IDLE_RATE_REDUCTION` (salary stays at full rate)

#### Scenario: Quiz reward grants bypass tick-only invariant

- **GIVEN** active or idle session (state independent)
- **WHEN** the QuizModal `applyQuizReward` service runs after a correct answer
- **THEN** the service MAY write directly to `gameCounters.revenue / reputation` outside the tick loop
- **AND** the write SHALL NOT conflict with the tick loop's lastTickAt cursor (independent counter update)

## REMOVED Requirements

### Requirement: Reading session buff SHALL multiply quiz reward when session is active

**Reason**: Per `openspec/decisions/2026-05-19.md` §23:55, the intended mental model is "reading session = doctor idle income boost while doctors see patients", not "reading session = quiz answer multiplier". Quiz reward should be independent of session state. The `READING_SESSION_BUFF_MULTIPLIER` constant is relocated to the tick-loop idle income computation (see MODIFIED `Tick loop SHALL accumulate revenue + reputation only during active study session` requirement above).

**Migration**: No data migration. The buff is a per-event multiplier computed at grant time, not a stored snapshot. Code changes:
1. `lib/tick.ts` adds `sessionMultiplier` branch (1.5 if active else 0.3) — see hospital-tycoon-engine MODIFIED tick requirement
2. `services/quiz-rewards.ts` removes `readingBuff` term and `currentSessionStartedAt` read — see hospital-quiz MODIFIED `Correct answer SHALL grant revenue and reputation rewards` requirement
3. `READING_SESSION_BUFF_MULTIPLIER` constant in `packages/content-medexam2-tw/src/recruitment.ts` SHALL remain (same value 1.5, used by tick loop instead of quiz rewards)
4. Tutorial / help copy refresh in StudySessionPage / HelpMenu / V6Migration to describe new mechanic (see `add-quiz-economy-redesign` task list pattern; copy update tracked in this change's tasks.md)
