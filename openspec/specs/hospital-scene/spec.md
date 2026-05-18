# hospital-scene Specification

## Purpose

二階 hospital home 的 pixel art 場景視覺系統 — tier-based scene asset、assigned-room-bound doctor slot rendering、building click → upgrade modal。場景隨 `hospital.tier` 切換（診所 / 區域醫院 / 醫學中心 / 國家級教學醫院 4 個 768×384 PNG），assigned doctors 依各自 `assignedRoom` 的 `room.type` 在對應 room slot 顯示（不再用 SUBJECT_TO_ROOM 強綁）。提供 `?scene=off` URL query 作 emergency fallback。Lives in `apps/medexam2-hospital-tw`。

## Requirements
### Requirement: HospitalScene SHALL render in 二階 home above status text

The system SHALL render a `<HospitalScene>` component on the 二階 home route (`/study-rpg/hospital/#/`), positioned between the top bar (containing 抽卡券 chip and navigation buttons) and the hospital status text (containing 醫院 tier name and revenue / reputation stats). The component SHALL be additive — existing status text and stats SHALL remain visible and functional, ensuring screen-reader accessibility and graceful degradation.

#### Scenario: Scene appears on home above status text

- **GIVEN** the user opens `/study-rpg/hospital/#/` for the first time
- **WHEN** the page finishes loading
- **THEN** the DOM order SHALL be: top bar → `<HospitalScene>` → status text (「醫院：診所」) → revenue / reputation stats → navigation buttons
- **AND** the status text SHALL remain visible and readable
- **AND** removing `<HospitalScene>` from the tree SHALL NOT break any other home functionality

#### Scenario: Scene region has fixed height to prevent layout shift

- **GIVEN** the `<HospitalScene>` is rendering
- **WHEN** the scene image is still loading
- **THEN** the container SHALL reserve a fixed height between 240 px and 320 px
- **AND** the status text below SHALL NOT shift vertically when the image loads

### Requirement: Scene asset SHALL switch by hospital tier

The system SHALL render one of **four** tier-specific scene PNG assets based on the current `hospital.tier` state. The four assets SHALL be:

| Tier | Asset path (in theme pack) |
|---|---|
| `'診所'` | `scenes.tier1` |
| `'區域醫院'` | `scenes.tier2` |
| `'醫學中心'` | `scenes.tier3` |
| `'國家級教學醫院'` | `scenes.tier4` |

When `hospital.tier` changes (e.g. via clinic-level-up), the rendered scene asset SHALL change accordingly without page reload. Theme packs that do not ship a tier4 asset SHALL leave `HOSPITAL_SCENES` undefined and trigger the `?scene=off` graceful-degradation path (status text and stats SHALL remain visible).

#### Scenario: Initial render shows tier 1 (診所) scene

- **GIVEN** a new player with `hospital.tier = '診所'`
- **WHEN** the home page renders
- **THEN** `<HospitalScene>` SHALL display the asset at `theme.scenes.tier1`
- **AND** the rendered `<img>` SHALL have `alt="Hospital scene: 診所"` or equivalent localized alt text

#### Scenario: Tier upgrade swaps scene asset

- **GIVEN** `hospital.tier = '診所'` and scene asset shows tier1
- **WHEN** reputation reaches 1000 and tier upgrades to `'區域醫院'`
- **THEN** `<HospitalScene>` SHALL re-render with the asset at `theme.scenes.tier2`
- **AND** the transition SHALL be an instant swap (no animation required for MVP)

#### Scenario: Tier 4 scene renders for 國家級教學醫院

- **GIVEN** the player has reached `hospital.tier = '國家級教學醫院'`
- **AND** the active theme pack provides `scenes.tier4` (i.e., `hospital-tier4-national.png` exists in the sprite registry)
- **WHEN** the home page renders
- **THEN** `<HospitalScene>` SHALL display the asset at `theme.scenes.tier4`
- **AND** the rendered `<img>` SHALL have `alt="Hospital scene: 國家級教學醫院"` or equivalent localized alt text

#### Scenario: Tier 3 → tier 4 upgrade swaps scene asset

- **GIVEN** `hospital.tier = '醫學中心'` and scene asset shows tier3
- **WHEN** reputation reaches 2,000,000 and tier upgrades to `'國家級教學醫院'` via the dual-gate (assuming diversification requirements met)
- **THEN** `<HospitalScene>` SHALL re-render with the asset at `theme.scenes.tier4`

#### Scenario: Tier 4 unavailable in theme pack falls back gracefully

