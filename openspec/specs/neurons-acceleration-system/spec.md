# neurons-acceleration-system Specification

## Purpose

A single 加速系統 (acceleration system) layered over the neurons-tw maze neural-energy economy, governing all speed·energy boosts under one boost-composition + hard-cap contract with two persistence forms: transient **consumables** (a manual-activate backpack/inventory) and durable **permanent equipment/companions** (a P1–P5 rarity collection). Both forms feed two additive `1 + Σbonus` pools (`energyAccel` clamped to `ENERGY_ACCEL_CAP`, `speedAccel` clamped to `SPEED_ACCEL_CAP`) composed onto the maze's existing multiplicative faucet (`streak × mastery`). Acquisition is via the DMN deck (consumables common, permanent equipment at low probability) — there is no IAP / real-money path. State persists via additive Dexie v16 (`inventory` + `equipment` tables) + R2 neurons bundle SCHEMA_VERSION 16, with reader tolerance and a v15→v16 upgrade fixture.

## Requirements

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

### Requirement: Permanent equipment SHALL have real artwork registered in `theme-pixel-neurons`

The `neurons-acceleration-system` capability SHALL ensure that every permanent-equipment sprite key (`equipment:<equipmentId>` for each entry in `EQUIPMENT_CATALOG`, currently 12) resolves in `theme-pixel-neurons`'s `SPRITE_MAP` to a real pixel-art PNG file at `packages/theme-pixel-neurons/sprites/equipment/<equipmentId>.png`, NOT the 1×1 transparent-PNG data URI placeholder shipped during `add-neurons-acceleration-system`.

Each equipment sprite SHALL visually communicate at least two identity dimensions:

1. **Neuroscience anchor** named in the equipment's `displayName` / `description` (e.g., `eq-fully-myelinated-axon-p1` → a heavily myelin-wrapped axon cable; `eq-mitochondrial-powerhouse-p1` → a mitochondrion with cristae; `eq-sodium-potassium-pump-p2` → a membrane pump moving Na⁺/K⁺ ions; `eq-oligodendrocyte-companion-p3` → an oligodendrocyte cell companion wrapping myelin).
2. **Lane** via palette — the `speed` lane (myelin / conduction) SHALL read in gold / white myelin with cyan conduction accents; the `energy` lane (pump / metabolic) SHALL read in warm amber / orange metabolic tones — so the two lanes are visually separable in the equipment dex.

Equipment sprites SHALL be 384×384 PNG with transparent background and 16-color quantization (GBA-era pixel-art aesthetic), consistent with the documented `image_gen_routing.md` recipe used by sibling changes `generate-neurons-sprites` and `generate-dmn-card-artworks`. Rarity (P1–P5) MAY additionally be conveyed via aura intensity (P1 radiant → P5 plain), reinforcing — not replacing — the dex's rarity grouping.

Equipment are **independent following-companion / aura sprites**, NOT body-worn gear composited onto the neuron; the sprite is a self-contained collectible object (or, for the glial-cell entries, a cute companion creature).

This requirement permits other sprite categories declared by `theme-pixel-neurons` (items / cosmetics / skill placeholders / 6 core scaffold keys) to remain on the transparent-PNG placeholder until their respective consumer capabilities ship.

#### Scenario: Theme pack ships real artwork per equipment

- **GIVEN** the `neurons-acceleration-system` capability is active and `theme-pixel-neurons` is loaded
- **WHEN** a consumer (`EquipmentDexPanel`, `DmnDrawModal` equipment reveal, etc.) reads `SPRITE_MAP['equipment:eq-mitochondrial-powerhouse-p1']`
- **THEN** the resolved URL SHALL point to a real PNG file under `packages/theme-pixel-neurons/sprites/equipment/`
- **AND** the resolved URL SHALL NOT be the 1×1 transparent-PNG data URI placeholder

#### Scenario: All 12 equipment ids covered with distinct sprites

- **GIVEN** the 12 `equipmentId` values declared by `EQUIPMENT_CATALOG` in `@study-rpg/content-neurons-tw`
- **WHEN** the developer iterates over those ids and checks `SPRITE_MAP['equipment:' + id]`
- **THEN** each lookup SHALL return a real PNG URL (not the transparent placeholder)
- **AND** no two equipment SHALL share the same sprite file

#### Scenario: Lane is distinguishable at a glance

- **GIVEN** a user opens the equipment dex showing speed-lane and energy-lane items
- **WHEN** the user visually scans without reading labels
- **THEN** speed-lane equipment SHALL read in gold / white myelin + cyan tones
- **AND** energy-lane equipment SHALL read in warm amber / orange metabolic tones
