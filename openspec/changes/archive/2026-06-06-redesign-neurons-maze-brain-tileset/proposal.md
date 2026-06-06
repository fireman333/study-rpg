## Why

The owner doesn't like the maze's current thin-line corridor weave — at the default whole-maze zoom each 99×99 cell renders at only ~7px, so it reads as faint threads, not a maze. The owner wants the chunky, **filled** pixel-tile look of a classic C64 maze (ref `~/Downloads/像素塊風格迷宮.jpg`: thick textured wall blocks + wide carved black paths) but themed so the tiles read as **brain/neuron** at a glance — cerebral-cortex gyri walls, neuron-soma path nodes, myelin/axon paths. This is a **visual-only** redesign (no gameplay, no schema): it makes the zoomed-out maze read as a brain cross-section and the zoomed-in maze read as clean chunky GBA tiles.

## What Changes

Scope locked via `/grill quick` (`~/.claude/scratch/grilled-maze-pixel-tile-redesign-2026-06-05.md`) + a Codex consult on pixel-tile art technique (folded into design.md). **Core method shift from the consult: AI generates seamless TEXTURE + symbol overlays only; all maze geometry (carved paths, autotile edges, overlays, tinting) is done in CODE + mask** — this avoids the "AI makes hi-res illustration that looks like pixel art but doesn't tile" trap.

- **Fixed 16-color brain palette** (`palette.png`) as the single source of truth; every tile asset is remapped to it (no per-image quantize) for a cohesive C64/GBA look.
- **AI-generated TEXTURE/REFERENCE assets only** (Gemini MCP first, codex / Chrome-MCP-3.5-Flash fallback per `~/.claude/imports/image_gen_routing.md`): ~4 seamless cerebral-cortex gyri/sulci **wall** textures (pink-grey, variants to avoid repetition) + symbol overlays (neuron **soma** node, **dendrite/axon-myelin** path motif, **synapse**-crossing icon, **electric-spark**, dotted **collectible** marker, **growth-cone** walker). Post-processed via ImageMagick (sharpen→posterize→`-resize 32x32! -filter point`→`-remap palette.png`; wall = light dither, icons = no dither).
- **Code-driven autotiling**: wall texture = base field; a black **path mask** (the family corridors, **widened to 2-3 cells**) carves the wide lanes; wall→path **edge pieces** (isolated / straight N-E-S-W / outer-corner / inner-corner / T / cross) are selected in code from the mask so path width, corners, and edges are always consistent.
- **Filled-wall canvas render** in `MazeGrid.tsx`: the wall field is a tiled canvas pattern (NOT ~9801 per-cell blits); carved paths + autotile edges + overlays (soma/synapse/spark + per-family multiply tint) draw on top. Nodes/synapses/spark are render-time overlays per the maze graph, not baked into tiles.
- **32×32 source tiles** (up from 16×16); `tile-index.ts` updated (`TILE_PX` 16→32, new tile names, new atlas layout). `BASE_TILE` / default zoom tuned so default view = brain gestalt, zoom-in = chunky tiles.
- **MVP-first build order** (Codex): ship ~8 production tiles, validate the renderer + look at 1×/2×/4×, then expand to the full rich set. Autotiling + exaggerated wall/path contrast matter more than any single tile.
- Rides the **existing** desktop mouse-wheel zoom + drag-pan. No new interaction.
- The atlas pipeline (`apps/neurons-tw/scripts/build-maze-atlas.mjs`) is reworked from procedural drawing → composing the AI textures + palette remap + (optionally pre-baked) autotile masks into the committed atlas.

## Capabilities

### New Capabilities

(none — visual redesign of an existing capability)

### Modified Capabilities

- `neurons-brain-maze`: MODIFY the visual/render requirements to specify the **filled brain-tissue tile field + carved wide paths + code-driven autotiling + render-time neuron overlays** aesthetic (32px tiles, fixed brain palette), while PRESERVING the existing normative guarantees — fog-of-war, no-neurotransmitter-taxonomy, redundant-channel (color + line-style + node-shape) color-blind encoding, settle = only pull path, synapse overlay read-only. The "Color-blind-friendly team encoding" requirement is updated to reflect the new visual still encoding family identity by ≥2 channels; a requirement is added/modified to mandate the filled-wall/carved-path tile aesthetic.

## Impact

- **Assets**: `apps/neurons-tw/src/assets/maze/tiles/` — new `palette.png`, regenerated `maze-atlas.png` (32px cells), new AI source textures (committed or build-input). `atlas-preview.png` / `real-maze-*.png` debug regenerated.
- **Build script**: `apps/neurons-tw/scripts/build-maze-atlas.mjs` reworked (procedural → AI-texture composition + palette remap + autotile masks).
- **Render**: `apps/neurons-tw/src/components/maze/MazeGrid.tsx` (filled-wall pattern + carved-path mask + autotile edge selection + overlays + 32px) and `apps/neurons-tw/src/assets/maze/tiles/tile-index.ts` (`TILE_PX`, tile names, layout).
- **Spec**: `openspec/specs/neurons-brain-maze/spec.md` (visual requirements delta).
- **ZERO schema/sync**: no Dexie `.version()` bump, no R2 `SCHEMA_VERSION` bump, no `SYNCED_META_KEYS` change. `grid-graph.json` ideally untouched (path widening = render-time mask dilation; if dilation smears the dense over/under weave, fall back to regenerating the graph → that would be schema-adjacent → flag to owner before doing it).
- **Out of scope (→ Change B `add-neurons-maze-zoom-and-focus`)**: mobile touch pinch-zoom, button-zoom-to-subject focus, answer/reading-time maze display. **Not touched**: maze topology (nodes/synapses/weave), any gameplay mechanic.
- **Risk**: AI image-gen flakiness (Gemini MCP may need the `Model.BASIC_FLASH` fix live; codex/Chrome-MCP fallbacks). Mitigated by MVP-first (validate 8 tiles before committing to the full set) and code-driven geometry (most of the "look" is the palette + autotile + contrast, which are deterministic code, not AI luck).
