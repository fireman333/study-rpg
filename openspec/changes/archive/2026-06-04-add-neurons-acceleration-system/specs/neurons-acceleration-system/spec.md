## ADDED Requirements

### Requirement: Acceleration boosts SHALL compose additively into two hard-capped pools

The system SHALL maintain two acceleration multipliers derived from active consumables and owned permanents, each an additive `1 + Σbonus` pool clamped to a hard cap:

```
energyAccel = min(ENERGY_ACCEL_CAP, 1 + Σ(active consumable energyBonus) + Σ(owned permanent energyBonus))
speedAccel  = min(SPEED_ACCEL_CAP,  1 + Σ(active consumable speedBonus)  + Σ(owned permanent speedBonus))
```

`ENERGY_ACCEL_CAP` SHALL default to `2.5` and `SPEED_ACCEL_CAP` to `2.0` (dogfood-tunable game-loop constants, NOT OE-anchored). The composition SHALL be additive (sum of bonuses), never multiplicative, so that the cap is a predictable ceiling guarding against positive-feedback runaway.

#### Scenario: Bonuses sum additively below the cap
- **WHEN** the player has one active consumable (+1.0 energy) and owns two permanents (+0.30, +0.10 energy)
- **THEN** `energyAccel` SHALL equal `1 + 1.0 + 0.30 + 0.10 = 2.40`

#### Scenario: Pool is clamped at the hard cap
- **WHEN** the additive sum for the energy pool would reach `1 + 1.8 = 2.8`
- **THEN** `energyAccel` SHALL be clamped to `ENERGY_ACCEL_CAP` (2.5)

#### Scenario: Empty pool is identity
- **WHEN** no consumable is active and no permanent is owned
- **THEN** `energyAccel` and `speedAccel` SHALL each equal `1.0` (no effect)

### Requirement: Consumables SHALL live in a manual-activate backpack inventory

Drawn consumable effects SHALL NOT auto-fire on draw. Each drawn consumable SHALL increment a stock count in a new `inventory` Dexie table (`kind` PK, `count`), and the player SHALL choose when to activate from a backpack UI. The backpack SHALL be stackable with no hard capacity cap.

- A **time-limited** consumable (e.g., the reframed `family-buff` energy window) SHALL tick from its activation instant (`activatedAt + durationMs`); while active it contributes its bonus to the additive pool and SHALL be removed on expiry.
- A **one-shot** consumable SHALL be consumed immediately on activation (count decremented, effect applied once).

#### Scenario: Drawing a consumable deposits stock without firing
- **WHEN** the player draws a consumable card
- **THEN** the matching `inventory` row's `count` SHALL increment by 1
- **AND** no buff SHALL become active until the player activates it from the backpack

#### Scenario: Activating a time-limited consumable
- **WHEN** the player activates a time-limited consumable from the backpack
- **THEN** its `inventory.count` SHALL decrement by 1
- **AND** an active-buff row SHALL be created with `expiresAt = now + durationMs`
- **AND** the buff's bonus SHALL contribute to the additive pool until `expiresAt`

#### Scenario: Activating with zero stock is blocked
- **WHEN** a consumable kind's `inventory.count` is 0
- **THEN** the backpack SHALL render that kind as unavailable and activation SHALL be a no-op

### Requirement: Consumable kinds SHALL include OE-anchored speed and energy boosts

The consumable set SHALL include at minimum the reframed `family-buff` (base energy boost) plus two new OE-anchored kinds:

| kind | lane | effect | OE anchor |
|---|---|---|---|
| `family-buff` | energy | the answered/buffed family's maze-energy faucet gains an additive energy bonus for a time window | acute neuromodulatory surge |
| `surge` | speed | exploration `speedAccel` gains an additive bonus for a time window (phasic NE/DA gain modulation) | `10.1038/s41586-022-04782-2` |
| `bolus` | energy | maze-energy faucet gains an additive energy bonus for a time window (acute on-demand lactate substrate) | `10.1038/nrn.2018.19` |

Each kind's bonus magnitude and duration SHALL be defined constants (dogfood-tunable). The reframed `family-buff` SHALL be equivalent to its prior `×2` energy effect expressed as a `+1.0` additive energy bonus while active.

#### Scenario: family-buff reframed as additive energy bonus
- **WHEN** only an activated `family-buff` is in effect for the answered family
- **THEN** `energyAccel` for that family SHALL equal `2.0` (= `1 + 1.0`), preserving the prior `×2` behavior

#### Scenario: surge boosts exploration speed only
- **WHEN** an activated `surge` consumable is in effect
- **THEN** `speedAccel` SHALL include the surge's additive speed bonus
- **AND** `energyAccel` SHALL be unchanged by the surge

