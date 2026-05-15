## MODIFIED Requirements

### Requirement: Roll result SHALL be displayed in modal with rarity indication

When a roll succeeds, the system SHALL display a `RecruitmentResultModal` showing the recruited doctor's resolved sprite image (per the theme pack sprite registry with fallback chain), name, rarity tier label (P1–P5 with Chinese label), subject affiliation, and powerMultiplier. The modal SHALL indicate when the result was pity-triggered.

The sprite image SHALL be resolved by looking up `doctor.spriteKey` in the active theme pack's sprite registry, with a 3-tier fallback chain: `doctor-<subjectId>-<rarity>` → `doctor-default-<rarity>` → `doctor-default-P3`. The resolved sprite SHALL be rendered as an `<img>` element with `image-rendering: pixelated` for nearest-neighbor scaling.

#### Scenario: Modal displays standard roll

- **GIVEN** a successful roll yields a P3 外科 doctor named `外科 醫師 #1`
- **WHEN** the result modal is rendered
- **THEN** the modal SHALL display the doctor's name
- **AND** the modal SHALL display the rarity label including `P3` and `人上人`
- **AND** the modal SHALL display the subject `外科`
- **AND** the modal SHALL display `powerMultiplier: 2.0` (or formatted equivalent)
- **AND** the modal SHALL NOT display any 保底 indicator

#### Scenario: Modal indicates pity result

- **GIVEN** a roll where `result.wasPity === true`
- **WHEN** the modal is rendered
- **THEN** the modal SHALL display a 保底 indicator (text, badge, or visual marker)

#### Scenario: Modal renders resolved sprite image with fallback chain

- **GIVEN** a successful roll yields a P2 外科 doctor
- **AND** the theme pack registers `doctor-default-P2` but NOT `doctor-外科-P2`
- **WHEN** the modal is rendered
- **THEN** the modal SHALL display an `<img>` element whose `src` resolves to the `doctor-default-P2` sprite URL
- **AND** the `<img>` SHALL apply `image-rendering: pixelated` per the GBA pixel convention
- **AND** the modal SHALL NOT display the 🩺 emoji placeholder

#### Scenario: Modal fallback to per-subject sprite when available

- **GIVEN** a successful roll yields a P3 內科 doctor
- **AND** the theme pack registers `doctor-內科-P3`
- **WHEN** the modal is rendered
- **THEN** the modal SHALL display an `<img>` whose `src` resolves to the `doctor-內科-P3` sprite URL (not the default-rarity fallback)

### Requirement: Doctor roster page SHALL list all recruited doctors

The `apps/medexam2-hospital-tw` SHALL provide a `/roster` route displaying all entries from the `doctors` IndexedDB table. The roster SHALL be sortable or filterable by subject and by rarity.

Each doctor card on the roster SHALL display the resolved sprite image (using the same fallback chain as the modal: `doctor-<subjectId>-<rarity>` → `doctor-default-<rarity>` → `doctor-default-P3`), alongside the doctor's name, subject, rarity label, and powerMultiplier.

#### Scenario: Roster page lists recruited doctors

- **GIVEN** the `doctors` table contains 5 entries
- **WHEN** the player navigates to `/roster`
- **THEN** the page SHALL display 5 doctor cards
- **AND** each card SHALL show the doctor's name, subject, rarity label, and powerMultiplier
- **AND** each card SHALL show the resolved sprite image (not the 🩺 emoji placeholder)

#### Scenario: Empty roster shows guidance

- **GIVEN** the `doctors` table is empty
- **WHEN** the player navigates to `/roster`
- **THEN** the page SHALL display guidance text directing the player back to the recruitment banners

## ADDED Requirements

### Requirement: Theme pack sprite registry SHALL provide doctor sprites covering the fallback chain

The active theme pack's `sprites` map SHALL include, at minimum, entries for the 5 default-rarity keys to support the `recruitment-gacha` fallback chain:

- `doctor-default-P5`
- `doctor-default-P4`
- `doctor-default-P3`
- `doctor-default-P2`
- `doctor-default-P1`

Each entry SHALL resolve to a URL pointing at a 384×384 PNG with transparent background and GBA-era pixel art style consistent with the theme pack's visual identity.

A theme pack MAY additionally include per-subject entries `doctor-<subjectId>-<rarity>` for any subset of the 14 二階 subjects and 5 rarity tiers; the lookup helper SHALL prefer those over the default-rarity fallback when registered.

#### Scenario: Theme pack with only default-rarity sprites is valid

- **GIVEN** a theme pack `T` whose `sprites` map contains exactly the 5 `doctor-default-<rarity>` keys
- **WHEN** a roll resolves `doctor.spriteKey = "doctor-內科-P5"`
- **AND** the lookup helper is invoked with `T.sprites`
- **THEN** the helper SHALL return the URL for `doctor-default-P5`
- **AND** the modal SHALL render the resolved sprite without error

#### Scenario: Theme pack with per-subject baseline coverage

- **GIVEN** a theme pack `T` registering all 5 `doctor-default-<rarity>` keys plus the 14 `doctor-<subjectId>-P3` keys
- **WHEN** a roll resolves `doctor.spriteKey = "doctor-外科-P3"`
- **THEN** the helper SHALL return the URL for `doctor-外科-P3` (per-subject win)
- **WHEN** a roll resolves `doctor.spriteKey = "doctor-外科-P1"`
- **THEN** the helper SHALL return the URL for `doctor-default-P1` (per-subject not registered at P1, falls back to default-rarity)

#### Scenario: Sprite resolution failure falls back to P3 default

- **GIVEN** a theme pack `T` whose `sprites` map is missing one default-rarity entry (e.g. `doctor-default-P2` is absent due to a generation failure)
- **WHEN** a roll resolves `doctor.spriteKey = "doctor-麻醉科-P2"`
- **AND** `doctor-麻醉科-P2` is also absent
- **THEN** the helper SHALL return the URL for `doctor-default-P3` as ultimate fallback
- **AND** the UI SHALL render this fallback rather than throwing or showing a broken-image icon
