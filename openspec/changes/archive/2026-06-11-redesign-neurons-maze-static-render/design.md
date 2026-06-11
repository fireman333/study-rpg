## Context

`apps/neurons-tw/src/components/maze/MazeGrid.tsx` (~1240 lines) renders the maze via a continuous `requestAnimationFrame` loop (`draw` ends with `raf = requestAnimationFrame(draw)`). Each frame fully repaints the canvas (`fillRect(0,0,w,h)` then re-draws every layer: baked tile blit + gold routes + family-colour cores + landmark sprites/halos + node pins + synapse overlay + walkers + sparks + brain backdrop + edge feather). Camera is a JS easing (`cam.cx += (tgt.cx-cam.cx)*0.12`) applied per frame. Codex root-cause (see `openspec/changes/archive/2026-06-10-fix-neurons-maze-safari-perf/design.md`): Safari/iOS is far worse than Chrome at sustained full-canvas repaint + per-frame allocations (4 edge gradients, route path rebuilds, radial gradients, globalAlpha/setLineDash churn). Shipped DPR-1.5 + gradient cache (change C) helped but the owner reports it's "還是很卡" on iPhone — load slow, pan/zoom laggy, ambient laggy. A lite-mode toggle was rejected (too much user friction).

Design locked via `/grill-me` (Quick, software-project); snapshot at `~/.claude/scratch/grilled-neurons-迷宮靜態全景重構-2026-06-10.md`.

## Goals / Non-Goals

**Goals:**
- Eliminate the 60fps full-canvas repaint → the maze is a static panorama; only user input + discrete game events cause updates.
- Smooth pan/zoom on mobile (GPU-composited CSS transform / native pinch) and keep desktop wheel-zoom + drag-pan feel.
- Preserve ALL maze behaviour + features (walker glide, fog, synapses, focus-on-family, ambient, colour-traceability, atlas).
- One renderer for both platforms (maintainability — vibe-coding solo dev).

**Non-Goals:**
- No change to routes / economy / fog rules / schema / sync / node-shape encoding.
- No lite-mode toggle (rejected). No second renderer.
- No new per-subject route/page (the "per-subject view" = a panorama zoom level).

## Decisions (locked in the grill)

| # | Decision | Locked choice |
|---|---|---|
| D1 | Platform scope | **Both desktop + mobile go static** (single renderer). Desktop's live-canvas feel changes but gains consistency + smoothness. |
| D2 | Walker exploration glide | **Keep, event-driven** — walker is a DOM overlay that CSS-glides one segment only when a settle advances its target cell (no per-frame easing). |
| D3 | Focus-on-family fly | **Keep, CSS transform transition** — tapping a family card animates the container transform to that cluster (one-shot, not 60fps). |
| D4 | Synapse pulse + connectome overlay | **Keep, event-driven overlay** — a layer redrawn when wires change + a one-shot pulse on wiring; not a per-frame pass. |
| D5 | "Per-subject focused view" | **= panorama zoom to that family's cluster** (same as D3 focus); NOT a separate route/page. |
| D6 | Desktop interaction | **Wheel-zoom + drag-pan** (current feel) but driven by CSS transform updated on input events, not per-frame canvas. |
| D7 | Ambient firing animation | **Keep but reimplement as lightweight CSS keyframes** (compositor-driven, cheap on mobile); not canvas/rAF. |
| D8 | Route colour model | **Per-corridor-cell concentric thin bands of the up-to-3 most-progressed families** that have walked the cell (cap 3; rank key = the already-synced `maze:<fam>:settles` progress — **zero new state, consistent cross-device**). Gold myelin → base sheath. Replaces *last-family-wins on shared cells*. Per-cell scope (整座網永遠五彩), not global. Folds in the owner's 「不要全部金色」 ask. |

## Route colour model (folds in the colour ask — D8)

**Motivating data** (measured from `grid-graph.json`, 11 families, 4670 distinct corridor cells): the maze is a densely-woven *shared* lattice, NOT disjoint per-family corridors —

| families sharing a cell | share of corridor cells |
|---|---|
| 1 (exclusive) | 16% |
| 2 | 12% |
| 3 | 10% |
| 4–7 | 33% |
| 8–11 | 30% |
| **≥2 (shared)** | **84%** |
| **≥4** | **62%** (max = all 11) |

So "thin concentric bands per family" is only renderable for ≤3 families; a trunk cell can't show 11 distinguishable bands on a ~4px corridor. **Decision:** cap at **3 bands per cell**. The owner's ask was 「最近走過的前三條 path」 (per-cell scope: 「每格各自 top-3，整座網永遠五彩」); this was **resolved to rank by each family's settle progress** rather than inventing a new recency signal, so the ordering is consistent cross-device with zero new state (owner-approved — settle progress already syncs and closely tracks "recently walked" for an active player).

