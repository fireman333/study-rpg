## MODIFIED Requirements

### Requirement: Doctor sprites SHALL render at assigned-room-bound slot positions

The system SHALL render assigned doctor sprites overlaid on the current tier scene at fixed slot positions defined by `theme.doctorSlotPositions[currentTier]`. Each slot SHALL be associated with a room category (`'ward'`, `'outpatient'`, or `'surgery'`). The slot bucket a doctor's sprite renders in SHALL be determined by `room.type` of the doctor's **actual assigned room** (`db.rooms.get(doctor.assignedRoom).type`), **NOT** by the doctor's natural subject↔room mapping in `SUBJECT_TO_ROOM`. The natural mapping affects only throughput affinity bonuses (per `affinity-specialty-bonus`); a doctor MAY be placed in any room regardless of their subject.

Per-tier slot inventory SHALL satisfy `slot_count(tier, type) ≥ default_room_count(tier, type) + max_extension_cap(type)` so that a maxed-out hospital (all default rooms + all extension rooms purchased) has a deterministic slot for every assigned doctor. Slot inventory per tier:

| Tier | ward slots | outpatient slots | surgery slots | total |
|---|---|---|---|---|
| `'診所'` | 0 | 3 | 0 | 3 |
| `'區域醫院'` | 2 | 7 | 3 | 12 |
| `'醫學中心'` | 3 | 7 | 4 | 14 |
| `'國家級教學醫院'` | 4 | 8 | 5 | 17 |

Each slot SHALL have `(x, y)` coordinates in the scene's 768×384 pixel space. Doctor sprites SHALL be rendered at 96×96 px, centered on the slot coordinate. Slots filled in `doctor.obtainedAt` ascending order, with a per-room-type cursor so each subsequent doctor of the same `room.type` advances to the next slot of that type.

#### Scenario: Empty slots render nothing

- **GIVEN** `hospital.tier = '診所'` and no doctors are assigned to roster
- **WHEN** `<HospitalScene>` renders
- **THEN** 0 doctor sprites SHALL be visible on the scene
- **AND** the slot positions SHALL remain visually empty (no placeholder)

#### Scenario: Doctor sprite renders at the slot of the doctor's assigned room type

- **GIVEN** `hospital.tier = '診所'`, one 內科 doctor (natural subject→ward mapping) assigned to `outpatient-1` (room.type = `'outpatient'`)
- **WHEN** `<HospitalScene>` renders
- **THEN** the doctor's sprite SHALL render at the first outpatient slot coordinate
- **AND** the sprite SHALL NOT render at any ward slot

#### Scenario: Multiple doctors in same room type fill consecutive slots

- **GIVEN** `hospital.tier = '區域醫院'` and three doctors assigned to `outpatient-1`, `outpatient-2`, `outpatient-3` (any subjects)
- **WHEN** `<HospitalScene>` renders
- **THEN** the three sprites SHALL appear at the first three outpatient slots
- **AND** the order SHALL match `doctor.obtainedAt` ascending (deterministic per-tick rendering)

#### Scenario: Affinity-mismatched assignments render at the assigned-room slot

- **GIVEN** `hospital.tier = '區域醫院'` and a 外科 doctor (natural surgery) is assigned to an `outpatient-*` room
- **WHEN** `<HospitalScene>` renders
- **THEN** the doctor's sprite SHALL render at an outpatient slot, NOT a surgery slot
- **AND** no console warning SHALL fire (this is a legal cross-affinity placement, not an error)

#### Scenario: Maxed-out hospital with extensions has no silent drops

- **GIVEN** `hospital.tier = '國家級教學醫院'` with all 10 default rooms occupied AND all maxExtras (3 outpatient + 2 surgery + 2 ward = 7) extension rooms purchased and occupied
- **WHEN** `<HospitalScene>` renders
- **THEN** all 17 assigned doctor sprites SHALL be visible in the scene
- **AND** the slot inventory (4 ward + 8 outpatient + 5 surgery = 17) SHALL exactly accommodate the load
- **AND** no overflow `console.warn` SHALL fire

