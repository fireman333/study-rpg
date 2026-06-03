## Context

The brain-maze (`add-neurons-brain-maze-slice`, archived 2026-06-03) shipped a DA-only vertical slice on `/maze-beta`: 20 of 110 variant slots, 1 of 4 NT branches. Its design D9 deliberately built the *pipeline + graph schema + loader + renderer* per-branch so the other three regions could be added additively, but the *runtime* is still DA-singular:

- `apps/neurons-tw/src/lib/maze/graph.ts` — `import daGraphRaw from '../../assets/maze/da-graph.json'`; `MAZE_GRAPH` is one graph; `MAZE_BRANCH = 'DA'`; `MAZE_FAMILIES` / `foggedNodes` / `nextTarget` / `nextTarget` all read the single `MAZE_GRAPH`.
- `apps/neurons-tw/src/lib/maze/economy.ts` — single pool keys `maze:da:signal` / `maze:da:settles`; `collectedDaKeys()`; one `mazeSpeedMultiplier`; one walker.

The single canonical mapping `FAMILY_NT_BRANCH` (`@study-rpg/content-neurons-tw/src/families.ts`) already partitions all 11 families into the 4 branches (DA=2, 5HT=2, GABA=3, Glu=4 families; 10 slots each → DA 20 / 5HT 20 / GABA 30 / Glu 40 = 110 nodes). The 110-variant catalog, the gacha mint path (`mintVariantSlot`), and the collected-variant store are unchanged.

## Goals / Non-Goals

**Goals:**
- Cover all 4 NT branches in the maze (90 new nodes) so every collected variant has a node.
- Generalize the runtime from single-branch to multi-branch with DA as the proven reference implementation that the other three inherit.
- Keep DA's `da-graph.json` (node positions) byte-stable through the refactor.
- Render the four regions overlaid on a shared brain outline, with filter chips to toggle which branch(es) are shown (default: all).
- Stay on `/maze-beta` (beta), local-only `meta` persistence, no Dexie bump, no sync/leaderboard change.

**Non-Goals:**
- No new gacha / collection mechanics; settle still routes through the existing `neuron-variant-gacha` mint.
- No monetary / IAP / ad path (hard product rule).
- No graduation off `/maze-beta` to a primary nav route (separate future change).
- No per-branch economy *tuning* in this change (constants stay shared; only the seam is added).
- No cross-device maze sync (lit state stays derived from already-synced collected variants).

## Decisions

### D10 — DA-as-reference inheritance contract (the core principle)

The other three branches **inherit DA's hardened behaviour by default**; only the per-branch *asset* differs. Three tiers:

| Tier | Content | Inherited from DA? |
|---|---|---|
| **① Shared code path** | render (pixelated tracts, concentric-circle two-layer nodes, frontier walker, arc-length centerline walk, `img(cover)`/`svg(none)` alignment), economy *logic* (accrue → reconcile settles → mint), graph *algorithm* (Zhang-Suen → hub-Dijkstra walk → RDP) | **Yes, automatically.** The refactor generalizes DA's code so all four branches execute the *same* tuned path. DA's pitfalls (morphClose off by default; alignment) apply to all. This is the primary reason this ships as **one** change, not three. |
| **② Per-branch asset** | base image + branch colour + that image's pipeline sanity-check (HSV colour threshold; morphClose only if that image has gaps) | **No — but seeded from DA's proven defaults** (≥384×256, morphClose OFF, same RDP epsilon, hub-rooted walk). Each image is generated + pipelined once; per-image tweaks only when a specific image needs them. |
| **③ Shared tunable constants** | `CORRECT_SIGNAL` / `READING_SIGNAL` / `SIGNAL_PER_NODE` / speed-buff | **Yes by default (shared).** A per-branch seam is left open (keyed by `NtBranchId`) but all four use one shared set until dogfood telemetry says a branch needs different pacing. |

Rationale: alternative was independent per-branch implementations (each re-tuned). Rejected — it would fork DA's hardened code, lose the shared-fix property, and triple the maintenance surface for zero player benefit.

### D11 — Render: overlay on a shared brain outline + filter-chip branch toggle

