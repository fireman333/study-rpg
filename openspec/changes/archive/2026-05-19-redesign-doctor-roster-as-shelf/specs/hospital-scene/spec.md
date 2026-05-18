## MODIFIED Requirements

### Requirement: Doctor sprites SHALL render at assigned-room-bound slot positions

The system SHALL render assigned doctor sprites in a roster shelf (`.doctor-shelf`) positioned beneath the hospital scene canvas, NOT as overlays on the scene PNG. The shelf SHALL be grouped by room type (`'ward'`, `'outpatient'`, `'surgery'`); the group an assigned doctor's cell renders in SHALL be determined by `room.type` of the doctor's **actual assigned room** (`db.rooms.get(doctor.assignedRoom).type`), **NOT** by the doctor's natural subject↔room mapping in `SUBJECT_TO_ROOM`. The natural mapping affects only throughput affinity bonuses (per `affinity-specialty-bonus`); a doctor MAY be placed in any room regardless of their subject.

Per-tier slot inventory (capacity used for empty-placeholder cells) SHALL satisfy `slot_count(tier, type) ≥ default_room_count(tier, type) + max_extension_cap(type)` so that a maxed-out hospital has a deterministic cell for every assigned doctor. Slot inventory per tier:

| Tier | ward slots | outpatient slots | surgery slots | total |
|---|---|---|---|---|
| `'診所'` | 0 | 3 | 0 | 3 |
| `'區域醫院'` | 2 | 7 | 3 | 12 |
| `'醫學中心'` | 3 | 7 | 4 | 14 |
| `'國家級教學醫院'` | 4 | 8 | 5 | 17 |

The shelf SHALL be laid out in visual ranks defined by `SHELF_ROW_LAYOUT`. Default layout SHALL be:

- **Rank 1**: `outpatient` group alone
- **Rank 2**: `ward` group + `surgery` group side-by-side

Cells SHALL be 84 × 96 px (including border + padding + name + subject labels), with 8 px gap between cells and 8 px gap between groups within the same rank. The shelf SHALL be horizontally centered relative to the hospital canvas above. Cells SHALL be vertically aligned across ranks — cell at column N of rank 1 SHALL share the same `getBoundingClientRect().left` value as cell at column N of rank 2.

Each group SHALL display a header containing the room type label (`'病房'` / `'門診'` / `'開刀房'`) and a fill-state count `<filled> / <total>`. Each group's cell row SHALL have `overflow-x: auto` so when assigned doctors of that room type exceed the visible horizontal width, the group scrolls independently without disturbing other ranks.

Cells SHALL fill in `doctor.obtainedAt` ascending order per room type. A filled cell SHALL display:
- The doctor sprite at 64 × 64 px inside a pixel-art frame
- Doctor name (`doctor.name`, ellipsis when overflowing 76 px)
- Doctor subject (`doctor.subjectId`)
- A rarity-colored border (P1 gold / P2 purple / P3 blue / P4 green / P5 wood-dark)

An empty cell SHALL display:
- A dashed border with `opacity: 0.55`
- A 45° diagonal hatch background pattern inside the frame
- A 28 px "?" placeholder character
- The text "空缺" below the frame

#### Scenario: Empty slots render placeholder cells

- **GIVEN** `hospital.tier = '診所'` and no doctors are assigned to roster
- **WHEN** `<HospitalScene>` renders
- **THEN** the shelf SHALL display 3 placeholder cells in the 門診 group
- **AND** the 病房 group SHALL NOT render (0 slots at tier 1)
- **AND** the 開刀房 group SHALL NOT render (0 slots at tier 1)
- **AND** each placeholder cell SHALL display "?" with dashed border and hatch background

#### Scenario: Doctor cell renders in the group of the doctor's assigned room type

- **GIVEN** `hospital.tier = '診所'`, one 內科 doctor (natural subject→ward mapping) assigned to `outpatient-1` (room.type = `'outpatient'`)
- **WHEN** `<HospitalScene>` renders
- **THEN** the doctor's cell SHALL render in the 門診 group at the first cell position
- **AND** the cell SHALL NOT appear in any other group

#### Scenario: Multiple doctors in same room type fill consecutive cells

