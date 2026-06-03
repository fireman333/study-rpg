## MODIFIED Requirements

### Requirement: Tier upgrade thresholds SHALL be locked literal constants

The system SHALL export `TIER_UPGRADE_THRESHOLDS: Record<HospitalTier, number | null>` with the following locked values, **recalibrated by `add-hospital-equipment-medexam2` (2026-05-23) to bump the T4 threshold 2× alongside the new equipment gate. Owner reported the original `add-quiz-economy-redesign` calibration (150k → ~day 30 reach) felt too rushed; doubled threshold + math-verified daily rate of ~5k rep/day yields a ~60-day total game arc / ~30-day endgame phase from 醫學中心 unlock at 80k**:

| Current tier | Reputation threshold to advance | Next tier |
|---|---|---|
| 診所 | **30,000** (unchanged) | 區域醫院 |
| 區域醫院 | **80,000** (unchanged) | 醫學中心 |
| 醫學中心 | **300,000** (was 150,000) | 國家級教學醫院 |
| 國家級教學醫院 | `null` (terminal, unchanged) | — |

These thresholds SHALL be recorded as literals in `packages/content-medexam2-tw/src/clinic-tiers.ts`. The 30k and 80k values remain frozen — players have already crossed those gates at these values; bumping would not affect them. Only the 醫學中心 key changes, gated by the T3 → T4 transition.

Subsequent tuning SHALL replace these values via a new change, not silently recompute them.

The recalibration is paired with two complementary T4 changes (see the「Tier upgrade SHALL fire...」requirement modified in this same change):
- New equipment gate (≥ 3 unique equipment installed)
- Existing diversification gate (10 P2+ subjects + 1 P1 doctor)

Together these three gates make the T4 upgrade a meaningful capital-investment milestone (extending the endgame phase by ~30 days vs the prior calibration) rather than a reputation-grind that ends the game in ~30 days from scratch.

Tuning constants SHALL be flagged `// TUNED 2026-05-23 — T4 threshold bumped 150k → 300k alongside equipment gate; revisit after 2-week telemetry` in source.

#### Scenario: 診所 threshold lookup returns unchanged value

- **GIVEN** `TIER_UPGRADE_THRESHOLDS['診所']`
- **WHEN** the value is read
- **THEN** it SHALL equal `30000`

#### Scenario: 區域醫院 threshold lookup returns unchanged value

- **GIVEN** `TIER_UPGRADE_THRESHOLDS['區域醫院']`
- **WHEN** the value is read
- **THEN** it SHALL equal `80000`

#### Scenario: 醫學中心 threshold lookup returns bumped value

- **GIVEN** `TIER_UPGRADE_THRESHOLDS['醫學中心']`
- **WHEN** the value is read after this change applies
- **THEN** it SHALL equal `300000` (was `150000` before this change)

#### Scenario: Terminal tier has null threshold

- **GIVEN** `TIER_UPGRADE_THRESHOLDS['國家級教學醫院']`
- **WHEN** the value is read
- **THEN** it SHALL be `null`

#### Scenario: Existing T3 saves above old threshold (150k) but below new threshold (300k) do NOT auto-upgrade

- **GIVEN** an existing save with `tier = '醫學中心'` and `reputation = 200,000` (above the old 150k threshold, below the new 300k)
- **WHEN** the next tick fires after the recalibration ships
- **AND** the diversification + P1 + equipment gates are all satisfied
- **THEN** the tier SHALL NOT upgrade to `'國家級教學醫院'` (300k reputation gate not yet met)
- **AND** the accumulated 200,000 reputation SHALL NOT be reset; it counts toward the new 300k target
- **AND** the HomePage SHALL surface the new 300k target so the player understands the recalibration

#### Scenario: Pre-existing T4 saves retain tier despite new threshold

- **GIVEN** an existing save with `tier = '國家級教學醫院'` and `reputation = 200,000` (already crossed T4 at the old 150k threshold)
- **WHEN** the next tick fires after the recalibration ships
- **THEN** the tier SHALL remain `'國家級教學醫院'` (tier monotonicity per Requirement 1 prevents regression)
- **AND** no shortfall SHALL display (terminal tier hides progress lines)

### Requirement: Tier upgrade SHALL fire when reputation AND diversification dual-gate both satisfied during a tick

The system SHALL check tier advancement at the end of every `runTick()` transaction. Upgrade SHALL fire ONLY if BOTH gates pass for T1→T2 and T2→T3 transitions, and ALL THREE gates pass for the T3→T4 transition:

