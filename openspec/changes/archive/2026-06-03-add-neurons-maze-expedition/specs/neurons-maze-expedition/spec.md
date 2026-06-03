## ADDED Requirements

### Requirement: Decorative expedition animation band

The system SHALL render a cosmetic side-scrolling "expedition" animation band on the `/maze-beta` page, composed of three independently-scrolling parallax layers — a far brain-sulci sky (slowest), a neural-tissue ground, and fast foreground synapse particles — that loop seamlessly to simulate a squad marching deeper into the brain. The band SHALL be purely decorative and MUST NOT read from or mutate any maze game state.

#### Scenario: Band renders with three parallax layers

- **WHEN** the expedition animation is shown on `/maze-beta`
- **THEN** a far sky layer, a tissue ground layer, and a foreground particle layer are each present and animate via CSS `background-position` at distinct (slow → fast) speeds, looping seamlessly

#### Scenario: Band does not affect game state

- **WHEN** the expedition band is shown or hidden
- **THEN** maze growth-signal accrual, node settling, and connected-region count are unchanged (the band neither pauses nor advances the journey)

### Requirement: Foreground squad derived from collected variants

The squad in the foreground SHALL be derived live from the player's collected neuron variants, showing up to the five rarest (P0 first), rendered as clean transparent sprites (without the per-variant context-art decor used on dex cards). When the player has no collected variants, the band SHALL fall back to growth-cone marchers so it still reads.

#### Scenario: Squad shows rarest collected variants

- **WHEN** the player has collected variants and the band is shown
- **THEN** up to five marchers appear, ordered by rarity (P0 first), each using the variant's own sprite as a clean transparent image, bobbing with staggered phase

#### Scenario: Empty collection falls back to growth cones

- **WHEN** the player has zero collected variants and the band is shown
- **THEN** growth-cone glyph marchers are rendered instead, so the band is never empty

#### Scenario: Squad updates as collection changes

- **WHEN** the player collects a new variant while the band is shown
- **THEN** the squad re-derives from the updated collection without a page reload

### Requirement: Opt-in, persisted show/hide

The expedition animation SHALL default to hidden and be toggled by two entry points — a header chip and an on-band minimize control — that drive a single visibility state persisted in `localStorage`. The persisted choice SHALL survive page reloads. Both entry points MUST use show/hide ("遠征動畫 顯示/隱藏") wording rather than start/stop wording, because the underlying journey is always running and cannot be paused.

#### Scenario: Hidden by default, shown on demand

- **WHEN** the player first opens `/maze-beta` with no stored preference
- **THEN** the band is hidden and the header chip offers to show the expedition animation

#### Scenario: Hide choice persists across reloads

- **WHEN** the player hides the band (via the header chip or the on-band minimize control) and then reloads the page
- **THEN** the band remains hidden and the persisted state records it as hidden

#### Scenario: Both controls drive one state

- **WHEN** the player hides the band via the on-band minimize control
- **THEN** the header chip reflects the hidden state, and showing it again via the header restores the same band

### Requirement: Reduced-motion and performance constraints

The animation SHALL be implemented with CSS transforms / `background-position` only (no `<canvas>`, no `requestAnimationFrame` loop) so it stays 60fps and is not throttled in backgrounded tabs. When the operating system requests reduced motion (`prefers-reduced-motion: reduce`), all layer and squad animations SHALL freeze to a static scene.

#### Scenario: Reduced-motion freezes the animation

- **WHEN** the OS `prefers-reduced-motion` setting is `reduce` and the band is shown
- **THEN** the parallax layers and the squad bob are static (no motion), while the scene remains visible