**Algorithm (run inside the static base bake; re-baked on settle, never per-frame):**
1. Precompute once at module load a `cell → Set<familyId>` map from each family's `path` / `path2` cells in `grid-graph.json`.
2. A cell is **walked by family F** iff F's explored-prefix frontier has reached/passed it (reuse the existing fog / explored-prefix logic — `exploredOnRoute` / `litNodes`). Unexplored cells stay the faint fog baseline (existing behaviour).
3. Among the families that have walked the cell, take the **3 with the highest settle progress**; draw them as concentric thin bands over a neutral base myelin sheath (gold demoted to base/frame). 1–2 walkers → 1–2 bands.
4. Family-exclusive cells always show that family's colour. Densely-shared cells show their current top-3-progressed (so the lattice is always five-coloured, shifting as your strongest subjects advance).

**Ranking signal — already synced, zero new state:** the rank key is each family's `maze:<fam>:settles` count, which is **already in `SYNCED_META_KEYS`** (one of the 22 per-family MAX-merged maze counters) — so it converges cross-device for free. The colour model therefore adds **no new meta key, no `SYNCED_META_KEYS` entry, no R2/Dexie bump**, keeping the redesign a pure presentation/architecture change. Ties (e.g. all-zero early game) fall back to a deterministic order (`FAMILY_IDS`) so the bake is stable. (This replaces the originally-floated device-local recency stamp: settle progress closely tracks "recently walked" for an active player but, unlike a new recency signal, is identical across devices — see the 不同步 discussion.)

**Trade-off (surfaced):** with shared cells showing the **most-progressed** families rather than every walking family's colour, a single family's route is **no longer fully traceable by colour alone across shared segments** — colour traceability now holds on a family's **exclusive** segments, and shared-segment distinguishability falls back to the two other redundant channels the spec already mandates (the **spatial carved route** + **node/marker shape**, per the color-blind-friendly encoding requirement, which is unchanged). The `neurons-brain-maze` brain-reading requirement's colour clause + the colour-traceable scenario are MODIFIED accordingly (see the spec delta).

**Rendering technique** (resolve at apply-time + owner visual check): per-cell nested rounded bands baked once vs. offset family polylines. The bake-once model makes per-cell nesting cheap; pick whichever keeps the biological "axon tract" read rather than a tiled heatmap.

## Architecture

**Layered container** (one CSS-transformed stage; the transform is the camera):
1. **Static base** — `bakeTileArt` + the route/landmark/node draw logic, rendered ONCE to a high-res offscreen canvas (or a few zoom-bucket bakes) on mount + on discrete change (explore, theme switch). Displayed as a `<canvas>`/`<img>` scaled by the container transform. `imageSmoothingEnabled = false` preserved (pixel-art crisp; per the atlas requirement — note the DPR-adaptation MAY-clause from change C still applies to the base bake resolution).
2. **Synapse overlay** — a sibling layer (canvas or SVG) drawn from synapse state; re-drawn on synapse change; one-shot CSS/JS pulse on wiring. Inside the same transform so it pans/zooms with the base.
3. **Walker + node-reveal overlays** — DOM/sprite overlays positioned in maze-space inside the transform; walker CSS-transitions on settle; newly-lit node reveals via overlay (or a cheap base re-render — see Open Questions).
4. **Ambient layer** — lightweight CSS `@keyframes` (opacity/transform only), gated by `useRespectsReducedMotion`.

**Camera = CSS transform** (no rAF): `transform: translate(...) scale(...)` on the stage container.
- Mobile: native pinch-zoom (`touch-action: pinch-zoom` / pointer-events math) — GPU composited.
- Desktop: wheel → scale, drag → translate; update transform on the input event only. Preserve page-scroll containment (`overscroll-behavior` / modifier rules already in the current panel).
- Focus-on-family (D3/D5): animate the transform to the family cluster via a CSS `transition` (one-shot).

**No `requestAnimationFrame` steady-state loop.** A transient rAF is acceptable ONLY to drive a one-shot animation (e.g. a walker glide or focus fly) and must stop when the animation ends.

## Reuse map (what carries over from the current MazeGrid)

