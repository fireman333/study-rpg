## ADDED Requirements

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

#### Scenario: Both variant sprites resolve

- **WHEN** the app loads the theme pack
- **THEN** `theme.sprites['character-base']` AND `theme.sprites['character-base-female']` SHALL both be non-empty string URLs
- **AND** both image URLs SHALL serve HTTP 200 with `image/png` MIME

### Requirement: Visual parity between variants

Character variants SHALL share the same visual style anchor (palette, background scene, perspective, pixel resolution) to maintain in-game continuity.

#### Scenario: Variants share scene + style

- **WHEN** the female variant sprite is generated
- **THEN** the manifest prompt SHALL anchor on the male variant prompt, swapping only gender-coded descriptors (subject + hair)
- **AND** background description (lamp / bookshelf / plants / parchment color) SHALL remain verbatim
- **AND** sprite dimensions SHALL be 384×384 PNG matching `character-base`

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
