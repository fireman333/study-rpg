## ADDED Requirements

### Requirement: Maze renders as a filled brain-tissue tile field with carved corridors

The maze SHALL render as a **filled** pixel-tile field: cells that are not part of a family corridor SHALL read as brain-tissue **WALL** tiles (cerebral-cortex gyri/sulci texture, with enough variation to avoid obvious repetition), and family corridors SHALL be **carved** as wide (≥ 2-cell), high-contrast path lanes — the chunky filled-maze aesthetic (C64/GBA), NOT thin threads on an empty background. Source tiles SHALL be 32×32.

The wall field SHALL be rendered efficiently as a tiled pattern (it MUST NOT blit one wall tile per grid cell every frame). Wall→corridor boundaries SHALL use code-selected **autotile edge** pieces (isolated / straight / outer-corner / inner-corner / T / cross) derived from the corridor mask so edges and corners are consistent. Neuron motifs — soma **nodes**, axon/myelin **path**, **synapse** crossings, **spark** — SHALL be drawn as **render-time overlays** keyed to the maze graph, not baked into a single path tile. All tile assets SHALL be remapped to **one fixed limited palette** (single source of truth). The canvas SHALL disable image smoothing so zoomed-in tiles stay crisp.

The default (zoomed-out) view SHALL read as a brain cross-section (filled cortical tissue with carved sulci-like paths); zooming in (existing desktop zoom/pan) SHALL reveal crisp chunky tiles. This requirement is **presentational only**: it SHALL NOT change maze topology (the committed grid graph's nodes, synapses, or weave cells), the per-family energy economy, the fog-of-war derivation, or the settle = only-pull-path mechanic. Corridor widening MAY be achieved by render-time dilation of the corridor mask without regenerating the grid graph.

#### Scenario: Filled brain-tile maze renders at default zoom

- **WHEN** the maze loads at the default zoom
- **THEN** non-corridor cells render as brain-tissue wall tiles and family corridors render as wide carved high-contrast lanes (a filled maze, not thin threads)
- **AND** the overall image reads as a brain cross-section

#### Scenario: Chunky crisp tiles on zoom-in

- **WHEN** the player zooms in with the existing desktop zoom
- **THEN** tiles render as crisp chunky pixels (no smoothing) with neuron soma / synapse / spark overlays visible on the carved paths

#### Scenario: Redesign is presentational only

- **WHEN** the filled-tile visual redesign is applied
- **THEN** maze topology (nodes / synapses / weave), the per-family energy economy, fog-of-war behavior, and the settle/pull mechanic are unchanged

### Requirement: Brain-image backdrop with neuron-symbol landmark overlays

Behind the carved-corridor tile field the maze SHALL render a **brain-image backdrop** — a muted top-down cerebral image (two hemispheres, central longitudinal fissure, white-matter fibers) — scaled to span the whole maze and drawn faintly enough that the corridors, routes, and nodes remain legible on top. The backdrop's scale and opacity SHALL be tunable, and the maze's outer (square) boundary SHALL be feathered into the panel frame so it does not read as a hard rectangle.

The maze SHALL also draw a layer of **textbook neuron-symbol landmark sprites** anchored on the committed maze graph: neuron **somata** at each family's tract origin, **synapse** boutons on the inner terminals converging toward the center, and **glia** (astrocytes, oligodendrocytes) distributed along the tracts. Landmark placement SHALL be anatomically grounded — soma at tract origins; synapse boutons at terminals, NOT at simple white-matter crossings; glia interfascicular / tiling — and landmarks SHALL be drawn UNDER the corridor routes so each axon tract flows continuously through the cell. Landmarks SHALL NOT reveal any node's identity or rarity (fog-of-war preserved); the always-visible origin somata are neutral anchors only.

This requirement is presentational only: it SHALL NOT change maze topology, the per-family energy economy, fog-of-war derivation, or the settle/pull mechanic.

#### Scenario: Brain backdrop reads at default zoom

- **WHEN** the maze loads at the default zoom
- **THEN** a muted brain image spans the maze behind the corridors, the square boundary is feathered into the dark frame, and the maze tiles + routes remain legible on top

#### Scenario: Neuron landmarks populate the tracts without breaking fog-of-war

- **WHEN** the maze renders
- **THEN** neuron-symbol sprites (soma / synapse / glia) appear at anatomically-grounded positions along the tracts, drawn under the gold routes
- **AND** no landmark reveals an unexplored node's identity or rarity

## MODIFIED Requirements

### Requirement: Color-blind-friendly team encoding

The maze SHALL encode each family's identity using redundant channels — a per-family **color tint**, each family's **distinct carved corridor route** through the shared grid (a spatial, non-color channel), and a per-family **node/marker shape** — so families are distinguishable without relying on color alone. The family→color mapping SHALL be a neutral, arbitrary-but-distinguishable assignment that asserts no neurotransmitter taxonomy.

#### Scenario: Families distinguishable without color

- **WHEN** the maze is rendered with color information removed (grayscale)
- **THEN** families are still distinguishable by their distinct corridor routes and node/marker shapes
- **AND** no color is presented as a neurotransmitter claim
