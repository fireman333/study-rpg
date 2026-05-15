## ADDED Requirements

### Requirement: Hospital tier progression SHALL follow exactly three monotonic tiers

The system SHALL define a `HospitalTier` union with exactly three values: `'診所'`, `'區域醫院'`, `'醫學中心'`. The system SHALL export `TIER_ORDER` as the ordered array `['診所', '區域醫院', '醫學中心']`. Tier progression SHALL be strictly monotonic — once advanced, a tier SHALL NOT regress regardless of reputation changes. Reputation itself is monotonic by design (see `hospital-tycoon-engine` capability), so this property is preserved trivially.

#### Scenario: Tier order is exported as canonical array

- **GIVEN** a developer imports `TIER_ORDER` from `@study-rpg/content-medexam2-tw`
- **WHEN** the import resolves
- **THEN** the array SHALL equal `['診所', '區域醫院', '醫學中心']`
- **AND** the array SHALL have exactly 3 elements

#### Scenario: Tier never regresses

- **GIVEN** `gameCounters.tier = '區域醫院'` and `reputation = 5000`
- **WHEN** a future change attempts to set `tier = '診所'` outside of test/migration code paths
- **THEN** the type system SHALL reject the assignment (TypeScript ensures this via `HospitalTier` typing)
- **AND** no runtime code path SHALL include such a downgrade

### Requirement: Tier upgrade thresholds SHALL be locked literal constants

The system SHALL export `TIER_UPGRADE_THRESHOLDS: Record<HospitalTier, number | null>` with the following locked values:

| Current tier | Reputation threshold to advance | Next tier |
|---|---|---|
| 診所 | 1,000 | 區域醫院 |
| 區域醫院 | 10,000 | 醫學中心 |
| 醫學中心 | `null` (terminal) | — |

These thresholds SHALL be recorded as literals in `packages/content-medexam2-tw/src/clinic-tiers.ts`. Subsequent tuning SHALL replace them via a new change, not silently recompute them.

#### Scenario: Threshold lookup returns locked value

- **GIVEN** `TIER_UPGRADE_THRESHOLDS['診所']`
- **WHEN** the value is read
- **THEN** it SHALL equal `1000`

#### Scenario: Terminal tier has null threshold

- **GIVEN** `TIER_UPGRADE_THRESHOLDS['醫學中心']`
- **WHEN** the value is read
- **THEN** it SHALL be `null`

### Requirement: Each tier SHALL declare its full room roster as a Room array

The system SHALL export `TIER_ROOMS: Record<HospitalTier, Room[]>` describing the complete room roster for each tier (cumulative — higher tiers include all rooms from lower tiers, plus new ones):

| Tier | Rooms |
|---|---|
| 診所 | 3 outpatient (slots 1, 2, 3) |
| 區域醫院 | 4 outpatient (slots 1, 2, 3, 4) + 1 surgery (slot 1) — total 5 rooms |
| 醫學中心 | 4 outpatient (slots 1–4) + 2 surgery (slots 1, 2) + 1 ward (slot 1) — total 7 rooms |

All rooms SHALL have `baseRate = 10`, `roomFacility = 1.0`, and `assignedDoctorId = null` as initial values. Room ids SHALL be deterministic per `${type}-${index}` pattern (e.g., `outpatient-3`, `surgery-1`, `ward-1`). Slot field SHALL be 1-indexed within each room type for display ordering.

`wire-hospital-reputation` SHALL be the change that introduces per-type throughput differences (surgery weight, ward weight); until then all room types use identical `baseRate = 10`.

#### Scenario: 診所 tier has 3 outpatient rooms

- **GIVEN** `TIER_ROOMS['診所']`
- **WHEN** the array is read
- **THEN** it SHALL have length 3
- **AND** every entry SHALL have `type === 'outpatient'`
- **AND** the slots SHALL be `[1, 2, 3]`

#### Scenario: 區域醫院 tier adds surgery and an extra outpatient

- **GIVEN** `TIER_ROOMS['區域醫院']`
- **WHEN** the array is read
- **THEN** it SHALL have length 5
- **AND** exactly 4 entries SHALL have `type === 'outpatient'`
- **AND** exactly 1 entry SHALL have `type === 'surgery'`
- **AND** the surgery entry's id SHALL equal `'surgery-1'`

