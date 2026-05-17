## MODIFIED Requirements

### Requirement: Hospital tier progression SHALL follow exactly four monotonic tiers

The system SHALL define a `HospitalTier` union with exactly four values: `'診所'`, `'區域醫院'`, `'醫學中心'`, `'國家級教學醫院'`. The system SHALL export `TIER_ORDER` as the ordered array `['診所', '區域醫院', '醫學中心', '國家級教學醫院']`. Tier progression SHALL be strictly monotonic — once advanced, a tier SHALL NOT regress regardless of reputation changes. Reputation itself is monotonic by design (see `hospital-tycoon-engine` capability), so this property is preserved trivially.

#### Scenario: Tier order is exported as canonical array of length 4

- **GIVEN** a developer imports `TIER_ORDER` from `@study-rpg/content-medexam2-tw`
- **WHEN** the import resolves
- **THEN** the array SHALL equal `['診所', '區域醫院', '醫學中心', '國家級教學醫院']`
- **AND** the array SHALL have exactly 4 elements

#### Scenario: Tier never regresses

- **GIVEN** `gameCounters.tier = '醫學中心'` and `reputation = 100,000`
- **WHEN** a future change attempts to set `tier = '區域醫院'` outside of test/migration code paths
- **THEN** the type system SHALL reject the assignment (TypeScript ensures this via `HospitalTier` typing)
- **AND** no runtime code path SHALL include such a downgrade

### Requirement: Tier upgrade thresholds SHALL be locked literal constants

The system SHALL export `TIER_UPGRADE_THRESHOLDS: Record<HospitalTier, number | null>` with the following locked values, recalibrated to align with the 30-day endgame pacing target:

| Current tier | Reputation threshold to advance | Next tier |
|---|---|---|
| 診所 | 48,000 | 區域醫院 |
| 區域醫院 | 192,000 | 醫學中心 |
| 醫學中心 | 2,000,000 | 國家級教學醫院 |
| 國家級教學醫院 | `null` (terminal) | — |

These thresholds SHALL be recorded as literals in `packages/content-medexam2-tw/src/clinic-tiers.ts`. Subsequent tuning SHALL replace them via a new change, not silently recompute them.

#### Scenario: Threshold lookup returns locked value

- **GIVEN** `TIER_UPGRADE_THRESHOLDS['診所']`
- **WHEN** the value is read
- **THEN** it SHALL equal `48000`

#### Scenario: Terminal tier has null threshold

- **GIVEN** `TIER_UPGRADE_THRESHOLDS['國家級教學醫院']`
- **WHEN** the value is read
- **THEN** it SHALL be `null`

### Requirement: Each tier SHALL declare its full room roster as a Room array

The system SHALL export `TIER_ROOMS: Record<HospitalTier, Room[]>` describing the complete room roster for each tier (cumulative — higher tiers include all rooms from lower tiers, plus new ones):

| Tier | Rooms |
|---|---|
| 診所 | 3 outpatient (slots 1, 2, 3) — total 3 |
| 區域醫院 | 4 outpatient (slots 1, 2, 3, 4) + 1 surgery (slot 1) — total 5 |
| 醫學中心 | 4 outpatient (slots 1–4) + 2 surgery (slots 1, 2) + 1 ward (slot 1) — total 7 |
| 國家級教學醫院 | 5 outpatient (slots 1–5) + 3 surgery (slots 1, 2, 3) + 2 ward (slots 1, 2) — total 10 |

All rooms SHALL have `baseRate = 10`, `roomFacility = 1.0`, and `assignedDoctorId = null` as initial values. Room ids SHALL be deterministic per `${type}-${index}` pattern. Slot field SHALL be 1-indexed within each room type for display ordering. Higher tiers SHALL be supersets of lower tiers (same ids preserved across upgrades).

#### Scenario: 國家級教學醫院 tier is the largest roster

- **GIVEN** `TIER_ROOMS['國家級教學醫院']`
- **WHEN** the array is read
- **THEN** it SHALL have length 10
- **AND** exactly 5 entries SHALL have `type === 'outpatient'`
- **AND** exactly 3 entries SHALL have `type === 'surgery'`
- **AND** exactly 2 entries SHALL have `type === 'ward'`

#### Scenario: 國家級教學醫院 superset preserves 醫學中心 ids

- **GIVEN** `TIER_ROOMS['醫學中心']` and `TIER_ROOMS['國家級教學醫院']`
- **WHEN** the ids of 醫學中心 rooms are extracted
- **THEN** every id from 醫學中心 SHALL appear in 國家級教學醫院's roster

### Requirement: Tier upgrade SHALL fire when reputation AND diversification dual-gate both satisfied during a tick

The system SHALL check tier advancement at the end of every `runTick()` transaction. Upgrade SHALL fire ONLY if BOTH gates pass:

1. **Reputation gate**: `reputation >= TIER_UPGRADE_THRESHOLDS[currentTier]`
2. **Diversification gate**: `countDistinctSubjectsAtRarity(minRarity) >= requiredDiversification`

Diversification requirements per tier:

