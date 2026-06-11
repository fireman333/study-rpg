## MODIFIED Requirements

### Requirement: Maze is the homepage route

The system SHALL render the unified square grid maze on the neurons-tw homepage at route `/` in `apps/neurons-tw`, covering all 11 subject families on one shared grid (no neurotransmitter regions). The prior beta route `/maze-beta` SHALL redirect to `/`. There SHALL be exactly **one** maze canvas instance on the homepage, and that canvas SHALL remain in the same stable DOM node across all layout-state changes — collapse / expand / desktop detail-mode / mobile dock SHALL be CSS class-toggle / grid-template changes only, never a re-parent or remount of the canvas. The maze SHALL be **embedded in the homepage's family-grid master-detail surface** (per `neurons-homepage`) rather than rendered as a standalone full-width centerpiece: on wide viewports (≥ 768px) as a **full-width panel stacked ABOVE the family-card list (below the exam-year filter chips)** when no family is selected — the same vertical stacking order as narrow viewports (no side column, no sticky panel) — and as a **full-width detail panel** (the maze below a dock header, with the card grid collapsed and a single-row family chip rail below) when a family is selected; on narrow viewports (< 768px) as a single panel that **docks directly under the tapped family card** (CSS-positioned, DOM unchanged) without a page scroll-jump. The maze SHALL be **collapsed by default to a slim teaser strip**, expanding when the player taps the teaser or any family card; the expand/collapse preference SHALL persist device-locally (NOT synced), while the mobile dock anchor SHALL be ephemeral device-local-only state (NOT persisted, NOT synced). The maze SHALL NOT animate the size of its canvas container (size changes SHALL snap); the displayed-canvas backing store SHALL be capped both by the per-platform DPR cap AND by a display-area clamp so the larger detail-mode / dock stage cannot exceed the canvas-memory budget. When expanded the maze SHALL host its own exploration UI (walker, fog, synapse overlay, 🔭 全覽 recenter) and SHALL remain the canonical view of the whole connectome (the per-subject view is this same map framed to a family, not a separate maze).

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