### Requirement: Permanent equipment SHALL be a P1–P5 rarity collection with rarity-scaled bonuses

`packages/content-neurons-tw` SHALL export an `EQUIPMENT_CATALOG` of **at least 10** permanent equipment/companion definitions across 5 rarity tiers (P1–P5). Each definition SHALL carry `equipmentId`, `rarity ∈ {P1..P5}`, `lane ∈ {speed, energy}`, `bonus: number`, and `artworkId`. The `bonus` SHALL scale by rarity so that P5 is negligible and P3-and-above is meaningful (defaults, dogfood-tunable): P1 `+0.30`, P2 `+0.18`, P3 `+0.10`, P4 `+0.04`, P5 `+0.01`. Each equipment SHALL be **owned once** with a fixed bonus (no upgrade ladder in v1).

A build-time validator SHALL reject a catalog with fewer than 10 items, fewer than 2 items in any rarity tier, an invalid `lane`, or a `bonus` not matching its `rarity` default-or-override contract.

#### Scenario: Catalog meets the rarity-collection contract
- **GIVEN** the published `EQUIPMENT_CATALOG`
- **THEN** its length SHALL be ≥ 10
- **AND** every rarity tier P1–P5 SHALL have ≥ 2 items
- **AND** every item's `lane` SHALL be `speed` or `energy`

#### Scenario: Owned permanents sum into the additive pool by lane
- **WHEN** the player owns a P3 speed item (+0.10) and a P1 speed item (+0.30)
- **THEN** the permanent contribution to `speedAccel` SHALL be `+0.40` (before the cap clamp)

### Requirement: Permanent equipment SHALL be acquired via low-probability DMN draws

A DMN draw SHALL first roll `EQUIPMENT_DRAW_RATE` (default ≈ 5%, dogfood-tunable) against the *unowned* equipment pool. On a hit with a non-empty pool, the draw SHALL roll an equipment rarity by `EQUIPMENT_RARITY_WEIGHTS` and award an unowned equipment of that tier (nearest-unowned fallback), recorded in a new `equipment` Dexie table (`equipmentId` PK, `rarity`, `obtainedAt`). Otherwise the draw SHALL fall through to a consumable card roll. When all equipment is owned, draws SHALL never roll equipment.

#### Scenario: Equipment hit awards an unowned permanent
- **GIVEN** the equipment draw roll hits and at least one equipment is unowned
- **WHEN** the draw resolves
- **THEN** exactly one new `equipment` row SHALL be inserted with an `equipmentId` not previously owned
- **AND** no `inventory` (consumable) row SHALL be incremented for that draw

#### Scenario: Equipment draw falls through to consumable when pool exhausted
- **GIVEN** the player owns every equipment in the catalog
- **WHEN** a draw resolves
- **THEN** the equipment roll SHALL be skipped and a consumable card SHALL be rolled instead

### Requirement: Equipment collection SHALL render as a P1–P5 dex independent of the consumable dex

The system SHALL provide an equipment collection view rendering owned equipment vs unowned silhouettes grouped by rarity P1–P5, separate from the consumable DMN closed-cap dex. Owning equipment SHALL never decrement (monotonic) and SHALL sync via monotonic-union merge.

#### Scenario: Equipment dex shows owned vs silhouette
- **WHEN** the player opens the equipment collection
- **THEN** owned equipment SHALL render with art and bonus
- **AND** unowned equipment SHALL render as a rarity-coded silhouette

### Requirement: Acceleration state SHALL persist via additive Dexie v16 + R2 bundle SCHEMA_VERSION 16

The neurons Dexie schema SHALL bump from v15 to v16 adding the `inventory` and `equipment` tables (additive; no primary-key change). The R2 neurons bundle `SCHEMA_VERSION` SHALL bump from 15 to 16 adding `inventory` (LWW per kind) and `equipment` (monotonic-union) adapters, with reader tolerance so a v15 client drops the unknown adapter keys and a v16 client reading a v15 bundle preserves local state. A v15→v16 Dexie upgrade fixture SHALL accompany the schema bump.

#### Scenario: v15 client tolerates a v16 bundle
- **WHEN** a v15 client pulls a bundle authored at SCHEMA_VERSION 16
- **THEN** it SHALL parse the shared keys and silently drop `inventory` / `equipment`
- **AND** it SHALL NOT throw an unsupported-schema error

#### Scenario: v16 upgrade preserves existing data
- **GIVEN** a populated v15 neurons database
- **WHEN** the database opens at v16
- **THEN** the open SHALL succeed without `DatabaseClosedError`
- **AND** existing tables SHALL retain their rows; `inventory` and `equipment` SHALL start empty
