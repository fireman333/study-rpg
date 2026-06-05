## Context

`MazeGrid.tsx` (the homepage maze centerpiece from `redesign-neurons-maze-rotjs-grid`) renders the committed `grid-graph.json` weave grid to a `<canvas>`. Today every cell is a **procedural primitive**: `drawFiberCell` paints a centered colored square per path cell, `drawNodeGlyph` draws a shape primitive per lit variant node, `drawBouton` a circle per synapse, `drawCore` a radial-gradient center; the background is a 2-color checker-dither. The "weave" look is faked by **gapping the under-family fiber** at each crossing (`SYNAPSE_UNDER_BY_CELL` → `continue` in the corridor loop) — there is **no notion of corridor direction** anywhere in the renderer. The author explicitly left a swap seam: "*procedural pixel-tile drawing (swap for an atlas later behind these calls)*".

This change is the deferred follow-up `polish-neurons-maze-tileset` (design D12 of the archived redesign; handoff item 2). It is **art + render only** — the routes, economy, schema, and sync are frozen.

Constraints: the project ships GBA-寶可夢 pixel art; an atlas-blit precedent exists (`lib/character-card-render.ts` + the achievements badge/family-mastery atlases). Aseprite MCP (`mcp__plugin_pixel-plugin_aseprite__*`), Gemini image gen (`mcp__gemini__gemini_generate_image`, model `BASIC_FLASH`), and codex CLI image gen are all available. The maze cell count is large (99×99) so canvas (not SVG) stays; tiles must blit fast.

## Goals / Non-Goals

**Goals:**
- The maze reads as a brain in GBA pixel-art, not colored squares, **before** the redesign merges to `main`.
- Crafted **16×16 atlas** (one PNG + a TS index map) blitted behind the existing draw seam at nearest-neighbor.
- **Corridor autotiling**: pick straight / curve / T / cross / cap per cell from route connectivity + over/under weave.
- Keep the redundant per-family encoding (colour + node-shape) and the reduced-motion contract.
- Graceful fallback to the current procedural draw if the atlas asset is missing.
- Zero schema/sync/route change.

**Non-Goals:**
- Changing the committed weave routes, the economy, first-pull, or any gameplay.
- Circuit-location naming / 「在 XXX 尋獲的神經元」provenance 稱號 (separate change `name-neurons-maze-circuit-locations`).
- New Dexie version, R2 bundle bump, upgrade fixture, Worker change, or new vitest (presentational change).
- Animated tile sprites (the walker bob / camera motion already exist; tiles are static).

## Decisions

### D1a — Authoring method (revised at apply, owner-approved via style probes): generator script, not Aseprite-by-hand / AI-downscale
At 16×16, AI-generated hero glyphs downscale to mush, and hand-pushing ~15 seamless tiles through the Aseprite MCP is many round-trips. The atlas is instead authored by a **committed generator script** (`apps/neurons-tw/scripts/build-maze-atlas.mjs`, uses `sharp`) that draws the tiles programmatically → seamless-by-construction, regenerable, version-controlled, tweak-by-constant. The spec contract is the *committed atlas PNG blitted behind the seam*; the authoring tool is an implementation detail. Owner approved the resulting look via staged style probes (chunky/pixelated + coarse 2×2-grain glow + grainy fog). The renderer swap seam (D2/D3) is unchanged — a future Aseprite/AI re-skin can still replace individual atlas cells behind the same index map.

### D1 — Hybrid tile source (owner-locked D12): Aseprite seamless structural + AI hero glyphs
Two tile classes by the **seamless-tiling constraint**:
- **Structural tiles MUST tile edge-to-edge** → authored in **Aseprite** (precise pixel control over edges): neural-tissue background, axon corridor straight (H/V) / curve (one base + 3 rotations) / T (one base + 3 rotations) / 4-way cross / cap, over-under weave bridge (the over-strand-unbroken variant), fog.
- **Hero glyphs have no edge continuity** → **Gemini/codex-generated** standalone art is safe and nicer: variant node neuron, synaptic bouton (dormant/weak/strong can be one glyph drawn at the existing opacity/radius weights), center soma core, border entry portal, walker growth-cone.
- Open-source CC0 sets = palette inspiration only (no brain-themed seamless tileset exists off-the-shelf).
- *Alternative rejected*: all-AI (AI tiles rarely tile seamlessly → visible seams on the corridor field). All-Aseprite (slower for the organic hero glyphs; AI is faster + nicer there).

### D2 — Atlas layout: single 16×16-cell PNG + a TS index map
One `apps/neurons-tw/src/assets/maze/tiles/maze-atlas.png`, cells of 16×16 px, addressed by `{col,row}` in a committed `tile-index.ts` const (named keys: `bgTissue`, `fiberStraightH`, `fiberStraightV`, `fiberCurveNE`…, `fiberT_N`…, `fiberCross`, `fiberCap`, `weaveOverH`/`weaveUnderGap`, `fog`, `nodeNeuron`, `bouton`, `core`, `portal`, `walker`). Blit `ctx.drawImage(atlas, col*16, row*16, 16, 16, dx, dy, tile, tile)` with `imageSmoothingEnabled = false` (already set on resize). Index map decouples art layout from the renderer so the atlas can be re-packed without code change.
- *Alternative rejected*: one PNG per tile (more fetches, no atlas batching; the app already standardized on atlases).

