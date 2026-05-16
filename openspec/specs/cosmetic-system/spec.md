# cosmetic-system Specification

## Purpose
TBD - created by archiving change add-cosmetic-and-dorm. Update Purpose after archive.

## Requirements

### Requirement: Cosmetic catalog defines 20+ entries across 5 categories

The system SHALL define a hard-coded `COSMETIC_CATALOG` constant in `packages/theme-pixel-medical/src/items.ts` containing ≥ 20 cosmetic entries spread across exactly 5 categories: `head`, `body`, `accessory`, `held`, `background`. Each category SHALL have ≥ 3 entries.

Each cosmetic SHALL declare:
- `id: string` — stable kebab-case identifier
- `name: string` — display name (zh-TW)
- `category: 'head' | 'body' | 'accessory' | 'held' | 'background'`
- `unlockCondition: (player: Player) => boolean` — pure predicate
- `unlockDescription: string` — human-readable unlock hint (e.g. "達 level 5 解鎖")
- `artKey: string` — sprite key into ThemePack.sprites

#### Scenario: Catalog has ≥ 20 entries across 5 categories

- **WHEN** `COSMETIC_CATALOG` is inspected at runtime or compile time
- **THEN** the array length SHALL be ≥ 20
- **AND** the distinct `category` values SHALL be exactly `{'head', 'body', 'accessory', 'held', 'background'}`
- **AND** each category SHALL contain ≥ 3 entries

#### Scenario: Catalog entries have effects = [] (cosmetic-only)

- **WHEN** any entry from `COSMETIC_CATALOG` is examined
- **THEN** if rendered as an `Item` via `cosmeticToItem(entry)`, the `Item.effects` SHALL be exactly `[]`
- **AND** the `Item.isCosmetic` flag SHALL be `true`

### Requirement: Milestone-only unlock — no gacha contamination

Cosmetic items SHALL NOT appear in the loot table consumed by `rollLoot`. They SHALL be unlocked exclusively via the `unlockCondition` predicate evaluated against the current `Player` state. Locked cosmetics SHALL exist in the catalog but NOT in `player.inventory` until unlocked.

#### Scenario: Loot table excludes cosmetic items

- **WHEN** `rollLoot(catalog, player.lootStats)` is called
- **THEN** the resulting item SHALL satisfy `item.isCosmetic !== true`
- **AND** the loot pool used internally SHALL be the result of `catalog.filter(i => !i.isCosmetic)`

#### Scenario: Milestone reached triggers unlock

- **WHEN** the player state changes (e.g. level-up, stat increase, streak bump, mock attempt completion) AND some cosmetic's `unlockCondition(prevPlayer) === false` AND `unlockCondition(nextPlayer) === true`
- **THEN** the system SHALL emit a "cosmetic unlocked" event
- **AND** SHALL append a new `ItemInstance` (with `itemId === cosmetic.id`) to `player.inventory`
- **AND** the cosmetic SHALL become selectable in the dorm picker

### Requirement: checkMilestoneUnlocks compares prev/next player state

The `checkMilestoneUnlocks(prev: Player, next: Player, catalog: readonly Cosmetic[]): Cosmetic[]` pure function SHALL return the list of cosmetics whose `unlockCondition` transitioned from `false → true` between the two states.

#### Scenario: Identifies newly unlocked cosmetics

- **WHEN** `prev.stats.knowledge = 49` AND `next.stats.knowledge = 50` AND a cosmetic has `unlockCondition: (p) => p.stats.knowledge >= 50`
- **THEN** that cosmetic SHALL appear in the returned array

#### Scenario: Already-unlocked cosmetics are NOT re-emitted

- **WHEN** `prev.stats.knowledge = 60` AND `next.stats.knowledge = 70` AND a cosmetic has `unlockCondition: (p) => p.stats.knowledge >= 50` (still true on both)
- **THEN** that cosmetic SHALL NOT appear in the returned array
- **AND** no duplicate ItemInstance SHALL be added to inventory

#### Scenario: Multiple unlocks in one state transition return all

- **WHEN** a single `setPlayer` call crosses 3 milestone thresholds simultaneously
- **THEN** all 3 newly-unlocked cosmetics SHALL appear in the returned array (order: catalog iteration order)

### Requirement: Cosmetic equipment uses dedicated EquipSlot keys

The `EquipSlot` type SHALL be extended with 5 cosmetic slot keys: `'cosmetic-head'`, `'cosmetic-body'`, `'cosmetic-accessory'`, `'cosmetic-held'`, `'cosmetic-background'`. These slots SHALL be independent of the existing 4 functional slots (`head`, `body`, `weapon`, `charm`) — equipping a cosmetic SHALL NOT unequip the corresponding functional item.