- `bakeTileArt` / `bakeTilemap` / `TILE_BAKE` — the offscreen tile bake (already exists, already on-demand). Becomes (part of) the static base.
- The Layer ② route draw (gold sheath + family-colour core — note change B's `coreW 0.6` + alphas), landmark draw (Layer ①·⑤), node pins (Layer ③a) — these draw functions are reused, but invoked **once into the base** instead of per-frame.
- Walker DOM overlays (`walkerRefs`, `el.style.transform`) — kept; repositioned by the container transform + a per-walker CSS transition on settle.
- `IS_SAFARI_OR_IOS` / `MAZE_DPR_CAP` (change C) — reused for the base bake resolution.
- Hit-testing (synapse/node tap → tooltip) — recompute against the static layout + current transform (was `synapseHitRef`, updated in draw; now updated on transform/synapse change).
- Celebrations / ritual overlays — already overlays, kept.

## §1 starting blueprint (from reading MazeGrid.tsx, 1264 lines — start a fresh session here)

Concrete facts the next session needs (so it doesn't re-derive from 1264 lines):
- The whole render is **one `requestAnimationFrame` `useEffect`** spanning **lines ~390–864** (`draw()` ends with `raf = requestAnimationFrame(draw)` at ~718).
- Camera = JS easing in **maze-space** (`camRef`/`targetRef`, `cam.cx += (tgt-cam)*0.12`), projected per-frame by `toX/toY` (lines ~447–449). Wheel/pointer/touch handlers (~748–841) mutate `targetRef`.
- **Only the tiles are baked** today: `bakeTileArt(sel)` → `tilesRef.current.tileBake` (`TILE_BAKE = 10`px/cell → 3840², Safari-safe < 4096²). The draw loop blits a *viewport slice* of it per frame (~482).
- **Drawn live every frame in screen-space** (must move into the one-time maze-space bake for §1): Layer ② routes (~552–607, this is where the **D8 colour model** lands), Layer ①·⑤ landmarks (~505), Layer ③a/③ node pins + lit nodes (~614–629), brain backdrop images (~470–497, 656–663), Layer ⑦ edge feather (~668–692). Synapse sparks (Layer ④) + walkers stay **dynamic overlays** (→ §2/§4).
- §1 move: add a `bakeScene()` that draws tiles+routes+landmarks+node-pins into ONE maze-resolution offscreen canvas (reuse the existing draw fns but project in maze-space, no cam); show it in a CSS-`transform` stage; pan/zoom = transform on input only (reuse the existing wheel/pinch/drag math, but apply to the transform instead of `targetRef`); reposition the walker DOM overlays inside the transform. Keep `imageSmoothingEnabled=false` + `MAZE_DPR_CAP` for the bake resolution. Then delete the steady-state rAF.
- DEV switcher (`maze-themes`, lines ~885–926) re-bakes on `sel` change — keep it driving a re-bake, not a per-frame read.

## Final architecture (as shipped — §1–§8 + A4; supersedes the §1 starting blueprint above)

The "CSS-transformed stage" framing in the original Decisions/Architecture sections is **obsolete**:
the first §1 cut displayed the maze as a 3840² canvas with `will-change: transform`, which iOS
promoted to ONE composited layer rasterized at devicePixelRatio (~hundreds of MB GPU) → WebKit
content-process OOM on scroll-into-view (§1.3 iter-1 failure). The shipped model:

1. **Offscreen scene bake** — two maze-resolution (3072², `SCENE_SCALE=8` px/cell) offscreen 2D
   bitmaps, never in the DOM: the tile floor (`tileBakeRef`, re-baked only on design-switch) and the
   "ink" (`sceneRef` — landmarks / gold sheaths / §8 colour bands / node pins / lit nodes / synapse
   sparks / core via `drawScene`), re-baked only on a discrete `bakeKey` change (explored / lit /
   synapse / settles / DEV-switch / emphasis). ~75 MB of plain canvas memory, not GPU-layer memory.
2. **Viewport-blit camera** — the ONLY DOM canvas is viewport-sized (backing store ≤
   `VIEW_DPR_CAP` 1.75-iOS/2 AND the `VIEW_AREA_CAP` 4.8M-px² area clamp from the master-detail
   change). `drawCamera()` blits the camera's slice (`camRef {cx,cy,z}`, pan-bounded by `clampPan`
   to maze + 40-cell margin) per DISCRETE event; input bursts coalesce through a one-shot
   `scheduleDraw` rAF. **No steady-state rAF anywhere**; the three surviving rAF handles
   (`drawRafRef` coalescer, `travelRafRef` settle-travel, `flyRafRef` focus fly) are one-shot,
   self-stopping, unmount-cancelled.
3. **§5 focus fly** = a one-shot rAF camera tween (`flyTo`/`flyTick`): lerped centre, log-space zoom,
   `easeInOutCubic`, 420–800ms scaled by screen-space distance; snaps on `instant` / reduced-motion /
   trivial delta; cancelled by any manual input (`markManual`). Mount / ResizeObserver / DEV-zoom
   reframes are instant; bus framings (card tap, auto-focus, recenter, travel auto-frame) fly.
   **C′ resize integration**: manual-focus + recenter framings defer one microtask past React's
   commit so the fly target is measured at the post-resize stage size, and the RO skips its instant
   reframe while an in-flight fly already targets the current size (`flyStageSizeRef`) — detail-mode
   entry/exit is one smooth move, never fly-then-snap.
4. **§6 ambient** = ≤12 DOM glow dots (`MAZE_AMBIENT_MAX`) over the strongest live synapse cells,
   camera-positioned like pings, inner element on compositor-only CSS keyframes; gone when 隱藏連結
   or reduced-motion. **§7.2 conduction pulse** = a dim-cyan one-shot ping on
   `connectome.conductionPulse` at `synapseCell(from,to)`, ≤8 per 200ms window.
5. **§8 colour bands** (D8 algorithm, implemented in pure `maze-route-bands.ts`, Vitest ×8):
   `CELL_FAMILIES` precompute + `buildBandRuns` → per walked cell the top-≤3 settles-ranked families
   become nested width bands (`{1:[0.62], 2:[0.36,0.72], 3:[0.26,0.50,0.78]}`, index 0 = most
   progressed = narrowest core, drawn last via widest-first run sort; 1-pt run overlap kills seams).
   `drawScene` pass (a) faint baseline unchanged; pass (b) keeps gold sheath + highlight (gold =
   base/frame) and DROPS the old solid per-family core; one global band pass after the loop.
   Re-bake trigger = `settles` appended to `bakeKey`. Zero new state.
6. **A4 polish**: walker idle breathe on an inner wrapper (arrive-pop wins while present; unlocked
   reps only), touch devices halve trail cadence (190ms) + ping cap (24), arrival ring back to gold
   (family colour stays on the trail).

## Risks / Trade-offs

- [Big rewrite of a 1240-line working component] → build **incrementally** (see Implementation plan); keep the maze functional at each step; owner verifies each cut on iPhone. Worktree is `track-neurons`; ship via the batched merge like A–D.
- [Cannot verify Safari perf in dev] → owner-verified on real iPhone + Mac Safari each increment; Chrome non-regression IS automatable (canvas mounts / no error / interactions work). This is the same gap as changes C — accepted, surfaced in proposal.
- [Native pinch-zoom vs page scroll fighting] → reuse the panel's existing `overscroll-behavior` containment + `touch-action` tuning; verify the page still scrolls past the maze.
- [Hit-testing accuracy after the transform model change] → recompute hit map from static layout + current transform; add a Vitest for the coordinate mapping if feasible.
- [Static base re-bake on every explore could stutter] → prefer overlay-reveal for newly-lit nodes; only re-bake the base on coarse changes (theme switch). Decide at apply-time.

## Implementation plan (incremental — owner verifies each on iPhone)

1. **Core spike**: render the static base (reuse existing draw into one offscreen canvas) + CSS-transform pan/zoom (mobile pinch + desktop wheel/drag), NO dynamic layers yet. **Owner verifies on iPhone that pan/zoom is smooth** — this validates the whole premise before building the rest.
2. **Walker overlay** (D2): DOM walkers positioned in the transform, CSS-glide on settle.
3. **Fog / node reveal** (overlay-reveal on explore).
4. **Synapse overlay** (D4): event-driven layer + wiring pulse.
5. **Focus-on-family** (D3/D5): CSS transform transition to cluster.
6. **Ambient** (D7): lightweight CSS keyframes.
7. **Hit-testing + tooltips + celebrations** re-wired; remove the dead rAF loop; `/simplify`; Chrome non-regression + owner iPhone sign-off; batched deploy.

## Migration Plan

Presentation/architecture only; no data/rollback implications. Ship incrementally on `track-neurons`, batched merge → main → CF Pages (like A–D). Each increment: Chrome non-regression (automatable) + **owner iPhone/Safari verification** (the real perf signal). If a step regresses behaviour, fall back to the prior increment.

## Open Questions (resolve at apply-time)

- Fog update on explore: overlay-reveal a single node (preferred — cheap, instant) vs re-bake the base.
- Whether to keep one full-res base canvas or a small set of zoom-bucket bakes (memory vs sharpness at deep zoom).
- Exact desktop wheel-zoom focal-point math (zoom toward cursor).
- Hit-test recompute trigger set (on transform end + synapse change).
- Route colour rendering technique (D8): per-cell nested rounded bands baked once vs. offset family polylines — pick whichever keeps the biological "axon tract" read rather than a tiled heatmap (owner visual check).
- Whether the top-3 rank key should be each family's **total** settle progress (simplest, chosen) vs. per-cell traversal depth — revisit only if total-progress ordering reads wrong on heavily-shared cells.