## ADDED Requirements

### Requirement: Extension rooms SHALL be visually represented in the scene

The system SHALL provision slot positions for extension rooms (room ids matching pattern `extra-<type>-<n>` from `services/room-extension.ts`) identically to default rooms. An assigned doctor in any extension room SHALL render a sprite in a slot of the matching `room.type`. The visual treatment SHALL be identical to default-room sprites (same 96×96 sprite, same per-rarity outline) — no "EXT" badge or dimming distinguishes extensions in MVP.

#### Scenario: Purchasing first extension outpatient renders the assigned doctor

- **GIVEN** `hospital.tier = '區域醫院'` with all 4 default outpatient rooms occupied (4 sprites visible)
- **WHEN** the player purchases `extra-outpatient-1` and assigns a 5th doctor to it
- **THEN** `<HospitalScene>` SHALL display 5 outpatient-slot sprites in total
- **AND** no `console.warn` SHALL fire

#### Scenario: Extension surgery doctor renders at the next surgery slot

- **GIVEN** `hospital.tier = '醫學中心'` with both default surgery rooms occupied
- **WHEN** the player purchases `extra-surgery-1` and assigns a doctor to it
- **THEN** the assigned doctor SHALL render at the 3rd surgery slot coordinate
- **AND** the sprite SHALL be visually identical to the default-room surgery sprites

### Requirement: Orphan assigned-room references SHALL be logged and skipped

The system SHALL detect doctors whose `assignedRoom` field references a room id NOT present in `db.rooms` (e.g., due to data corruption, future migration bug, or sync conflict). Such orphan doctors SHALL be skipped during scene rendering. In DEV builds (`import.meta.env.DEV`), a `console.warn` SHALL log the doctor id and the missing room id; in production builds, the warning SHALL NOT appear. No exception SHALL propagate; the rest of the scene SHALL render normally.

#### Scenario: Doctor with orphan assignedRoom logs warning in DEV and is skipped

- **GIVEN** a doctor row with `assignedRoom = 'outpatient-deleted-xyz'` that does not exist in `db.rooms`
- **AND** the build mode is DEV (`import.meta.env.DEV === true`)
- **WHEN** `<HospitalScene>` renders
- **THEN** the orphan doctor's sprite SHALL NOT appear
- **AND** `console.warn` SHALL fire with format `[hospital-scene] doctor <id> assignedRoom=<roomId> not found`
- **AND** all other (valid) doctor sprites SHALL render normally

#### Scenario: Same orphan in production logs nothing

- **GIVEN** the same orphan-room scenario as above
- **AND** the build mode is production (`import.meta.env.DEV === false`)
- **WHEN** `<HospitalScene>` renders
- **THEN** the orphan doctor's sprite SHALL NOT appear
- **AND** no `console.warn` SHALL fire (DEV-gated)
- **AND** all other (valid) doctor sprites SHALL render normally

## REMOVED Requirements

### Requirement: Doctor sprites SHALL render at subject-bound slot positions

**Reason**: Replaced by the new "assigned-room-bound" rule in MODIFIED Requirements above. The original spec described pre-fix behavior where `SUBJECT_TO_ROOM[doctor.subjectId]` chose the slot bucket; this caused sprites to vanish or land in the wrong room when players placed doctors against natural affinity. The shipped 2026-05-18 `HospitalScene.tsx` fix and this realign together implement the new rule.

**Migration**: No data migration. The replacement requirement covers all previous scenarios (empty slots, single doctor assignment, multi-doctor fill) with updated semantics. The old scenario "Multiple doctors of same subject — only first renders" is removed entirely — under the new rule, all assigned doctors render as long as their assigned room has a free slot of matching type. The old scenario "Subject without mapping skips render" is also removed — with assigned-room-bound rendering, doctors without a `SUBJECT_TO_ROOM` mapping still render normally based on their assigned room's `type`; only orphan `assignedRoom` references trigger skip-with-warn (see new orphan-room requirement).
