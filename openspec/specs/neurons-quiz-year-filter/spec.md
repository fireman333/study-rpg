# neurons-quiz-year-filter Specification

## Purpose

A homepage exam-year gate for the neurons-tw quiz pool, mirroring 二階's `year-filter` behaviorally. The selected 民國 years (106–114) persist in the Dexie `meta` key `quiz.yearFilter` (JSON-encoded, since neurons `MetaRow.value` is a string), with `null`/`[]` both meaning「全選」. A persistent `YearFilterBar` in the OverviewPage quiz-launch CTA area lets the player pick years; the selection gates both quiz-launch paths (specific family and cross-family random) by filtering on `q.meta.year`. Local-only (not synced), no Dexie schema change, no backfill. Created by archiving change `add-neurons-quiz-year-filter`.

## Requirements

### Requirement: The exam-year filter SHALL persist in Dexie meta with null/empty meaning all years

The system SHALL store the selected exam years under the Dexie `meta` key `quiz.yearFilter`, encoded as a JSON array of 民國 years (`MetaRow.value` is a string). `ALL_YEARS` SHALL be `[106,107,108,109,110,111,112,113,114]`. A helper `effectiveYearSet(persisted)` SHALL resolve `null` (no row), an unparseable value, OR an empty array all to the full set of `ALL_YEARS` ("default = everything"). `getYearFilter()` SHALL never throw — a non-array or parse error resolves to `null`. The filter SHALL be local-only (NOT added to the sync `SYNCED_META_KEYS` allowlist).

#### Scenario: No persisted filter defaults to all years

- **GIVEN** the player has never set a year filter (no `quiz.yearFilter` meta row)
- **WHEN** `effectiveYearSet(getYearFilter())` is evaluated
- **THEN** it SHALL equal the set of all 9 years `{106..114}`

#### Scenario: Empty array also means all years

- **GIVEN** `quiz.yearFilter` is persisted as `"[]"`
- **WHEN** `effectiveYearSet` resolves it
- **THEN** it SHALL equal `{106..114}` (not the empty set)

#### Scenario: Selection persists across reloads

- **WHEN** the player selects only years 113 and 114
- **THEN** `quiz.yearFilter` SHALL be written as a JSON array containing 113 and 114
- **AND** on next app load `getYearFilter()` SHALL return `[113, 114]` (order-insensitive)

#### Scenario: Corrupt value is treated as all years

- **GIVEN** `quiz.yearFilter` holds a non-array / unparseable string
- **WHEN** `getYearFilter()` runs
- **THEN** it SHALL return `null` without throwing
- **AND** `effectiveYearSet(null)` SHALL be the full 9-year set

### Requirement: The homepage SHALL render a YearFilterBar that gates the quiz pool

The OverviewPage SHALL render a persistent `YearFilterBar` in the quiz-launch CTA area, listing a 「全部」 chip plus one chip per year (106–114). Toggling chips SHALL call `setYearFilter`; the bar SHALL reflect the current effective selection reactively (via a live query). The bar SHALL share state with the pool gate — there is one source of truth (`quiz.yearFilter`).

#### Scenario: Bar reflects persisted selection on load

- **GIVEN** `quiz.yearFilter` is `[114]`
- **WHEN** OverviewPage renders
- **THEN** the YearFilterBar SHALL show year 114 as selected and the other years as unselected

#### Scenario: Toggling a year updates persistence and bar

- **GIVEN** all years are selected
- **WHEN** the player clicks the 113 chip to deselect it
- **THEN** `quiz.yearFilter` SHALL persist the remaining 8 years
- **AND** the bar SHALL show 113 as unselected without a manual reload

### Requirement: Both quiz-launch paths SHALL apply the year filter to the pool

The `quizPool` built in OverviewPage SHALL apply the effective year set AFTER family filtering, on both launch paths: the specific-family path (`quizEntry = familyId`) and the cross-family random path (`quizEntry = null`). A question is included only if `q.meta.year` is in the effective year set. When the effective set spans all 9 years the year filter SHALL be a no-op (return the family-filtered pool unchanged).

#### Scenario: Cross-family random respects the year filter

- **GIVEN** the player has selected only year 114
- **WHEN** the player launches 🎲 隨機跨 family 答題
- **THEN** every served question SHALL have `q.meta.year === 114`

#### Scenario: Specific-family launch respects the year filter

- **GIVEN** the player has selected years 113 and 114
- **WHEN** the player launches a quiz for 藥理學 from its family card
- **THEN** every served question SHALL be `subject === '藥理學'` AND `meta.year ∈ {113,114}`

#### Scenario: All-years selection is a no-op

- **GIVEN** all 9 years are selected (or none persisted)
- **WHEN** any quiz launches
- **THEN** the pool SHALL equal the family-filtered pool with no year exclusion

### Requirement: An empty filtered pool SHALL show a plain empty state, not break

When the family × year selection yields zero questions, launching SHALL be allowed and `QuizModal` SHALL render a plain text empty state (e.g. 「所選年份下這個範圍沒有可作答的題目」) with a close affordance, distinct from the normal 「答完」 completion state. No quick-action button is required.

#### Scenario: Empty filtered pool renders the empty state

- **GIVEN** a (family, year-set) selection that yields 0 questions
- **WHEN** the player launches the quiz
- **THEN** `QuizModal` SHALL open with a plain text empty-state message and a close control
- **AND** it SHALL NOT crash or show the normal completion ("答完") wording

### Requirement: Existing players SHALL default to all years with no migration

Introducing the year filter SHALL NOT require any Dexie schema change or backfill. Players with no `quiz.yearFilter` meta row SHALL behave exactly as before (all years playable). The `/bookmarks` year chip and the homepage year filter SHALL remain independent state with no cross-effect.

#### Scenario: Pre-existing player sees no behavior change until they opt in

- **GIVEN** an existing player who has never opened the YearFilterBar
- **WHEN** they launch any quiz
- **THEN** the full family pool (all years) SHALL be served, identical to pre-change behavior

#### Scenario: Homepage filter does not affect /bookmarks chips

- **GIVEN** the player sets the homepage year filter to 114 only
- **WHEN** they open `/bookmarks`
- **THEN** the `/bookmarks` year chips SHALL be unaffected (independent state)