#### Scenario: 醫學中心 tier is the largest roster

- **GIVEN** `TIER_ROOMS['醫學中心']`
- **WHEN** the array is read
- **THEN** it SHALL have length 7
- **AND** exactly 4 entries SHALL have `type === 'outpatient'`
- **AND** exactly 2 entries SHALL have `type === 'surgery'`
- **AND** exactly 1 entry SHALL have `type === 'ward'`

#### Scenario: Higher-tier rosters are supersets of lower-tier (deterministic ids)

- **GIVEN** `TIER_ROOMS['診所']` and `TIER_ROOMS['區域醫院']`
- **WHEN** the ids of 診所 rooms are compared to ids in 區域醫院's first 3 outpatient entries
- **THEN** every id from 診所 SHALL appear in 區域醫院's roster (`outpatient-1`, `outpatient-2`, `outpatient-3`)
- **AND** `TIER_ROOMS['醫學中心']` SHALL likewise contain every id from `TIER_ROOMS['區域醫院']`

### Requirement: Tier upgrade SHALL fire when reputation crosses threshold during a tick

The system SHALL check tier advancement at the end of every `runTick()` transaction, within the same Dexie transaction that wrote the reputation increment. Upgrade logic:

1. Read current `gameCounters.tier` and final `reputation` after delta applied
2. Compute `requiredThreshold = TIER_UPGRADE_THRESHOLDS[currentTier]`
3. If `requiredThreshold !== null && reputation >= requiredThreshold`:
   - Set `tier = nextTier` (look up via `TIER_ORDER`)
   - Compute the set of room ids missing from the current `rooms` table relative to `TIER_ROOMS[nextTier]` and `bulkAdd` ONLY the missing ones. This SHALL NOT overwrite existing rooms — assignments and per-room customization on lower-tier rooms are preserved.
   - Record `upgradedTo: HospitalTier` in `TickResult`

Multiple tier crossings in one tick (e.g., reputation jumps from 500 to 15,000 during catch-up) SHALL advance through each tier in order, with the FINAL `upgradedTo` reflecting the latest tier reached. New rooms for every intermediate tier SHALL also be persisted via the same additive-only insert.

#### Scenario: Single tier crossing surfaces upgrade

- **GIVEN** `gameCounters = { tier: '診所', reputation: 950 }` and a tick computes `deltaReputation = 60`
- **WHEN** `runTick()` completes
- **THEN** `gameCounters.tier` SHALL equal `'區域醫院'`
- **AND** `gameCounters.reputation` SHALL equal `1010`
- **AND** `db.rooms` SHALL contain all 5 entries from `TIER_ROOMS['區域醫院']`
- **AND** the returned `TickResult.upgradedTo` SHALL equal `'區域醫院'`

#### Scenario: No upgrade when below threshold

- **GIVEN** `gameCounters = { tier: '診所', reputation: 500 }` and `deltaReputation = 100`
- **WHEN** `runTick()` completes
- **THEN** `gameCounters.tier` SHALL still equal `'診所'`
- **AND** `TickResult.upgradedTo` SHALL be `undefined`

#### Scenario: Double tier crossing in catch-up tick

- **GIVEN** `gameCounters = { tier: '診所', reputation: 0 }` and `deltaReputation = 11_000` (e.g., 5-minute offline cap with extreme throughput)
- **WHEN** `runTick()` completes
- **THEN** `gameCounters.tier` SHALL equal `'醫學中心'`
- **AND** `gameCounters.reputation` SHALL equal `11_000`
- **AND** `db.rooms` SHALL contain all 7 entries from `TIER_ROOMS['醫學中心']`
- **AND** `TickResult.upgradedTo` SHALL equal `'醫學中心'`

#### Scenario: Already at terminal tier

- **GIVEN** `gameCounters = { tier: '醫學中心', reputation: 50_000 }` and `deltaReputation = 1000`
- **WHEN** `runTick()` completes
- **THEN** `gameCounters.tier` SHALL still equal `'醫學中心'`
- **AND** no new rooms SHALL be added
- **AND** `TickResult.upgradedTo` SHALL be `undefined`

