## ADDED Requirements

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

The system SHALL render one of three tier-specific scene PNG assets based on the current `hospital.tier` state. The three assets SHALL be:

| Tier | Asset path (in theme pack) |
|---|---|
| `'診所'` | `scenes.tier1` |
| `'區域醫院'` | `scenes.tier2` |
| `'醫學中心'` | `scenes.tier3` |

When `hospital.tier` changes (e.g. via clinic-level-up), the rendered scene asset SHALL change accordingly without page reload.

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

### Requirement: Doctor sprites SHALL render at subject-bound slot positions

The system SHALL render assigned doctor sprites overlaid on the current tier scene at fixed slot positions defined by `theme.doctorSlotPositions[currentTier]`. Each slot SHALL be associated with a room category (`'ward'`, `'outpatient'`, or `'surgery'`). The assignment of doctors to slots SHALL follow the subject↔room mapping defined in `wire-hospital-reputation` (e.g., 內科 → ward, 外科 → surgery, 家醫科 → outpatient).

Slot counts per tier SHALL be:

| Tier | ward slots | outpatient slots | surgery slots | total |
|---|---|---|---|---|
| `'診所'` | 1 | 1 | 0 | 2 |
| `'區域醫院'` | 2 | 2 | 1 | 5 |
| `'醫學中心'` | 3 | 3 | 2 | 8 |

Each slot SHALL have `(x, y)` coordinates in the scene's 768×384 pixel space. Doctor sprites SHALL be rendered at 96×96 px, centered on the slot coordinate.

#### Scenario: Empty slots render nothing

- **GIVEN** `hospital.tier = '診所'` and no doctors are assigned to roster
- **WHEN** `<HospitalScene>` renders
- **THEN** 0 doctor sprites SHALL be visible on the scene
- **AND** the slot positions SHALL remain visually empty (no placeholder)

#### Scenario: Single doctor assigned to matching room renders at slot

- **GIVEN** `hospital.tier = '診所'`, one doctor with `subject = '內科'` is assigned
- **WHEN** `<HospitalScene>` renders
- **THEN** the doctor's sprite SHALL render at the ward slot coordinate
- **AND** the outpatient slot SHALL remain empty

#### Scenario: Multiple doctors of same subject — only first renders

- **GIVEN** `hospital.tier = '區域醫院'` and two doctors with `subject = '內科'` assigned (each maps to ward)
- **WHEN** `<HospitalScene>` renders
- **THEN** only the first ward slot SHALL be filled with the first 內科 doctor sprite (by assignment order)
- **AND** the second 內科 doctor SHALL NOT appear in the scene
- **AND** the second ward slot SHALL still be available for a different 內科 (or 神經內科) doctor

#### Scenario: Subject without mapping skips render

- **GIVEN** a doctor's subject is not in the SUBJECT_TO_ROOM mapping
- **WHEN** `<HospitalScene>` renders
- **THEN** that doctor SHALL NOT appear in any slot
- **AND** no console error SHALL be thrown (silent skip is acceptable)

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
