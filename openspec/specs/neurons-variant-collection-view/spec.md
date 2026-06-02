# neurons-variant-collection-view Specification

## Purpose

The `/collection` dex page for neurons-tw: a persistent surface to browse collected neuron variants. Pokédex-style — every family shows all 5 slots (collected cards + uncollected silhouettes carrying their AP unlock threshold), grouped by family, with family-filter chips that default to all-shown. Each collected card surfaces sprite / name / rarity / description / pity chip plus a reserved caption row that a later capability fills with provenance. The player may pick one collected variant per family as that family's representative, persisted in a `meta` key and synced cross-device (last-write-wins). This page is the prerequisite browse surface for `add-neurons-variant-provenance`.
## Requirements
### Requirement: A dedicated /collection route SHALL exist with a single navbar entry

The neurons mode SHALL register a `/collection` route rendering the variant dex page, reachable from exactly one navbar `NavLink` (alongside the existing home / dmn / bookmarks / achievements / leaderboard links). The page SHALL NOT be embedded inside the connectome homepage.

#### Scenario: Navbar link navigates to the collection page

- **WHEN** the player clicks the collection navbar link
- **THEN** the app SHALL navigate to `/collection`
- **AND** the variant dex page SHALL render

#### Scenario: Direct navigation to /collection renders the dex

- **WHEN** the player loads `/collection` directly (fresh navigation or reload)
- **THEN** the variant dex page SHALL render without redirecting away

### Requirement: Slots SHALL be grouped by family with family-filter chips defaulting to all-shown

