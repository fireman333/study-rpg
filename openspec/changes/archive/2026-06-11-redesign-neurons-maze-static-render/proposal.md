## Why

The maze (`MazeGrid.tsx`) is a live `<canvas>` repainted every frame by a `requestAnimationFrame` loop — the entire DPR-capped ~1520² canvas redraws at 60fps with heavy per-frame allocation. Safari/iOS is far worse than Chrome at sustained full-canvas repaint, so on iPhone the maze loads slowly, stutters on pan/zoom, and even the ambient animation is janky (owner-reported). The shipped band-aids (`fix-neurons-maze-safari-perf`: Safari DPR 1.5 + cached edge gradients) are not enough, and a manual lite-mode toggle was rejected by the owner as too much user friction. The fix must be **architectural**: stop repainting the whole canvas every frame.

## What Changes

Re-architect the maze renderer from a per-frame live canvas into a **static panorama + native-zoom + event-driven overlays**, so nothing repaints at 60fps:

- **Static base layer**: render the full maze (brain-tissue tiles + corridors + gold routes + per-family colours + landmarks + node pins) **once** to a high-resolution offscreen canvas (reusing ~80% of the existing draw logic, run on-demand instead of per-frame), displayed inside a CSS-transformable container.
- **Native pan/zoom via CSS transform**: pinch-zoom on mobile (GPU-composited), wheel-zoom + drag-pan on desktop — the transform updates only on input events, NOT in a rAF loop. Page-scroll containment is preserved.
- **Event-driven dynamic overlays** (update only when state actually changes, never 60fps):
  - **Walker** (exploration sprite) — DOM overlay, CSS-glides one segment only when a settle advances it.
  - **Fog reveal** — on explore, the newly-lit node reveals via overlay (or a cheap base re-render), not a per-frame fog pass.
  - **Synapse overlay** — a separate layer redrawn when wires change, with a one-shot pulse on wiring (no 60fps).
  - **Focus-on-family** — tapping a family card flies/zooms to that cluster via a one-shot CSS transform transition (this also realizes the owner's "per-subject focused view" — it is a panorama zoom level, not a separate route).
  - **Ambient firing** — retained but reimplemented as lightweight CSS keyframes (compositor-driven), not canvas/rAF.
- **Per-cell progress-ranked family colours** (folds in the owner's 「不要全部金色」 ask): the route colour model changes from *each family's whole route drawn in its colour, the last-drawn family winning on shared cells* to **per-corridor-cell concentric thin bands of the up-to-3 most-progressed families** that have walked that cell. The rank key is each family's **already-synced settle progress** (`maze:<fam>:settles`, MAX-merged cross-device) — so the colour ordering is **consistent across devices and needs zero new state**. A cell walked by 1–2 families shows 1–2 bands; ≥3 shows exactly the 3 most-progressed; the gold myelin demotes to the base sheath under the bands. Family-exclusive segments still read in that family's colour; densely-shared cells (measured: **84% of corridor cells are shared by ≥2 families, 62% by ≥4, max 11**) stay legible by capping at 3 instead of stacking an unrenderable 11-band stack. Shared-segment route-traceability then leans on the existing spatial-route + node-shape redundancy channels.

Both desktop and mobile use the single static renderer (no second renderer to maintain). No change to maze topology, routes, growth economy, fog rules, or node/shape encoding; **no Dexie schema / R2 `SCHEMA_VERSION` / synced-meta change** — the colour model adds only one **device-local** recency meta key (not in `SYNCED_META_KEYS`).

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `neurons-brain-maze`: (a) the maze's **render architecture** changes from a per-frame `requestAnimationFrame` live-canvas to a **statically-rendered base (high-res offscreen, drawn on-demand) + CSS-transform native pan/zoom + event-driven overlays for the walker / fog / synapses / focus / ambient**, with NO continuous per-frame full-canvas repaint. All existing maze BEHAVIOUR (routes, fog-of-war, exploration, settle/pull, synapse formation, focus-on-family, atlas/fallback) is preserved; only the rendering mechanism changes. The existing per-frame-canvas-flavored wording in the brain-maze requirements is updated to allow (and prefer) the static + event-driven model. (b) the **route colour model** changes: each corridor cell renders concentric thin bands of its up-to-3 most-progressed families (ranked by the already-synced per-family settle progress), demoting the gold myelin to a base sheath — replacing the prior "each family's whole route in its colour, last-drawn wins on shared cells." The brain-reading requirement's colour clause + the colour-traceable scenario are MODIFIED accordingly (colour traceability now holds on a family's *exclusive* segments; shared segments fall back to the spatial-route + node-shape redundancy channels).

## Impact

- **Code (presentation/architecture only)**: a substantial rewrite of `apps/neurons-tw/src/components/maze/MazeGrid.tsx` (the rAF loop → on-demand static render + CSS-transform interaction + overlay layers), plus `apps/neurons-tw/src/styles.css` (transform container, ambient CSS keyframes). Drawing helpers (`bakeTileArt`, route/landmark/node draw) are mostly reused, invoked on-demand; the route draw is extended to the per-cell progress-band colour model (a `cell → families` map is precomputed once from `grid-graph.json` routes at module load). Walker DOM overlays already exist and are kept.
- **No synced-schema / economy / routes change + zero new state**: zero Dexie store / R2 `SCHEMA_VERSION` / Worker edit; `grid-graph.json` + the per-family economy untouched; `lint:dexie-fixtures` no-op. The colour model adds **no new state at all** — it ranks by the already-synced per-family settle progress (`maze:<fam>:settles`, already in `SYNCED_META_KEYS`), so the band ordering is identical across devices with no new meta key, no `SYNCED_META_KEYS` entry, and no fixture-lint surface.
- **⚠️ VERIFICATION = OWNER ON REAL iPhone SAFARI**: the maze is rAF-driven and does not paint in the background-throttled automation tab, and there is no Safari device in the dev environment — so the perf win (and visual parity) MUST be verified by the owner on a real iPhone (and Mac Safari) at each increment. Chrome non-regression IS automatable. Build incrementally and have the owner test each cut.