| Current tier → Next | Required: distinct subjects with rarity ≥ R, count ≥ N | Additional |
|---|---|---|
| 診所 → 區域醫院 | 5 distinct subjects (any rarity) | — |
| 區域醫院 → 醫學中心 | 8 distinct subjects with rarity ≥ P3 | — |
| 醫學中心 → 國家級教學醫院 | 10 distinct subjects with rarity ≥ P2 | AND ≥ 1 P1 doctor (any subject — duplicate-subject P1 counts) |

The relaxation from 12 → 10 P2+ subjects (and P1 not requiring unique subject) reflects 二階 corpus having only 14 subjects total — 85% coverage at P2 rarity was infeasible within the 30-day endgame target. The P1 requirement remains as a "must have at least one top-tier doctor" gate but does not bottleneck on subject collection.

`countDistinctSubjectsAtRarity(minRarity)` SHALL return the count of unique `subjectId` values across all doctors (assigned or bench) where `rarityIsAtLeast(doctor.rarity, minRarity)`. Rarity ordering: `P1 > P2 > P3 > P4 > P5`.

If reputation gate passes but diversification gate fails, the upgrade SHALL NOT fire; the player SHALL continue accumulating reputation but the UI SHALL display the diversification shortfall. The player SHALL never "lose" excess reputation accumulated past the threshold.

Multiple tier crossings in one tick (e.g., reputation jumps from 500 to 250,000 during a long session) SHALL evaluate dual-gate for each intermediate tier independently — a tier SHALL advance only if its diversification gate is also satisfied at that moment.

#### Scenario: Both gates satisfied advances tier

- **GIVEN** `gameCounters = { tier: '診所', reputation: 47,950 }`, 5 distinct subjects with any rarity, and a tick computes `deltaReputation = 100`
- **WHEN** `runTick()` completes
- **THEN** `gameCounters.tier` SHALL equal `'區域醫院'`
- **AND** `gameCounters.reputation` SHALL equal `48,050`
- **AND** `db.rooms` SHALL contain all 5 entries from `TIER_ROOMS['區域醫院']`
- **AND** the returned `TickResult.upgradedTo` SHALL equal `'區域醫院'`

#### Scenario: Reputation gate met but diversification fails — no upgrade

- **GIVEN** `gameCounters = { tier: '診所', reputation: 60,000 }`, only 3 distinct subjects (need 5 for 區域醫院)
- **WHEN** `runTick()` completes
- **THEN** `gameCounters.tier` SHALL still equal `'診所'`
- **AND** `TickResult.upgradedTo` SHALL be `undefined`
- **AND** the HomePage banner SHALL display a diversification shortfall message (e.g., `需 5 不同科別醫師（目前 3）`)

#### Scenario: Diversification gate met but reputation fails — no upgrade

- **GIVEN** `gameCounters = { tier: '診所', reputation: 30,000 }`, 8 distinct subjects with P3+
- **WHEN** `runTick()` completes
- **THEN** `gameCounters.tier` SHALL still equal `'診所'`
- **AND** the player SHALL continue accumulating reputation toward 48,000

#### Scenario: 國家級教學醫院 P1 requirement enforced

- **GIVEN** `gameCounters = { tier: '醫學中心', reputation: 2,500,000 }`, 10 distinct P2+ subjects, but 0 doctors at P1 rarity
- **WHEN** `runTick()` completes
- **THEN** `gameCounters.tier` SHALL still equal `'醫學中心'`
- **AND** the UI SHALL display the missing P1 requirement

#### Scenario: Duplicate-subject P1 satisfies P1 requirement

- **GIVEN** `gameCounters = { tier: '醫學中心', reputation: 2,500,000 }`, 10 distinct P2+ subjects, and 2 P1 doctors that are both `subjectId = '內科'` (same subject)
- **WHEN** `runTick()` completes
- **THEN** the P1 requirement SHALL be satisfied (≥ 1 P1 of any subject, including duplicates of subjects already covered by P2+ count)
- **AND** if reputation gate also met, tier SHALL upgrade to `'國家級教學醫院'`

### Requirement: HomePage SHALL display current tier and dual-gate progress

The HomePage banner SHALL display, in addition to revenue / reputation / totalStudyMinutes counters, a tier line showing:

- Current tier name (e.g., `「醫院：診所」`)
- Reputation progress to next tier as a fraction (e.g., `「(聲望 234 / 48,000 → 區域醫院)」`)
- Diversification progress as a separate line (e.g., `「(科別 3 / 5)」` or `「(P3+ 科別 5 / 8)」`)
- If current tier is `'國家級教學醫院'` (terminal): just show the tier name with a ⭐ suffix indicating max tier

Both progress indicators SHALL turn green (or use a "ready" indicator) when their respective gate passes; the actual upgrade fires at the next tick.

#### Scenario: Tier badge shows both gates

- **GIVEN** `gameCounters = { tier: '診所', reputation: 30,000 }` and 3 distinct subjects
- **WHEN** the HomePage renders
- **THEN** the tier line SHALL contain `'診所'`, `'30,000'`, `'48,000'`, `'區域醫院'`
- **AND** the diversification line SHALL show `'3 / 5'`
- **AND** neither line SHALL display the "ready" indicator

#### Scenario: Terminal tier shows star

- **GIVEN** `gameCounters.tier = '國家級教學醫院'`
- **WHEN** the HomePage renders
- **THEN** the tier line SHALL contain `'國家級教學醫院'` and `'⭐'`
- **AND** the diversification line SHALL be hidden
