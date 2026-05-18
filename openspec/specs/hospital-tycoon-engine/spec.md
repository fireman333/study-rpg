# hospital-tycoon-engine Specification

## Purpose

Defines the tycoon/idle simulation engine for the 二階 hospital management mode: room data model, doctor-to-room assignment semantics, the 5-second tick loop that accumulates revenue and reputation, and the HomePage/Hospital UI surface that surfaces those counters and assignment affordances. Lives in `@study-rpg/content-medexam2-tw` (not `@study-rpg/core`) to preserve engine/content separation — the core engine remains content-agnostic while hospital-specific simulation rules ship with the 二階 content pack.

## Requirements

### Requirement: Room data model SHALL persist with type, baseRate, roomFacility, and assignment fields

The system SHALL persist each room in an IndexedDB `rooms` table with the following schema:

```typescript
interface Room {
  id: string                                          // stable identifier (e.g., "outpatient-1")
  type: 'outpatient' | 'surgery' | 'ward'
  baseRate: number                                    // patients per minute, > 0
  roomFacility: number                                // multiplier, ≥ 1.0
  assignedDoctorId: string | null                     // FK to doctors.id
  slot: number                                        // 1-indexed display order within type
}
```

The `Room` interface SHALL be exported from `@study-rpg/content-medexam2-tw` (not from `@study-rpg/core`), reinforcing engine/content separation per `project.md`. The interface MAY be imported by the hospital app but SHALL NOT be referenced from any one階 (`apps/medexam-tw`) source file.

#### Scenario: Room interface exported from content pack

- **GIVEN** a developer imports `Room` from `@study-rpg/content-medexam2-tw`
- **WHEN** the import is resolved
- **THEN** the type SHALL be available with all fields: `id`, `type`, `baseRate`, `roomFacility`, `assignedDoctorId`, `slot`

#### Scenario: Room persists to IndexedDB

- **GIVEN** an `outpatient` room with `baseRate = 10`, `roomFacility = 1.0`, `assignedDoctorId = null`, `slot = 1`
- **WHEN** the room is written to the `rooms` table
- **AND** the page is reloaded
- **THEN** the room SHALL be read back with all fields equal to the original values

### Requirement: Fresh save SHALL seed 3 outpatient rooms at 診所 tier baseline

The system SHALL detect empty `rooms` table on app boot and seed it with `TIER_ROOMS['診所']` from the `clinic-level-up` capability — exactly 3 entries:

| id | type | baseRate | roomFacility | assignedDoctorId | slot |
|---|---|---|---|---|---|
| `outpatient-1` | outpatient | 10 | 1.0 | null | 1 |
| `outpatient-2` | outpatient | 10 | 1.0 | null | 2 |
| `outpatient-3` | outpatient | 10 | 1.0 | null | 3 |

These constants represent 診所 tier defaults. The `clinic-level-up` capability extends the seeding to higher tiers (區域醫院, 醫學中心) via the same `TIER_ROOMS` table; tier upgrade logic appends new rooms when reputation crosses thresholds. The seeding logic SHALL be idempotent — re-running it on a non-empty table SHALL NOT duplicate or modify existing rooms.

The `INITIAL_ROOMS` named constant from `wire-hospital-tycoon-engine` is REMOVED in favor of `TIER_ROOMS['診所']` to enforce a single source of truth for the 診所 roster across both seeding and tier-upgrade code paths.

#### Scenario: New save seeds 3 outpatient rooms

- **GIVEN** a fresh IndexedDB with no `rooms` table entries
- **WHEN** the hospital app boots
- **THEN** the `rooms` table SHALL contain exactly 3 entries with `type = 'outpatient'`
- **AND** each room's `assignedDoctorId` SHALL equal `null`
- **AND** each room's `baseRate` SHALL equal `10`
- **AND** the source of the seed SHALL be `TIER_ROOMS['診所']` (not a separate `INITIAL_ROOMS` constant)

#### Scenario: Re-seeding is idempotent

- **GIVEN** the `rooms` table already contains 3 entries with `slot = 1, 2, 3`
- **AND** one room has been modified (`roomFacility = 1.5`)
- **WHEN** the seeding logic runs again on app boot
- **THEN** the `rooms` table SHALL still contain exactly 3 entries
- **AND** the modified room's `roomFacility` SHALL remain `1.5` (not reset to `1.0`)

