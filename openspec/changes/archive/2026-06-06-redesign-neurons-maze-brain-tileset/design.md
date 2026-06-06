## Context

The neurons maze is a 99×99 logical weave grid (`grid-graph.json`: 11 family corridors + 1300 over/under weave bridges + 135 synapses + per-family nodeCells = variant slots), rendered on a `<canvas>` (`MazeGrid.tsx`) by blitting a procedurally-generated 16×16 tile atlas (`build-maze-atlas.mjs`). At the default whole-maze zoom each cell is ~7px → thin faint corridors. The owner wants the chunky **filled** C64-maze look (ref `~/Downloads/像素塊風格迷宮.jpg`) re-themed as brain/neuron tissue.

This is **visual-only** and **zero-schema** (no Dexie/R2 bump; ideally no `grid-graph.json` regen). Desktop zoom/pan already exists; mobile + focus are Change B. Decisions below fold in a Codex consult on pixel-tile art technique (`/tmp` codex run, 2026-06-05).

## Goals / Non-Goals

**Goals:**
- Whole-maze (zoomed-out) view reads as a **brain cross-section** (filled cortical tissue + carved sulci-like paths) — 「一眼看出是腦」.
- Zoomed-in view reads as a clean **chunky GBA pixel-tile maze** (thick textured walls, wide black paths, crisp neuron icons).
- Cohesive limited-palette look that doesn't turn to mush at 32px.
- Robust to AI-image-gen flakiness (most of the "look" is deterministic code).

**Non-Goals:**
- ❌ Mobile touch zoom / button-focus / answer-time display → Change B.
- ❌ Maze topology / resolution / gameplay changes.
- ❌ Schema/sync changes.

## Decisions

### D0 — Art direction REVISED after Wave-1 (2026-06-05): CUTE varied neuron-element tiles, NOT realistic brain tissue

Wave-1 shipped a single realistic cerebral-cortex gyri/sulci wall texture. Owner feedback after seeing it: **(a) drop the realistic brain — use CUTE (Q版/kawaii) neuron elements; (b) the single brain tile was too monotonous — want MANY tile types; (c) the uniform brain wall read as too separated from the coloured routes — the wall tiles on BOTH SIDES of every route must themselves be these cute neuron elements** (so walls feel part of the neuron world, not a backdrop).

New wall vocabulary (cute kawaii GBA pixel, soft pastels; multiple interleaved types, NOT one texture):
myelin segments (節節包覆 + Node-of-Ranvier breaks) · axon-fiber bundles · synaptic boutons (點點眼睛) · vesicle clusters (小泡泡) · sulci-fold (Q版化, just ONE of many, not the whole) · astrocyte (cute star glia) · oligodendrocyte · dendritic spines · microtubule tracks · receptor patches · NT-molecule sparkle accents. Route/node elements: cute soma node · Node-of-Ranvier saltatory point · action-potential spark · synapse glow.

The wall field is therefore a VARIED scatter/auto-mix of these element tiles (placed right beside routes too), not a single repeating pattern. This supersedes the "~4 gyri texture variants" of D1 below — keep D1's *method* (AI makes the tiles, code does carve/geometry/palette-remap) but the *content* is now this cute varied vocabulary.

**Refinement 2 (2026-06-05, after the cute-bouton probe): NO faces; neuroscience/HISTOLOGY-grounded colour; "cute" = rounded friendly SILHOUETTE only, not kawaii candy.** Drop the dot-eyes/smile. Palette grounded in real histological stains (this satisfies the project neuroscience-accuracy rule for the visual layer): myelin = Luxol-Fast-Blue teal / pale blue-white (white matter); neuron soma / Nissl bodies = cresyl-violet purple; cytoplasm + grey matter = H&E eosin pink; axons/fibers = Golgi/silver dark line on cream; astrocyte = GFAP DAB brown (star shape); background = histology tan/cream. Shapes stay plump/rounded (friendly contour) but read as scientific specimens, not mascots. The fixed palette (D2) is re-tuned to these stain tones (replacing the brain-pink-only subset).

**Refinement 3 (2026-06-05, after the varied-wall in-context probe — SUPERSEDES the "varied wall mosaic" approach): owner clarified "WALL" = the BLACK EDGE/RIM immediately flanking each colored path, NOT the whole background.** My varied-everywhere fill read as "too busy". Corrected LAYERED model + move to a REAL EDITABLE TILESET (Aseprite) so the owner can author/swap tiles. See decision **D8 — Layered tileset architecture** below. In short: **wall-edge tiles = consistent/uniform black rim** (no decoration); **background layer = the varied neuron-element tiles** (variety lives here, behind everything); **path = colored corridor**; **crossing nodes = a bright spark-in-circle synapse sprite** (white core + cyan halo + yellow spark rays). The Wave-1/2 procedural stroke-carve + full-bleed varied wall is superseded by this layered tilemap; the generated element tiles (myelin/vesicle/astrocyte/sulci/spine/fiber) are REUSED as `bg_*` background decorative tiles.

