## MODIFIED Requirements

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