### Requirement: Doctor assignment SHALL be atomic across `Room.assignedDoctorId` and `Doctor.assignedRoom`

The system SHALL maintain the invariant: for every `room` with `room.assignedDoctorId === doctorId`, the corresponding `doctor.assignedRoom === room.id`. Assignment, swap, and unassignment SHALL be wrapped in a Dexie transaction such that both writes succeed or both abort.

The transaction SHALL prevent a doctor from being assigned to two rooms simultaneously: if the doctor was previously assigned to another room, the prior room's `assignedDoctorId` SHALL be cleared in the same transaction.

#### Scenario: Assign doctor to empty room

- **GIVEN** `room-A.assignedDoctorId = null` and `doctor-X.assignedRoom = null`
- **WHEN** `assignDoctor(roomId='room-A', doctorId='doctor-X')` is called
- **THEN** `room-A.assignedDoctorId` SHALL equal `'doctor-X'`
- **AND** `doctor-X.assignedRoom` SHALL equal `'room-A'`
- **AND** both writes SHALL complete within a single Dexie transaction

#### Scenario: Reassign doctor from one room to another

- **GIVEN** `doctor-X` is currently assigned to `room-A`
- **WHEN** `assignDoctor(roomId='room-B', doctorId='doctor-X')` is called
- **THEN** `room-A.assignedDoctorId` SHALL equal `null`
- **AND** `room-B.assignedDoctorId` SHALL equal `'doctor-X'`
- **AND** `doctor-X.assignedRoom` SHALL equal `'room-B'`
- **AND** all three writes SHALL complete within a single Dexie transaction

#### Scenario: Unassign clears both sides

- **GIVEN** `room-A.assignedDoctorId = 'doctor-X'` and `doctor-X.assignedRoom = 'room-A'`
- **WHEN** `unassignDoctor(roomId='room-A')` is called
- **THEN** `room-A.assignedDoctorId` SHALL equal `null`
- **AND** `doctor-X.assignedRoom` SHALL equal `null`

#### Scenario: Transaction abort leaves both sides unchanged

- **GIVEN** `room-A.assignedDoctorId = null` and `doctor-X.assignedRoom = null`
- **WHEN** `assignDoctor` is called but the transaction throws midway (e.g., simulated I/O failure on the second write)
- **THEN** `room-A.assignedDoctorId` SHALL still equal `null`
- **AND** `doctor-X.assignedRoom` SHALL still equal `null`


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

### Requirement: Tick loop SHALL cap session-active accumulation at 5 minutes (defense against clock skew)

The system SHALL enforce `MAX_OFFLINE_TICK_SEC = 300` even during active sessions to defend against system clock anomalies (e.g., suspend / hibernate during session). No single tick SHALL advance by more than 300 seconds of accumulated throughput.

The previous "offline accumulation" semantics (offline tick accruing when player returns) SHALL be removed — since tick only runs during active session, "offline" no longer applies. The UI SHALL display a notification only if a single tick exceeds the cap (rare: indicates suspend or clock skew).

#### Scenario: Suspend mid-session triggers cap notice

- **GIVEN** active session, `lastTickAt` was 30 minutes ago (player suspended laptop without ending session — see hospital-study-session auto-pause requirements)
- **WHEN** the tab regains focus and the next tick fires
- **THEN** `elapsedSec` SHALL be capped at `300`
- **AND** the UI SHALL display a notification mentioning clock-skew cap

### Requirement: Tick loop SHALL pause whenever study session is paused or idle

The system SHALL clear the tick `setInterval` whenever `studySession.state !== 'active'`. Specifically:

- `studySession.state` transitions to `'paused'` (visibility / idle / explicit) → clear interval
- `studySession.state` transitions to `'idle'` (explicit stop) → clear interval
- `studySession.state` transitions to `'active'` (start / resume) → schedule interval

Visibility transitions SHALL be handled via the study session pause logic (see `hospital-study-session`), NOT directly here. This removes the previous direct `visibilitychange` handler on the tick loop.

#### Scenario: Visibility hide pauses session, tick clears

- **GIVEN** active session and tick interval scheduled
- **WHEN** `document.visibilityState` transitions to `'hidden'`
- **THEN** `studySession.state` SHALL transition to `'paused'` (via hospital-study-session)
- **AND** the tick interval SHALL be cleared as a downstream effect

