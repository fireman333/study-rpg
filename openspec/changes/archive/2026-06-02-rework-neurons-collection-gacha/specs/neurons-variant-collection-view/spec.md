# neurons-variant-collection-view (delta) — Collection 2.0 Phase 2 spine

## REMOVED Requirements

### Requirement: The dex SHALL show all 5 slots per family with uncollected slots as silhouettes carrying their unlock threshold

**Reason**: The slot model changes from 5 AP-unlock slots to 6 fixed-rarity slots
(P0–P5), and AP no longer gates collection. Replaced by the 6-slot rarity-labeled
dex (see ADDED "The dex SHALL show all 6 slots per family with uncollected slots as
rarity-labeled silhouettes").

## MODIFIED Requirements

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

## ADDED Requirements

### Requirement: The dex SHALL show all 6 slots per family with uncollected slots as rarity-labeled silhouettes

The page SHALL render every family's **6** slots (`slotIndex 0..5`, one per rarity
tier P0–P5) derived from the variant catalog. A collected `(familyId, slotIndex)`
SHALL render as a collected card; an uncollected slot SHALL render as a dimmed
silhouette displaying the slot's **rarity** (e.g. `P0` / `P5`) — NOT an AP unlock
threshold (AP no longer gates collection). The dex SHALL render the complete 66-slot
set even when nothing is collected.

#### Scenario: Uncollected slot renders a silhouette with its rarity

- **GIVEN** the player has not collected `(familyId='藥理學', slotIndex=0)` (P0)
- **WHEN** the collection page renders
- **THEN** that slot SHALL render as a dimmed silhouette displaying `P0` (not an AP threshold)

#### Scenario: Empty collection renders an all-silhouette 66-slot dex

- **GIVEN** the player has collected zero variants
- **WHEN** the page renders
- **THEN** all 66 slots SHALL render as rarity-labeled silhouettes and the page SHALL NOT be blank

#### Scenario: Collected slot renders a full card

- **GIVEN** the player has collected `(familyId='藥理學', slotIndex=1)`
- **WHEN** the page renders
- **THEN** that slot SHALL render as a collected variant card (not a silhouette)

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
