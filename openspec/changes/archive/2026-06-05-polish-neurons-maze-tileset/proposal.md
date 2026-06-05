## Why

The redesigned weave-grid maze (`redesign-neurons-maze-rotjs-grid`, shipped to `track-neurons`) renders every cell as a **procedural colored square** — a deliberate first cut (design D12) that ships the whole maze end-to-end with zero asset risk, but reads as a bare grid, not the GBA-寶可夢-style brain the owner wants. This change replaces those procedural tiles with a crafted 16×16 pixel-art atlas so the maze reads as brain tissue (axon fibers, synaptic boutons, soma core) before the redesign merges to `main` and deploys.

## What Changes

- Add a crafted **16×16 GBA-style pixel-art tile atlas** (`apps/neurons-tw/src/assets/maze/tiles/maze-atlas.png`) + a TS tile-index map, authored via the **hybrid source plan** locked in design D12: Aseprite-authored **seamless structural tiles** (neural-tissue background, axon corridor straight / curve / T / 4-way cross / cap, over-under weave bridge, fog) + Gemini/codex-generated **standalone hero glyphs** (variant node neuron, synaptic bouton, center soma core, border entry portal, walker growth-cone). Open-source CC0 sets used for palette inspiration only.
- Add **corridor autotiling** to the renderer: derive each cell's connectivity (straight H/V, curve ×4, T ×4, cross, cap) from consecutive `path` cells in each family's `grid-graph.json` route, combined with the over/under weave flag, to pick the correct structural tile. This logic does **not** exist today — the current renderer draws each cell as an independent square and fakes the weave only by gapping the under-family fiber.
- Swap the four procedural draw functions (`drawFiberCell` / `drawNodeGlyph` / `drawBouton` / `drawCore`) + the background checker-dither + the `GrowthConeGlyph` SVG fallback in `MazeGrid.tsx` to **blit from the atlas** (`ctx.drawImage(...)`, `imageSmoothingEnabled = false`) behind the same call sites. Camera / fog / contextual-camera / walker-overlay / synapse-overlay logic is untouched.
- Preserve the redundant per-family encoding (colour + node-shape) for color-blind support and the reduced-motion contract while moving to crafted tiles.
- Graceful degradation: if the atlas asset fails to load, the renderer falls back to the existing procedural draw so the maze never shows broken images.

This is **ART + render only**. The committed weave routes (`grid-graph.json`), economy, schema, and gameplay are unchanged.

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities

- `neurons-brain-maze`: the **"Maze SHALL read as a brain (neural-fiber design language)"** requirement is modified — the brain styling SHALL now be realized via a crafted 16×16 pixel-art atlas with corridor autotiling (not procedural primitive shapes), while keeping every existing constraint (redundant family encoding, reduced-motion, brain reading). One **ADDED** requirement covers the new atlas asset contract + autotiling derivation + nearest-neighbor blit + missing-asset fallback.

## Impact

- **Code**: `apps/neurons-tw/src/components/maze/MazeGrid.tsx` (autotiling + atlas blit behind the existing draw seam); new `apps/neurons-tw/src/assets/maze/tiles/` (atlas PNG + TS index map). Atlas-blit precedent already in this app (`apps/neurons-tw/src/lib/character-card-render.ts`, achievements badge/family-mastery atlases).
- **Assets**: ~1 atlas PNG (16×16 cells) authored via Aseprite MCP + Gemini/codex image gen.
- **No** Dexie `.version()` bump, **no** R2 bundle `SCHEMA_VERSION` bump, **no** upgrade fixture, **no** Worker change, **no** content/economy change — therefore no Dexie-upgrade-fixture lint trigger.
- **Out of scope**: circuit-location naming + 「在 XXX 尋獲的神經元」provenance 稱號 (separate change `name-neurons-maze-circuit-locations`); any route / topology / economy / first-pull change.
