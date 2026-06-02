# connectome-collection (delta) — Collection 2.0 Phase 2 spine

## REMOVED Requirements

### Requirement: Variant slot unlock SHALL emit event when family AP crosses one of five threshold values

**Reason**: Variants are now produced by the currency-gated gacha pull
(`neuron-variant-gacha`), not by AP threshold crossings. The
`connectome.variantSlotUnlocked` event, the AP threshold ladder
(`[10,30,80,200,500]`), and the `slotsCrossedByIncrement` / `nextSlotThreshold` /
`AP_THRESHOLDS` helpers are removed. `recordCorrectAnswer` no longer computes slot
crossings; it instead mints pull currency (see `neuron-variant-gacha` ADDED "Study
activity SHALL mint a neural-energy pull currency").

## MODIFIED Requirements

### Requirement: Per-family Action Potential SHALL be tracked as monotonic counter incremented by correct quiz answers

The neurons mode SHALL maintain a per-neuron-family `actionPotential` (AP) counter
that:

- Starts at 0 for each of the 11 families on save creation
- Increments by exactly 1 for every correct quiz answer attributed to that family
  (plus any active DMN family-buff bonus)
- Is monotonic (never decreases — no per-day reset, no decay)
- Persists across sessions via the local Dexie `familyAccrual` table

AP is a **display + progression signal** (shown on the connectome homepage, and
recorded as `apAtUnlock` provenance at pull time). AP SHALL NOT gate variant
collection — variant acquisition is the `neuron-variant-gacha` capability's
currency-gated pull. AP is distinct from `pullCount` (the per-family P0 pity clock).

#### Scenario: Initial AP is zero for all families

- **GIVEN** the player creates a new save in neurons-tw
- **THEN** every family's `actionPotential` SHALL equal 0
- **AND** the `familyAccrual` table SHALL contain one row per family initialized with
  `ap = 0` and `pullCount = 0`

#### Scenario: Correct answer increments AP by exactly 1

- **GIVEN** a family's current `actionPotential` is `X`
- **WHEN** the player answers a question correctly attributed to that family
- **THEN** that family's `actionPotential` SHALL become `X + 1` (plus DMN bonus if active)
- **AND** no `connectome.variantSlotUnlocked` event SHALL be emitted (the event no longer exists)

#### Scenario: AP no longer unlocks variants

- **GIVEN** a family's AP crosses any value (e.g. 10, 30, 80)
- **WHEN** the answer commits
- **THEN** no variant row SHALL be created as a result of the AP value
- **AND** variants SHALL only be created by an explicit player pull

### Requirement: Connectome homepage view SHALL display all 11 families grouped by NT branch on the homepage with a dimmed-skeleton empty state

The neurons mode SHALL render the connectome on the homepage route (`/`) consisting
of:

- The polished SVG Linnean tree as the primary visual
- A family-detail section organized into 4 NT-branch groups (`DA` / `5-HT` / `GABA` /
  `Glu`), each listing its family cards
- Each family card SHALL display: family `displayName`, sprite (via `artKey`), current
  `actionPotential`, the `🧬 X / 6` collection chip, and a `firedToday` badge when
  applicable. The card SHALL **NOT** display a "next slot threshold" / "MAX" line
  (slot-unlock thresholds are removed).

When the `synapses` table is empty, the tree SHALL render a dimmed grayscale skeleton
of all 11 families + NT-branch structure plus an action-guidance callout naming the
N=5 same-day co-fire rule. The family-card detail section SHALL remain accessible and
SHALL NOT be hidden behind a default-collapsed section.

#### Scenario: Homepage family card shows AP and collection chip, not a slot threshold

- **WHEN** the homepage renders a family card
- **THEN** the card SHALL show `displayName`, sprite, `actionPotential`, and the
  `🧬 X / 6` chip
- **AND** the card SHALL NOT show a "next slot threshold" or "MAX" line

#### Scenario: Homepage renders all 11 families in correct NT-branch groups

- **WHEN** the homepage renders
- **THEN** there SHALL be exactly 4 NT-branch groups (`DA`, `5-HT`, `GABA`, `Glu`)
- **AND** every content-pack family SHALL appear in exactly one group matching its
  `ntBranch`

#### Scenario: Empty connectome renders a dimmed skeleton plus guidance

- **WHEN** the `synapses` table is empty
- **THEN** the tree SHALL render a dimmed grayscale skeleton of all 11 family leaves +
  the 4 NT-branch structure
- **AND** an action-guidance callout SHALL name the N=5 same-day co-fire rule
