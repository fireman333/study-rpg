## ADDED Requirements

### Requirement: Item interface supports isCosmetic flag

The `Item` interface SHALL include an optional `isCosmetic?: boolean` field. When `true`, the item:
- SHALL be a purely visual cosmetic with `effects: []` (no stat / multiplier deltas)
- SHALL NOT be returned by `rollLoot` (excluded from gacha)
- SHALL be unlocked via `cosmetic-system` milestone conditions, not via random rolls
- MAY use a cosmetic-specific EquipSlot (`'cosmetic-head'` / `'cosmetic-body'` / `'cosmetic-accessory'` / `'cosmetic-held'` / `'cosmetic-background'`)

#### Scenario: Cosmetic items have empty effects

- **WHEN** any item with `isCosmetic === true` is examined
- **THEN** `item.effects` SHALL equal `[]`
- **AND** type checking or lint MAY enforce this invariant at build time

#### Scenario: Functional items omit isCosmetic (default false)

- **WHEN** an existing functional item (e.g. acetaminophen, beta-blocker) is examined
- **THEN** `item.isCosmetic` SHALL be `undefined` or `false`
- **AND** the item SHALL retain its existing `effects` array

#### Scenario: Loot table filtering by isCosmetic

- **WHEN** `rollLoot(catalog, lootStats)` runs
- **THEN** the internal pool SHALL be `catalog.filter(i => !i.isCosmetic)`
- **AND** the returned `RollResult.item` SHALL satisfy `item.isCosmetic !== true`

### Requirement: theme-pixel-medical ships a COSMETIC_CATALOG

The `@study-rpg/theme-pixel-medical` package SHALL export a `COSMETIC_CATALOG` constant (in addition to the existing functional `ITEM_CATALOG`). The cosmetic catalog SHALL contain ≥ 20 entries spread across 5 categories per the `cosmetic-system` capability spec.

#### Scenario: Theme exports COSMETIC_CATALOG separately from ITEM_CATALOG

- **WHEN** `import { ITEM_CATALOG, COSMETIC_CATALOG } from '@study-rpg/theme-pixel-medical'` is evaluated
- **THEN** both SHALL be defined and disjoint
- **AND** no entry in `ITEM_CATALOG` SHALL have `isCosmetic === true`
- **AND** every entry rendered from `COSMETIC_CATALOG` as an `Item` SHALL have `isCosmetic === true`

#### Scenario: Catalog cross-reference invariant

- **WHEN** any `cosmetic.artKey` is inspected
- **THEN** that key SHALL be present in `THEME_PIXEL_MEDICAL.sprites`
- **AND** the sprite URL SHALL resolve to a non-empty value