All four NT regions render **z-stacked on a common brain outline** (D9's interwoven intent — anatomically, the 4 NT systems share one brain and interweave; cf. Tremblay 2016, cited in the slice's D-decision). A **filter-chip control** (reusing the app's existing `.filter-chip[aria-pressed]` pattern from `YearFilterBar` / bookmarks) toggles each branch's visibility; **default = all four on**. Toggling a branch off hides its tract layer, its nodes, its fog, and its walker; the shared brain outline never hides.

- **Compositing**: one always-on shared brain-outline base layer + four independently-toggleable colored tract layers (z-stacked) + per-branch node/fog/walker SVG overlays.
- **DA byte-stability**: the refactor does not regenerate `da-graph.json` (node positions stable). DA's tract is rendered from its existing graph; only image *compositing* changes.
- **Alignment requirement**: for overlay to register, all four branch graphs must live in the **same normalized 0..1 coordinate space over a common canvas with the brain in the same position**. The 3 new images are generated on DA's canvas geometry; the build pipeline already emits normalized coords, so co-registration reduces to "same canvas + same brain placement."
- Alternatives rejected: **per-branch tab** (one region at a time) — simpler/lower-risk but loses the interwoven-brain reading the player explicitly wanted; **2×2 small-multiples** — all visible but kills single-brain immersion.

### D12 — Per-branch state keys + accrual routing

- `meta` keys become per-branch: `maze:<branch>:signal` / `maze:<branch>:settles` for `branch ∈ {da, 5ht, gaba, glu}` (DA keys unchanged → existing DA progress preserved, no migration). All local-only (NOT in `SYNCED_META_KEYS`).
- Growth-signal accrual routes each gameplay event to its branch via `FAMILY_NT_BRANCH[subject]`: a correct 寄生蟲學 answer feeds the `5ht` pool, etc. Reading time without a subject context feeds … (see Open Questions).
- `graph.ts` exposes `MAZE_GRAPHS: Record<NtBranchId, MazeGraph>` (4 JSON imports) and branch-parameterized `foggedNodes(branch, collected)` / `nextTarget(branch, collected)`; `economy.ts` parameterizes `collectedKeys(branch)` / `mazeSpeedMultiplier(branch, count)` / settle reconcile per branch.

### D13 — Tests extend, not replace

`maze-graph.test.ts` + `maze-economy.test.ts` extend to assert all four branches (node counts 20/20/30/40; per-branch pool isolation; DA behaviour unchanged = regression guard). No Dexie upgrade fixture needed (no schema store; stays in `meta`).

### D14 — Render pivot during apply (codex consult + OE): graph-first SVG + canonical normalization + brain-mask clip

A Chrome MCP overlay check during apply confirmed D11's "stack N dimmed basemap images" fails: the four AI-generated images each place the brain silhouette differently → multiple misaligned brain outlines + heavy clutter. A codex consult + owner feedback drove the final approach (supersedes the *mechanism* of D11; the overlay-on-shared-outline + filter-chip *intent* stays):

1. **Drop the per-branch fog images from the render.** Runtime renders ONLY: one shared brain-outline image + each branch's tracts as **solid pixelated SVG straight from its graph walk-paths** (dim = unexplored fog, bright = lit). The AI basemaps become **build-time-only inputs** to `build-maze-graph.mjs` (not shipped/rendered). Removes the misaligned-brains problem AND the clutter (sparse 20–40 SVG paths vs dense images).
2. **Canonical brain-frame normalization** (`graph.ts` `normalizeGraph`, load-time): each branch's graph is affine-fit from its own robust point-extent (2nd–98th pct) into one `CANONICAL_BRAIN_BOX` + a per-branch `{dx,dy,sx,sy}` nudge. DA = identity (`da-graph.json` byte-stable on disk + render). Codex's key correction: fit from the GRAPH geometry, not the AI image's brain bbox.
3. **Brain-shape `<mask>` clip** (`brain-mask.png` — flood-filled silhouette derived from `da-basemap`): tracts clip to the actual brain shape (not an ellipse) → pixel-perfect containment, no spill. The shared outline (`brain-outline.png`) is the low-saturation brain lines extracted from `da-basemap` with the DA tracts removed → no ghost when the DA chip is off.
4. **OE-grounded anatomical placement** (per project neuroscience-fidelity rule): per-branch nudges place each NT system in its correct sagittal territory — DA→frontal/striatum (VTA, forward-left), 5HT→raphe (brainstem, low-center), GABA→basal ganglia + cerebellum (center-right), Glu→cortex (dorsal, upper). Refs: Camí NEJM 2003 `10.1056/NEJMra023160`, Yetnikoff Neuroscience 2014 (VTA), Ren eLife 2019 (raphe) — 11 crossref-validated citations.
5. **Solid lines** (no dash, owner preference): colour-blind redundancy = colour + node-shape (circle/diamond/square/triangle), distinct in grayscale.

Resolves both Open Questions below (outline = extracted brain lines, not a generated asset; reading = even-split).

## Risks / Trade-offs

- **Image co-registration drift** (3 new tracts must sit on DA's brain geometry to overlay) → Generate all 3 on the same canvas + brain placement as DA; verify overlay visually in Chrome MCP (per `chrome_mcp_*` imports — `img(cover)`/`svg(none)` only align when container aspect matches) before settling on assets. If a branch can't be co-registered cleanly, fall back to dimming non-active branches rather than blocking ship.
- **Image-gen stall / content gate** (3 generations during apply) → abstract brain-tract art is low content-gate risk (DA's succeeded via codex). Route per `image_gen_routing.md`: Gemini-first for simple single-color tracts, codex fallback; Chrome MCP Gemini as deep fallback. Stall > 10 min on one → switch tool, don't block the others.
- **Visual clutter with 4 branches + 4 walkers on** → the filter chips are the mitigation (player isolates); default-all is the neuroscience-faithful view but the chip lets them de-clutter instantly.
- **DA regression during refactor** → `da-graph.json` untouched + extended DA assertions in `maze-graph`/`maze-economy` tests as a regression guard; DA is "branch === 'DA'" with equivalent behaviour.
- **Colour-blind legibility when multiple branches overlay** → keep the slice's 3-channel encoding (colour + line style + node shape) and ensure the 4 branches are distinct on *all three* channels, not just colour.

## Migration Plan

- **Forward**: purely additive — 3 images + 3 graph JSONs + 3 per-branch `meta` key-pairs + multi-branch refactor. Existing DA players: DA nodes already lit (derived from collected DA variants), DA progress keys preserved, no backfill, no banner.
- **Rollback**: revert the change; DA-only maze returns; the 3 new `meta` keys become inert (ignored). No schema/sync state to unwind.
- **Deploy**: `track-neurons` → main → `deploy-cf-pages.yml` → `med-study-rpg.com/neurons/maze-beta`. Not on GH Pages.

## Open Questions

- **DA outline vs dedicated shared-outline asset** (apply-time — recommended path now firmed by code reading): the current renderer shows "fog" as the **dimmed full `da-basemap.png` image** (brain outline + amber tracts baked into one PNG at `opacity 0.42`, `objectFit: cover`); the SVG layer only draws the *bright explored* pixel-paths + nodes + walker on top. Therefore stacking four full basemaps would multiply the outline and clutter the mist. **Recommended (a)**: generate one dedicated neutral shared brain-outline base asset (always-on, never hidden by chips) + four **tract-only transparent-bg** branch images (DA re-cut from its basemap with the outline masked — `da-graph.json` stays byte-stable since the tract skeleton is unchanged) dimmed + per-branch SVG overlays; filter chips toggle each branch's tract image + SVG group together. Fallback (b) if re-cutting DA proves lossy: DA basemap carries the shared outline and toggling DA dims-not-hides. Resolve with a Chrome MCP overlay check at apply; no second spec round-trip.
- **Reading-time branch attribution** (active, not a placeholder): `reading-timer.ts:87` already calls `accrueMazeSignal(READING_SIGNAL)` per minute into the single DA pool — reading is wired today, so the multi-branch refactor MUST branch-route it (it cannot be deferred). Reading has no subject/NT context → default = split the per-minute reading signal evenly across the 4 branch pools; alternative = attribute to the most-recently-studied branch. Pick the simpler even-split unless dogfood feels wrong; confirm at apply.