1. **Reputation gate**: `reputation >= TIER_UPGRADE_THRESHOLDS[currentTier]`
2. **Diversification gate**: `countDistinctSubjectsAtRarity(minRarity) >= requiredDiversification`
3. **Equipment gate (T3→T4 only)**: `uniqueOwnedEquipmentCount >= 3` — where the count is the number of distinct `equipmentId` rows in the `hospitalEquipment` Dexie table at level ≥ 1

Diversification requirements per tier (unchanged from prior version):

| Current tier → Next | Required: distinct subjects with rarity ≥ R, count ≥ N | Additional |
|---|---|---|
| 診所 → 區域醫院 | 5 distinct subjects (any rarity) | — |
| 區域醫院 → 醫學中心 | 8 distinct subjects with rarity ≥ P3 | — |
| 醫學中心 → 國家級教學醫院 | 10 distinct subjects with rarity ≥ P2 | AND ≥ 1 P1 doctor (any subject — duplicate-subject P1 counts) **AND ≥ 3 unique equipment installed at level ≥ 1** |

The relaxation from 12 → 10 P2+ subjects (and P1 not requiring unique subject) reflects 二階 corpus having only 14 subjects total — 85% coverage at P2 rarity was infeasible within the 30-day endgame target. The P1 requirement remains as a "must have at least one top-tier doctor" gate but does not bottleneck on subject collection.

The equipment gate is new (added 2026-05-23 via `add-hospital-equipment-medexam2` change). It applies ONLY to the T3→T4 transition; lower tiers continue to evaluate only reputation + diversification. Pre-existing T4 saves are grandfathered per tier monotonicity — the gate is checked only at fresh upgrade evaluation, not retroactively.

`countDistinctSubjectsAtRarity(minRarity)` SHALL return the count of unique `subjectId` values across all doctors (assigned or bench) where `rarityIsAtLeast(doctor.rarity, minRarity)`. Rarity ordering: `P1 > P2 > P3 > P4 > P5`.

If any gate passes but another fails, the upgrade SHALL NOT fire; the player SHALL continue accumulating the missing resource(s) but the UI SHALL display each gate's shortfall separately (reputation / diversification / equipment). The player SHALL never "lose" excess reputation accumulated past the threshold.

Multiple tier crossings in one tick (e.g., reputation jumps from 500 to 250,000 during a long session) SHALL evaluate the relevant gates for each intermediate tier independently — a tier SHALL advance only if all of its gates are satisfied at that moment.

#### Scenario: Both gates satisfied at T1 advances to 區域醫院

- **GIVEN** `gameCounters = { tier: '診所', reputation: 29,950 }`, 5 distinct subjects with any rarity, and a tick computes `deltaReputation = 100`
- **WHEN** `runTick()` completes
- **THEN** `gameCounters.tier` SHALL equal `'區域醫院'`
- **AND** the equipment gate SHALL NOT be checked (only applies to T3→T4)

#### Scenario: Reputation gate met at T1 but diversification fails — no upgrade

- **GIVEN** `gameCounters = { tier: '診所', reputation: 60,000 }`, only 3 distinct subjects (need 5 for 區域醫院)
- **WHEN** `runTick()` completes
- **THEN** `gameCounters.tier` SHALL still equal `'診所'`
- **AND** the equipment gate SHALL NOT be checked

#### Scenario: T3 → T4 succeeds with all three gates passing

- **GIVEN** `gameCounters = { tier: '醫學中心', reputation: 320,000 }`, 10 distinct P2+ subjects, 2 P1 doctors, and 3 owned equipment at L1 (e.g., CT / ECMO / endoscopy)
- **WHEN** `runTick()` completes
- **THEN** `gameCounters.tier` SHALL equal `'國家級教學醫院'`

#### Scenario: T3 → T4 blocked by equipment gate

- **GIVEN** `gameCounters = { tier: '醫學中心', reputation: 320,000 }`, 10 distinct P2+ subjects, 1 P1 doctor, but only 2 owned equipment (need 3)
- **WHEN** `runTick()` completes
- **THEN** `gameCounters.tier` SHALL still equal `'醫學中心'`
- **AND** the HomePage banner SHALL display the equipment shortfall `「設備：2 / 3」`
- **AND** the reputation / diversification / P1 lines SHALL each show ✓ ready

#### Scenario: T3 → T4 blocked by all three gates' partial state