### Requirement: Game counters SHALL split LWW fields and monotonic fields into separate rows

The system SHALL persist game state across TWO rows in dedicated tables to support different cloud sync merge strategies:

1. **`gameCounters.singleton`** (LWW merge — last-write-wins):
   - `revenue: number`
   - `reputation: number`
   - `lastTickAt: number`
   - `tier: HospitalTier`
   - `hasUsedStarterPull: boolean`
   - `currentSessionStartedAt: number | null`
   - `lastSessionEndedAt: number | null`
   - `tutorial: { completedSteps: Record<string, true>, firstVisit: Record<string, true>, firedTips: Record<string, true> }`

2. **`monotonicCounters.singleton`** (MAX merge — strictly non-decreasing):
   - `totalStudyMinutes: number`
   - `fateCardBadLuckPity: { common: number, rare: number, epic: number }`

Each row SHALL be created on first read if missing (auto-seed both rows with default zero values + `tier = '診所'` / `hasUsedStarterPull = false`).

Existing saves (pre-redesign-hospital-economy v6) SHALL be patched by the v6 upgrade hook to:
- Create `monotonicCounters.singleton` with `totalStudyMinutes = 0` and `fateCardBadLuckPity = {common: 0, rare: 0, epic: 0}`
- Add `currentSessionStartedAt = null` / `lastSessionEndedAt = null` / `tutorial = { completedSteps: {}, firstVisit: {}, firedTips: {} }` to existing `gameCounters.singleton` if missing

This split SHALL allow cloud sync (per `add-cloud-sync` capability) to apply different merge strategies per row — `gameCounters` uses standard LWW, `monotonicCounters` uses field-wise max — without requiring per-field merge hook infrastructure in the sync engine.

#### Scenario: Fresh save initializes both rows

- **GIVEN** a new hospital save (no prior rows in either table)
- **WHEN** the app boots and ensureSeed runs
- **THEN** `gameCounters.singleton.tier` SHALL equal `'診所'`
- **AND** `monotonicCounters.singleton.totalStudyMinutes` SHALL equal `0`
- **AND** `monotonicCounters.singleton.fateCardBadLuckPity` SHALL equal `{common: 0, rare: 0, epic: 0}`

#### Scenario: Existing v5 save upgrades to v6 with new monotonic row

- **GIVEN** a v5 save with `gameCounters.singleton = { revenue: 100, reputation: 50, ... }` (no monotonicCounters row)
- **WHEN** the app upgrades to v6
- **THEN** `monotonicCounters.singleton.totalStudyMinutes` SHALL equal `0`
- **AND** `monotonicCounters.singleton.fateCardBadLuckPity` SHALL equal `{common: 0, rare: 0, epic: 0}`
- **AND** `gameCounters.singleton` LWW fields SHALL remain unchanged

#### Scenario: Cloud sync max-merge for monotonic counters