The `Equipment` interface SHALL include 5 optional cosmetic slot fields, all `ItemInstanceId` typed.

#### Scenario: Equip cosmetic does not displace functional equipment

- **WHEN** a player has `equipment.head` set to a functional item AND equips a cosmetic into `equipment['cosmetic-head']`
- **THEN** `equipment.head` SHALL remain unchanged
- **AND** stat computation (`effectiveStats`) SHALL be unaffected by the cosmetic equip

#### Scenario: One cosmetic per slot

- **WHEN** a player equips cosmetic A into `equipment['cosmetic-head']` then equips cosmetic B into the same slot
- **THEN** `equipment['cosmetic-head']` SHALL contain only B's `ItemInstanceId`
- **AND** A's instance SHALL remain in `player.inventory` (not deleted, available for re-equip)

### Requirement: Cosmetic equip / unequip are pure helpers

`equipCosmetic(player: Player, instanceId: ItemInstanceId, slot: CosmeticSlot): Player` and `unequipCosmetic(player: Player, slot: CosmeticSlot): Player` SHALL be pure functions returning a new Player object with the appropriate `equipment[slot]` field set or cleared.

#### Scenario: equipCosmetic does not mutate input

- **WHEN** `equipCosmetic(originalPlayer, instId, 'cosmetic-head')` is called
- **THEN** the returned player SHALL be a new object
- **AND** `originalPlayer.equipment['cosmetic-head']` SHALL be unchanged

#### Scenario: unequipCosmetic clears the slot

- **WHEN** `unequipCosmetic(player, 'cosmetic-head')` is called
- **THEN** the returned player's `equipment['cosmetic-head']` SHALL be `undefined`

### Requirement: Cosmetic sprite bbox compliance

Non-background cosmetic sprites SHALL paint their main visual content within a category-specific pixel bounding box on the 384×384 canvas. The canvas area outside the bbox SHALL be fully transparent (alpha = 0). This bbox convention is the normative spec for the LPC / Mana Seed fixed-grid paper-doll layering pattern adopted by this engine.

The bbox table is:

| Category | bbox X (pixels) | bbox Y (pixels) | Size (W × H) | Anatomy anchor |
|---|---|---|---|---|
| `head` | 130 – 254 | 40 – 160 | 124 × 120 | 臉部+瀏海+眼鏡/帽 |
| `body` | 100 – 280 | 140 – 300 | 180 × 160 | 肩→腰，白袍/衣服 |
| `accessory` | 100 – 280 | 160 – 260 | 180 × 100 | 胸口層級，聽診器/徽章/掛飾 |
| `held` | 80 – 200 | 240 – 340 | 120 × 100 | 左手 grip 位置 |
| `background` | N/A | N/A | 384 × 384 | full-canvas, no bbox |

Coordinates are pixel indices in a 384×384 canvas with origin (0, 0) at top-left.

The bbox compliance threshold SHALL be:
- Main visual content fully within declared bbox, with ≤ 5 px overflow tolerance per edge
- Outside bbox: alpha = 0 (transparent); non-transparent stray pixels outside bbox count as bbox violation

bbox violation is a spec-level defect. Theme pack authors generating sprites (via codex `$imagegen` or otherwise) SHALL regenerate non-compliant sprites until they fit the bbox.

#### Scenario: Head cosmetic fits head bbox

- **WHEN** any `cosmetic-head-*` sprite is loaded
- **THEN** all non-transparent pixels SHALL fall within X = [130, 254] ± 5 px AND Y = [40, 160] ± 5 px
- **AND** all pixels outside the bbox SHALL have alpha = 0

#### Scenario: Body cosmetic fits body bbox

- **WHEN** any `cosmetic-body-*` sprite is loaded
- **THEN** all non-transparent pixels SHALL fall within X = [100, 280] ± 5 px AND Y = [140, 300] ± 5 px

#### Scenario: Accessory cosmetic fits accessory bbox

- **WHEN** any `cosmetic-accessory-*` sprite is loaded
- **THEN** all non-transparent pixels SHALL fall within X = [100, 280] ± 5 px AND Y = [160, 260] ± 5 px

#### Scenario: Held cosmetic fits held bbox

- **WHEN** any `cosmetic-held-*` sprite is loaded
- **THEN** all non-transparent pixels SHALL fall within X = [80, 200] ± 5 px AND Y = [240, 340] ± 5 px

#### Scenario: Background cosmetic is full-canvas

- **WHEN** any `cosmetic-background-*` sprite is loaded
- **THEN** the sprite MAY paint the full 384×384 canvas
- **AND** bbox compliance SHALL NOT apply
