# neurons-maze-expedition Specification

## Purpose
TBD - created by archiving change add-neurons-maze-expedition. Update Purpose after archive.
## Requirements
### Requirement: Decorative expedition animation band

The system SHALL render a cosmetic side-scrolling "expedition" animation band composed of three independently-scrolling parallax layers — a far brain-sulci sky (slowest), a neural-tissue ground, and fast foreground synapse particles — that loop seamlessly to simulate the squad marching deeper into the brain. The band SHALL render in two contexts: a full-size band on the maze homepage, and a **compact, semi-transparent** band in the upper background of `QuizModal` during a quiz session. The band SHALL be purely decorative and MUST NOT read from or mutate any maze game state; the compact quiz band SHALL be non-interactive (`pointer-events: none`, low opacity, behind the question content) so it never obscures or intercepts the answer UI.

#### Scenario: Band renders with three parallax layers
- **WHEN** the expedition animation is shown (on the maze homepage or in QuizModal)
- **THEN** a far sky layer, a tissue ground layer, and a foreground particle layer are each present and animate via CSS `background-position` at distinct (slow → fast) speeds, looping seamlessly

#### Scenario: Band does not affect game state
- **WHEN** the expedition band is shown or hidden in either context
- **THEN** maze growth-signal accrual, node settling, and connected-region count are unchanged (the band neither pauses nor advances the journey)

#### Scenario: Compact quiz band stays out of the way
- **WHEN** the compact band renders in the QuizModal upper background
- **THEN** it is semi-transparent, non-interactive (does not intercept clicks), and positioned behind the question stem/options without obscuring them

### Requirement: Foreground squad derived from collected variants

The marchers in the foreground SHALL be derived live from the player's **active squad「神經元遠征隊」** (`useActiveSquad`), rendered as clean transparent sprites (without the per-variant context-art decor used on dex cards), so the band matches the squad shown in the correct-answer celebration. When the active squad is empty, the band SHALL fall back to the five rarest collected variants (P0 first); when the player has no collected variants at all, the band SHALL fall back to growth-cone marchers so it still reads.

#### Scenario: Band shows the active squad
- **WHEN** the player has a non-empty active squad and the band is shown
- **THEN** the squad members render as clean transparent sprite marchers, bobbing with staggered phase, matching the squad shown in the celebration

#### Scenario: Empty squad falls back to rarest collected variants
- **WHEN** the active squad is empty but the player has collected variants and the band is shown
- **THEN** up to five marchers appear, ordered by rarity (P0 first), each using the variant's own sprite as a clean transparent image

#### Scenario: Empty collection falls back to growth cones
- **WHEN** the player has zero collected variants and the band is shown
- **THEN** growth-cone glyph marchers are rendered instead, so the band is never empty

#### Scenario: Band updates as the squad changes
- **WHEN** the player edits their active squad (or collects a new variant while the squad is empty) with the band shown
- **THEN** the marchers re-derive without a page reload

### Requirement: Opt-in, persisted show/hide

The expedition band SHALL play automatically during active-study moments rather than requiring a manual opt-in: on the maze homepage it SHALL play while reading is active (`reading-timer` `status === 'reading'`) and be static otherwise; in `QuizModal` the compact band SHALL play for the duration the modal is open. A single persisted「關閉動畫」visibility preference (default shown) SHALL let the player hide the band in BOTH contexts, and the choice SHALL survive page reloads. When the OS requests reduced motion (`prefers-reduced-motion: reduce`), the band SHALL freeze to a static scene regardless of the preference. Visibility wording SHALL use show/hide ("遠征動畫 顯示/隱藏") rather than start/stop, because the underlying journey is always running and cannot be paused.

#### Scenario: Homepage band auto-plays while reading
- **WHEN** the player starts a reading session on the maze homepage (reading-timer status becomes `reading`) and the band is not hidden
- **THEN** the band animates; when reading pauses/stops, the band returns to a static scene

#### Scenario: Quiz band auto-plays during a session
- **WHEN** the player opens `QuizModal` and the band is not hidden
- **THEN** the compact band animates in the upper background for the duration of the session

#### Scenario: Hide choice persists across reloads and both contexts
- **WHEN** the player toggles「關閉動畫」on and then reloads the page
- **THEN** the band stays hidden on both the homepage and in QuizModal, and the persisted state records it as hidden

#### Scenario: Both controls drive one state
- **WHEN** the player hides the band via the on-band minimize control
- **THEN** the header chip reflects the hidden state, and showing it again via the header restores the same band

### Requirement: Reduced-motion and performance constraints

The animation SHALL be implemented with CSS transforms / `background-position` only (no `<canvas>`, no `requestAnimationFrame` loop) so it stays 60fps and is not throttled in backgrounded tabs. When the operating system requests reduced motion (`prefers-reduced-motion: reduce`), all layer and squad animations SHALL freeze to a static scene.

#### Scenario: Reduced-motion freezes the animation

- **WHEN** the OS `prefers-reduced-motion` setting is `reduce` and the band is shown
- **THEN** the parallax layers and the squad bob are static (no motion), while the scene remains visible

