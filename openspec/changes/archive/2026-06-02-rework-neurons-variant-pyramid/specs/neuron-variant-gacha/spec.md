## MODIFIED Requirements

### Requirement: Variant SHALL be persisted in `neuronVariants` Dexie table with composite primary key `(familyId, slotIndex)`

The Dexie schema SHALL retain the composite primary key `[familyId, slotIndex]`
(NOT changed — Dexie cannot change a PK in an upgrade). `slotIndex` ranges `0..N-1`
where `N` is the family's pyramid total (variants the catalog declares for that
family); **slot 0 SHALL remain the family's P0 apex**. The row shape SHALL be:

```typescript
interface NeuronVariantRow {
  familyId: string
  slotIndex: number          // 0..N-1 (unique within family; 0 = P0 apex)
  rarity: 'P0'|'P1'|'P2'|'P3'|'P4'|'P5'
  displayName: string
  spriteKey: string
  rolledAt: number
  copies: number             // ≥ 1; increments on a dupe pull (Phase 3 consumes)
  wasPityFloor: boolean      // repurposed: true iff a P0 obtained via soft-pity
  provenance?: NeuronVariantProvenance
}
```

`copies` is a non-indexed additive field (no `.stores()` index change). Row content
(`rarity`/`displayName`/`spriteKey`/`provenance`) is immutable after mint; only
`copies` mutates. The `.stores()` index string SHALL remain
`'[familyId+slotIndex], familyId, rolledAt'`.

#### Scenario: New variant persists with copies = 1

- **GIVEN** the player pulls a not-yet-owned `(familyId='藥理學', slotIndex=2)` (a P4)
- **WHEN** the pull resolves
- **THEN** a row SHALL exist with `slotIndex=2`, `rarity='P4'`, `copies=1`, a composed
  `displayName`, the resolved `spriteKey`, and a `rolledAt` timestamp

#### Scenario: Dupe pull increments copies, never duplicates the row

- **GIVEN** a row exists for `(藥理學, 2)` with `copies=1`
- **WHEN** a pull resolves to the same `(藥理學, 2)`
- **THEN** the row's `copies` SHALL become 2
- **AND** the `neuronVariants` row count for that pair SHALL remain 1
- **AND** `rarity` / `displayName` / `rolledAt` SHALL be unchanged

### Requirement: Connectome page family cards SHALL display collected-variant count

The connectome homepage family card SHALL render a `🧬 X / N` chip, where `X` is the
count of `neuronVariants` rows for that `familyId` and `N` is the family's **pyramid
total** (the number of variants the catalog declares for that family). The chip SHALL
update live via `useLiveQuery`. When `X === N` the chip SHALL render a celebratory
variant (gold + 🏆) with no reward side-effect. The chip SHALL be visible even when
nothing is collected (`🧬 0 / N`).

#### Scenario: Chip reflects live count out of the family's pyramid total

- **GIVEN** the `neuronVariants` table contains 3 rows for `familyId='解剖學'` whose
  pyramid total is `N`
- **WHEN** the connectome homepage renders
- **THEN** the 解剖學 card SHALL display `🧬 3 / N`

#### Scenario: Full collection renders the celebratory chip

- **GIVEN** all `N` variants for `familyId='免疫學'` are collected
- **WHEN** the homepage renders
- **THEN** the chip SHALL render `🏆 N / N` with a gold accent and no reward fires

### Requirement: Variant collection SHALL sync via the neurons R2 bundle with copies MAX-merge and cross-version tolerance

The variant collection SHALL sync via the neurons R2 bundle: variants ride inside the `neuronVariants` rows, and the bundle `SCHEMA_VERSION` SHALL bump from 9 to 10 (additive). The `neuronVariants` adapter
SHALL treat row identity `[familyId, slotIndex]` + content as immutable, and on
conflict SHALL resolve `copies = max(local, incoming)` and keep the earliest
`rolledAt` (a MONOTONIC carve-out — NOT LWW). Currency counters
(`neuralEnergyEarned` / `neuralEnergySpent`) and `familyAccrual.pullCount` SHALL sync
as monotonic MAX-merge values. Cross-version reads SHALL be tolerant
(`validateBundleMeta` already accepts `schema_version > SCHEMA_VERSION` and drops
unknown keys). The shared sync Worker is bundle-opaque and SHALL NOT change.

#### Scenario: copies MAX-merges across devices

- **GIVEN** device A has `(藥理學,2)` with `copies=3` and device B has `copies=1`
- **WHEN** the bundle round-trips
- **THEN** both SHALL converge to `copies=3` and the row content SHALL be unchanged

