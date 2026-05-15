## MODIFIED Requirements

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
