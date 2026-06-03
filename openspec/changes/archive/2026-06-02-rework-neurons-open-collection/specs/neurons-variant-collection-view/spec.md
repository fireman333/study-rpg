## ADDED Requirements

### Requirement: The collection page SHALL render only collected variants and hide the catalog total

The `/collection` dex SHALL render **only the variants the player has collected** (the `neuronVariants` rows). It SHALL NOT render uncollected slots as silhouettes, SHALL NOT pre-show the rarity of un-pulled variants, and SHALL NOT size any grid to the catalog's per-family slot count. The page SHALL NOT display a denominator, progress bar, `X / N`, `100%`, or 全部收集 anywhere — the finite catalog total (77) SHALL be invisible to the player. A collection总覽 / count chip SHALL render as a **pure count** (`🧬 X 隻`), never `🧬 X / N`. Collected cards SHALL still display their own rarity (knowledge earned by pulling). An empty collection SHALL NOT leave the page blank — the energy HUD, family headers, and pull controls SHALL still render.

#### Scenario: Only collected variants render; no silhouettes

- **GIVEN** the player has collected 3 variants in `藥理學` whose pyramid total is 7
- **WHEN** the collection page renders the 藥理學 section
- **THEN** exactly 3 collected cards SHALL render
- **AND** no silhouette / dimmed placeholder / rarity-labeled empty slot SHALL render for the 4 uncollected ones

#### Scenario: No denominator or completion indicator is shown

- **WHEN** the collection page renders with any number of collected variants
- **THEN** no `X / N`, progress bar, `100%`, or 全部收集 indicator SHALL appear
- **AND** any count chip SHALL read `🧬 X 隻` (pure count, no denominator)

#### Scenario: Empty collection renders a non-blank page

- **GIVEN** the player has collected zero variants
- **WHEN** the page renders
- **THEN** the energy balance HUD, the family headers, and the per-family pull controls SHALL still render
- **AND** no silhouette dex SHALL be shown

## MODIFIED Requirements

### Requirement: Slots SHALL be grouped by family with family-filter chips defaulting to all-shown

The dex SHALL group the player's **collected variants** into one section per neuron family (each section a labelled row of that family's collected variant cards; a family with zero collected variants renders its header with no cards). A family-filter chip bar (mirroring the `YearFilterBar` pixel-chip pattern; neurons-tw has no shared `.filter-bar` CSS) SHALL be present. With no chip narrowing applied, ALL families SHALL be shown. Selecting one or more chips SHALL narrow the view to those families; the chips SHALL act as additive narrowing, not a gate that hides everything by default.

#### Scenario: Default view shows all families

- **WHEN** the collection page first renders with no filter chip narrowing applied
- **THEN** all 11 family sections SHALL be visible (each showing only its collected cards)

#### Scenario: Selecting a family chip narrows to that family

- **GIVEN** the player narrows to only the `藥理學` family chip
- **THEN** only the `藥理學` section SHALL be shown
- **AND** restoring all chips SHALL show all families again

### Requirement: The collection page SHALL display the neural-energy balance and provide a per-family pull control

The `/collection` page SHALL show the current neural-energy **balance** (earned −
spent) in a header HUD that updates live. Each family section SHALL provide a **pull**
control labeled with the `PULL_COST`. The control SHALL be disabled **only** when the
balance is below `PULL_COST`. The control SHALL NOT be disabled when the family is
fully collected — pulling a fully-collected family is permitted and yields a duplicate
(there SHALL be no 全部收集 disabled state). Activating the control SHALL invoke
`pullVariant(familyId)` and surface the pull reveal.

#### Scenario: Balance HUD reflects current energy

- **GIVEN** `neuralEnergyEarned = 50` and `neuralEnergySpent = 20`
- **WHEN** the collection page renders
- **THEN** the balance HUD SHALL show `30`

#### Scenario: Pull control disabled below cost

- **GIVEN** the balance is below `PULL_COST`
- **WHEN** the page renders a family's pull control
- **THEN** the control SHALL be disabled

#### Scenario: Pull control stays enabled when family fully collected

- **GIVEN** every variant of a family is collected AND the balance ≥ `PULL_COST`
- **WHEN** the page renders that family's pull control
- **THEN** the control SHALL remain enabled (no 全部收集 disabled state)
- **AND** activating it SHALL perform a pull that yields a duplicate

#### Scenario: Activating the control performs a pull

- **GIVEN** the balance ≥ `PULL_COST`
- **WHEN** the player activates the pull control for that family
- **THEN** `pullVariant(familyId)` SHALL be invoked and the pull reveal SHALL surface

## REMOVED Requirements

### Requirement: The dex SHALL show all pyramid slots per family with uncollected slots as rarity-labeled silhouettes

**Reason**: The open-collection范式 (this change) renders only collected variants and hides the catalog total from the player. Uncollected slots, silhouettes, pre-shown rarity, and catalog-sized grids are exactly the closed-cap Pokédex affordances being removed.

**Migration**: Replaced by the new requirement "The collection page SHALL render only collected variants and hide the catalog total". No data migration — the `neuronVariants` rows are unchanged; the rendering switches from catalog-driven (all slots) to collection-driven (collected rows only).
