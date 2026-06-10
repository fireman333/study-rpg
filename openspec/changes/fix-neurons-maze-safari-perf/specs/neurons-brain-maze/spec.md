## MODIFIED Requirements

### Requirement: Maze SHALL render from a committed pixel-art tile atlas with graceful fallback

The maze renderer SHALL draw cells by blitting from a single committed pixel-art atlas asset (`apps/neurons-tw/src/assets/maze/tiles/maze-atlas.png`) addressed through a tile-index map, using `imageSmoothingEnabled = false` for crisp pixel scaling. The atlas SHALL contain the seamless structural tiles (neural-tissue background, axon corridor straight / curve / T / cross / cap, over-under weave bridge, fog) and the standalone hero glyphs (variant node neuron, synaptic bouton, center soma core, border entry portal, walker). Atlas adoption SHALL NOT change the committed maze routes, economy, schema, or sync (no Dexie or R2 bundle version bump). If the atlas asset fails to load, the renderer SHALL fall back to the procedural draw so the maze never displays broken images. To bound per-frame fill cost on high-cost canvas platforms, the renderer MAY cap the device-pixel-ratio backing-store resolution lower on Safari / iOS (e.g. 1.5×) than on other engines (2×), provided `imageSmoothingEnabled` stays off so the pixel-art tiles remain crisp; this platform-adaptive cap SHALL NOT change routes, economy, schema, or sync.

#### Scenario: Cells blit from the atlas

- **WHEN** the maze renders with the atlas loaded
- **THEN** each cell is drawn by blitting the indexed tile from the atlas at nearest-neighbor scaling

#### Scenario: Missing atlas degrades gracefully

- **WHEN** the atlas asset fails to load
- **THEN** the renderer draws the maze with the procedural fallback (no broken-image placeholder, no crash)

#### Scenario: Atlas adoption is presentation-only

- **WHEN** this change ships
- **THEN** the committed `grid-graph.json` routes, the per-family economy, the Dexie schema version, and the R2 bundle `SCHEMA_VERSION` are all unchanged

#### Scenario: DPR backing-store is capped lower on Safari / iOS

- **WHEN** the maze renders on a Safari / iOS engine
- **THEN** the device-pixel-ratio backing store MAY be capped lower (e.g. 1.5×) than on other engines (2×) to reduce per-frame fill cost
- **AND** `imageSmoothingEnabled` stays off so the tiles remain crisp
- **AND** routes, economy, schema, and sync are unchanged
