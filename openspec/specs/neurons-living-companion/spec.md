# neurons-living-companion Specification

## Purpose

Defines which owned acceleration-system equipment renders as an on-screen companion in `apps/neurons-tw`, and how. The companion set is the catalog's *living cells* (glia) only; they appear exclusively as marchers in the expedition animation band (per `neurons-maze-expedition`), never on the brain-map. The layer is purely presentational and derives from the already-synced `equipment` table with zero schema/sync change.

## Requirements

### Requirement: Living-companion render set SHALL be declared in the equipment catalog

The set of permanent items that render as on-screen companions SHALL be derived from an explicit `companion: true` field on the `EquipmentDef` catalog entry (single source of truth), NOT from a hardcoded id list in the view layer and NOT from the item's `lane`. Only catalog items that represent *living cells* SHALL carry `companion: true`. A pure helper SHALL expose the companion subset for a given owned-id set.

#### Scenario: Glial cell items are companions

- **WHEN** the catalog is read
- **THEN** `eq-oligodendrocyte-companion-p3` and `eq-astrocyte-glycogen-p3` SHALL have `companion: true`
- **AND** all structural/molecular items (e.g. myelin wrap, node of Ranvier, Na⁺/K⁺ pump, lactate reserve, trace glucose, mitochondrial powerhouse) SHALL NOT have `companion: true`

#### Scenario: companion subset derives from owned ids

- **WHEN** `livingCompanions(ownedIds)` is called with a set of owned equipment ids
- **THEN** it SHALL return only the owned items whose catalog entry has `companion: true`, rarest-first

#### Scenario: companion flag is additive and non-breaking

- **WHEN** an existing consumer of `EquipmentDef` (validator, dex panel, acceleration passive sum) reads a catalog entry
- **THEN** the new optional `companion` field SHALL NOT change that consumer's behavior (the item's lane, rarity, and bonus are unaffected)

### Requirement: Owned living companions SHALL appear only in the expedition animation

Owned living-companion items SHALL render exclusively as marchers in the expedition animation band (per `neurons-maze-expedition`), riding along with the squad parade. They SHALL NOT render as a permanent fixture on the brain-map, nor anywhere outside the expedition band.

#### Scenario: owned companion marches in the band

- **WHEN** the player owns `eq-oligodendrocyte-companion-p3` and the expedition band is shown
- **THEN** a companion marcher for that item SHALL appear in the band's squad parade

#### Scenario: non-companion equipment does not appear

- **WHEN** the player owns only structural/molecular equipment (no `companion: true` item)
- **THEN** no companion marcher SHALL appear in the band

#### Scenario: companions do not appear on the brain-map

- **WHEN** the brain-map (the four-region fog-of-war SVG) is rendered
- **THEN** no living-companion sprite SHALL be composited over the brain SVG (companions live only in the expedition band)

#### Scenario: companion still contributes its passive

- **WHEN** an owned item is a living companion
- **THEN** it SHALL continue contributing its acceleration passive bonus exactly as before (the render layer is purely additive and does not alter the passive math)

### Requirement: Companion render SHALL be purely derived with zero schema or sync change

The companion marchers SHALL derive entirely from the already-synced `equipment` Dexie table via a live query. There SHALL be no Dexie `.version()` bump, no R2 bundle `SCHEMA_VERSION` bump, no new sync adapter, and no new synced meta key.

#### Scenario: identical companions on a second device

- **WHEN** the same account's owned `equipment` set is present on a second device
- **THEN** that device SHALL compute and render the identical companion marchers with no additional synced state

### Requirement: Companion animation asset SHALL resolve placeholder-first

The companion marcher SHALL resolve its artwork as `companion:<id>` → `equipment:<id>` → a transparent guard, so a dedicated companion sprite is preferred when present and the static dex sprite is the fallback (never a broken image). Dedicated `companion:<id>` marcher sprites SHALL ship for the living-cell companions; the registry SHALL key a `companion:<id>` entry only when its PNG is present (an absent sprite SHALL leave the key unresolved so the `equipment:<id>` fallback fires, rather than resolving to a transparent pixel). Companion marchers SHALL render at a **reduced size relative to the squad marchers** (a single tunable scale), so the glia read as smaller companions.

#### Scenario: dedicated companion art is preferred

- **WHEN** a `companion:<id>` sprite is registered for an owned companion
- **THEN** the band SHALL render the dedicated `companion:<id>` art (not the `equipment:<id>` dex sprite)

#### Scenario: missing companion asset falls back to the dex sprite

- **WHEN** no `companion:<id>` sprite is registered
- **THEN** the band SHALL render the existing static `equipment:<id>` sprite (never a broken image or a transparent pixel)

#### Scenario: companion marchers are smaller than the squad

- **WHEN** a companion marches in the band alongside squad marchers
- **THEN** the companion sprite SHALL render at a smaller size than the squad marcher at the same depth
