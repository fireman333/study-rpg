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

### Requirement: Tick loop SHALL accumulate revenue + reputation per visible 5-second tick

The system SHALL run a tick function every 5 seconds while the browser tab is visible. Each tick SHALL:

1. Read `gameCounters.singleton` (revenue, reputation, lastTickAt)
2. Compute `elapsedSec = max(0, min((now - lastTickAt) / 1000, MAX_OFFLINE_TICK_SEC))` where `MAX_OFFLINE_TICK_SEC = 300`
3. For each room with `assignedDoctorId !== null`, sum `throughput = baseRate × doctor.powerMultiplier × roomFacility × affinityBonus`, where `affinityBonus = getAffinityBonus(doctor.rarity, doctor.subjectId, room.type)` per the `hospital-reputation` capability
4. Compute `deltaRevenue = totalThroughput × elapsedSec / 60` (throughput is patients/min; elapsedSec is seconds)
5. Compute `deltaReputation = deltaRevenue × 0.7` (idle tick contributes 70% of reputation; the remaining 30% comes from the per-question hook defined in `hospital-reputation` capability)
6. Write `revenue += deltaRevenue`, `reputation += deltaReputation`, `lastTickAt = now` in a single Dexie transaction

All counter mutations from idle tick SHALL go through this tick function. Direct writes to `revenue` / `reputation` from UI code SHALL NOT be permitted. The per-Q reputation hook is the only other authorised writer of `reputation` (and never of `revenue`).

#### Scenario: Tick accumulates with one assigned doctor matched to room

- **GIVEN** `gameCounters.lastTickAt` was 5000 ms ago
- **AND** `room-surgery-1` has `baseRate = 10`, `roomFacility = 1.0`, `type = 'surgery'`
- **AND** the assigned doctor has `powerMultiplier = 2.0` (P3), `subjectId = '外科'` (maps to surgery → match)
- **AND** no other rooms are assigned
- **WHEN** `runTick()` is called
- **THEN** `affinityBonus` SHALL equal `1.3` (P3 match)
- **AND** `totalThroughput` SHALL equal `10 × 2.0 × 1.0 × 1.3 = 26`
- **AND** `deltaRevenue` SHALL equal `26 × 5 / 60 ≈ 2.167`
- **AND** `deltaReputation` SHALL equal `2.167 × 0.7 ≈ 1.517`
- **AND** `gameCounters.revenue` SHALL increase by approximately `2.167`
- **AND** `gameCounters.reputation` SHALL increase by approximately `1.517`

#### Scenario: Tick accumulates with mismatched doctor (no affinity bonus)

- **GIVEN** `gameCounters.lastTickAt` was 5000 ms ago
- **AND** `room-ward-1` has `baseRate = 10`, `roomFacility = 1.0`, `type = 'ward'`
- **AND** the assigned doctor has `powerMultiplier = 5.0` (P1), `subjectId = '外科'` (maps to surgery → mismatch)
- **WHEN** `runTick()` is called
- **THEN** `affinityBonus` SHALL equal `1.0` (mismatch, no penalty)
- **AND** `totalThroughput` SHALL equal `10 × 5.0 × 1.0 × 1.0 = 50`
- **AND** `deltaRevenue` SHALL equal `50 × 5 / 60 ≈ 4.167`
- **AND** `deltaReputation` SHALL equal `4.167 × 0.7 ≈ 2.917`

#### Scenario: Tick produces zero for empty rooms

- **GIVEN** all 3 rooms have `assignedDoctorId = null`
- **AND** `gameCounters.lastTickAt` was 5000 ms ago
- **WHEN** `runTick()` is called
- **THEN** `gameCounters.revenue` SHALL remain unchanged
- **AND** `gameCounters.reputation` SHALL remain unchanged
- **AND** `gameCounters.lastTickAt` SHALL still be updated to `now`

### Requirement: Tick loop SHALL cap offline accumulation at 5 minutes

