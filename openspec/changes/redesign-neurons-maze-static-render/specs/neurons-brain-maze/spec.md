## ADDED Requirements

### Requirement: Maze SHALL render as a static panorama with event-driven overlays (no per-frame repaint)

The maze SHALL render its base scene (brain-tissue tiles, corridors, gold routes, per-family colour cores, neuron-symbol landmarks, and node pins) as a **statically-rendered layer drawn on demand** — once on mount and again only on discrete changes (exploration progress, theme switch) — NOT repainted every animation frame. The renderer SHALL NOT run a continuous steady-state `requestAnimationFrame` loop; a transient rAF MAY drive a single one-shot animation (a walker glide or a focus fly) and SHALL stop when that animation completes. Pan and zoom SHALL be realized as a **CSS transform** on the maze stage (GPU-composited), updated only on user input — native pinch-zoom on touch devices, and wheel-zoom + drag-pan on desktop — and SHALL preserve page-scroll containment (the maze SHALL NOT trap page scroll). All dynamic elements SHALL be **event-driven overlays** that update only when their state changes, never at a fixed frame rate: the exploration **walker** (glides one segment on a settle), **fog/node reveal** (a newly-lit node reveals on exploration), the **synapse overlay** (re-drawn when wires change, with a one-shot pulse on wiring), **focus-on-family** (a one-shot CSS-transform transition to that family's cluster — which also serves as the per-subject focused view), and the **ambient firing** animation (lightweight CSS keyframes, compositor-driven, gated by reduced-motion). The same static renderer SHALL serve both desktop and mobile (a single renderer). This change SHALL preserve all existing maze behaviour — routes, fog-of-war exploration, settle/pull economy, synapse formation/strengthening, focus-on-family, atlas rendering + graceful fallback — and SHALL NOT change `grid-graph.json` routes, the per-family economy, the Dexie schema, or the R2 bundle `SCHEMA_VERSION`. (The route **colour** model is upgraded per the route-colour requirement below — not preserved — but adds no new state.)

#### Scenario: No continuous per-frame repaint at rest
- **WHEN** the maze is displayed and the player is not interacting and no exploration/wiring event is in flight
- **THEN** the renderer SHALL NOT be repainting the canvas every frame (no steady-state `requestAnimationFrame` loop)
- **AND** the base scene remains displayed statically

#### Scenario: Pan/zoom is a GPU-composited transform
- **WHEN** the player pinch-zooms (touch) or wheel-zooms + drags (desktop)
- **THEN** the maze pans/zooms via a CSS transform updated on the input event (not a per-frame canvas redraw)
- **AND** the page still scrolls normally past the maze (the maze does not trap page scroll)

#### Scenario: Dynamic elements update only on their events
- **WHEN** the player advances exploration (a settle), forms/strengthens a synapse, or taps a family card to focus
- **THEN** the corresponding overlay updates as a one-shot (walker glides a segment / node reveals / synapse layer redraws + pulses / camera transform transitions to the cluster)
- **AND** none of these introduces a continuous steady-state animation loop

#### Scenario: Behaviour and data are unchanged
- **WHEN** this render re-architecture ships
- **THEN** the committed `grid-graph.json` routes, the per-family economy, the Dexie schema version, and the R2 bundle `SCHEMA_VERSION` are all unchanged
- **AND** fog-of-war, settle/pull, synapse formation, focus-on-family, and atlas fallback all behave as before (the route colour model is upgraded per the route-colour requirement below)

### Requirement: Maze route colour SHALL encode each corridor cell's up-to-3 most-progressed families

The maze route layer SHALL colour each **walked** corridor cell with the colours of the **up to three most-progressed families** that pass through that cell, rendered as concentric thin bands over a neutral base myelin sheath (the gold myelin SHALL be demoted to that base/frame, no longer the dominant or default band). "Walked" means a family's exploration frontier has reached/passed the cell (reusing the existing fog/explored-prefix logic); a cell no family has walked yet SHALL remain the faint fog baseline. A cell walked by one or two families SHALL show one or two bands; a cell walked by three or more SHALL show exactly the three most-progressed (the per-cell cap is three, so a densely-shared trunk cell — up to all 11 families — SHALL NOT attempt to stack more than three bands). "Most-progressed" SHALL be ranked by each family's already-synced settle-progress counter (`maze:<familyId>:settles`, a member of `SYNCED_META_KEYS`), so the colour ordering is **consistent across devices** and the colour model SHALL add **no new meta key, no `SYNCED_META_KEYS` entry, no Dexie store, and no R2 `SCHEMA_VERSION` change**; ties (e.g. before any settle) SHALL fall back to a deterministic family order. The colour computation SHALL run inside the on-demand static base bake and be re-baked only on discrete change (a settle that changes a family's progress or the explored frontier), never per animation frame. The redundant non-colour family encoding (the distinct carved route + node/marker shape) SHALL remain intact so families stay distinguishable on shared segments and for color-blind users.

#### Scenario: Exclusive corridor cell shows its family's colour
- **WHEN** a corridor cell is on exactly one family's route and that family has walked it
- **THEN** the cell is rendered in that family's colour over the neutral base sheath

#### Scenario: Densely-shared cell shows its three most-progressed families, capped
- **WHEN** a corridor cell is shared by four or more families that have walked it
- **THEN** the cell renders exactly three concentric bands — the three most-progressed families (ranked by settle progress) — and does not attempt to render a band per family

#### Scenario: Colour ordering is consistent cross-device with zero new state
- **WHEN** the route colour bake ranks families for a shared cell
- **THEN** it ranks by the already-synced `maze:<familyId>:settles` counter, adding no new meta key and no `SYNCED_META_KEYS` / R2 `SCHEMA_VERSION` / Dexie change
- **AND** the same account on another device computes the same ordering (the rank key is MAX-merged cross-device)

## MODIFIED Requirements

### Requirement: Maze SHALL read as a brain (neural-fiber design language)

The maze SHALL be styled to read as brain tissue, not a bare grid: a soft neural-tissue backdrop (cortical-fold / myelin texture on the dark signal palette), the weave corridors styled as axon fibers, the crossing-synapses as synaptic-bouton glyphs (brightening when potentiated), and the center as a dense synaptic core. The brain styling SHALL be realized through a **crafted 16×16 pixel-art tile atlas** (GBA-寶可夢 art direction) blitted at nearest-neighbor (no smoothing), NOT through procedural primitive shapes. Corridor fiber tiles SHALL be selected by **autotiling** — each corridor cell's structural tile (straight / curve / T-junction / 4-way cross / cap) is chosen from that cell's connectivity to its neighbours along the family routes, and the over/under weave at a crossing renders the over fiber unbroken and the under fiber gapped. Corridor colour SHALL be tinted at render time from a single neutral fiber tile set rather than per-family atlas art: a family's **exclusive** corridor segments SHALL be rendered in that family's colour, while a **shared** corridor cell SHALL render concentric thin bands of the up-to-3 most-progressed families that have walked it (per the route-colour requirement), with the gold myelin demoted to a base sheath rather than the dominant band — so a family's exclusive route is colour-traceable and the densely-shared lattice (84% of corridor cells are shared, 62% by ≥4 families) stays legible without an unrenderable per-family band stack. The brain styling SHALL NOT obscure the redundant family encoding (corridor colour + node colour + node-shape) and SHALL respect reduced-motion (no required animation to perceive structure).

#### Scenario: Maze is visually brain-themed

- **WHEN** the maze renders
- **THEN** corridors read as neural fibers over a neural-tissue backdrop, with synaptic-bouton crossing glyphs and a dense central core
- **AND** the family colour / node-shape encoding remains distinguishable over the brain styling

#### Scenario: Corridor tiles follow their direction

- **WHEN** a corridor turns, branches, or crosses another corridor
- **THEN** the rendered fiber tile matches the cell's connectivity (a curve at a turn, a junction where routes meet, a straight along a run)
- **AND** at a weave crossing the over fiber renders unbroken while the under fiber is gapped

#### Scenario: Corridor colour is traceable on exclusive segments and legible on shared ones

- **WHEN** the maze renders multiple families' corridors
- **THEN** a family's exclusive corridor segments are drawn in that family's colour (tinted from one neutral fiber tile set), so those segments trace that family
- **AND** a shared corridor cell shows concentric thin bands of its up-to-3 most-progressed families, with the gold myelin demoted to a base sheath rather than dominating
- **AND** node colour + node-shape redundancy (and the distinct carved route) remains so families stay distinguishable on shared segments and for color-blind users
