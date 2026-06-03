## MODIFIED Requirements

### Requirement: Stub Connectome view SHALL display all 11 families grouped by NT branch plus a synapse table

The neurons mode SHALL ship a `/connectome` route view containing:

- A polished SVG Linnean phylogenetic tree as the primary visual (per the "Polished SVG Linnean tree" requirement below) rendered at the top of the route
- Below the tree, a supplemental detail section organized into 4 columns labeled by NT branch (`DA` / `5-HT` / `GABA` / `Glu`), with each column listing the family cards assigned to that branch (per content pack metadata)
- Each family card SHALL display: family `displayName`, sprite (via `artKey`), current `actionPotential`, next slot threshold (or "MAX" if all 5 slots unlocked), and a `firedToday` badge when applicable
- A synapse table section listing all rows from the `synapses` table with columns: family A `displayName`, family B `displayName`, state (`dormant` / `weak` / `strong`), `lastCoFireDate`, `daysSinceCoFire`
- An empty-state message when no synapses exist explaining the N=5 same-day co-fire rule

The supplemental column-card + table sections SHALL remain accessible (screen-reader friendly, keyboard navigable) and SHALL NOT be hidden behind a collapsed section by default. Synapse formation feedback to the user SHALL come from toast notifications (per the toast requirement) in addition to the tree's edge draw-in animation.

#### Scenario: Connectome view renders all 11 families in correct NT-branch columns

- **GIVEN** the player navigates to `/connectome`
- **WHEN** the page renders
- **THEN** there SHALL be exactly 4 NT-branch columns labeled `DA`, `5-HT`, `GABA`, `Glu` in the supplemental detail section
- **AND** every family from the content pack SHALL appear in exactly one column matching its `ntBranch` field
- **AND** every family card SHALL display `displayName`, sprite via `artKey`, `actionPotential`, and next slot threshold

#### Scenario: Empty-state message appears when no synapses exist

- **GIVEN** the `synapses` table is empty
- **WHEN** the page renders
- **THEN** the synapse table section SHALL show an empty-state message that names the rule (≥ 5 correct in 2 families on the same day forms a synapse)
- **AND** no rows SHALL appear in the synapse table

#### Scenario: Synapse table renders one row per synapse with state and lastCoFireDate

- **GIVEN** the `synapses` table contains a row with `pairKey = "藥理學|解剖學"`, `state = weak`, `lastCoFireDate = "2026-05-30"`
- **AND** today is `"2026-06-02"`
- **WHEN** the page renders
- **THEN** the synapse table SHALL contain a row showing family A `藥理學`, family B `解剖學`, state `weak`, `lastCoFireDate` `2026-05-30`, `daysSinceCoFire` `3`

## ADDED Requirements

### Requirement: Polished SVG Linnean phylogenetic tree SHALL render the connectome at the top of /connectome with state-driven edge styling

The `/connectome` route SHALL render a polished SVG visualization as its primary visual, organized as a Linnean phylogenetic tree with:

- A root spanning the full width of the visualization
- Exactly 4 NT-branch sub-roots labeled `DA`, `5-HT`, `GABA`, `Glu`, fanning out from the root with vertical spacing computed by a pure layout function (`layout.ts`); each sub-root SHALL be visually distinguishable via its label and the family color of its first child leaf
- 11 neuron-family leaf nodes — each family from the content pack SHALL appear as exactly one leaf attached to its declared `ntBranch` sub-root
- Each leaf node SHALL render the family's sprite (via `artKey`) at a size legible without zoom (≥ 32px on desktop, ≥ 28px on mobile), plus the family's `displayName` label adjacent to the sprite, plus the family's current `actionPotential` value in a small chip
- A `firedToday` indicator (visual halo or 🔥 glyph) SHALL appear on the leaf node when `firedToday` is true for that family

Synapses SHALL render as SVG `<path>` elements drawn between non-sibling family leaves (cross-NT-branch pairs only — same-NT-branch pairs do not form synapses per existing co-fire rules; the layout SHALL position them so cross-branch paths arc smoothly without crossing labels):

- `dormant` synapses (synapse row exists with state `dormant`): SHALL NOT render (no visible edge)
- `weak` synapses: SHALL render with stroke width 1.5px, color amber (`#b58900`), opacity 1.0, no glow
- `strong` synapses: SHALL render with stroke width 3px, color blue (`#268bd2`), opacity 1.0, plus a subtle glow filter (SVG `feGaussianBlur` or CSS `filter: drop-shadow`)

The SVG SHALL be responsive: at viewport width ≥ 768px it SHALL use a wide horizontal layout (root left, branches fanning right); at viewport width < 768px it SHALL switch to a compact vertical layout (root top, branches stacking down) without DOM remount (CSS / viewBox-driven, not React conditional rendering).

#### Scenario: SVG tree renders 4 NT-branch sub-roots and 11 family leaves

