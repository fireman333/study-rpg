## ADDED Requirements

### Requirement: Player SHALL be able to rename any doctor in the roster

The roster page (`/roster`) SHALL provide an affordance on each doctor card that opens a rename dialog. The dialog SHALL allow the player to enter a custom name for that doctor, with validation, and persist the new name to the `doctors` IndexedDB table. The dialog SHALL also provide a "restore default name" action that resets the doctor's `name` back to the auto-generated template `"<subject.displayName> 醫師 #<seq>"`, where `<seq>` is recomputed at restore time based on the doctor's current ordinal position (by `obtainedAt` ascending) among all doctors with the same `subjectId`.

The rename SHALL be persisted via a whole-row write to `doctors` (Dexie `put`), which automatically marks the row dirty for cloud sync via the existing `hospital_doctors` adapter. No schema migration, no new sync table, no new field on `DoctorRow` is required.

The rename action SHALL be available at any time after a doctor enters the roster, with no in-game cost, cooldown, or limit on the number of times a single doctor can be renamed.

#### Scenario: Player renames a doctor to a custom name

- **GIVEN** the roster contains a doctor with `name = "外科 醫師 #3"` and `id = "doc-001"`
- **WHEN** the player clicks the ✏️ button on that doctor's card, enters `"天才小王"` in the rename dialog, and confirms
- **THEN** the dialog SHALL close
- **AND** `db.doctors.get("doc-001").name` SHALL equal `"天才小王"`
- **AND** the doctor card SHALL re-render showing `"天才小王"`
- **AND** the row SHALL be marked dirty in `hospital_doctors` cloud sync state

#### Scenario: Player restores a renamed doctor to default name

- **GIVEN** the roster contains a P2 外科 doctor with `name = "天才小王"`, `obtainedAt = T3` (3rd 外科 doctor by `obtainedAt` ascending), and 5 total 外科 doctors in the roster
- **WHEN** the player opens the rename dialog and clicks "還原預設名" and confirms
- **THEN** `db.doctors.get(...).name` SHALL equal `"外科 醫師 #3"`
- **AND** the doctor card SHALL re-render showing the default name

#### Scenario: Rename validation rejects empty name

- **WHEN** the player opens the rename dialog and submits an empty string, a single space, or any whitespace-only input
- **THEN** the rename SHALL be rejected with a UI error message
- **AND** `db.doctors.get(...).name` SHALL remain unchanged

#### Scenario: Rename validation rejects names longer than 20 characters

- **WHEN** the player submits a name longer than 20 characters (e.g., 21 characters)
- **THEN** the rename SHALL be rejected with a UI error message
- **AND** `db.doctors.get(...).name` SHALL remain unchanged

#### Scenario: Rename trims leading and trailing whitespace

- **WHEN** the player submits `"  天才小王  "` (with surrounding whitespace)
- **THEN** the persisted `doctor.name` SHALL equal `"天才小王"` (trimmed)

#### Scenario: Rename propagates to all UI surfaces reading doctor.name

- **GIVEN** a renamed doctor is assigned to a clinic room
- **WHEN** the player navigates to the room card, the assignment modal, the quiz modal, the training page, the hospital scene sprite alt text, or the recruitment result modal
- **THEN** each surface SHALL display the custom name (not the auto-generated default), via the existing `useLiveQuery` reactivity

## MODIFIED Requirements

### Requirement: Newly recruited doctor SHALL be persisted with sprite-resolved attributes

Each successful roll SHALL persist a new row in the `doctors` IndexedDB table with:

- `id`: unique identifier (e.g. UUID)
- `subjectId`: subject of the recruited doctor
- `rarity`: assigned rarity tier
- `powerMultiplier`: from the rarity table
- `name`: a default value generated as `"<subject.displayName> 醫師 #<seq>"`, where `<seq>` is the player's recruit count for this subject. The player MAY override this value at any time via the rename dialog on the roster page (see `Player SHALL be able to rename any doctor in the roster`).
- `spriteKey`: resolved sprite identifier (see male/female variant requirement below)
- `obtainedAt`: ISO timestamp or epoch ms of acquisition
- `assignedRoom`: `null` (reserved for clinic placement feature)

The `spriteKey` SHALL follow the pattern `doctor-<subjectId>-<rarity>` with theme-pack fallback chain `doctor-<subjectId>-<rarity>` → `doctor-default-<rarity>` → `doctor-default`.

The `assignedRoom` field SHALL be `null` upon creation in this change; it is reserved for `wire-hospital-tycoon-engine`.

#### Scenario: Newly recruited doctor stored with all fields

- **GIVEN** the player rolls a P2 外科 doctor as the 3rd 外科 recruit
- **WHEN** the doctor is persisted
- **THEN** `doctor.id` SHALL be a non-empty unique string
- **AND** `doctor.subjectId` SHALL equal `"外科"`
- **AND** `doctor.rarity` SHALL equal `"P2"`
- **AND** `doctor.powerMultiplier` SHALL equal `3.5`
- **AND** `doctor.name` SHALL equal `"外科 醫師 #3"` (the auto-generated default, before any player rename)
- **AND** `doctor.spriteKey` SHALL equal `"doctor-外科-P2"`
- **AND** `doctor.obtainedAt` SHALL be set to the current epoch ms
- **AND** `doctor.assignedRoom` SHALL be `null`
