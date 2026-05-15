# character-system Specification

## Purpose
TBD - created by archiving change add-character-and-sprites. Update Purpose after archive.
## Requirements
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

### Requirement: Player has a switchable character sprite key

The `Player` entity SHALL include an optional `characterSpriteKey` field referencing a key in `ThemePack.sprites`, with a default fallback to `'character-base'`.

#### Scenario: Missing field falls back to male default

- **WHEN** a `Player` is loaded with `characterSpriteKey === undefined` (or the field absent entirely from serialized data)
- **THEN** the character card SHALL render `theme.sprites['character-base']`
- **AND** no error / warning SHALL be emitted

#### Scenario: Unknown key in theme falls back to default

- **WHEN** `Player.characterSpriteKey` references a key that doesn't exist in `theme.sprites`
- **THEN** the character card SHALL fall back to `theme.sprites['character-base']`
- **AND** the engine SHALL not crash or render a broken `<img>`

### Requirement: Theme pack ships at least one alternate character variant

The default theme (`@study-rpg/theme-pixel-medical`) SHALL ship at least 2 character sprite variants:
- `character-base` (existing male medical student)
- `character-base-female` (new female medical student, same style anchor)

Both character-base sprites SHALL satisfy the paper-doll layering prerequisites defined in the "Visual parity between variants" requirement (transparent background, no baked-in cosmetic items, no baked-in scene furniture).

#### Scenario: Both variant sprites resolve

- **WHEN** the app loads the theme pack
- **THEN** `theme.sprites['character-base']` AND `theme.sprites['character-base-female']` SHALL both be non-empty string URLs
- **AND** both image URLs SHALL serve HTTP 200 with `image/png` MIME

#### Scenario: Both variant sprites are paper-doll compliant

- **WHEN** either `character-base` or `character-base-female` PNG is inspected
- **THEN** the canvas SHALL be 384×384 with transparent background (alpha = 0 outside the character silhouette)
- **AND** the sprite SHALL contain ONLY the character (head, torso, arms, hands, legs)
- **AND** the sprite SHALL NOT contain baked-in cosmetic items (no stethoscope, no notebook, no book, no glasses, no hat)
- **AND** the sprite SHALL NOT contain baked-in scene furniture (no desk, no shelf, no lamp, no plants)

### Requirement: Visual parity between variants

Character variants SHALL share the same visual style anchor (palette, perspective, pixel resolution) to maintain in-game continuity. Both variants SHALL also share the same anatomy anchor coordinates so that cosmetic sprites layered on top align identically regardless of which variant is active.

Both character-base sprites SHALL be paper-doll compliant — meaning transparent background, no baked-in cosmetic items, no baked-in scene furniture — so that:
- `cosmetic-background-*` sprites are visible behind the character
- `cosmetic-{head,body,accessory,held}-*` sprites layer on top without colliding with baked-in equipment
- A future content/theme fork can re-skin the character without inheriting medical-student visual debt

The required anatomy anchor (shared by both variants) SHALL be:

| Anchor | X coordinate | Y coordinate | Notes |
|---|---|---|---|
| Head center | 192 | 100 | 臉佔 Y 40–160 區帶 |
| Torso center | 190 | 220 | 肩 Y 140, 腰 Y 300 |
| Left hand grip | 130 | 290 | 持物位置（對應 held cosmetic bbox） |
| Right hand | 250 | 290 | 垂於體側 |

Coordinates are pixel indices in a 384×384 canvas with origin (0, 0) at top-left. ±5 px tolerance on each anchor.

#### Scenario: Variants share scene + style

- **WHEN** the female variant sprite is generated
- **THEN** the manifest prompt SHALL anchor on the male variant prompt, swapping only gender-coded descriptors (subject + hair)
- **AND** palette + pixel resolution + transparent background convention SHALL remain verbatim
- **AND** sprite dimensions SHALL be 384×384 PNG matching `character-base`

#### Scenario: Variants share anatomy anchor coordinates

- **WHEN** either `character-base` or `character-base-female` sprite is rendered as the bottom layer in dorm view
- **THEN** the character's head SHALL be centered at X 192 ± 5 px, Y 100 ± 5 px
- **AND** the character's left hand SHALL be at X 130 ± 5 px, Y 290 ± 5 px
- **AND** any cosmetic sprite (head / body / accessory / held) layered on top SHALL align with these anchors via the `cosmetic-system` bbox compliance convention

#### Scenario: Variants are paper-doll compliant

- **WHEN** either character-base sprite is inspected
- **THEN** the background SHALL be transparent (alpha = 0 outside the character silhouette)
- **AND** the sprite SHALL contain no baked-in cosmetic items
- **AND** the sprite SHALL contain no baked-in scene furniture

### Requirement: Player can switch variants via character-card UI

The character card SHALL provide controls to cycle through available variants, applied immediately to `Player.characterSpriteKey`.

#### Scenario: Cycle forward

- **WHEN** the player clicks the forward (▶) toggle next to their character sprite
- **THEN** `Player.characterSpriteKey` SHALL update to the next entry in the variants list, wrapping around at the end
- **AND** the displayed character sprite SHALL reflect the new key immediately

#### Scenario: Cycle backward

- **WHEN** the player clicks the backward (◀) toggle
- **THEN** the same cycle behavior applies in reverse, wrapping at the start

### Requirement: Variant change persists with player state

Switching variants SHALL be persisted alongside other player state (same React state path), so refreshing or reopening the app retains the choice.

#### Scenario: Variant survives state reload

- **WHEN** the player switches to `'character-base-female'`
- **AND** the player state is later read back (e.g. after IndexedDB rehydration in a future change, or in a simulated re-mount)
- **THEN** the character card SHALL render the female sprite, not the default

### Requirement: Sprite generation is manifest-driven

The new female variant sprite SHALL be added to `sprites.manifest.json` and regeneratable via the existing `generate-sprites.ts` pipeline.

#### Scenario: Manifest entry exists and is reproducible

- **WHEN** `pnpm --filter @study-rpg/theme-pixel-medical generate-sprites -- --keys=character-base-female` is run
- **THEN** the script SHALL invoke `cdx image` with the manifest's `styleAnchor + character-base-female.prompt + negativePrompt`
- **AND** SHALL write the output PNG to `packages/theme-pixel-medical/sprites/character-base-female.png`
- **AND** the manifest entry SHALL include `key`, `filename`, `size: "384x384"`, and `prompt` fields

