## MODIFIED Requirements

### Requirement: Maze SHALL read as a brain (neural-fiber design language)

The maze SHALL be styled to read as brain tissue, not a bare grid: a soft neural-tissue backdrop (cortical-fold / myelin texture on the dark signal palette), the weave corridors styled as axon fibers, the crossing-synapses as synaptic-bouton glyphs (brightening when potentiated), and the center as a dense synaptic core. The brain styling SHALL be realized through a **crafted 16×16 pixel-art tile atlas** (GBA-寶可夢 art direction) blitted at nearest-neighbor (no smoothing), NOT through procedural primitive shapes. Corridor fiber tiles SHALL be selected by **autotiling** — each corridor cell's structural tile (straight / curve / T-junction / 4-way cross / cap) is chosen from that cell's connectivity to its neighbours along the family routes, and the over/under weave at a crossing renders the over fiber unbroken and the under fiber gapped. Each family's corridor SHALL be rendered in that family's colour (so routes are traceable), tinted at render time from a single neutral fiber tile set rather than per-family atlas art. The brain styling SHALL NOT obscure the redundant family encoding (corridor colour + node colour + node-shape) and SHALL respect reduced-motion (no required animation to perceive structure).

#### Scenario: Maze is visually brain-themed

- **WHEN** the maze renders
- **THEN** corridors read as neural fibers over a neural-tissue backdrop, with synaptic-bouton crossing glyphs and a dense central core
- **AND** the family colour / node-shape encoding remains distinguishable over the brain styling

#### Scenario: Corridor tiles follow their direction

- **WHEN** a corridor turns, branches, or crosses another corridor
- **THEN** the rendered fiber tile matches the cell's connectivity (a curve at a turn, a junction where routes meet, a straight along a run)
- **AND** at a weave crossing the over fiber renders unbroken while the under fiber is gapped

#### Scenario: Each family's corridor is colour-traceable

- **WHEN** the maze renders multiple families' corridors
- **THEN** each family's corridor is drawn in that family's colour (tinted from one neutral fiber tile set), so a route can be visually traced end to end
- **AND** node colour + node-shape redundancy remains for color-blind users

## ADDED Requirements

### Requirement: Maze SHALL render from a committed pixel-art tile atlas with graceful fallback

The maze renderer SHALL draw cells by blitting from a single committed pixel-art atlas asset (`apps/neurons-tw/src/assets/maze/tiles/maze-atlas.png`) addressed through a tile-index map, using `imageSmoothingEnabled = false` for crisp pixel scaling. The atlas SHALL contain the seamless structural tiles (neural-tissue background, axon corridor straight / curve / T / cross / cap, over-under weave bridge, fog) and the standalone hero glyphs (variant node neuron, synaptic bouton, center soma core, border entry portal, walker). Atlas adoption SHALL NOT change the committed maze routes, economy, schema, or sync (no Dexie or R2 bundle version bump). If the atlas asset fails to load, the renderer SHALL fall back to the procedural draw so the maze never displays broken images.

#### Scenario: Cells blit from the atlas

- **WHEN** the maze renders with the atlas loaded
- **THEN** each cell is drawn by blitting the indexed tile from the atlas at nearest-neighbor scaling

#### Scenario: Missing atlas degrades gracefully

- **WHEN** the atlas asset fails to load
- **THEN** the renderer draws the maze with the procedural fallback (no broken-image placeholder, no crash)

#### Scenario: Atlas adoption is presentation-only

- **WHEN** this change ships
- **THEN** the committed `grid-graph.json` routes, the per-family economy, the Dexie schema version, and the R2 bundle `SCHEMA_VERSION` are all unchanged
