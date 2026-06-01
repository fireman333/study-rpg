## ADDED Requirements

### Requirement: A dedicated /collection route SHALL exist with a single navbar entry

The neurons mode SHALL register a `/collection` route rendering the variant dex page, reachable from exactly one navbar `NavLink` (alongside the existing home / dmn / bookmarks / achievements / leaderboard links). The page SHALL NOT be embedded inside the connectome homepage.

#### Scenario: Navbar link navigates to the collection page

- **WHEN** the player clicks the collection navbar link
- **THEN** the app SHALL navigate to `/collection`
- **AND** the variant dex page SHALL render

#### Scenario: Direct navigation to /collection renders the dex

- **WHEN** the player loads `/collection` directly (fresh navigation or reload)
- **THEN** the variant dex page SHALL render without redirecting away

### Requirement: The dex SHALL show all 5 slots per family with uncollected slots as silhouettes carrying their unlock threshold

The page SHALL render every family's 5 slots derived from the variant catalog. A slot whose `(familyId, slotIndex)` variant has been collected SHALL render as a collected card; a slot not yet collected SHALL render as a dimmed silhouette displaying the slot's AP unlock threshold (slot 1→10, 2→30, 3→80, 4→200, 5→500). The dex SHALL render the complete slot set even when nothing is collected.

#### Scenario: Uncollected slot renders a silhouette with its threshold

- **GIVEN** the player has not collected `(familyId='藥理學', slotIndex=3)`
- **WHEN** the collection page renders
- **THEN** that slot SHALL render as a dimmed silhouette
- **AND** it SHALL display the slot-3 AP unlock threshold (80)

#### Scenario: Collected slot renders a full card

- **GIVEN** the player has collected `(familyId='藥理學', slotIndex=1)`
- **WHEN** the collection page renders
- **THEN** that slot SHALL render as a collected variant card (not a silhouette)

#### Scenario: Empty collection renders an all-silhouette dex, never a blank page

- **GIVEN** the player has collected zero variants
- **WHEN** the collection page renders
- **THEN** all 55 slots SHALL render as silhouettes with their thresholds
- **AND** the page SHALL NOT be blank

### Requirement: Slots SHALL be grouped by family with family-filter chips defaulting to all-shown

The dex SHALL group slots into one section per neuron family (each section a labelled row of that family's 5 slots). A family-filter chip bar (reusing the existing `.filter-bar` component) SHALL be present. With no chip selected, ALL families SHALL be shown. Selecting one or more chips SHALL narrow the view to those families; the chips SHALL act as additive narrowing, not a gate that hides everything by default.

#### Scenario: Default view shows all families

- **WHEN** the collection page first renders with no filter chip selected
- **THEN** all 11 family sections SHALL be visible

#### Scenario: Selecting a family chip narrows to that family

- **GIVEN** the player selects the `藥理學` family chip
- **THEN** only the `藥理學` section SHALL be shown
- **AND** clearing the chip SHALL restore all families

### Requirement: Each collected variant card SHALL show sprite, name, rarity, description, pity chip, and a reserved caption row

A collected variant card SHALL display the variant's sprite (`spriteKey`), `displayName`, rarity badge, the catalog `description` blurb, and a `保底` chip when `wasPityFloor` is true. The card SHALL include a reserved single-line caption row (empty placeholder in this change) that a later capability fills with provenance text without causing layout reflow. The card SHALL NOT show a slot number/name label.

#### Scenario: Collected card renders all baseline fields plus reserved caption row

- **GIVEN** a collected variant with `wasPityFloor=false`
- **WHEN** its card renders
- **THEN** the card SHALL show the sprite, `displayName`, rarity badge, and catalog description
- **AND** the card SHALL include an empty reserved caption row element
- **AND** no `保底` chip SHALL be shown

#### Scenario: Pity-floor variant shows the 保底 chip

- **GIVEN** a collected variant with `wasPityFloor=true`
- **WHEN** its card renders
- **THEN** the card SHALL show a `保底` chip

### Requirement: The player SHALL be able to set one representative variant per family, persisted and validated

The page SHALL let the player select one collected variant per family as that family's representative. The selection SHALL persist in a `meta` key (`representativeVariants`, a map `familyId → slotIndex`). Setting a representative SHALL be rejected (no-op) if that `(familyId, slotIndex)` is not collected. The current representative SHALL be visually marked on its card. A stored representative pointing at a slot that is no longer collected SHALL be treated as absent at read time.

#### Scenario: Selecting a collected variant sets it as representative

- **GIVEN** the player has collected `(familyId='藥理學', slotIndex=2)`
- **WHEN** the player sets it as the `藥理學` representative
- **THEN** the `representativeVariants` meta key SHALL map `藥理學 → 2`
- **AND** that card SHALL show the representative marker

#### Scenario: Cannot set an uncollected slot as representative

- **GIVEN** the player has NOT collected `(familyId='藥理學', slotIndex=5)`
- **WHEN** a set-representative is attempted for `藥理學 → 5`
- **THEN** the write SHALL be rejected (no-op)
- **AND** the prior representative (if any) SHALL be unchanged

#### Scenario: Stale representative is treated as absent

- **GIVEN** `representativeVariants` maps `藥理學 → 3` but that variant is not in the collected set
- **WHEN** the page reads representatives
- **THEN** `藥理學` SHALL be treated as having no representative

### Requirement: Representative selection SHALL sync cross-device via the neurons R2 bundle

The `representativeVariants` meta key SHALL be included in the neurons R2 bundle's synced meta-key allowlist. The bundle `SCHEMA_VERSION` SHALL bump from 5 to 6. Cross-version reads SHALL remain tolerant (a client at a higher `SCHEMA_VERSION` reading a lower-version bundle, or vice versa, SHALL NOT error; unknown keys are dropped, absent keys preserved), reusing the existing `validateBundleMeta` tolerance.

#### Scenario: Representative selection round-trips through sync

- **GIVEN** the player sets a representative and the neurons bundle is pushed
- **WHEN** the same account pulls on another device
- **THEN** the pulled state SHALL include the `representativeVariants` meta key with the same mapping

#### Scenario: Older client tolerates the v6 bundle

- **GIVEN** a client at `SCHEMA_VERSION = 5` reads a bundle at `SCHEMA_VERSION = 6`
- **WHEN** the bundle is validated
- **THEN** no error SHALL be raised
- **AND** the unknown `representativeVariants` key SHALL be dropped by that older client without breaking the pull

### Requirement: The collection page SHALL be responsive desktop-to-mobile

The dex slot grid SHALL use an intrinsic auto-fill column track (`repeat(auto-fill, minmax(150px, 1fr))`, matching the shipped `DmnCollectionPage`) so column count reflows with available width — more columns on desktop, progressively fewer on narrow viewports (down to 1–2 columns on phones). The filter chip bar SHALL wrap and remain usable at mobile widths.

#### Scenario: Slot grid reflows fewer columns as viewport narrows

- **GIVEN** the collection page renders across desktop and phone widths
- **THEN** the slot grid SHALL show several columns on desktop (e.g. ≥ 4 at ≥ 768px) and reflow to 1–2 columns on phone widths (≤ 414px)
- **AND** the filter chip bar SHALL wrap and remain usable at mobile widths