- **GIVEN** `hospital.tier = '區域醫院'` and three doctors assigned to `outpatient-1`, `outpatient-2`, `outpatient-3` (any subjects)
- **WHEN** `<HospitalScene>` renders
- **THEN** the three cells SHALL appear at the first three positions in the 門診 group
- **AND** the order SHALL match `doctor.obtainedAt` ascending
- **AND** the remaining 門診 cells (4 placeholder) SHALL render with "?" placeholders

#### Scenario: Affinity-mismatched assignments render at the assigned-room group

- **GIVEN** `hospital.tier = '區域醫院'` and a 外科 doctor (natural surgery) is assigned to an `outpatient-*` room
- **WHEN** `<HospitalScene>` renders
- **THEN** the doctor's cell SHALL render in the 門診 group, NOT the 開刀房 group
- **AND** no console warning SHALL fire (this is a legal cross-affinity placement)

#### Scenario: Cells align vertically across ranks

- **GIVEN** `hospital.tier = '醫學中心'` with no doctors assigned
- **WHEN** `<HospitalScene>` renders
- **THEN** the rank-1 (門診) row SHALL contain 7 placeholder cells
- **AND** the rank-2 row SHALL contain 3 (病房) + 4 (開刀房) = 7 placeholder cells
- **AND** for every column index `i` in `[0..6]`, `cells_rank1[i].getBoundingClientRect().left` SHALL equal `cells_rank2[i].getBoundingClientRect().left`
- **AND** the shelf's horizontal center SHALL equal the hospital canvas's horizontal center (within 1 px tolerance)

#### Scenario: Group scrolls independently when over capacity at the rendering level

- **GIVEN** `hospital.tier = '醫學中心'` (門診 capacity = 7) and a fork modifies content to assign 10 doctors to outpatient rooms (overflow scenario)
- **WHEN** `<HospitalScene>` renders
- **THEN** the 門診 group SHALL display the first 7 cells visible and the remainder reachable via horizontal scroll
- **AND** the rank-2 row (病房 + 開刀房) SHALL NOT be affected by the scroll state of rank-1

#### Scenario: Maxed-out hospital with extensions has no silent drops

- **GIVEN** `hospital.tier = '國家級教學醫院'` with all 10 default rooms occupied AND all maxExtras (3 outpatient + 2 surgery + 2 ward = 7) extension rooms purchased and occupied
- **WHEN** `<HospitalScene>` renders
- **THEN** all 17 assigned doctor cells SHALL be visible in the shelf
- **AND** the capacity (4 ward + 8 outpatient + 5 surgery = 17 cells) SHALL exactly accommodate the load
- **AND** no overflow `console.warn` SHALL fire

### Requirement: Extension rooms SHALL be visually represented in the scene

The system SHALL provision shelf cells for extension rooms (room ids matching pattern `extra-<type>-<n>` from `services/room-extension.ts`) identically to default rooms. An assigned doctor in any extension room SHALL render a cell in the group matching the room's `room.type`. The visual treatment SHALL be identical to default-room cells (same 64×64 sprite, same per-rarity border outline, same name + subject labels) — no "EXT" badge or dimming distinguishes extensions in MVP.

#### Scenario: Purchasing first extension outpatient renders the assigned doctor

- **GIVEN** `hospital.tier = '區域醫院'` with all 4 default outpatient rooms occupied (4 cells filled in 門診 group)
- **WHEN** the player purchases `extra-outpatient-1` and assigns a 5th doctor to it
- **THEN** the 門診 group SHALL display 5 filled cells in total
- **AND** the remaining 門診 cells (2) SHALL render with "?" placeholders
- **AND** no `console.warn` SHALL fire

#### Scenario: Extension surgery doctor renders at the next surgery cell

- **GIVEN** `hospital.tier = '醫學中心'` with both default surgery rooms occupied
- **WHEN** the player purchases `extra-surgery-1` and assigns a doctor to it
- **THEN** the assigned doctor SHALL render at the 3rd cell in the 開刀房 group
- **AND** the cell SHALL be visually identical to the default-room surgery cells

### Requirement: Click on scene SHALL open upgrade modal

