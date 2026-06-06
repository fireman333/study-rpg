# Maze visual redesign — "wiring diagram" direction (2026-06-06)

> Decision capture after ~8 rejected design waves + 2 Codex 5-version rounds. Change in flight:
> `redesign-neurons-maze-brain-tileset` (mid-apply, NOT committed). This note + the DEV switcher are
> the resumable state if context compacts.

## Where we are
The neurons maze homepage (`apps/neurons-tw/src/components/maze/MazeGrid.tsx` + new
`maze-themes.ts`) has a **DEV-only design switcher** (`import.meta.env.DEV`): preset buttons + 4
per-element dropdowns (WALL / PATH / BG / NODE), re-bakes on switch. Topology untouched.

Owner kept rejecting every per-cell-texture design as "neuro elements not obvious enough."

## Root cause (owner + Codex agree)
Maze = 384×384, baked 10px/cell, **whole-maze zoom ≈ 2px/cell**. Area split: **PATH 63.8% / WALL
17.8% / BG 18.4%**. At 2px, ANY per-cell texture collapses to noise; PATH must stay dark so the gold
routes read → low contrast. So per-cell texture is the wrong lever.

## Decision — Codex strategic direction: make the maze a WIRING DIAGRAM
Stop texturing tiles; make the maze itself anatomically legible via silhouette + topology + icons.
The one element the owner consistently likes = the **gold myelin sheath** on the 11 routes. Scale it
to the maze's core identity:

- **PATH-FLOOR (hero):** render EVERY corridor as a **myelinated axon** (dark axon core following the
  corridor direction + periodic pale myelin internodes + node-of-Ranvier gaps), but **faint + cool +
  desaturated** as the base layer. The **11 family routes stay bright warm-gold premium on top** =
  "activated tracts." (Derive corridor direction from each PATH cell's path-neighbour bitmask.)
- **WALL:** demoted to a **subdued structural frame** (glial / oligodendrocyte sheath edge / endoneurium
  between tracts) — cool, low-contrast, optional slight drop-shadow relief. Just frames the corridors.
- **BG:** very quiet accent (already is).
- **LANDMARKS (carries most of the "obvious" read):** ~8–20 LARGE textbook-symbol neuron sprites at
  hubs/junctions — soma+dendrites, synapses, astrocytes, oligodendrocytes. (Follow-up after the
  axon-network base lands.)
- **Figure-ground:** BG quiet → wall subdued → path = mid-bright faint axon net → 11 routes brightest
  gold → landmark silhouettes distinct. Avoid dark-on-dark "rich texture" (= mud at this zoom).

Codex full text: `/tmp/maze-codex/strategy.log` (ephemeral).

## Next steps
1. Add a `wiring` PATH style = neighbour-mask-aware myelinated-axon render (extend `PathStyle` with an
   optional `render(c,bx,by,s,mask)`; bakeTileArt computes the N/E/S/W path-neighbour mask). Subdued
   `tractedge` WALL. New "髓鞘接線圖" preset in the switcher.
2. Verify in switcher, owner A/Bs vs current 5.
3. If it lands: add large landmark sprites; then collapse to chosen look + strip switcher + delete
   orphan AI bg assets (`bg-nissl/darkfield/garden/firing.png`, `wall-fibers.png`) + trim.

## Cross-session housekeeping
- All maze work UNCOMMITTED (track-neurons). Lessons already folded into `~/git/claude-config/imports/`
  (`design_iteration_loop.md` new + `image_gen_routing.md` augmented) — also uncommitted there.
- codex `gpt-image-2` works this session; Gemini MCP down (stale cookie). Procedural is fine for this.
