## MODIFIED Requirements

### Requirement: Resolved spriteKey SHALL support male / female variants

The `doctor.spriteKey` written to persistence SHALL be resolved at roll time via a `resolveSpriteKey(subjectId, rarity, themeSprites)` helper. The helper SHALL:

1. With **50% probability**, prefer the female variant key `doctor-<subjectId>-<rarity>-female` IF that key exists in the active theme pack's sprite registry
2. Otherwise (or in the remaining 50%), use the legacy key `doctor-<subjectId>-<rarity>`

The fallback chain for downstream sprite rendering SHALL remain:

```
spriteKey (as resolved above)
  → doctor-<subjectId>-<rarity>           (legacy male, always exists if subject is in roster)
  → doctor-default-<rarity>               (rarity fallback)
  → doctor-default-P3                     (terminal fallback)
```

The deterministic starter pull (the first 2 free doctors granted on fresh save) SHALL NOT invoke the random picker — those continue to use the legacy `doctor-<subjectId>-<rarity>` key directly to keep starter pull behavior reproducible for testing.

#### Scenario: Roll picks female variant when available and RNG ≤ 0.5

- **GIVEN** a player rolls a 內科 P3 doctor
- **AND** the active theme pack includes both `doctor-內科-P3.png` and `doctor-內科-P3-female.png`
- **AND** the RNG provider returns `0.3` for the gender pick
- **WHEN** the gacha service writes the doctor row
- **THEN** `doctor.spriteKey` SHALL equal `"doctor-內科-P3-female"`

#### Scenario: Roll picks male variant when RNG > 0.5

- **GIVEN** a player rolls a 內科 P3 doctor
- **AND** the active theme pack includes both `doctor-內科-P3.png` and `doctor-內科-P3-female.png`
- **AND** the RNG provider returns `0.7` for the gender pick
- **WHEN** the gacha service writes the doctor row
- **THEN** `doctor.spriteKey` SHALL equal `"doctor-內科-P3"`

#### Scenario: Roll falls back to male when female variant not in theme pack

- **GIVEN** a player rolls a 麻醉科 P2 doctor
- **AND** the active theme pack includes `doctor-麻醉科-P2.png` only (no `-female` variant)
- **AND** the RNG provider returns `0.3` for the gender pick (would prefer female)
- **WHEN** the gacha service writes the doctor row
- **THEN** `doctor.spriteKey` SHALL equal `"doctor-麻醉科-P2"` (fallback because female key not in registry)

#### Scenario: Starter pull SHALL NOT invoke random picker

- **GIVEN** a fresh save with `hasUsedStarterPull = false`
- **WHEN** the player picks 內科 from the starter pull modal
- **AND** the RNG provider would return `0.3` (preference for female)
- **THEN** the granted doctor's `spriteKey` SHALL equal `"doctor-內科-P5"` (the deterministic starter key, not `"doctor-內科-P5-female"`)
- **AND** `gachaStats.totalRolls` SHALL NOT be incremented (starter pull is free, separate counter path)