The system SHALL make the hospital scene canvas (the `<div class="hospital-scene__canvas">` containing the building PNG) a clickable element. Clicking the canvas SHALL open an `<UpgradeModal>` component showing:

- Current tier name (e.g. "區域醫院")
- Next tier name and reputation threshold (e.g. "醫學中心 — 聲望達 5,000")
- Progress bar (current reputation / threshold)
- "升級" button (enabled when threshold met, disabled with tooltip otherwise)
- "關閉" button

When `hospital.tier = '醫學中心'` (highest tier), the modal SHALL show "已達最高 tier" message instead of upgrade button.

The doctor shelf SHALL NOT be clickable for the upgrade modal; cells SHALL have no `onClick` handler in MVP. Future changes MAY introduce per-cell click behavior (e.g., jump to doctor roster detail) without conflicting with the canvas click target, because the shelf is a sibling element to the canvas, not a child.

#### Scenario: Click hospital canvas opens modal with tier info

- **GIVEN** `hospital.tier = '診所'`, reputation = 500
- **WHEN** the user clicks the hospital canvas
- **THEN** `<UpgradeModal>` SHALL open
- **AND** modal SHALL show current "診所" and next "區域醫院 — 聲望達 1,000"
- **AND** progress bar SHALL show 500/1000 (50%)
- **AND** "升級" button SHALL be disabled with tooltip "聲望差 500"

#### Scenario: Click canvas at max tier shows max message

- **GIVEN** `hospital.tier = '醫學中心'`
- **WHEN** the user clicks the hospital canvas
- **THEN** `<UpgradeModal>` SHALL open
- **AND** modal SHALL show "已達最高 tier" message
- **AND** no upgrade button SHALL be rendered

#### Scenario: Click on shelf cell does NOT open upgrade modal

- **GIVEN** doctor cells are rendered in the shelf below the canvas
- **WHEN** the user clicks a doctor cell
- **THEN** `<UpgradeModal>` SHALL NOT open
- **AND** no separate per-cell action SHALL trigger in MVP

## ADDED Requirements

### Requirement: Orphan assigned-room references SHALL be skipped silently in DEV and production

The system SHALL detect doctors whose `assignedRoom` field references a room id NOT present in `db.rooms` (e.g., due to data corruption, future migration bug, or sync conflict). Such orphan doctors SHALL be skipped during shelf rendering. No exception SHALL propagate; the rest of the shelf SHALL render normally. Unlike the prior overlay-rendered version, the shelf-based renderer SHALL NOT emit a per-orphan `console.warn` because the capacity-aware placeholder model already surfaces missing-doctor visual feedback through empty cells.

#### Scenario: Doctor with orphan assignedRoom is skipped in DEV

- **GIVEN** a doctor row with `assignedRoom = 'outpatient-deleted-xyz'` that does not exist in `db.rooms`
- **AND** the build mode is DEV (`import.meta.env.DEV === true`)
- **WHEN** `<HospitalScene>` renders
- **THEN** the orphan doctor's cell SHALL NOT appear
- **AND** the position the orphan would have occupied SHALL render as a "?" placeholder if within the group's slot capacity
- **AND** all other (valid) doctor cells SHALL render normally

#### Scenario: Same orphan in production is skipped silently

- **GIVEN** the same orphan-room scenario as above
- **AND** the build mode is production (`import.meta.env.DEV === false`)
- **WHEN** `<HospitalScene>` renders
- **THEN** the orphan doctor's cell SHALL NOT appear
- **AND** all other (valid) doctor cells SHALL render normally

## REMOVED Requirements

### Requirement: Orphan assigned-room references SHALL be logged and skipped

**Reason**: Replaced by the silent-skip variant. The new shelf renderer's capacity-aware placeholder cells already give the player + dev a visible signal that "a room expects a doctor that isn't there" (the empty `?` cell), so the DEV-only `console.warn` no longer carries new information and would add noise during normal shelf rendering. The skip behavior itself is preserved (orphan rows do not crash the render); only the `console.warn` is dropped.

**Migration**: No data or API migration required. Forks that grep for the warning message string `[hospital-scene] doctor` MAY need to update logs/tests; otherwise no action.