The dex SHALL group slots into one section per neuron family (each section a labelled row of that family's 5 slots). A family-filter chip bar (mirroring the `YearFilterBar` pixel-chip pattern; neurons-tw has no shared `.filter-bar` CSS) SHALL be present. With no chip narrowing applied, ALL families SHALL be shown. Selecting one or more chips SHALL narrow the view to those families; the chips SHALL act as additive narrowing, not a gate that hides everything by default.

#### Scenario: Default view shows all families

- **WHEN** the collection page first renders with no filter chip narrowing applied
- **THEN** all 11 family sections SHALL be visible

#### Scenario: Selecting a family chip narrows to that family

- **GIVEN** the player narrows to only the `藥理學` family chip
- **THEN** only the `藥理學` section SHALL be shown
- **AND** restoring all chips SHALL show all families again

### Requirement: Each collected variant card SHALL show sprite, name, rarity, description, pity chip, and a reserved caption row

A collected card SHALL display the variant's sprite, `displayName`, rarity badge, the
catalog `description`, a `× N` copies badge when `copies > 1`, and a `保底` chip when
`wasPityFloor` is true (now meaning a P0 obtained via soft-pity). The card SHALL
include the reserved single-line caption row (filled by the provenance capability).
The card SHALL NOT show a slot-number label.

#### Scenario: Collected card renders baseline fields plus reserved caption row

- **GIVEN** a collected variant with `copies = 1` and `wasPityFloor = false`
- **WHEN** its card renders
- **THEN** the card SHALL show the sprite, `displayName`, rarity badge, and description
- **AND** include an empty reserved caption row, with no `× N` badge and no `保底` chip

#### Scenario: Duplicate count surfaces on the card

- **GIVEN** a collected variant with `copies = 3`
- **WHEN** its card renders
- **THEN** the card SHALL show a `× 3` copies badge

#### Scenario: P0 pity variant shows the 保底 chip

- **GIVEN** a collected P0 variant with `wasPityFloor = true`
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

### Requirement: Representative selection SHALL sync cross-device via the neurons R2 bundle with last-write-wins

The `representativeVariants` meta key SHALL be included in the neurons R2 bundle's synced meta-key allowlist. The bundle `SCHEMA_VERSION` SHALL bump from 5 to 6. The persisted value SHALL be a timestamped envelope (`{ map, updatedAt }`) reconciled **last-write-wins** by an `onPullComplete` post-pass (the generic meta adapter is first-write-wins, which is insufficient for an editable preference). Cross-version reads SHALL remain tolerant (a client at a higher `SCHEMA_VERSION` reading a lower-version bundle, or vice versa, SHALL NOT error; unknown keys are dropped, absent keys preserved), reusing the existing `validateBundleMeta` tolerance.

#### Scenario: Representative selection round-trips through sync (last-write-wins)

- **GIVEN** the player sets a representative and the neurons bundle is pushed
- **WHEN** the same account pulls on another device whose local value is older
- **THEN** the pulled state SHALL reconcile to the newer `representativeVariants` mapping

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

### Requirement: The dex SHALL show all pyramid slots per family with uncollected slots as rarity-labeled silhouettes

The page SHALL render **every slot the catalog declares for a family** (`slotIndex
0..N-1`, the family's pyramid total) derived from the variant catalog. A collected
`(familyId, slotIndex)` SHALL render as a collected card; an uncollected slot SHALL
render as a dimmed silhouette displaying the slot's **rarity** (e.g. `P0` / `P5`) —
NOT an AP unlock threshold (AP no longer gates collection). The slot count per family
SHALL be derived from the catalog, never hardcoded. The dex SHALL render the complete
slot set even when nothing is collected.

#### Scenario: Uncollected slot renders a silhouette with its rarity

- **GIVEN** the player has not collected `(familyId='藥理學', slotIndex=0)` (P0)
- **WHEN** the collection page renders
- **THEN** that slot SHALL render as a dimmed silhouette displaying `P0` (not an AP threshold)

#### Scenario: Empty collection renders an all-silhouette dex sized to the catalog

- **GIVEN** the player has collected zero variants
- **WHEN** the page renders
- **THEN** every catalog slot SHALL render as a rarity-labeled silhouette and the page
  SHALL NOT be blank

#### Scenario: Collected slot renders a full card

- **GIVEN** the player has collected `(familyId='藥理學', slotIndex=1)`
- **WHEN** the page renders
- **THEN** that slot SHALL render as a collected variant card (not a silhouette)

#### Scenario: A family with multiple variants in a tier renders each as its own slot

- **GIVEN** family `藥理學` declares two `P5` variants (`slotIndex` 1 and 6)
- **WHEN** the dex renders the 藥理學 section
- **THEN** both `P5` slots SHALL render as separate cards/silhouettes labeled `P5`

### Requirement: The collection page SHALL display the neural-energy balance and provide a per-family pull control

The `/collection` page SHALL show the current neural-energy **balance** (earned −
spent) in a header HUD that updates live. Each family section SHALL provide a **pull**
control labeled with the `PULL_COST`. The control SHALL be disabled when the balance
is below `PULL_COST` or when the family is fully collected (the latter showing a
全部收集 state). Activating the control SHALL invoke `pullVariant(familyId)` and
surface the pull reveal.

#### Scenario: Balance HUD reflects current energy

- **GIVEN** `neuralEnergyEarned = 50` and `neuralEnergySpent = 20`
- **WHEN** the collection page renders
- **THEN** the balance HUD SHALL show `30`

#### Scenario: Pull control disabled below cost

- **GIVEN** the balance is below `PULL_COST`
- **WHEN** the page renders a family's pull control
- **THEN** the control SHALL be disabled

#### Scenario: Pull control disabled when family fully collected

- **GIVEN** all 6 variants of a family are collected
- **WHEN** the page renders that family's pull control
- **THEN** the control SHALL be disabled and show a 全部收集 state

#### Scenario: Activating the control performs a pull

- **GIVEN** the balance ≥ `PULL_COST` and the family is not fully collected
- **WHEN** the player activates the pull control for that family
- **THEN** `pullVariant(familyId)` SHALL be invoked and the pull reveal SHALL surface