- **GIVEN** local `totalStudyMinutes = 100` and cloud `totalStudyMinutes = 80` (player studied 20 min offline on this device)
- **WHEN** the sync engine pulls
- **THEN** the local value SHALL remain `100` (max(local, cloud))
- **AND** the cloud value SHALL be pushed up to `100` on next push (LWW won't downgrade since this row uses max merge)

#### Scenario: Cloud sync LWW for gameCounters revenue

- **GIVEN** local `gameCounters.singleton.revenue = 5000` (updated 1 min ago) and cloud value `revenue = 8000` (updated 10 seconds ago, fresher)
- **WHEN** the sync engine pulls
- **THEN** the local value SHALL become `8000` (cloud fresher → LWW wins)

### Requirement: HomePage SHALL display revenue and reputation prominently

The `apps/medexam2-hospital-tw/src/pages/Home.tsx` SHALL render a banner at the top of the page (above the recruitment banner grid) showing the current `revenue` and `reputation` values. Both values SHALL be formatted with Chinese locale thousands separator (e.g., `1,234,567`). The banner SHALL include a brief hint when both counters are zero, directing the player to assign doctors.

#### Scenario: Banner displays formatted counters

- **GIVEN** `gameCounters.revenue = 12345` and `gameCounters.reputation = 678`
- **WHEN** the HomePage renders
- **THEN** the banner SHALL display revenue as `12,345`
- **AND** the banner SHALL display reputation as `678`

#### Scenario: Empty state hint shown when counters are zero

- **GIVEN** `gameCounters.revenue = 0` and `gameCounters.reputation = 0`
- **AND** no doctors are assigned to any room
- **WHEN** the HomePage renders
- **THEN** the banner SHALL display a hint containing `「指派」` and `「診間」`

### Requirement: Assignment UI SHALL list only unassigned doctors when picking

The `/hospital` page SHALL render a grid of rooms. Clicking an empty slot SHALL open an `AssignDoctorModal` that lists only doctors whose `assignedRoom === null`. Clicking a doctor in the modal SHALL trigger the atomic assignment transaction defined above.

Clicking an already-assigned slot SHALL display options to **swap** (open modal listing unassigned doctors + current doctor) or **unassign**.

#### Scenario: Modal lists only unassigned doctors

- **GIVEN** the `doctors` table contains 5 entries
- **AND** 2 doctors have `assignedRoom !== null`
- **WHEN** the player clicks an empty room slot to assign
- **THEN** the modal SHALL display 3 doctor cards
- **AND** the 2 assigned doctors SHALL NOT appear in the modal

#### Scenario: Swap option offered on assigned slot

- **GIVEN** `room-A` has an assigned doctor
- **WHEN** the player clicks `room-A`
- **THEN** the UI SHALL display options to swap or unassign
- **AND** selecting swap SHALL open the modal with unassigned doctors plus the current doctor available
- **AND** selecting unassign SHALL clear `room-A.assignedDoctorId` and the doctor's `assignedRoom` atomically

### Requirement: Hospital page SHALL render rooms with assigned doctor sprite

Each room cell on the `/hospital` page SHALL render a `RoomCard` component showing:

- Room type label (e.g., `「門診」` for outpatient, `「手術」` for surgery, `「病房」` for ward)
- Slot number (e.g., `#1`, `#2`, `#3`)
- Assigned doctor's sprite (via the same `lookupSprite` helper from `add-doctor-sprite-roster`) when assigned
- An empty placeholder with `「指派醫師」` CTA when unassigned
- Live throughput indicator showing `XX 患者/分` when assigned (reflecting the affinity-adjusted formula `baseRate × powerMultiplier × roomFacility × affinityBonus`), `0 患者/分` when empty
- Affinity bonus marker when the assigned doctor's subject maps to the room's type per `hospital-reputation` capability (see that capability for marker visual + scenario details)

The sprite SHALL apply `image-rendering: pixelated` consistent with the existing roster and recruitment modal.

#### Scenario: Empty room shows assign CTA

- **GIVEN** `room-outpatient-1.assignedDoctorId = null`
- **WHEN** the `/hospital` page renders
- **THEN** the corresponding `RoomCard` SHALL display `「門診」` and `#1`
- **AND** the card SHALL display an empty placeholder with `「指派醫師」` CTA
- **AND** the throughput indicator SHALL show `0`

#### Scenario: Assigned room shows sprite and affinity-adjusted throughput (match)

- **GIVEN** `room-surgery-1` has `type = 'surgery'`, `baseRate = 10`, `roomFacility = 1.0`
- **AND** `assignedDoctorId = 'doctor-外科-P3-uuid'`
- **AND** the doctor has `powerMultiplier = 2.0`, `subjectId = '外科'` (maps to surgery → match, P3 bonus = 1.3)
- **WHEN** the `/hospital` page renders
- **THEN** the `RoomCard` SHALL render an `<img>` whose `src` resolves to `doctor-外科-P3` sprite
- **AND** the throughput indicator SHALL show `26 患者/分` (= 10 × 2.0 × 1.0 × 1.3)
- **AND** the card SHALL display the affinity match marker (per `hospital-reputation` capability)

#### Scenario: Assigned room shows lower throughput on mismatch

- **GIVEN** `room-ward-1` has `type = 'ward'`, `baseRate = 10`, `roomFacility = 1.0`
- **AND** the same P3 外科 doctor is assigned (mismatch: 外科 → surgery, room is ward)
- **WHEN** the `/hospital` page renders
- **THEN** the throughput indicator SHALL show `20 患者/分` (= 10 × 2.0 × 1.0 × 1.0)
- **AND** the card SHALL NOT display an affinity match marker
