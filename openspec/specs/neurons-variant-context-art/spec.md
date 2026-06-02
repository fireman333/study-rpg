# neurons-variant-context-art Specification

## Purpose

The visual context-art channel for collected neuron variants in neurons-tw (Pikmin Bloom 「帽子=出身」 — a collectible's appearance reflects the study context it was born in). It derives, purely at render time from a variant's already-stored `provenance` and `rolledAt`, two things: (a) **decor neuro-field textures** — 救贖 action-potential firing field / 里程碑 myelinated-axon field / 元老 antique Cajal histology plate — and (b) a **circadian brain-wave band** (δ/θ/α/β) from the variant's birth hour-of-day. Both compose as faint, full-bleed, semi-transparent layers BEHIND the fully-visible neuron via a shared `<VariantSprite>` used at every collected-variant render site. Zero new persisted state, zero Dexie/R2 schema change. Sibling visual channel to the text birth-caption shipped by `add-neurons-variant-provenance`.

## Requirements

### Requirement: Context-art SHALL be derived purely from a variant's stored data with no new persisted state

A pure function `variantContextArt(row)` SHALL compute, from a `NeuronVariantRow`, a context-art descriptor consisting of an ordered set of decor keys plus a brain-wave band. It SHALL read only the already-stored `provenance` object (and its absence), `rolledAt`, and content-pack constants. It SHALL NOT introduce any new Dexie field, Dexie `.version()` bump, R2 bundle `SCHEMA_VERSION` bump, or sync adapter.

#### Scenario: Descriptor derives from stored data at render time
- **GIVEN** a collected `neuronVariant` row
- **WHEN** the row is rendered at any collected-variant render site
- **THEN** its decor keys and band SHALL be computed by `variantContextArt(row)` at render time
- **AND** no write SHALL be performed to the row, and no schema or bundle version SHALL change

#### Scenario: Standard variant gets no decor field
- **GIVEN** a row whose `provenance` has `wasRedemption === false` and `streakAtMint < MILESTONE_STREAK_THRESHOLD`
- **WHEN** `variantContextArt(row)` runs
- **THEN** it SHALL return an empty decor set (a band SHALL still be present)

### Requirement: Decor SHALL map provenance to 救贖 / 里程碑 / 元老 neuro-field textures with defined stacking and exclusivity

`variantContextArt` SHALL map provenance to decor keys as: `provenance.wasRedemption === true` → `decor:redemption` (action-potential firing field); `provenance.streakAtMint >= MILESTONE_STREAK_THRESHOLD` → `decor:milestone` (myelinated-axon field); `provenance === undefined` → `decor:elder` (Cajal histology plate). `MILESTONE_STREAK_THRESHOLD` SHALL be the single content-pack constant (default 7) already used by the birth caption. 救贖 and 里程碑 SHALL be able to co-occur; `decor:elder` SHALL be mutually exclusive with both (it requires absent provenance).

#### Scenario: Redemption individual carries the firing-field
- **GIVEN** a row with `provenance.wasRedemption === true` and `streakAtMint < 7`
- **WHEN** `variantContextArt(row)` runs
- **THEN** the decor set SHALL contain `decor:redemption` and SHALL NOT contain `decor:milestone` or `decor:elder`

#### Scenario: Milestone redemption stacks both fields
- **GIVEN** a row with `provenance.wasRedemption === true` and `provenance.streakAtMint === 7`
- **WHEN** `variantContextArt(row)` runs
- **THEN** the decor set SHALL contain both `decor:milestone` and `decor:redemption`
- **AND** SHALL NOT contain `decor:elder`

#### Scenario: Elder individual carries only the Cajal plate
- **GIVEN** a row with `provenance === undefined`
- **WHEN** `variantContextArt(row)` runs
- **THEN** the decor set SHALL contain `decor:elder` and SHALL NOT contain `decor:redemption` or `decor:milestone`

### Requirement: A brain-wave band SHALL derive from birth hour-of-day and be cross-device deterministic

`variantContextArt` SHALL derive a brain-wave band from the variant's birth hour, computed from `rolledAt` in a fixed timezone (Asia/Taipei) so every device resolves the same band. The hour SHALL map to the EEG band dominant in that circadian epoch: 00–06 → δ, 06–12 → β, 12–18 → α, 18–24 → θ. A band SHALL be present for every row, including 元老 (which have `rolledAt` but no `provenance`). The band SHALL be surfaced as a colour-coded Greek-letter (δ/θ/α/β) accent and SHALL NOT be applied as a full-cell colour wash (cards keep a consistent neutral background).

#### Scenario: Birth hour maps to circadian band
- **GIVEN** a row whose `rolledAt` falls at 03:00 Asia/Taipei
- **WHEN** `variantContextArt(row)` runs
- **THEN** the band SHALL be δ (delta)

#### Scenario: Band is timezone-stable across devices
- **GIVEN** the same `rolledAt` epoch rendered on two devices in different local timezones
- **WHEN** `variantContextArt(row)` runs on each
- **THEN** both SHALL resolve the same band (the hour is computed in the fixed Asia/Taipei timezone)

#### Scenario: Elder still gets a band
- **GIVEN** a row with `provenance === undefined` and a `rolledAt` at 21:00 Asia/Taipei
- **WHEN** `variantContextArt(row)` runs
- **THEN** the decor set SHALL be `['decor:elder']` and the band SHALL be θ (theta)

### Requirement: Context art SHALL render behind the neuron at every render site via a shared component

A single shared render component SHALL compose the context art as faint, full-bleed, semi-transparent layers BEHIND the base neuron sprite, which renders on top at full opacity, so the neuron is never occluded and there is no positioned foreground badge to align. It SHALL be used at the `/collection` dex card, the variant unlock-reveal modal, and the `/collection` family-section-header representative sprite. It SHALL render correctly over both static and animated base sprites.

#### Scenario: Dex card composes context art behind the neuron
- **GIVEN** a 救贖 row shown on the `/collection` dex card
- **WHEN** the card renders
- **THEN** the firing-field texture and the band letter SHALL render behind the neuron, and the neuron SHALL be fully visible (not occluded)

#### Scenario: Unlock modal composes context art at mint
- **GIVEN** a variant is minted with `streakAtMint >= MILESTONE_STREAK_THRESHOLD`
- **WHEN** the unlock-reveal modal shows the new variant
- **THEN** the myelin-field texture SHALL appear behind the base sprite alongside the birth caption

#### Scenario: Family representative composes context art
- **GIVEN** an 元老 variant is set as a family's representative
- **WHEN** the `/collection` family-section header shows that family's representative sprite
- **THEN** the Cajal-plate texture SHALL render behind the base sprite

### Requirement: The context channel SHALL remain visually distinct from the rarity channel

Context SHALL be expressed by neuro-field textures plus a band letter, while rarity (P1–P5) continues to be expressed by colour (rarity chip / reveal spin). The elder field SHALL render as a faint background and SHALL NOT be confused with the card's rarity indicator; the rarity chip SHALL remain the rarity signal.

#### Scenario: Rarity signal unaffected by context art
- **GIVEN** a P1 元老 variant card
- **WHEN** the card renders
- **THEN** the rarity chip SHALL still show the P1 rarity label and colour
- **AND** the Cajal field SHALL render as a faint context backdrop distinct from the rarity chip

### Requirement: A missing decor asset SHALL degrade gracefully

If a decor sprite key resolves to the transparent placeholder (asset not yet present), the render SHALL still show the base sprite with no broken-image icon. Absence of a decor asset SHALL mean "no visible context field", never a render failure.

#### Scenario: Placeholder decor key renders base only
- **GIVEN** `decor:redemption` resolves to the transparent placeholder
- **WHEN** a 救贖 variant renders
- **THEN** the base sprite SHALL display normally with no broken-image icon