- **GIVEN** `gameCounters = { tier: '醫學中心', reputation: 100,000 }`, 8 distinct P2+ subjects, 0 P1 doctors, 1 owned equipment
- **WHEN** `runTick()` completes
- **THEN** `gameCounters.tier` SHALL still equal `'醫學中心'`
- **AND** the HomePage SHALL display all three shortfalls: `「聲望 100,000 / 300,000」` + `「P2+ 科別 8 / 10」` + `「需 1 P1 doctor (目前 0)」` + `「設備 1 / 3」`

#### Scenario: Pre-existing T4 save grandfathered with 0 equipment

- **GIVEN** a player save was at `tier = '國家級教學醫院'` before this change ships (upgraded at the old 150k threshold), with 0 rows in `hospitalEquipment` and `reputation = 200,000` (above old threshold but below new 300k)
- **WHEN** the upgraded code runs the next tick
- **THEN** `gameCounters.tier` SHALL remain `'國家級教學醫院'`
- **AND** no tier downgrade SHALL occur (tier is monotonic per Requirement 1)
- **AND** the player MAY purchase equipment to unlock multipliers but is not obligated

#### Scenario: T3 player above old threshold but below new threshold continues grinding

- **GIVEN** a T3 save that crossed `reputation = 150,000` before this change shipped (was about to T4 under old calibration) and has 10 P2+ subjects + 1 P1 + 3 equipment installed
- **WHEN** the upgraded code runs the next tick
- **THEN** `gameCounters.tier` SHALL still equal `'醫學中心'` (300k threshold not yet met)
- **AND** the accumulated reputation SHALL NOT be reset; player keeps the 150k+ already earned
- **AND** the HomePage SHALL surface the new 300k target

#### Scenario: T3 → T4 equipment gate counts unique IDs, not total levels

- **GIVEN** `gameCounters = { tier: '醫學中心', reputation: 320,000 }`, 10 distinct P2+ subjects, 1 P1 doctor, and the player owns CT at L3 only (1 unique equipment ID)
- **WHEN** `runTick()` completes
- **THEN** `gameCounters.tier` SHALL still equal `'醫學中心'`
- **AND** the equipment count shortfall SHALL show `「設備 1 / 3」` (L3 still counts as 1 unique, not 3)

### Requirement: HomePage SHALL display current tier and dual-gate progress

The HomePage banner SHALL display, in addition to revenue / reputation / totalStudyMinutes counters, a tier line showing:

- Current tier name (rendered via `tierLabel()` per `hospital-management-mode` capability, e.g., `「醫院：診所」`)
- Reputation progress to next tier as a fraction (e.g., `「(聲望 234 / 30,000 → 區域)」`)
- Diversification progress as a separate line (e.g., `「(科別 3 / 5)」` or `「(P3+ 科別 5 / 8)」`)
- **For T3 (醫學中心) targeting T4 (大廟)**: an additional equipment line `「(設備 N / 3)」` showing unique equipment count progress
- If current tier is `'國家級教學醫院'` (terminal): just show the tier name with a ⭐ suffix indicating max tier

All progress indicators SHALL turn green (or use a "ready" indicator) when their respective gate passes; the actual upgrade fires at the next tick.

The equipment progress line SHALL be hidden at tiers 診所 / 區域醫院 (gate doesn't apply there) and at 國家級教學醫院 (terminal tier).

#### Scenario: Tier badge at T3 shows three progress lines

- **GIVEN** `gameCounters = { tier: '醫學中心', reputation: 150,000 }` (50% of new threshold), 8 distinct P2+ subjects, 1 P1, and 1 owned equipment
- **WHEN** the HomePage renders
- **THEN** the tier line SHALL contain `'醫中'` (via tierLabel), `'150,000'` (current reputation), `'300,000'` (new threshold per the「Tier upgrade thresholds SHALL be locked literal constants」 modified requirement in this change), `'大廟'`
- **AND** the diversification line SHALL show `'8 / 10 P2+ 科別'` with no ready indicator
- **AND** the equipment line SHALL show `'設備 1 / 3'` with no ready indicator

#### Scenario: T1 player does not see equipment line

- **GIVEN** `gameCounters.tier = '診所'`
- **WHEN** the HomePage renders
- **THEN** the equipment line SHALL NOT be rendered (only applies T3→T4)
- **AND** the reputation + diversification lines SHALL render as before

#### Scenario: Terminal tier hides all progress lines

- **GIVEN** `gameCounters.tier = '國家級教學醫院'`
- **WHEN** the HomePage renders
- **THEN** the tier line SHALL contain `'大廟'` and `'⭐'`
- **AND** the diversification / equipment lines SHALL both be hidden