#### Scenario: v9 client tolerates a v10 bundle

- **GIVEN** a client at `SCHEMA_VERSION = 9` reads a bundle at version 10
- **WHEN** the bundle is validated
- **THEN** no error SHALL be raised and unknown keys SHALL be dropped

### Requirement: Player SHALL initiate variant pulls per family by spending neural energy

The neurons mode SHALL expose a player-initiated `pullVariant(familyId)` action that
is the **only** mechanism producing `neuronVariants` rows. A pull SHALL require
balance ≥ `PULL_COST` (=20) and that the family is not fully collected; otherwise it
SHALL be rejected (no spend). On success, inside a single Dexie transaction, the
system SHALL: add `PULL_COST` to `neuralEnergySpent`, increment
`familyAccrual.pullCount`, roll a rarity tier (P0 soft-pity applied), **select a
variant within the rolled tier (uniform among that family's catalog variants of that
tier)**, and either persist a new row (`copies = 1`, provenance stamped) or increment
`copies` on the existing row. A pull MAY yield a dupe in any non-P0 tier (no
new-variant guarantee beyond P0 pity; the dupe sink is a later phase). The reveal
SHALL fire only after commit. There SHALL be NO slot-unlock subscriber and NO manual
ticket/fate-card roll path.

#### Scenario: Pull spends cost and yields a variant within the rolled tier

- **GIVEN** balance ≥ 20 and family `藥理學` not fully collected
- **WHEN** the player pulls `藥理學` and the rolled tier has two variants
- **THEN** `neuralEnergySpent` SHALL increase by 20, `familyAccrual['藥理學'].pullCount`
  SHALL increment by 1, and the result SHALL be one of that tier's two variants —
  either a new row (`copies = 1`) or a `copies` increment on an owned one

#### Scenario: Pull rejected when balance below cost

- **GIVEN** balance < 20
- **WHEN** a pull is attempted
- **THEN** no spend SHALL occur, no row/copies SHALL change, and the pull SHALL be a no-op

#### Scenario: Pull rejected when family fully collected

- **GIVEN** all of `免疫學`'s variants are collected
- **WHEN** a pull is attempted for `免疫學`
- **THEN** the pull SHALL be rejected with no spend (UI surfaces a 全部收集 state)

## REMOVED Requirements

### Requirement: Content pack SHALL ship a 66-entry `NEURON_VARIANT_CATALOG` with a fixed rarity per variant

**Reason**: The fixed 66-entry (11 × 6) shape and the `rarity === SLOT_RARITY[slotIndex]`
derivation are replaced by a per-family pyramid catalog with an explicit per-variant
rarity (see the ADDED requirement below). Identity/count changes, so this is a
REMOVE + ADD rather than a reworded MODIFIED.

### Requirement: Theme pack SHALL register 66 variant sprite keys plus terminal default

**Reason**: The fixed count of 66 sprite keys is replaced by "one key per catalog
entry" (the pyramid total), and the 11 P0 keys move from placeholder to real art.
See the ADDED requirement below.

### Requirement: Existing collection SHALL be fully reset on the Dexie v10 upgrade with no grandfather

