## ADDED Requirements

### Requirement: DMN fate cards SHALL have real artwork registered in `theme-pixel-neurons`

The `neurons-dmn-fate-cards` capability SHALL ensure that every DMN fate-card sprite key declared by `add-neurons-dmn-fate-card` (the 20 entries in `DMN_CARD_CATALOG` plus the shared `dmn:card-back` key, total 21) has a corresponding real pixel-art PNG file registered in `theme-pixel-neurons`'s `SPRITE_MAP`. "Real artwork" means: a per-card PNG file at `packages/theme-pixel-neurons/sprites/cards/<cardId>.png` (for individual cards) or `packages/theme-pixel-neurons/sprites/cards/card-back.png` (for the shared back), NOT the 1×1 transparent-PNG data URI placeholder shipped during the original DMN fate-card change.

Each card sprite SHALL visually communicate at least two identity dimensions:

1. **DMN concept** named in the card's `displayName` and `description` field (e.g., `dmn-mpfc-reverberation-p2` 「內側前額葉迴響」 → visual metaphor for mPFC self-referential reverberation; `dmn-hippocampal-ripples-p2` 「海馬迴漣漪」 → cross-section of hippocampus with ripple waves)
2. **Rarity tier** visible at the card edges via border / glow / framing color (P1 鑽石 → gold inner glow + diamond corners; P2 金 → ornate gold border; P3 銀 → silver border; P4 銅 → thin bronze border)

Sprites SHALL be 384×384 PNG with transparent background and 16-color quantization (GBA-era pixel-art aesthetic), consistent with the documented `image_gen_routing.md` recipe used by sibling change `generate-neurons-sprites`.

The shared `dmn:card-back` sprite MAY be opaque (non-transparent background) since it represents a physical card flipped face-down.

This requirement supersedes the original placeholder mapping for DMN sprite keys only. Other sprite categories declared by `theme-pixel-neurons` (items / cosmetics / skill placeholders / variant gacha / 6 core scaffold keys) MAY remain on the transparent-PNG placeholder until their respective consumer capabilities ship.

#### Scenario: Theme pack ships real artwork per DMN card

- **GIVEN** the `neurons-dmn-fate-cards` capability is active and `theme-pixel-neurons` is loaded
- **WHEN** any consumer (`DmnCollectionPage`, `DmnDrawModal`, future achievement modal, etc.) reads `SPRITE_MAP['dmn:card:dmn-mpfc-reverberation-p2']`
- **THEN** the resolved URL SHALL point to a real PNG file under `packages/theme-pixel-neurons/sprites/cards/`
- **AND** the resolved URL SHALL NOT be the 1×1 transparent-PNG data URI used during the original DMN fate-card change

#### Scenario: All 20 cards + 1 shared card-back covered

- **GIVEN** the 20 cardIds declared by `DMN_CARD_CATALOG` in `@study-rpg/content-neurons-tw` plus the shared `dmn:card-back` key
- **WHEN** the developer iterates over those keys and checks `SPRITE_MAP[key]`
- **THEN** each lookup SHALL return a real PNG URL (not the transparent placeholder)
- **AND** no two cards SHALL share the same sprite file (except the shared `dmn:card-back`, which by design is reused on every locked / not-yet-drawn card silhouette)

#### Scenario: Sprite visual identity reflects card neuroscience anchor

- **GIVEN** a human reviewer opens `packages/theme-pixel-neurons/sprites/cards/dmn-hippocampal-ripples-p2.png`
- **THEN** the sprite SHALL display a hippocampus-related morphology cue (curled / seahorse-shaped silhouette OR ripple-wave pattern emanating from a central focus)
- **AND** the sprite SHALL display a P2-tier gold ornate border
- **AND** the same reviewer opening `dmn-default-mode-awakening-p1.png` SHALL see a multi-region brain silhouette with mPFC + PCC + precuneus + angular gyrus glow, AND a P1-tier gold-with-diamond-corners frame

#### Scenario: Sprite communicates rarity tier at a glance

- **GIVEN** a user opens `/dmn` collection page showing all 20 unlocked cards
- **WHEN** the user visually scans the grid without reading any text labels
- **THEN** P1 cards SHALL be visually distinguishable from P2/P3/P4 cards via border / glow framing
- **AND** the four rarity tiers SHALL each have a consistent framing convention across all cards of that tier

#### Scenario: Other sprite categories may remain placeholder until consumer ships

- **GIVEN** variant gacha / cosmetic / item / skill placeholder consumer capabilities have not yet shipped their own artwork generation
- **WHEN** the developer reads `SPRITE_MAP['variant:藥理學:3']` or `SPRITE_MAP['cosmetic-head-soma-newcomer-halo']` or similar non-DMN-card key
- **THEN** the resolved URL MAY still be the transparent-PNG placeholder
- **AND** this is acceptable until the respective consumer capability ships its own asset-generation change (separate future work)