- **GIVEN** the player navigates to `/connectome` and the page renders
- **WHEN** the SVG tree mounts
- **THEN** there SHALL be exactly 4 NT-branch sub-root elements with `aria-label` attributes containing `DA`, `5-HT`, `GABA`, `Glu`
- **AND** there SHALL be exactly 11 family leaf elements, one per content-pack family
- **AND** each leaf SHALL be visually anchored under its declared `ntBranch` sub-root

#### Scenario: Synapse renders with state-driven styling

- **GIVEN** the `synapses` table contains a row with `pairKey = "藥理學|解剖學"`, `state = weak`
- **WHEN** the SVG tree mounts
- **THEN** the SVG SHALL contain a `<path>` element connecting the `藥理學` leaf and `解剖學` leaf with stroke width 1.5px and amber color
- **AND** no other dormant-state rows SHALL render a visible edge

#### Scenario: Compact vertical layout activates below 768px viewport

- **GIVEN** the page renders inside a viewport of width 600px
- **WHEN** the SVG tree mounts
- **THEN** the tree SHALL use a vertical (top-to-bottom) layout
- **AND** the root SHALL be positioned at the top with the 4 NT-branch sub-roots stacked beneath
- **AND** the same SVG DOM structure SHALL be used (no React conditional re-mount between layouts)

### Requirement: SVG tree synapse formation, strengthening, decay, and slot-unlock SHALL drive Framer Motion animations gated by useRespectsReducedMotion

The SVG tree SHALL animate state transitions using Framer Motion (`motion.path`, `motion.g`) and the timing tokens defined in `neurons-motion-library`'s `SYNAPSE_TIMINGS` requirement:

- **Synapse formation** (`connectome.synapseFormed` event arrives): the new edge `<path>` SHALL animate `pathLength` from 0 → 1 over `SYNAPSE_TIMINGS.formation` ms with an ease-out curve, while opacity holds at 1
- **Synapse strengthening** (`connectome.synapseStrengthened` event arrives): the existing edge `<path>` SHALL animate stroke width and color from weak (1.5px amber) to strong (3px blue), plus glow opacity 0 → 1, over `SYNAPSE_TIMINGS.strengthen` ms
- **Synapse decay** (`connectome.synapseDecayed` event arrives, transitioning strong→weak or weak→dormant): the edge SHALL animate either stroke style (strong→weak: width + color morph downward) or opacity (weak→dormant: fade to 0 and then remove from DOM after animation completes) over `SYNAPSE_TIMINGS.decay` ms
- **AP slot unlock** (`connectome.variantSlotUnlocked` event arrives): the family leaf node SHALL pulse — scale 1 → 1.15 → 1 with a brief halo glow expand and fade — over `SYNAPSE_TIMINGS.slotUnlock` ms

When the `useRespectsReducedMotion()` hook returns `true`, the tree SHALL skip all animations and apply the new visual state instantly (no `pathLength` draw-in, no stroke morph, no scale pulse, no glow expansion). State colors and stroke widths SHALL still reflect dormant / weak / strong correctly so that the visual hierarchy is preserved.

#### Scenario: Synapse formation animates pathLength draw-in over SYNAPSE_TIMINGS.formation ms

- **GIVEN** the SVG tree is mounted and `useRespectsReducedMotion()` returns `false`
- **WHEN** a `connectome.synapseFormed` event fires for the `藥理學|解剖學` pair
- **THEN** the new edge `<path>` SHALL animate `pathLength` from 0 to 1 over `SYNAPSE_TIMINGS.formation` ms
- **AND** the curve SHALL be ease-out (later half of duration slower than first half)
- **AND** the animation SHALL complete within `SYNAPSE_TIMINGS.formation` ms of the event

#### Scenario: Synapse decay weak→dormant fades the edge out and removes from DOM

- **GIVEN** the SVG tree shows a weak edge for the `藥理學|解剖學` pair
- **AND** `useRespectsReducedMotion()` returns `false`
- **WHEN** a `connectome.synapseDecayed` event fires transitioning the pair from `weak` → `dormant`
- **THEN** the edge SHALL animate opacity from 1 to 0 over `SYNAPSE_TIMINGS.decay` ms
- **AND** after the animation completes the edge SHALL be removed from the SVG DOM
- **AND** the surrounding leaf nodes SHALL NOT visually shift during the fade

#### Scenario: Reduced motion skips all animations but preserves state styling

- **GIVEN** the user has set OS preference `prefers-reduced-motion: reduce`
- **AND** `useRespectsReducedMotion()` therefore returns `true`
- **WHEN** a `connectome.synapseFormed` event fires for the `藥理學|解剖學` pair
- **THEN** the edge `<path>` SHALL appear instantly at its final weak styling (stroke width 1.5px amber, opacity 1)
- **AND** there SHALL be no `pathLength` draw-in animation
- **AND** the leaf nodes SHALL NOT pulse on subsequent `connectome.variantSlotUnlocked` events