**Reason**: The reset moves to the Dexie **v11** upgrade (this change's schema bump).
Version number changes, so this is a REMOVE + ADD. See the ADDED requirement below.

## ADDED Requirements

### Requirement: Variant rarity SHALL be an explicit per-variant property decoupled from slot index

`NeuronVariantDef.rarity` SHALL be an **explicit field authored per catalog entry**,
NOT derived from `slotIndex`. `slotIndex` SHALL be a within-family unique index
`0..N-1` whose only fixed meaning is **slot 0 = the family's P0 apex**; it SHALL NOT
encode the rarity tier. The `SLOT_RARITY` map SHALL NOT be used as the rarity source
(a family may declare multiple variants sharing the same tier). The catalog remains
the single source of truth for variant `displayName` / `description` / `rarity`.

#### Scenario: Two variants of the same family share a tier with distinct slot indices

- **GIVEN** family `藥理學` declares two `P5` variants
- **WHEN** the catalog is inspected
- **THEN** both SHALL have `rarity === 'P5'` with distinct `slotIndex` values, and
  neither rarity SHALL be inferred from `slotIndex`

#### Scenario: Slot 0 remains the P0 apex

- **WHEN** any family's `slotIndex === 0` entry is read
- **THEN** its `rarity` SHALL be `'P0'`

### Requirement: Content pack SHALL ship a per-family pyramid `NEURON_VARIANT_CATALOG` with an explicit rarity per variant

The `@study-rpg/content-neurons-tw` package SHALL export `NEURON_VARIANT_CATALOG:
NeuronVariantDef[]` shaped as a **per-family rarity pyramid**: each family declares a
variable number of variants per tier, with rising rarity holding fewer variants and
exactly one P0 apex (`slotIndex = 0`) per family. Each entry SHALL have:

```typescript
interface NeuronVariantDef {
  familyId: string
  slotIndex: number                     // 0..N-1 unique within family; 0 = P0 apex
  rarity: 'P0'|'P1'|'P2'|'P3'|'P4'|'P5' // EXPLICIT per variant (not derived)
  displayName: string
  spriteKey: string                     // 'variant:<familyId>:<slotIndex>'
  description: string
}
```

A build-time `assertCatalogShape` guard SHALL enforce: every family has exactly one
P0 at `slotIndex === 0`; `slotIndex` values are contiguous `0..N-1` and unique within
each family; `rarity ∈ {P0..P5}`; rising rarity holds no more variants than the tier
below it (pyramid invariant); and `spriteKey === 'variant:' + familyId + ':' + slotIndex`.

#### Scenario: Catalog is a per-family pyramid with one P0 apex each

- **WHEN** a consumer imports `NEURON_VARIANT_CATALOG`
- **THEN** every family SHALL have exactly one `rarity === 'P0'` entry at `slotIndex === 0`
- **AND** within each family, for every adjacent rarity pair the rarer tier SHALL
  declare no more variants than the commoner tier (pyramid invariant)
- **AND** each family's `slotIndex` values SHALL be contiguous `0..N-1` and unique

#### Scenario: Rarity is read from the explicit field, not the slot index

- **GIVEN** a family with two `P5` variants at `slotIndex` 1 and 2
- **WHEN** the pull service resolves a variant's rarity
- **THEN** it SHALL read the entry's explicit `rarity` field, not `SLOT_RARITY[slotIndex]`

### Requirement: Theme pack SHALL register one variant sprite key per catalog entry plus terminal default

The `theme-pixel-neurons` `SPRITE_MAP` SHALL include `variant:<familyId>:<slotIndex>`
for **every** catalog entry (one key per pyramid slot) plus the terminal
`variant:default` fallback. The 55 legacy base keys SHALL keep their existing real
PNGs. The 11 P0 keys (`slotIndex 0`) SHALL resolve to **real art** wired in this
change (the staged P0 apex sprites). Any base-tier slot beyond the existing 55 base
sprites MAY resolve to a placeholder until the roster-art-fill follow-up; the lookup
SHALL never produce a broken image (falls back to `variant:default`).

#### Scenario: Every catalog key resolves

- **WHEN** the developer iterates all `(familyId, slotIndex)` pairs in the catalog
- **THEN** `SPRITE_MAP['variant:'+familyId+':'+slotIndex]` SHALL resolve to a
  non-empty URL for each, OR fall back to `variant:default` (never a broken image)

#### Scenario: P0 keys now resolve to real art

- **WHEN** the developer reads a `variant:<familyId>:0` key
- **THEN** it SHALL resolve to a real (non-placeholder) P0 sprite PNG

### Requirement: Existing collection SHALL be fully reset on the Dexie v11 upgrade with no grandfather

The Dexie schema SHALL bump to **v11**. The v10→v11 `.upgrade()` callback SHALL clear
the `neuronVariants` table and reset every `familyAccrual` row's `unlockedSlots` to
`[]` and `pullCount` to `0` (so P0 pity restarts on the fresh collection). It SHALL
NOT change the `neuronVariants` primary key. Study progress (AP, synapses, mastery,
question history, bookmarks, achievements, `totalStudyMinutes`) **and the
neural-energy balance counters (`neuralEnergyEarned` / `neuralEnergySpent`)** SHALL be
preserved. There SHALL be NO grandfather logic and NO migration banner. A
`db-v10-to-v11-migration.test.ts` fixture (per the `dexie-fixture-lint` rule) SHALL
seed a v10 save and assert the reset + preservation split.

#### Scenario: v11 upgrade clears collection and resets pity, preserves study + energy

- **GIVEN** a v10 save with collected variants, non-zero AP, synapses, and a non-zero
  neural-energy balance
- **WHEN** the DB opens at v11
- **THEN** `neuronVariants` SHALL be empty and every `familyAccrual.pullCount` SHALL be `0`
- **AND** AP, synapses, mastery rows, and the `neuralEnergyEarned`/`neuralEnergySpent`
  counters SHALL be unchanged

#### Scenario: No banner or grandfather path

- **WHEN** an existing player opens the app after upgrade
- **THEN** no migration banner SHALL appear and no pre-upgrade variant SHALL survive