#### Scenario: Idempotent upgrade re-run preserves assignments

- **GIVEN** `gameCounters.tier = '區域醫院'` (already upgraded previously)
- **AND** `db.rooms` already contains all 5 entries from `TIER_ROOMS['區域醫院']`
- **AND** room `outpatient-1` has `assignedDoctorId = 'doctor-X-uuid'`
- **WHEN** the upgrade logic re-fires (e.g., manual `runTick()` after a save reload)
- **THEN** the rooms table SHALL still contain exactly 5 entries (no duplicates)
- **AND** room `outpatient-1.assignedDoctorId` SHALL still equal `'doctor-X-uuid'` (additive insert leaves existing rooms untouched)

### Requirement: Upgrade event SHALL surface a UI notification banner

The system SHALL display a celebratory banner when `TickResult.upgradedTo` is set. The banner SHALL:

- Appear at the top of the viewport (similar position to offline-cap notice)
- Display text containing the new tier name and a summary of unlocked rooms (e.g., `升級為 區域醫院！+1 門診 +1 手術房`)
- Auto-dismiss after 8 seconds (longer than the 5-second offline-cap notice)
- Apply throttling to prevent spam when multiple tiers cross in rapid succession — at most one banner visible at a time; the latest upgrade event replaces any in-flight banner

#### Scenario: Banner displays after 區域 upgrade

- **GIVEN** the player has just upgraded from 診所 to 區域醫院
- **WHEN** `TickResult.upgradedTo = '區域醫院'` reaches the App component
- **THEN** the banner SHALL be rendered with text containing `'區域醫院'`
- **AND** the banner SHALL be visible for 8 seconds
- **AND** after 8 seconds, the banner SHALL be removed from the DOM

#### Scenario: Rapid double upgrade shows latest tier only

- **GIVEN** a single tick produces `upgradedTo = '醫學中心'` (skipping 區域醫院 banner)
- **WHEN** the App renders
- **THEN** the banner SHALL display `'醫學中心'`
- **AND** no `'區域醫院'` banner SHALL be visible

### Requirement: HomePage SHALL display current tier and progress to next

The HomePage banner SHALL display, in addition to revenue and reputation counters, a tier line above or within the counter banner showing:

- Current tier name (e.g., `「醫院：診所」`)
- Progress to next tier as a fraction (e.g., `「(聲望 234 / 1,000 → 區域醫院)」`)
- If current tier is `'醫學中心'` (terminal): just show the tier name with a ⭐ suffix indicating max tier

The display SHALL be reactive to counter updates via `liveQuery`.

#### Scenario: Tier badge shows fraction to next

- **GIVEN** `gameCounters = { tier: '診所', reputation: 234 }`
- **WHEN** the HomePage renders
- **THEN** the tier line SHALL contain `'診所'`
- **AND** the tier line SHALL contain `'234'`
- **AND** the tier line SHALL contain `'1,000'` (or `'1000'`)
- **AND** the tier line SHALL contain `'區域醫院'`

#### Scenario: Terminal tier shows star

- **GIVEN** `gameCounters.tier = '醫學中心'`
- **WHEN** the HomePage renders
- **THEN** the tier line SHALL contain `'醫學中心'`
- **AND** the tier line SHALL contain `'⭐'`
- **AND** the tier line SHALL NOT contain a `'→'` arrow (no next tier)

### Requirement: Hospital page header SHALL display tier name alongside throughput

The `/hospital` route header SHALL be enriched to display:

- Current tier name
- Total throughput across assigned rooms (existing behavior from `hospital-tycoon-engine`)
- Room count summary (`房間 N/M` where N = assigned, M = total rooms at current tier)

Example format: `診所 · 總產能 20.0 患者/分 · 房間 1/3`.

#### Scenario: Hospital page header reflects current tier

- **GIVEN** `gameCounters.tier = '區域醫院'`
- **AND** 2 of 5 rooms have assigned doctors with throughput summing to 30 patients/min
- **WHEN** the `/hospital` page renders
- **THEN** the header SHALL contain `'區域醫院'`
- **AND** the header SHALL contain `'30.0 患者/分'`
- **AND** the header SHALL contain `'2/5'` (or equivalent format containing `2` and `5`)
