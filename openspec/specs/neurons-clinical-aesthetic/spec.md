# neurons-clinical-aesthetic

## Purpose

The clinical EEG "signal layer" design-system overlay for neurons-tw. It adds a cold cyan/amber instrument-screen aesthetic to the app's *data surfaces* (connectome edges, the connectome canvas, quiz correct-answer feedback, stats / counter readouts, and data-heavy backdrops) while explicitly preserving the warm GBA pixel base (cream / brown palette, chunky frames) and the warm-toned sprite PNGs. The goal is that a medical-student viewer recognizes the neuroscience background on first glance, without clashing the cold data surfaces against the warm pixel sprites. Primary visual anchor: EEG waveform / spike-train.

## Requirements

### Requirement: A clinical signal-layer palette SHALL be added without altering the warm pixel base

The `theme-pixel-neurons` theme pack SHALL export a set of signal-layer CSS custom properties (cyan / amber primary signal colors, a dim inactive-trace color, a dark data-surface background, and grid + scanline overlay colors) in addition to its existing warm base tokens. The signal-layer tokens SHALL be the single source of truth for all clinical-aesthetic colors; components SHALL reference them via `var(--…)` and SHALL NOT hardcode signal hex literals.

The existing warm base tokens — `--bg-cream`, `--ink`, `--frame-cell-light`, `--frame-cell-dark`, the four `--nt-*` branch colors, and the `--rarity-*` frame colors — SHALL NOT be recolored or removed by this change. Sprite PNG assets SHALL NOT be modified.

#### Scenario: Signal-layer tokens present and warm base preserved

- **GIVEN** the neurons-tw app has booted and injected `THEME_PIXEL_NEURONS.cssVars` onto `:root`
- **WHEN** the computed styles on `:root` are inspected
- **THEN** signal-layer custom properties (cyan / amber / dim / dark data-surface bg / grid / scanline) SHALL be present and non-empty
- **AND** `--bg-cream`, `--ink`, `--frame-cell-light`, `--frame-cell-dark`, `--nt-da`, `--nt-5ht`, `--nt-gaba`, `--nt-glu` SHALL retain their pre-change warm values
- **AND** every signal-layer key SHALL satisfy the `theme-pack-contract` cssVars key regex `^--[a-z][a-z0-9-]*$`

#### Scenario: No stray signal hex literals introduced

- **GIVEN** the change implementation is complete
- **WHEN** the touched component files are scanned for the newly-introduced signal colors
- **THEN** those colors SHALL appear only as `var(--signal-…)` / `var(--grid-line)` / `var(--scanline)` references in component code, not as raw hex literals

### Requirement: Data surfaces SHALL adopt the EEG signal-layer styling while non-data surfaces stay warm

The following data / instrument surfaces SHALL adopt the clinical signal layer: connectome synapse edges, the connectome canvas backdrop, the quiz correct-answer feedback, the stats / counter readouts, and the data-heavy backdrop region of the Overview page. Non-data surfaces — family picker chips, DMN card art, achievement badges, dorm / cosmetic surfaces, and leaderboard rows — SHALL retain the warm pixel styling and SHALL NOT be signal-recolored by this change.

Connectome synapse edges SHALL consume the `--synapse-*` tokens (wired to the signal palette) rather than hardcoded colors, and SHALL preserve three visually-distinct states (dormant / forming-or-potentiated / mastered). This change SHALL NOT alter connectome node positions, force-simulation, or the edge formation / strengthen / decay animation timing contract owned by `connectome-collection`.

#### Scenario: Connectome edges read as EEG signal traces

- **GIVEN** the player opens `/connectome` with at least one formed synapse
- **WHEN** the synapse edges render
- **THEN** edge stroke colors SHALL derive from the signal-layer `--synapse-*` tokens (cyan for forming/potentiated, amber + glow for mastered, dim for dormant)
- **AND** the three synapse states SHALL remain visually distinguishable
- **AND** the connectome node positions and force-simulation layout SHALL be unchanged from before this change

#### Scenario: Non-data surfaces remain warm

- **GIVEN** the player views the Overview family picker, a DMN card, an achievement badge, and a leaderboard row
- **WHEN** those surfaces render
- **THEN** they SHALL retain warm pixel styling (cream / brown / sprite tones)
- **AND** they SHALL NOT be recolored to the cold signal palette

### Requirement: Stats and counters SHALL render as monospace clinical data readouts

User-facing numeric stats and counters (e.g. AP count, LTP delta, daily streak, family-mastery X/N, study minutes) on the data surfaces SHALL render in a monospace data-readout style consistent with an EEG / clinical-monitor anchor: fixed-width glyphs, value-prominent, signal-colored. Associated short labels SHALL use clinical neuro-data phrasing consistent with the EEG anchor (e.g. AP / LTP Δ / spike-rate) rather than generic game phrasing.

#### Scenario: Stat readout uses monospace signal styling

- **GIVEN** the Overview / connectome stats area renders a numeric counter
- **WHEN** the counter is displayed
- **THEN** it SHALL use a monospace (fixed-width) glyph treatment
- **AND** the numeric value SHALL be colored with a signal-layer token
- **AND** its label SHALL use clinical neuro-data phrasing aligned to the EEG anchor

### Requirement: Data-heavy surfaces SHALL carry a grid + scanline backdrop motif

Data-heavy surfaces (connectome canvas, Overview stats region) SHALL render a subtle grid + scanline backdrop motif using the signal-layer overlay tokens, evoking an instrument screen. The motif SHALL sit behind content, SHALL NOT reduce legibility of foreground pixel sprites / chips / text, and SHALL be confined to the data surfaces (it SHALL NOT cover the whole app chrome).

#### Scenario: Connectome canvas shows instrument backdrop without obscuring content

- **GIVEN** the player opens `/connectome`
- **WHEN** the canvas renders
- **THEN** a faint grid + scanline backdrop SHALL be visible behind the tree using the signal-layer overlay tokens
- **AND** the family nodes, edges, and labels SHALL remain fully legible over it
- **AND** the warm cream page chrome outside the data surface SHALL NOT carry the grid/scanline motif
