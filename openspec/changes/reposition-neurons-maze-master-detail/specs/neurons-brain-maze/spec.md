## MODIFIED Requirements

### Requirement: Maze is the homepage route

The system SHALL render the unified square grid maze on the neurons-tw homepage at route `/` in `apps/neurons-tw`, covering all 11 subject families on one shared grid (no neurotransmitter regions). The prior beta route `/maze-beta` SHALL redirect to `/`. There SHALL be exactly **one** maze canvas instance on the homepage. The maze SHALL be **embedded in the homepage's family-grid master-detail surface** (per `neurons-homepage`) rather than rendered as a standalone full-width centerpiece: on wide viewports (≥ 768px) as the **sticky detail panel** beside the family-card list, and on narrow viewports (< 768px) as a single panel that expands **adjacent to the selected family card**. The maze SHALL be **collapsed by default to a slim teaser strip**, expanding when the player taps the teaser or any family card; the expand/collapse preference SHALL persist device-locally (NOT synced). When expanded the maze SHALL host its own exploration UI (walker, fog, synapse overlay, 🔭 全覽 recenter) and SHALL remain the canonical view of the whole connectome (the per-subject view is this same map framed to a family, not a separate maze).

#### Scenario: Grid maze renders embedded in the homepage master-detail

- **WHEN** the user navigates to `/`
- **THEN** the unified square grid maze is present as the family-grid master-detail's detail panel (one canvas instance), collapsed to a teaser by default
- **AND** no four-region brain map and no connectome tree is rendered
- **AND** expanding it (teaser tap or family-card tap) reveals the full maze with its exploration UI

#### Scenario: Legacy maze-beta route redirects home

- **WHEN** the user navigates to `/maze-beta`
- **THEN** the app redirects to `/`

#### Scenario: All 11 families present on the grid

- **WHEN** the maze loads its node set
- **THEN** the grid contains the border entry, corridor, and nodes for all 11 families
- **AND** each family's node count equals that family's variant-slot count

#### Scenario: Per-subject view is the whole map focused, not an isolated mini-maze

- **WHEN** the player selects a family card
- **THEN** the single embedded maze expands (if collapsed) and flies its camera to that family's cluster, with the rest of the connectome (neighbouring families + cross-subject synapses) still part of the same map
- **AND** a 🔭 全覽 control returns the camera to the whole-connectome view
- **AND** no second canvas or isolated single-family maze is mounted

## ADDED Requirements

### Requirement: Selecting a family SHALL spotlight its tract, with reverse walker-select

When a family is selected (its card tapped, per `neurons-homepage`), the single embedded maze SHALL **emphasise** that family's tract — dimming the other families' corridors + lit nodes while keeping cross-subject synapse sparks and landmarks at full strength (the「fire together, wire together」cross-subject metaphor is NOT weakened) — and SHALL surface a clear-emphasis affordance (🔭 全覽, and a 🎯 chip where the topbar is shown). Conversely, **tapping a family's walker sprite on the maze** (a clean tap, not a pan/drag) SHALL select that family and scroll its card into view. Clearing the emphasis (全覽 / 🎯✕) SHALL flow through the recenter bus so the card selection and the maze emphasis clear together (one selection state).

#### Scenario: Card tap spotlights the family tract
- **WHEN** the player selects a family card
- **THEN** the maze dims the other families' tracts + lit nodes and the selected family's tract is emphasised
- **AND** cross-subject synapse sparks + landmarks remain at full strength
- **AND** a clear-emphasis control (🔭 全覽 / 🎯) is available

#### Scenario: Tapping a walker selects its card
- **WHEN** the player taps a family's walker sprite on the maze (a clean tap, not a pan/drag)
- **THEN** that family becomes selected and its card scrolls into view

### Requirement: Crossing a settle threshold SHALL play a one-shot neuron-travel reward animation

When a family's accumulated maze energy (from correct answers + per-subject reading) crosses a settle threshold that advances its growth cone — observed from the **existing** economy/settle signal; this requirement adds NO new counter and changes NO economy value or persistence — the maze SHALL play a one-shot animation of that family's walker travelling forward along its axon path (eased motion along the corridor polyline, a family-colour trail, and an arrival flourish). The animation SHALL be a **transient self-cancelling** effect (no steady-state render loop), SHALL be **deferred until any variant-reveal modal queue is idle** so it plays unobstructed, and SHALL degrade under `prefers-reduced-motion` to an instant snap (no travel). An advance that arrives via background state hydration / cloud rehydration (already-reconciled, no live settle tick) SHALL NOT trigger it.

#### Scenario: A live settle plays the travel animation
- **WHEN** a family's energy crosses a settle threshold during play (a live advance)
- **THEN** its walker animates travelling forward along its path with a trail + arrival flourish
- **AND** the effect is one-shot (no persistent loop) and a single maze canvas is used
- **AND** if a variant-reveal modal is open, the travel is deferred until the reveal queue is idle

#### Scenario: Reduced-motion and hydration do not animate
- **WHEN** reduced-motion is active, OR the advance came from state hydration / cloud rehydration rather than a live settle
- **THEN** the walker snaps to its new position with no travel animation