- **GIVEN** a fork uses a theme pack that ships only tier1/tier2/tier3 assets (no tier4 file)
- **AND** the player reaches `hospital.tier = '國家級教學醫院'`
- **WHEN** the home page renders
- **THEN** `HOSPITAL_SCENES` SHALL be `undefined` (guard requires all 4 keys)
- **AND** `<HospitalScene>` SHALL display the same "no scene" fallback used by the `?scene=off` query path
- **AND** the status text "醫院：國家級教學醫院" SHALL remain visible

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

### Requirement: Click on scene SHALL open upgrade modal

The system SHALL make the entire `<HospitalScene>` container a clickable element. Clicking the scene (anywhere within the container) SHALL open an `<UpgradeModal>` component showing:

- Current tier name (e.g. "區域醫院")
- Next tier name and reputation threshold (e.g. "醫學中心 — 聲望達 5,000")
- Progress bar (current reputation / threshold)
- "升級" button (enabled when threshold met, disabled with tooltip otherwise)
- "關閉" button

When `hospital.tier = '醫學中心'` (highest tier), the modal SHALL show "已達最高 tier" message instead of upgrade button.

#### Scenario: Click scene opens modal with tier info

- **GIVEN** `hospital.tier = '診所'`, reputation = 500
- **WHEN** the user clicks anywhere on `<HospitalScene>`
- **THEN** `<UpgradeModal>` SHALL open
- **AND** modal SHALL show current "診所" and next "區域醫院 — 聲望達 1,000"
- **AND** progress bar SHALL show 500/1000 (50%)
- **AND** "升級" button SHALL be disabled with tooltip "聲望差 500"

#### Scenario: Click scene at max tier shows max message

- **GIVEN** `hospital.tier = '醫學中心'`
- **WHEN** the user clicks `<HospitalScene>`
- **THEN** `<UpgradeModal>` SHALL open
- **AND** modal SHALL show "已達最高 tier" message
- **AND** no upgrade button SHALL be rendered

#### Scenario: Doctor sprite click does NOT trigger scene click

- **GIVEN** doctor sprites are rendered in slots within the scene container
- **WHEN** the user clicks a doctor sprite
- **THEN** EITHER the click MAY propagate to the scene container (opening upgrade modal) which is acceptable MVP behavior, OR the doctor sprite MAY use `pointer-events: none` so only the scene container is clickable — implementation choice
- **AND** no separate doctor-specific action SHALL trigger in MVP

### Requirement: Responsive layout SHALL adapt to viewport width

The system SHALL render `<HospitalScene>` differently based on viewport width:

- Desktop / tablet (≥ 768 px): scene centered horizontally, `max-width: 700px`, 16 px padding around
- Mobile (< 768 px): scene scales proportionally to fill viewport width, `max-height: 320 px`

#### Scenario: Desktop viewport renders centered scene

- **GIVEN** viewport width is 1280 px
- **WHEN** home renders
- **THEN** `<HospitalScene>` SHALL be horizontally centered
- **AND** the rendered `<img>` width SHALL be ≤ 700 px

#### Scenario: Mobile viewport renders full-width scene

- **GIVEN** viewport width is 400 px
- **WHEN** home renders
- **THEN** `<HospitalScene>` SHALL fill viewport width (with optional padding)
- **AND** the rendered `<img>` height SHALL NOT exceed 320 px

### Requirement: URL query param `?scene=off` SHALL disable scene rendering

The system SHALL check the URL query parameter `scene`. When `scene=off`, the `<HospitalScene>` component SHALL render nothing (return `null`), allowing emergency fallback to the original text-only home if scene assets fail to load or cause visual regressions.

#### Scenario: `?scene=off` hides scene

- **GIVEN** the user navigates to `/study-rpg/hospital/?scene=off#/`
- **WHEN** home renders
- **THEN** `<HospitalScene>` SHALL render nothing (no `<img>`, no container)
- **AND** the status text and stats SHALL render normally
- **AND** all other home functionality SHALL be unaffected

#### Scenario: `?scene` parameter absent or any value other than "off" shows scene

- **GIVEN** the URL has no `scene` query parameter (or `scene=on`, `scene=anything`)
- **WHEN** home renders
- **THEN** `<HospitalScene>` SHALL render normally

### Requirement: Scene asset SHALL fail gracefully if missing

The system SHALL handle missing or failed-to-load scene assets without crashing the home page. If a scene PNG is missing (e.g., due to CDN failure or build artifact issue), the scene container SHALL render with an empty / transparent state and the rest of the home SHALL remain functional.

#### Scenario: Missing scene asset does not break home

- **GIVEN** `theme.scenes.tier1` points to a path returning 404
- **WHEN** home renders
- **THEN** the `<img>` element SHALL have `onError` handler that gracefully hides the broken image
- **AND** the status text below SHALL still be visible
- **AND** the page SHALL NOT throw any uncaught exception
