# doctor-training Specification

## Purpose

醫師進修 (training) — 消耗營收以機率升級醫師 rarity。失敗只損營收、不掉 rarity；同醫師連續失敗 5 次後第 6 次必中（pity 保底）。Pure logic in content-pack `training.ts`; atomic transaction in app-layer `services/training.ts`.

## Requirements
### Requirement: Doctor training SHALL upgrade rarity probabilistically with revenue cost

The system SHALL provide a doctor training mechanic where the player selects a target doctor and pays revenue to attempt a rarity upgrade. Cost and base success rate SHALL follow this locked table:

| Current rarity | Target rarity | Revenue cost | Base success rate |
|---|---|---|---|
| P5 | P4 | 1,000 | 50% |
| P4 | P3 | 5,000 | 30% |
| P3 | P2 | 25,000 | 15% |
| P2 | P1 | 125,000 | 5% |

P1 doctors SHALL NOT be upgradeable (terminal rarity). On attempt resolution: if success, the doctor's rarity SHALL advance one tier and `powerMultiplier` SHALL recalculate from `RARITY_POWER_MULTIPLIER`. If failure, the revenue SHALL be deducted but rarity SHALL remain unchanged (no downgrade).

#### Scenario: Successful P3 → P2 upgrade

- **GIVEN** a P3 doctor and `gameCounters.revenue = 30,000`
- **WHEN** the player initiates training and the RNG resolves to success (15% probability hit)
- **THEN** the doctor's rarity SHALL equal `'P2'`
- **AND** the doctor's `powerMultiplier` SHALL equal `3.5`
- **AND** `gameCounters.revenue` SHALL equal `5,000`

#### Scenario: Failed P3 → P2 attempt preserves rarity

- **GIVEN** a P3 doctor and `gameCounters.revenue = 30,000`
- **WHEN** the player initiates training and the RNG resolves to failure (85% probability)
- **THEN** the doctor's rarity SHALL still equal `'P3'`
- **AND** `gameCounters.revenue` SHALL equal `5,000`

#### Scenario: P1 doctor cannot be trained

- **GIVEN** a P1 doctor
- **WHEN** the player opens the training UI for this doctor
- **THEN** the training button SHALL be disabled
- **AND** a message SHALL state「已達最高級別」or equivalent

### Requirement: Insufficient revenue SHALL block training attempt

The system SHALL verify `gameCounters.revenue >= cost` BEFORE deducting and rolling. If the check fails, the attempt SHALL abort with no state mutation, and the UI SHALL display an insufficient-funds message.

#### Scenario: Insufficient revenue aborts training

- **GIVEN** a P3 doctor and `gameCounters.revenue = 20,000` (cost is 25,000)
- **WHEN** the player initiates training
- **THEN** no RNG roll SHALL occur
- **AND** `gameCounters.revenue` SHALL remain at `20,000`
- **AND** the doctor's rarity SHALL remain at `'P3'`
- **AND** the UI SHALL display an error message

### Requirement: Per-doctor pity counter SHALL guarantee success after 5 consecutive failures

The system SHALL track `pityCounter: number` per doctor (default 0). On each training attempt:

- If the attempt fails, `pityCounter` SHALL increment by 1
- If the attempt succeeds, `pityCounter` SHALL reset to 0
- If `pityCounter >= 5` before the roll, the attempt SHALL deterministically succeed (skip RNG); revenue still deducted; pity reset to 0

The pity counter SHALL persist across game sessions and SHALL NOT reset when the target rarity changes (e.g., 5 failed P3→P2 attempts on doctor X applies to the next attempt regardless of whether it targets P2 or a different upgrade).

#### Scenario: 6th attempt auto-succeeds after 5 failures

- **GIVEN** a P3 doctor with `pityCounter = 5` (from 5 prior failed P3→P2 attempts)
- **WHEN** the player initiates a 6th training attempt with sufficient revenue
- **THEN** the attempt SHALL succeed regardless of RNG
- **AND** the doctor's rarity SHALL equal `'P2'`
- **AND** the doctor's `pityCounter` SHALL reset to `0`

#### Scenario: Pity counter persists across reload

- **GIVEN** a doctor with `pityCounter = 3`
- **WHEN** the app reloads
- **THEN** the doctor's `pityCounter` SHALL still equal `3` after rehydration from IndexedDB

### Requirement: Training history SHALL be persisted for telemetry

The system SHALL append a row to `trainingHistory` table for every training attempt with:

- `attemptedAt: number` — Unix ms timestamp
- `doctorId: string` — target doctor
- `fromRarity: Rarity` — rarity before attempt
- `toRarityIfSuccess: Rarity` — target rarity
- `success: boolean` — outcome
- `pityTriggered: boolean` — true if pity short-circuited the RNG
- `revenueSpent: number` — cost paid

#### Scenario: Each attempt creates a history row

- **GIVEN** a clean `trainingHistory` table
- **WHEN** the player completes 3 training attempts on the same doctor (2 failed, 1 succeeded)
- **THEN** `trainingHistory` SHALL contain exactly 3 rows
- **AND** the rows SHALL be ordered by `attemptedAt`
- **AND** exactly 2 rows SHALL have `success: false`
- **AND** exactly 1 row SHALL have `success: true`