### D3 — Autotiling from route connectivity (the main new code)
Precompute, once per `grid-graph.json` load (memoized like `SYNAPSE_UNDER_BY_CELL`), a `Map<cellKey, CellTile>` where each corridor cell stores its **direction mask** (which of N/S/E/W neighbours are same-family route cells) → resolves to a structural tile id (straight / curve / T / cross / cap) + rotation. The over/under weave flag (from `grid-graph.json` `weave[]` / `synapses[]`) selects the bridge variant: the over family draws its straight/branch tile unbroken; the under family draws the `weaveUnderGap` variant at that cell (replacing today's `continue`-gap with an actual gapped tile so the cell isn't empty). Built per family (a cell can host two families at a crossing). This is pure derivation from already-committed data — no new state.
- *Alternative rejected*: bake tile ids into `grid-graph.json` at build time → couples art to the committed graph + forces a graph re-emit; runtime derivation keeps the graph art-agnostic and the change presentation-only.

### D4 — Family identity: per-family tinted corridors via blit-time tint of ONE neutral base tile (owner-chosen at style probe)
Each family's corridor is **tinted in its family colour** (the owner could not trace routes when fibers were neutral — style-probe v4). To avoid an 11×-palette-swapped atlas (bloat), the atlas carries **one neutral / near-white myelin fiber tile set** designed for tinting; the renderer tints it **per family at blit time** by caching a small per-family **offscreen tinted canvas** of the fiber tiles (draw the neutral tile → `globalCompositeOperation = 'multiply'` (or `'source-atop'`) the family colour → cache the 11 tinted tile sets once). Blit the family-tinted tile per corridor cell. Node glyphs keep the colour **+ shape** redundancy (color-blind safety) and the walker overlay already carries family colour. So the atlas stays compact (one fiber set) while corridors render in 11 distinct colours.
- *Alternative rejected*: 11 palette-swapped fiber sets baked into the atlas — atlas bloat, and re-coloring needs a re-export. Runtime tint cache is small (11 sets × a handful of fiber tiles) and built once.
- *Alternative rejected (first cut, owner-overruled)*: neutral fiber + colour only on the node glyph — fails the trace-the-route read at zoom-out.

### D5 — Graceful fallback (No Silent Errors + missing-asset safety)
Load the atlas once via `new Image()`; gate atlas blits on `atlas.complete && atlas.naturalWidth > 0`. Until loaded / on error, call the existing procedural `drawFiberCell`/etc. (kept in the file, not deleted). So a missing/failed atlas degrades to today's render rather than broken images — mirrors the theme sprite-map `?? TRANSPARENT_PIXEL` discipline.

### D6 — Verification is visual (Chrome MCP), not unit-test
The change is presentational; existing 356 vitest stay green (no new tests). Correctness = Chrome MCP visual smoke (brain pixel-art reads, weave over/under correct, lit-vs-fog, node glyphs by family, boutons by connectome state, walker, contextual camera still zooms on answer) + typecheck + prod build. Note the rAF backgrounded-tab throttle (`chrome_mcp_raf_throttle.md`): the canvas pauses when the tab is backgrounded → assert the rendered frame after focusing the tab / verify the draw path independently, don't conclude "frozen = broken".

## Risks / Trade-offs

- **Seams between structural tiles** → author + verify edges in Aseprite at the actual blit scale; the neutral background tissue tile is the highest seam risk (verify the field tiles cleanly first).
- **Autotiling edge cases (crossing cells host two families; route ends; padded route cells)** → derive per-family; cap/dead-end tile covers route ends; verify a crossing renders over unbroken + under gapped, and a lit node still draws its glyph on top.
- **Atlas authoring is iterative + tool-heavy (Aseprite + AI)** → ship structural tiles first (they prove the brain read), hero glyphs second; fallback (D5) means a partial atlas still renders.
- **AI hero glyphs off-palette / off-style** → constrain prompts to the signal palette; magick post (nearest-neighbor downscale + 16-color quantize + chroma-key) per `image_gen_routing.md`; reroll cheap on Gemini.
- **Perf at 99×99 × per-frame blit** → blit only visible cells (camera cull, as the procedural path effectively does) + memoize the autotile map; verify mobile fps before merge.

## Migration Plan

- **Deploy**: client-only asset + render change; ships with the redesign when `track-neurons` merges to `main` (`deploy-cf-pages.yml`, neurons build). No Worker deploy, no migration step.
- **Rollback**: revert the change → the procedural draw (still in the file) renders; no data touched, symmetric.

## Open Questions

1. ✅ **RESOLVED (style probe v4, owner)** — Per-family **tinted** corridors (each科 its own colour), via blit-time tint of one neutral base fiber tile (D4). Neutral-fiber failed the trace-the-route read.
2. ✅ **RESOLVED (style probe, owner)** — Overall vibe = the **v1 balanced** density (not dense v2 / sparse v3); dark brain-at-night signal palette; 16×16 tiles.
3. **Bouton state rendering** — one bouton glyph drawn at the existing opacity/radius weights (simplest) vs 3 distinct dormant/weak/strong glyphs; decide at authoring.
4. **Tint blend mode** — `multiply` vs `source-atop` for the per-family fiber tint; pick whichever keeps the glow + colour legible against the dark bg at authoring.
