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

Decor sprite resolution SHALL follow a fallback chain: the per-branch texture (`decor:<type>:<branch>`) is used when its asset is present; otherwise the universal texture (`decor:<type>`) is used when present; otherwise no visible decor field is shown. If a resolved key would be the transparent placeholder (asset not yet present at any level), the render SHALL still show the base sprite with no broken-image icon. Absence of a decor asset SHALL mean "no visible context field", never a render failure.

#### Scenario: Placeholder decor key renders base only
- **GIVEN** neither `decor:redemption:da` nor `decor:redemption` has a real asset
- **WHEN** a 救贖 DA variant renders
- **THEN** the base sprite SHALL display normally with no broken-image icon

#### Scenario: Per-branch missing but universal present
- **GIVEN** `decor:elder:glu` has no asset but `decor:elder` does
- **WHEN** an 元老 variant of a Glu family renders
- **THEN** the universal `decor:elder` Cajal-plate texture SHALL render behind the neuron

### Requirement: Decor textures SHALL be flavoured by the variant's NT branch with a universal fallback

The context-art descriptor SHALL carry the variant's NT branch (`'DA' | '5HT' | 'GABA' | 'Glu'` or null), derived purely from `row.familyId`. At render time, each decor type SHALL resolve to a per-branch texture keyed `decor:<type>:<branch-lowercase>` (e.g. `decor:redemption:da`). When the per-branch texture asset is absent, rendering SHALL fall back to the universal `decor:<type>` texture; when the universal asset is also absent, it SHALL show no visible decor field (never a broken image). The provenance→decor-type mapping (救贖 / 里程碑 / 元老), stacking, and exclusivity SHALL be unchanged. The branch SHALL affect only the decor channel — the brain-wave band and rarity channels SHALL be unaffected.

#### Scenario: Decor flavoured by the variant's branch
- **GIVEN** a 救贖 variant of family `藥理學` (NT branch DA)
- **WHEN** it renders and the `decor:redemption:da` asset is present
- **THEN** the firing-field texture shown SHALL be the DA-flavoured `decor:redemption:da` texture

#### Scenario: Per-branch asset absent falls back to the universal texture
- **GIVEN** a 里程碑 variant of family `組織學` (NT branch 5HT)
- **WHEN** it renders and `decor:milestone:5ht` has no asset but `decor:milestone` does
- **THEN** the universal `decor:milestone` texture SHALL render (no broken image)

#### Scenario: Branch does not alter the band or rarity channels
- **GIVEN** any collected variant
- **WHEN** `variantContextArt(row)` runs
- **THEN** the brain-wave band SHALL be derived exactly as before from `rolledAt`
- **AND** the rarity chip / reveal SHALL be unchanged by the branch

### Requirement: The variant→NT-branch mapping SHALL come from a single exported source

The 11-family `familyId → NT-branch` mapping SHALL be defined once as a runtime export of the content pack (`@study-rpg/content-neurons-tw`) and consumed by both the build pipeline (when emitting each subject's branch grouping) and the render-time context-art derivation. There SHALL NOT be a second hard-coded copy of the mapping. A `familyId` not present in the map SHALL resolve to a null branch (which falls back to the universal decor texture). This SHALL introduce no Dexie `.version()` bump, no R2 bundle `SCHEMA_VERSION` bump, and no sync adapter.

#### Scenario: All eleven families resolve to their canonical branch
- **GIVEN** the exported family→branch map
- **WHEN** each of the 11 family ids is looked up
- **THEN** it SHALL resolve to its canonical branch (藥理學/公共衛生學→DA; 寄生蟲學/組織學→5HT; 生物化學/病理學/免疫學→GABA; 解剖學/生理學/胚胎學/微生物學→Glu)

#### Scenario: Build pipeline and render derivation use the same source
- **GIVEN** the build script's subject branch grouping and the render-time branch derivation
- **WHEN** both compute a family's branch
- **THEN** both SHALL read the single exported map and resolve identically

#### Scenario: Unknown family resolves to a null branch
- **GIVEN** a row whose `familyId` is not present in the map
- **WHEN** the branch is derived
- **THEN** the branch SHALL be null and the universal decor texture SHALL be used

### Requirement: Second-lap location variants SHALL render a position-keyed hue/filter over the base sprite

A second-lap location variant (per `neurons-maze-second-lap`) SHALL render as its family's base sprite with a **position-keyed hue/filter** shift derived deterministically from its `location`, composited via the existing shared context-art component. The change SHALL add ZERO new sprite asset files. The hue/filter SHALL be a pure function of `(familyId, location)` so a second device renders identically. This location channel SHALL remain visually distinct from the rarity channel and SHALL coexist with the existing decor / brain-wave-band context channels.

#### Scenario: Location variant renders base sprite with a derived hue/filter

- **WHEN** a second-lap location variant is rendered at any site (reveal, dex, maze walker)
- **THEN** it shows the family's base sprite with a hue/filter deterministically derived from its location
- **AND** no new sprite file is shipped for it

#### Scenario: Location hue/filter is deterministic and device-stable

- **WHEN** the same location variant is rendered on two devices
- **THEN** both compute the identical hue/filter from `(familyId, location)`

#### Scenario: Location channel coexists with existing context channels

- **WHEN** a location variant also has decor / brain-wave-band context art
- **THEN** the location hue/filter composites with them without replacing the rarity channel’s distinct styling

