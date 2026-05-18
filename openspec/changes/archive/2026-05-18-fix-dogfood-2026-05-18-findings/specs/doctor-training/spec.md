## MODIFIED Requirements

### Requirement: Doctor training SHALL upgrade rarity probabilistically with revenue cost

The system SHALL provide a doctor training mechanic where the player selects a target doctor and pays revenue to attempt a rarity upgrade. Cost and base success rate SHALL follow this locked table:

| Current rarity | Target rarity | Revenue cost | Base success rate |
|---|---|---|---|
| P5 | P4 | 1,000 | 50% |
| P4 | P3 | 5,000 | 30% |
| P3 | P2 | 25,000 | 15% |
| P2 | P1 | 125,000 | 5% |

P1 doctors SHALL NOT be upgradeable (terminal rarity). On attempt resolution: if success, the doctor's rarity SHALL advance one tier and `powerMultiplier` SHALL recalculate from `RARITY_POWER_MULTIPLIER`. If failure, the revenue SHALL be deducted but rarity SHALL remain unchanged (no downgrade).

On a successful training attempt, the doctor's `spriteKey` SHALL be regenerated for the new rarity. Gender encoding (the `-female` suffix on the existing spriteKey, if present) SHALL be preserved across rarity changes:

- If the doctor's current `spriteKey` ends with `-female`, the new `spriteKey` SHALL also end with `-female` (e.g., `doctor-內科-P5-female` trained to P4 becomes `doctor-內科-P4-female`).
- Otherwise the new `spriteKey` SHALL be the base form `doctor-{subjectId}-{newRarity}` with no gender suffix.

This contract relies on `theme-pixel-hospital` exporting all `{subjectId × rarity × {base, female}}` sprite keys; the theme pack is the single source of truth for sprite key availability.

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

#### Scenario: Successful training preserves female sprite key suffix

- **GIVEN** a P5 doctor with `spriteKey = 'doctor-內科-P5-female'`
- **WHEN** the player initiates training and the attempt succeeds
- **THEN** the doctor's `rarity` SHALL equal `'P4'`
- **AND** the doctor's `spriteKey` SHALL equal `'doctor-內科-P4-female'` (gender suffix preserved)
- **AND** the doctor SHALL render with the female sprite asset in all surfaces (HomePage, AssignDoctorModal, study session scene)

#### Scenario: Successful training preserves base sprite key when no gender suffix

- **GIVEN** a P5 doctor with `spriteKey = 'doctor-外科-P5'` (base / male sprite)
- **WHEN** the player initiates training and the attempt succeeds
- **THEN** the doctor's `rarity` SHALL equal `'P4'`
- **AND** the doctor's `spriteKey` SHALL equal `'doctor-外科-P4'` (no suffix added)
- **AND** the doctor SHALL render with the base sprite asset