The system SHALL enforce `MAX_OFFLINE_TICK_SEC = 300` such that no single tick advances by more than 300 seconds of accumulated throughput, even if the actual `now - lastTickAt` exceeds it. After the capped tick, `lastTickAt` SHALL be set to `now` (not `lastTickAt + 300`), so the remaining elapsed time is intentionally forfeit.

The UI SHALL display a notification when a tick was capped, informing the player that some offline time was not credited.

#### Scenario: Offline cap forfeits excess time

- **GIVEN** `gameCounters.lastTickAt` was 1 hour ago
- **AND** `room-A` produces `throughput = 20 patients/min`
- **WHEN** `runTick()` is called
- **THEN** `elapsedSec` SHALL be capped at `300`
- **AND** `deltaRevenue` SHALL equal `20 × 300 / 60 = 100` (not `20 × 3600 / 60 = 1200`)
- **AND** `gameCounters.lastTickAt` SHALL be set to the current `now` (not `lastTickAt + 300_000`)
- **AND** the UI SHALL display a notification mentioning offline cap

#### Scenario: Negative elapsed time guarded

- **GIVEN** `gameCounters.lastTickAt` is in the future (e.g., player adjusted system clock backwards)
- **WHEN** `runTick()` is called
- **THEN** `elapsedSec` SHALL be `0`
- **AND** `gameCounters.revenue` SHALL NOT decrease
- **AND** `gameCounters.lastTickAt` SHALL be updated to the current `now`

### Requirement: Tick loop SHALL pause when tab is hidden and resume on visibility return

The system SHALL listen to `document.visibilitychange`. When the tab transitions to `hidden`, the periodic `setInterval` SHALL be cleared and no further ticks SHALL run until visibility returns. When the tab transitions to `visible`, the system SHALL:

1. Immediately call `runTick()` (catching up missed time, subject to offline cap)
2. Restart the 5-second `setInterval`

This SHALL prevent battery drain and ensures the player who leaves a tab open in the background does not get continuous CPU usage from the tick loop.

#### Scenario: Tick loop pauses on tab hide

- **GIVEN** the tick loop is running with `setInterval` active
- **WHEN** the tab transitions to `hidden`
- **THEN** the `setInterval` handle SHALL be cleared
- **AND** no calls to `runTick` SHALL fire while hidden

#### Scenario: Tick loop resumes on tab show with catch-up

- **GIVEN** the tab has been hidden for 30 seconds
- **AND** `room-A` produces `throughput = 12 patients/min`
- **WHEN** the tab transitions to `visible`
- **THEN** `runTick()` SHALL fire immediately
- **AND** `gameCounters.revenue` SHALL increase by approximately `12 × 30 / 60 = 6`
- **AND** the 5-second `setInterval` SHALL be restarted

### Requirement: Game counters SHALL be persisted as Dexie singleton row reactive to liveQuery

The system SHALL persist `revenue`, `reputation`, and `lastTickAt` in a `gameCounters` table with a single row keyed by `id = 'singleton'`. The row SHALL be created on first read if missing (auto-seed with `revenue = 0`, `reputation = 0`, `lastTickAt = now`).

The hospital app SHALL subscribe to this row via Dexie `liveQuery` so that UI components re-render automatically when the tick updates the counters — no manual polling or pub/sub.

#### Scenario: Counters auto-seed on first read

- **GIVEN** a fresh IndexedDB with no `gameCounters` entries
- **WHEN** the app reads `gameCounters.singleton`
- **THEN** the row SHALL be created with `revenue = 0`, `reputation = 0`, `lastTickAt = now`
- **AND** the row SHALL be returned to the caller

#### Scenario: HomePage re-renders on counter update

- **GIVEN** the HomePage banner is displaying `revenue = 100`
- **AND** `runTick()` writes `revenue = 105`
- **WHEN** the Dexie liveQuery fires
- **THEN** the HomePage banner SHALL re-render and display `revenue = 105`
- **AND** no manual `setState` or polling SHALL be required

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
