## MODIFIED Requirements

### Requirement: Tier upgrade thresholds SHALL be locked literal constants

The system SHALL export `TIER_UPGRADE_THRESHOLDS: Record<HospitalTier, number | null>` with the following locked values, **recalibrated to align with the 30-day endgame pacing target under the quiz-economy-redesign reward formula (see `add-quiz-economy-redesign` change for math model derivation)**:

| Current tier | Reputation threshold to advance | Next tier |
|---|---|---|
| 診所 | **30,000** | 區域醫院 |
| 區域醫院 | **80,000** | 醫學中心 |
| 醫學中心 | **150,000** | 國家級教學醫院 |
| 國家級教學醫院 | `null` (terminal) | — |

These thresholds SHALL be recorded as literals in `packages/content-medexam2-tw/src/clinic-tiers.ts`. Subsequent tuning SHALL replace them via a new change, not silently recompute them.

The recalibration assumes the typical 30-day player profile:
- ~600 min pure quiz (1200 correct attempts, ~1000 fresh correct distinct questionIds)
- ~200 min reading session active (~100 min overlap with quiz for ×1.5 buff)
- Avg specialty multiplier 1.15 (mixed pool of same-subject and cross-subject doctor partners)
- Mid-game throughput ~80/min idle base (multiplied by `READING_IDLE_RATE_REDUCTION = 0.3`)

Target accumulated reputation at day 30 under this profile is approximately 129,000, with `醫學中心 → 國家級教學醫院` threshold at 150,000 providing a "few more days to terminal tier" tail (preventing day-30 over-shoot with nothing left).

Tuning constants SHALL be flagged `// TUNED 2026-05-18 — first dogfood pass; revisit after 1-2 weeks of telemetry` in source.

#### Scenario: 診所 threshold lookup returns recalibrated value

- **GIVEN** `TIER_UPGRADE_THRESHOLDS['診所']`
- **WHEN** the value is read
- **THEN** it SHALL equal `30000`

#### Scenario: 區域醫院 threshold lookup returns recalibrated value

- **GIVEN** `TIER_UPGRADE_THRESHOLDS['區域醫院']`
- **WHEN** the value is read
- **THEN** it SHALL equal `80000`

#### Scenario: 醫學中心 threshold lookup returns recalibrated value

- **GIVEN** `TIER_UPGRADE_THRESHOLDS['醫學中心']`
- **WHEN** the value is read
- **THEN** it SHALL equal `150000`

#### Scenario: Terminal tier has null threshold

- **GIVEN** `TIER_UPGRADE_THRESHOLDS['國家級教學醫院']`
- **WHEN** the value is read
- **THEN** it SHALL be `null`

#### Scenario: Existing saves with reputation between old and new thresholds auto-upgrade on next tick

- **GIVEN** an existing v4 save with `tier = '診所'` and `reputation = 35000` (was below old threshold 48000, now above new threshold 30000)
- **WHEN** the next tick fires after the recalibration ships
- **AND** the diversification gate (P5 5 subjects) is satisfied
- **THEN** the tier SHALL upgrade to `區域醫院` (per existing dual-gate logic)
- **AND** the player SHALL see the tier-up notification once
- **AND** the upgrade SHALL not double-fire on subsequent ticks (already-upgraded tier is monotonic)
