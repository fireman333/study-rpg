## MODIFIED Requirements

### Requirement: A collection view SHALL show owned mock variants with own count

The system SHALL provide a mock-variant collection view that lists the player's owned variants grouped by rarity and shows a pure-count own total (no denominator, no full-collection celebratory state, consistent with the maze cards). Owned variants SHALL render their real sprite from `SPRITE_MAP` keyed by `spriteKey` (`mock-variant:<variantId>`); when a sprite file is absent the view SHALL fall back to a stable placeholder glyph rather than a broken image. The same sprite-with-glyph-fallback rule SHALL apply to the post-submit roll reveal.

#### Scenario: Collection view renders owned variants and a count

- **WHEN** the player opens the mock-variant collection view
- **THEN** it SHALL list each owned variant (its real sprite if present, else a placeholder glyph, plus display name + rarity) and a pure-count own total

#### Scenario: Missing sprite degrades to a glyph, never a broken image

- **WHEN** an owned variant has no sprite file registered in `SPRITE_MAP`
- **THEN** the tile and reveal SHALL render the placeholder glyph instead of a broken image
