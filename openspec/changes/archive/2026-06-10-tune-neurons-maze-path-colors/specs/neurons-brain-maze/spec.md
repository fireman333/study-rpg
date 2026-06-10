## MODIFIED Requirements

### Requirement: Maze SHALL read as a brain (neural-fiber design language)

The maze SHALL be styled to read as brain tissue, not a bare grid: a soft neural-tissue backdrop (cortical-fold / myelin texture on the dark signal palette), the weave corridors styled as axon fibers, the crossing-synapses as synaptic-bouton glyphs (brightening when potentiated), and the center as a dense synaptic core. The brain styling SHALL be realized through a **crafted 16×16 pixel-art tile atlas** (GBA-寶可夢 art direction) blitted at nearest-neighbor (no smoothing), NOT through procedural primitive shapes. Corridor fiber tiles SHALL be selected by **autotiling** — each corridor cell's structural tile (straight / curve / T-junction / 4-way cross / cap) is chosen from that cell's connectivity to its neighbours along the family routes, and the over/under weave at a crossing renders the over fiber unbroken and the under fiber gapped. Each family's corridor SHALL be rendered in that family's colour (so routes are traceable), tinted at render time from a single neutral fiber tile set rather than per-family atlas art; the **family colour SHALL be the corridor's dominant visual weight**, with the gold myelin sheath rendered as a framing accent on either side rather than the dominant band, so the 11 families are distinguishable by colour at a glance. The brain styling SHALL NOT obscure the redundant family encoding (corridor colour + node colour + node-shape) and SHALL respect reduced-motion (no required animation to perceive structure).

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
- **AND** the family colour is the corridor's dominant visual weight (the gold myelin sheath frames it rather than dominating), so the 11 families' colours are distinguishable at a glance
- **AND** node colour + node-shape redundancy remains for color-blind users
