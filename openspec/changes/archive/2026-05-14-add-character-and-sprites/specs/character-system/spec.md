## ADDED Requirements

### Requirement: Character has visual portrait

The Player entity SHALL be represented by a visible character sprite drawn from the active `ThemePack.sprites` map, distinct from inventory item sprites.

#### Scenario: Character sprite visible on home screen

- **WHEN** the app loads and a player profile exists
- **THEN** a character sprite image SHALL be rendered in the character card area of the home screen
- **AND** the image SHALL be loaded from `theme.sprites['character-base']` (or the active theme's equivalent character key)
- **AND** the `<img>` element SHALL apply `image-rendering: pixelated` per DESIGN.md

### Requirement: Character name is editable

The player SHALL be able to edit `Player.name` from the character card.

#### Scenario: Edit character name inline

- **WHEN** the player clicks the name display next to the character sprite
- **THEN** the name SHALL become an editable input
- **AND** committing the edit (Enter or blur) SHALL persist the new name to `Player.name` via the existing `setPlayer` state path
- **AND** the default name for new players SHALL remain `見習醫師`

### Requirement: Four fixed equipment slots visible

The character card SHALL display 4 equipment slots — `head`, `body`, `weapon`, `charm` — as a 2×2 grid of tiles below the character sprite.

#### Scenario: Empty slot shows placeholder

- **WHEN** a slot has no equipped item (e.g. `Player.equipment.head === undefined`)
- **THEN** the tile SHALL render the corresponding placeholder sprite (e.g. `theme.sprites['slot-placeholder-head']`)
- **AND** the tile SHALL have a dashed 2px border in `--frame-wood-light`

#### Scenario: Occupied slot shows item sprite

- **WHEN** a slot has an equipped `ItemInstance` (e.g. `Player.equipment.head === <itemInstanceId>`)
- **THEN** the tile SHALL render the equipped item's sprite via `theme.sprites[item.artKey]`
- **AND** the tile SHALL have a solid 2px border colored per the item's rarity (`--rarity-<n>`)

### Requirement: Click-to-equip interaction

Players SHALL be able to equip / unequip items via single-click interactions on slots and inventory items (no drag-drop).

#### Scenario: Click occupied slot unequips

- **WHEN** the player clicks an occupied equipment slot tile
- **THEN** the equipped `ItemInstance` SHALL be removed from `Player.equipment[slot]` (set to `undefined`)
- **AND** the same `ItemInstance` SHALL remain in `Player.inventory` (it returns to backpack, not destroyed)

#### Scenario: Click inventory item equips to its slot

- **WHEN** the player clicks an item tile in the inventory grid
- **THEN** the item SHALL be equipped to its `slot` (per `Item.slot`)
- **AND** if the slot was already occupied, the previously-equipped `ItemInstance` SHALL move back to `Player.inventory`
- **AND** stat bonuses from `Item.effects[].stat` SHALL be re-applied to the displayed character stats

#### Scenario: Consumable slot not equippable

- **WHEN** the player clicks a `consumable`-slot item in the inventory
- **THEN** the equip flow SHALL NOT activate
- **AND** instead the item SHALL be marked for use (M2: trigger consumable effect; MVP: visible-only with toast "consumable use coming in M2")

### Requirement: Inventory grid renders item sprites

The inventory UI SHALL render each `ItemInstance` as a 64×64 tile showing the item sprite + rarity outline.

#### Scenario: Inventory grid shows sprite + rarity outline

- **WHEN** the player opens the inventory view
- **THEN** each `ItemInstance` SHALL appear as a tile with:
  - The item's sprite from `theme.sprites[item.artKey]`
  - A 2px outline colored by `--rarity-<rarity>`
  - The item name visible on hover (CSS title or tooltip)
- **AND** tiles SHALL be arranged in a 6-column responsive grid

### Requirement: Loot reveal displays item sprite

The card-reveal animation that fires after a loot roll SHALL display the item sprite alongside the existing rarity tag + name + flavor.

#### Scenario: Roll reveal shows sprite

- **WHEN** a loot roll completes and `RollReveal` is displayed
- **THEN** the reveal SHALL render the item's sprite via `theme.sprites[item.artKey]` at 96×96 or larger
- **AND** the sprite SHALL apply `image-rendering: pixelated`
- **AND** the rarity tag, item name, and flavor remain unchanged

### Requirement: Sprite assets are bundled with theme pack

The theme pack SHALL ship all sprite assets it references via `theme.sprites`, served from a stable URL path that survives Vite build.

#### Scenario: Sprite URL serves successfully in dev and prod

- **WHEN** the dev server serves any URL in `theme.sprites` values
- **THEN** the response SHALL be HTTP 200 with `image/png` content-type
- **AND** the same URL SHALL resolve in a production `vite build` output (sprites copied to `dist/`)

### Requirement: Theme sprite map covers character + all items + slot placeholders

`THEME_PIXEL_MEDICAL.sprites` SHALL contain at minimum these keys after this change:

- `character-base` — the player portrait
- `slot-placeholder-head`, `slot-placeholder-body`, `slot-placeholder-weapon`, `slot-placeholder-charm` — empty-slot placeholders
- One entry per `artKey` used by any item in `ITEM_CATALOG` (20 items → 20 entries; legacy artKey strings map to renamed item sprites per design.md "artKey ↔ sprite key migration")

#### Scenario: All artKeys resolve to a sprite URL

- **WHEN** any item in `ITEM_CATALOG` is inspected
- **THEN** `theme.sprites[item.artKey]` SHALL be a non-empty string URL
- **AND** at boot time, attempting to render the character card SHALL NOT produce any `<img>` with a missing-src warning in the console

### Requirement: Reproducible sprite generation

Sprite assets SHALL be generated from a committed manifest, not ad-hoc, so that any sprite can be regenerated with the same prompt.

#### Scenario: Manifest drives generation

- **WHEN** `packages/theme-pixel-medical/scripts/generate-sprites.ts` is run
- **THEN** it SHALL read `packages/theme-pixel-medical/scripts/sprites.manifest.json` containing per-sprite entries with `key`, `filename`, `size`, and `prompt`
- **AND** it SHALL invoke `cdx image` for each entry with the manifest's shared `styleAnchor` + per-sprite `prompt` + shared `negativePrompt`
- **AND** it SHALL save each generated PNG to the path declared in the manifest
- **AND** the manifest SHALL be version-controlled (gitignored output sprites OK, but manifest IS in repo)

### Requirement: Style consistency gate

The first 3 sprites generated SHALL be reviewed by the user before the remaining 18 are generated, to prevent style drift wasting 21 calls.

#### Scenario: Subagent halts after smoke batch

- **WHEN** the sprite-generation subagent begins generation
- **THEN** it SHALL generate exactly 3 sprites first (character-base + 2 items spanning N rarity + UR rarity for vibe-check range)
- **AND** it SHALL pause and send a preview message to the main thread containing the 3 sprite paths
- **AND** it SHALL NOT proceed to the remaining 18 sprites until the main thread sends a `continue` instruction
- **AND** if the main thread sends `abort`, the subagent SHALL stop and report which 3 sprites exist for review