### D8 — Layered tileset architecture (Codex consult 2026-06-05; the new build target)

A real, Aseprite-authorable tileset (32px, NEUTRAL grayscale + runtime per-family multiply-tint — author one set, not 11). Four tile groups + a fixed render order:

| Group | Tiles | Selected by | Tint? |
|---|---|---|---|
| **Path** | 16-direction connection autotile `path_0000`..`path_1111` (N/E/S/W path-neighbour bitmask; 1-cell winding corridor → 16-conn, NOT 47-blob) | a cell's path-neighbours | per-family multiply ✓ |
| **Wall-edge (rim)** | separate 16-mask rim set `rim_0000`..`rim_1111` — the BLACK rim drawn ONLY on non-path cells that touch a path; consistent, no decoration | which sides of a non-path cell touch a path | no (black/grey) |
| **Background decor** | 24-48 independent tiles `bg_myelin_*` / `bg_vesicle_*` / `bg_astrocyte_*` / `bg_sulci_*` / `bg_spine_*` / `bg_fiber_*` / `bg_plain_*` — VARIETY lives here only | seeded-random per grid coord (or author-drawn tilemap) | no |
| **Overlay** | crossing-node synapse spark (white core + cyan halo + 4-8 yellow spark rays, hollow outer so it doesn't cover the path colour); soma node; portal | cell used by ≥2 family paths = synapse; family nodeCells = soma | spark = bright accent |

**Render order (fixed):** ① background decor (every cell) → ② wall-edge black rim (only non-path cells adjacent to a path — NOT the whole non-path area) → ③ colored path (path cells, neighbour-mask tile, family-tinted) → ④ node/synapse spark overlay → ⑤ player/UI/fx.

**Aseprite workflow:** master `maze_tileset_32.aseprite` (rows: path / rim / bg / overlays); slice names == renderer IDs (`path_0101`, `rim_0011`, `bg_myelin_03`, `overlay_synapse_spark`); export `aseprite -b maze_tileset_32.aseprite --sheet maze_tileset_32.png --data maze_tileset_32.json --format json-array --list-slices`; renderer consumes PNG + JSON BY SLICE/FRAME NAME (never hardcode row/col) so owner edits round-trip. (If Aseprite CLI isn't installed, the build script composes the sheet from individual element PNGs + a hand-written name→rect index — same contract.)

This replaces the single `wall-neuro-field.png` pattern fill + the `MazeGrid` stroke-carve. The neighbour-mask tile selection makes path width + corners + the rim consistent (Codex: "autotile + contrast matter more than any single tile").

### D10 — REBUILD (owner reset 2026-06-05): tilemap maze, 3 flat-color regions first, 16px tiles, 384², codex-consulted

After D9's procedural attempts (colored chunky corridors, then a myelin-tissue wall field, then trying to extract a tissue tile from the owner's `maze-brain-default.png` reference) were all rejected, the owner called a clean **打掉重練** (scrap & rebuild) with firm constraints. Codex was consulted (`/tmp/maze-rebuild.log`, 2026-06-05). The new build target SUPERSEDES D1–D9's render approach (the procedural canvas render + the histology-tile wall + the pink-brain reference are all dropped):

- **Tilemap with 3 cell kinds** — `BACKGROUND(0) / WALL(1) / PATH(2)` — rendered as **FLAT COLORS first, NO tile images**, so 16×16 tile art drops in per-layer later without touching layout. (Owner: 「先不要套用直接分成三個區域就好」.)
- **16×16 px tiles**, grid **384×384** (codex: 384 fits 11 winding border→center weave paths + crossings, easier 60fps than the owner's ≥500 floor which codex flagged as overkill; owner accepted 384).
- **≥11 winding paths** (the 11 families), **weave/wire format kept** (over/under bridges).
- **Later image plan (NOT now)**: WALL ← the earlier scratch histology element tiles (`element-neuro-*`); BACKGROUND ← freshly-generated neuron-themed images; PATH ← thin colored family routes. **The pink-brain `maze-brain-default.png` tissue is explicitly dropped** (owner: 「不要用那個粉色的腦」).
- **Generation method**: EllerMaze at a **logical 96²** → braid → weave bridges → 11 winding routes → synapses/nodes, then **scale ×4 → 384²** so corridors are 4-wide chunky + walls thick. Cell-kind classify on the scaled grid: passage→PATH; wall 4-adjacent to a PATH cell→WALL (corridor rim); else→BACKGROUND (deep wall interior + outer margin). Bridge density retuned DOWN (codex: target ~150–250 crossings for 110 nodes, not the old ~1300).
- **Data compatibility**: keep `grid-graph.json` `families/path/nodeCells/synapses/weave/center/gridW/gridH` shape IDENTICAL (so `graph.ts`/`economy.ts`/`useMaze.ts` are untouched; nodes stay keyed `family:slotIndex` → save-data-safe), and ADD an RLE-encoded `cellKinds` grid. New generator `scripts/build-tilemap-maze.mjs`; old `build-grid-maze.mjs` becomes obsolete.
- **Renderer**: `MazeGrid.tsx` rewritten to draw, viewport-culled, layer order bg→wall→path (flat colors) → thin colored family routes → synapses → nodes → core. The flat-color→tile-image swap later replaces ONLY the per-kind cell-draw function (4-bit N/E/S/W autotile bitmask).

### D9 — Implementation: D8's layered model is rendered PROCEDURALLY (per-cell canvas blocks), not from a 32-PNG autotile sheet (apply decision 2026-06-05) [SUPERSEDED by D10]

D8 specifies the *visual contract* (layer order: bg decor → black rim → colored chunky corridor → spark/soma overlay; consistent black rim flanking colored corridors; calm varied-neuron-element background). It does NOT need to be sourced from an authored `path_*`/`rim_*` PNG tile sheet — the path and rim tiles are pure **geometry** (a filled colored block; a black edge strip), which canvas draws directly from the maze graph + a precomputed cell mask. So:

- **Aseprite is not installed** on this machine (`which aseprite` → not found), so the "owner-editable .aseprite round-trip" benefit of D8 is already unavailable; the fallback was always "build script composes a PNG sheet". A render-time procedural draw is a further simplification of that same fallback and produces an identical visual.
- **Geometry = code + a static mask** (Codex's own central recommendation, D1): `PATH_CELLS` (each family's centerline dilated to a chunky 2–3-cell corridor, carrying `{familyId, pathIndex}` for fog) + `RIM_CELLS` (non-path cells adjacent to a path, with which sides face the corridor) are precomputed ONCE from `FAMILY_GRAPHS` (static — no per-frame autotile bitmask lookup). The renderer iterates these (viewport-culled) and fills: dim/bright family-colored corridor blocks (fog = unexplored dim, explored prefix bright) + a black rim strip on each wall cell's corridor-facing side.
- **Background decor REUSES the generated `element-neuro-*.png` tiles** as `bg_*` (the D8-mandated "variety lives in the background layer"), placed **sparsely + faintly** by a deterministic per-cell hash so the field reads CALM (the owner's "太亂了" fix) — not the full-bleed mosaic of Wave-2.
- **Overlays**: soma = `neuro-soma-violet.png` at lit nodes; **synapse spark drawn procedurally** (white core + cyan halo + yellow rays, hollow outer) keyed to the live synapse rows; center amber core procedural. No new AI image-gen needed (sidesteps the Gemini/codex flakiness risk entirely).
- **What this drops vs D8 literal**: no `maze_tileset_32.png/.json`, no 16 `path_*` + 16 `rim_*` + ~24 `bg_*` PNG cells, no atlas re-bake. The committed `maze-atlas.png` + `wall-neuro-field.png` become orphaned (flag for deletion at verify; left on disk this round to keep the diff render-focused).
- **Escalation path**: if the owner's screenshot gate (§5.2) rejects the procedural chunky look (e.g. wants hand-authored tile texture per cell), THEN compose the PNG sheet per D8 — but validate the cheap procedural look FIRST (MVP-first, D7).

### D1 — AI generates TEXTURE + symbol overlays ONLY; geometry is code+mask (Codex's central recommendation)

The biggest pitfall (Codex): AI image generators produce "hi-res illustration that looks like pixel art" — anti-aliased edges, inconsistent per-tile lighting, noise at 32px, non-tiling seams, inconsistent path width, hundreds of near-duplicate colors. So:
- **AI produces**: ~4 seamless cerebral-cortex gyri/sulci **wall** textures (pink-grey, variants for non-repetition) + discrete **symbol overlays** (soma node / dendrite-axon-myelin path motif / synapse-crossing icon / electric-spark / dotted collectible marker / growth-cone walker) + the border frame.
- **Code + mask produces**: the carved black paths, the wall→path autotile EDGE selection, path width, corner alignment — all from a black path mask laid over the wall texture. Symbols/tints are render-time overlays per the maze graph.

This gives `zoom-out = brain cross-section, zoom-in = clean tile maze` for free, and makes path geometry deterministic instead of AI-luck.

### D2 — Fixed 16-color brain palette, single source of truth

Build a committed `palette.png` and remap EVERY tile asset to it (never let each AI image self-quantize → that's how you get "100 near-colors that look retro but aren't"). Starting palette from the Codex consult (tune during MVP):

```
black path #050408 · deep sulci #2a1d2e · purple-gray #51415c · brain shadow #766274
brain mid #a98c94 · brain pink #d3a3a0 · brain highlight #f1c6b5 · myelin cream #f5dfb0
axon gold #d89b35 · spark yellow #ffe66d · synapse cyan #5fd7d1 · subject blue #4a8fff
subject green #5ecc71 · subject red #e85d75 · border blue #2450a4 · white marker #f8f4e8
```

Per-family tint is a render-time multiply over near-neutral tiles (existing `FAMILY_COLORS` mechanism), so the 16-color base + tint covers all 11 families.

### D3 — ImageMagick post-process recipe (per asset class)

Clean AI output → 32px tile in the fixed palette:
```bash
# walls (light dither OK on texture):
magick in.png -resize 128x128! -sharpen 0x1 -posterize 16 \
  -resize 32x32! -filter point -dither FloydSteinberg -remap palette.png out.png
# icons / symbols (NO dither — must stay crisp + readable):
magick in.png -resize 32x32! -filter point -dither None -remap palette.png out.png
```
Corner-pixel chroma-key for transparency on symbol overlays (existing recipe in `image_gen_routing.md`). Check every tile at **1×, 2×, 4×**.

### D4 — Autotile set (code-selected from the path mask)

8 wall→path edge states selected by neighbour-bitmask: isolated wall, straight N/E/S/W, outer corner ×4, inner corner ×4, T ×4, cross. Each = wall texture variant + black path mask carved at the correct edge. Implemented either (a) pre-baked into the atlas by `build-maze-atlas.mjs` (texture × mask → committed tiles), or (b) composited at render. **Lean pre-baked** (simpler render loop, deterministic, atlas stays the single blit source) unless the variant×edge combinatorics make the atlas too big — decide in apply.

### D5 — Filled-wall render performance

Do NOT blit ~9801 wall cells/frame. The wall field = a `createPattern('repeat')` of the wall texture (already the pattern technique in `MazeGrid.tsx`); then draw only: carved path cells (black) + autotile edge pieces along path borders + node/synapse/spark overlays + walker. Cost scales with path length (hundreds of cells), not grid area.

### D6 — Path widening = render-time mask dilation (zero schema)

Widen corridors to 2-3 cells by dilating the path mask at draw time (the path mask is derived from each family's `path` polyline in `grid-graph.json`). The logical nodes/synapses/weave cells are unchanged → `grid-graph.json` is NOT regenerated → zero schema. **Risk**: in the dense over/under weave region, a 3-cell dilation could merge adjacent corridors or smear a bridge. Mitigation: validate at apply; if it smears, drop to 2-cell, or (last resort) regenerate `grid-graph.json` with wider corridors — which is schema-adjacent (the committed graph is an asset, not Dexie, but coordinates shift) → **flag to owner before doing it**.

### D7 — MVP-first build order (Codex)

Wave 1: ~8 production tiles (4 wall variants + a couple edge/corner + 1 path + 1 soma node) + palette → wire the renderer → verify the filled-maze reads right at 1×/2×/4× via Chrome MCP. Only then Wave 2: expand to the full set (more edges/corners/T/cross + dendrite/myelin path + synapse + spark + collectible + walker + border). Ship is gated on Wave-1 looking right; don't generate all ~20 AI assets before the renderer is proven.

## Risks / Trade-offs

- **[AI image-gen flaky / muddy]** → AI only makes texture+symbols (small surface); geometry is code; fixed-palette remap + MVP-8 validation catch mush before scale. Gemini-first, codex + Chrome-MCP-3.5-Flash fallback.
- **[Path dilation smears the weave]** → D6 mitigation (2-cell fallback / flag before graph regen).
- **[Filled render tanks fps]** → D5 pattern-fill + path-only draw; verify 60fps at default + zoomed.
- **[32px tiles + zoom blur]** → integer-ish zoom steps + `imageSmoothingEnabled=false` on the canvas context to keep pixels crisp.
- **[Scope creep into Change B]** → desktop-zoom-only hard line; no mobile/focus/answer-display.

## Migration Plan

Asset + render swap. Deploy = merge → main (CF Pages auto-deploy). Rollback = revert the commit (atlas PNG + render + script + spec revert; no data/schema implications). No player data touched.

## Open Questions

- D4 pre-baked-atlas vs render-time-composite autotiling — decide at apply once the wall variant count is known.
- Exact final palette — start from D2, tune during MVP-8 against the brain-gestalt read.
- Whether 2 or 3 cell path width survives the weave region (D6) — empirical at apply.
