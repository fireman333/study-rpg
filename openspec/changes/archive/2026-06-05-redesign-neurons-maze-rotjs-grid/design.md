## Context

The neurons-tw homepage maze (`apps/neurons-tw/src/lib/maze/{graph,economy,useMaze}.ts` + `components/maze/MazeBrainMap.tsx`) is built on a four-NT-branch model:

- 4 committed graph JSONs `assets/maze/{da,5ht,gaba,glu}-graph.json` produced by a build-time image→HSV-mask→Zhang-Suen-skeleton→Dijkstra-walk pipeline over brain-shaped basemap PNGs.
- `FAMILY_NT_BRANCH` (`packages/content-neurons-tw/src/families.ts`) maps the 11 exam subjects to 4 branches; `branchOfFamily` routes a correct answer's energy to the right branch pool.
- Economy (`economy.ts`): `CORRECT_ENERGY=3`, `READING_ENERGY=2`, `nodeCost(n)=round(PACING_BASE·(1+PACING_K·n))` with `PACING_BASE=24`, `PACING_K=0.1`; `SPEED_BUFF_PER_VARIANT=0.04`, `SPEED_BUFF_CAP=1.0`. State in synced `meta`: `maze:<branch>:{earned,settles,starterFamily}` × 4 branches.
- Synapse network is a **read-only** overlay (state owned by `connectome-collection`, which already implements formation / strengthening / 7-day LTD decay).
- first-pull (`services/first-pull.ts`) runs the one-time starter ritual: 4 pulls (one per branch), writes `maze:<branch>:starterFamily`, which the maze reads via `litNodesWithStarter` to light those 4 families' representative nodes.
- Current schema: Dexie **v16**, R2 bundle **SCHEMA_VERSION 16**.

Phase 1 (`drop-neurons-nt-branch-claim-and-synapse-axis`, archived 2026-06-05) relabelled player-facing surfaces to neutral but kept all of this structure. The「11 科 = 4 NT 分支」carve-up has no defensible anatomical basis — a med-student audience will see through it.

This change (Phase 2, change 1 of 2) replaces the 4-branch structure with one unified **square, zoomable** grid maze where 11 families explore inward from the border toward the center, neuro metaphors are OpenEvidence-grounded, and the synapse network becomes a real (Hebbian LTP) gameplay mechanic. Owner-confirmed direction (this session): single shared **square** grid (not 11 regions, not brain-shaped silhouette); **11 families enter from the border and converge toward the center (mandatory)**; **maximize maze complexity** (open-source maze layout may be forked/modified, e.g. radial outward extensions, if algorithmic generation isn't complex enough); save reset acceptable; split into 2 changes (this is change 1; persona rewrite + first-pull rework are change 2). The **first-pull rework** (border-onboarding + 二階-style answer-unlock) is explicitly deferred — change 1 leaves first-pull untouched.

## Goals / Non-Goals

**Goals:**
- Remove every structural artifact of the「科別 = NT 分支」claim from the maze (topology, economy, colors); `FAMILY_NT_BRANCH` survives only as internal data for other capabilities (character-card, variant-decor).
- One unified, complex, **square zoomable** grid maze rendered with our own neural-fiber-themed renderer; rot.js used headless for generation / pathfinding / FOV only (or an open-source maze layout forked + reskinned if richer).
- **Border-start → center-convergence** topology: 11 families enter at distinct perimeter cells, route inward to a shared center; corridors cross at intersection cells = synapses (densest at the core).
- **Contextual camera (design language)**: answering a quiz zooms in to the answered family's walker (watch the action-potential move); reading shows the whole map with ambient exploration animation.
- 11 per-family energy pools, pacing recalibrated for fragmentation, guarded against the positive-feedback runaway.
- Synapse intersections load-bearing: co-firing two families strengthens their synapse (LTP) and grants a **capped** cross-family bonus.
- All neuro metaphors OE-grounded and cited.
- Schema bumped cleanly (Dexie v17 + R2 17) with the required upgrade fixture; per-branch economy reset, collection + first-pull state preserved.

**Non-Goals:**
- Rewriting the 110 NT-saturated variant personas (deferred to change 2 `rewrite-neurons-personas-flat`).
- **first-pull rework** (border-onboarding, 二階-style answer-correct-unlock) — deferred to a future change. first-pull stays functionally unchanged here (only its `NT_BRANCHES` import source relocates).
- **Saltatory-conduction cell-jump movement** — parked as a possible future ITEM, NOT the default movement (default = smooth corridor walk).
- **LTD decay as a maze mechanic** — explicitly cut from this change (connectome's own LTD state is unchanged but the maze does not act on decay).
- Changing the variant catalog, rarity pyramid, dupe-fusion, achievements, leaderboard, character-card, or variant-decor.
- Touching the sync Worker (bundle-opaque) or any non-headless use of rot.js rendering.

## Decisions

### D1 — Engine: `rot-js` for the base grid (build-time only); OWN weave/winding/crossing layer
`rot-js` (BSD-3-Clause, zero-dep, TS types) headless provides the **base maze** (`ROT.Map.EllerMaze` + `ROT.RNG`) at BUILD TIME only. The **weave promotion, winding waypoint routing, crossing detection, and over/under rendering are OURS** (no external weave lib integrates — meatfighter's native `canvas` dep fails to build on node 25, csmazes is CoffeeScript/DOM-tied, daleobrien is Python; all off-stack). We do NOT use `ROT.Display` — the renderer is our own React/canvas brain-themed surface. The runtime always consumes the committed `grid-graph.json`; generation is a one-time build step (`build:grid-maze`). **rot.js is NOT in the runtime bundle** — the committed JSON omits the full wall map (the player only sees explored corridors over a fogged field), so a runtime `ROT.FOV` wall-occlusion pass has no walls to act on; runtime fog is corridor-frontier-based (D11).
- *Alternatives*: external weave libs (meatfighter / csmazes / daleobrien) — rejected on integration (build failure / language / no data API). Phaser — rejected (fights React). PathFinding.js — rejected (unlicensed). WheelScore 74 🟠.

### D2 — Spatial model: ONE square, zoomable, complex grid (owner-confirmed)
A single **square** grid maze shared by all 11 families — not 11 regions, not a brain silhouette. Cute neural-fiber theme skin (corridors = axon tracts). The grid is large + **as complex as feasible** (zoom/pan, D-camera below). All families' corridors live in one coordinate space and cross at interior cells (synapses).
- *Alternatives*: 11 separate regions — rejected (can't host shared-intersection synapses). Brain silhouette / small grid — rejected (owner wants square + complex + zoomable).

### D3 — Topology: STRUCTURAL WEAVE maze + WINDING routes whose crossings generate the nodes (owner-locked 2026-06-05)
The build-time pipeline (`scripts/build-grid-maze.mjs`) emits a single committed `assets/maze/grid-graph.json` (run once, zero runtime recompute). Final locked model after the visual-pass iteration:
1. **Structural weave maze**: `ROT.Map.EllerMaze` base (`GRID=99`, odd) + **braid `0.7`** (the sweet spot — higher *kills* 4-way junctions) → then promote a fraction (`WEAVE=0.7`) of 4-way junctions to **over/under bridges** (the N-S corridor passes over the E-W, no join). Result ≈ **1300 structural weave bridges** — the dense over/under look (like a true weave maze). We OWN this generator (no external dep — meatfighter's `canvas` build fails on node 25, csmazes is CoffeeScript, daleobrien is Python; none integrates cleanly).
2. **11 family border entries** spread by angle around the perimeter.
3. **WINDING (non-shortest) routes** border→center: each family's corridor is routed through `WIND=10` random waypoints (chained weave-aware BFS, respecting the bridge no-turn constraint), so it **meanders ~700+ cells across the map** and interweaves with the other 10 families (owner: "把各個路線弄的更交錯複雜，不要走最小路徑").
4. **Crossings GENERATE the nodes** (owner: "交錯出那些節點"): a cell where one family's route passes H/over and another's passes V/under = a **crossing-synapse** (≈ **135**, > 110). Each family's **10 variant-slot nodes sit AT crossings on its route** (sampled evenly in route order; pad with route cells if a route has < 10 crossings). So all **110/110 nodes are interwoven crossing points**, not evenly-spaced spokes.
5. Walker tween follows the winding corridor centerline (the committed `path` cell list).
6. Commit `{ gridW, gridH, center, seed, weave:[{cell,over}]×~1300, families:{<familyId>:{ entryCell, path, nodeCells:[{slotIndex,cell,t,synapse}] }}, synapses:[{ cell, families:[A,B], over, under }]×~135 }`.

Frontier ordering is now **route-index order** (the walker advances along the winding path, lighting its crossing-nodes in path order), NOT border-entry distance. There is no central hub origin; the center is the convergence target, walkers originate at the border.

### D4 — Movement: smooth corridor walk (AP); saltatory parked as a future item
The growth-cone walker auto-advances (idle-walk, no manual steering) along its family's corridor from the border inward; on each settle the frontier advances one node and the walker tweens to it along the corridor centerline by arc-length = **action-potential propagation** (smooth, the default). **Saltatory conduction (discrete cell-to-cell jump) is parked as a possible future ITEM effect**, NOT the default movement. Per family, the walker sprite is that family's representative collected variant (rarest, tie-broken most-recent), else a generic growth-cone fallback.

### D-camera — Contextual zoom (the design language, owner-directed)
The maze camera is driven by the player's current activity:
- **Answering a quiz** → the camera **zooms in to the answered subject's family** walker, so the player watches that character move (the AP propagating along its corridor) as the answer resolves / settles.
- **Reading** → the camera shows the **whole map** with the ambient exploration animation (all families' walkers idling/advancing).
- Manual pan/zoom is available; the contextual zoom is the default framing per activity. Reduced-motion downgrades the zoom transition to an instant cut.

### D5 — Economy: 11 per-family pools + pacing recalibration (the #1 balance risk)
- **Pools**: synced `meta` keys `maze:<familyId>:earned` + `maze:<familyId>:settles` × 11 families (replacing the 4-branch earned/settles). Monotonic, in `SYNCED_META_KEYS`, MAX-merged.
- **Faucet**: a correct answer in subject S accrues to `maze:S:earned` directly (S is the family — no `FAMILY_NT_BRANCH` lookup). Scaled by streak × mastery × `energyAccel` (capped) × synapse bonus (capped).
- **Reading**: splits across families with ≥1 collected variant (even); fallback even split across all 11 if none collected. *(Open Question: single focus-family.)*
- **Pacing recalibration**: per-family pools fill from one subject's answers only → first-cut **`PACING_BASE` 24 → 14**, keep `PACING_K = 0.10`, `CORRECT_ENERGY = 3`, **`READING_ENERGY` 2 → 3**; dogfood-telemetry-tunable.
- **Runaway guard**: `SPEED_BUFF_CAP` + `SYNAPSE_BONUS_CAP` keep the `collection × streak × mastery × energyAccel × synapse` stack bounded.

### D6 — Synapse load-bearing: capped cross-family energy bonus (LTP only, no LTD)
A **strong** synapse between families A and B (per `connectome-collection`'s existing co-fire formation/strengthening) grants a small, **capped** energy-accrual bonus to A and B (additive across a family's strong synapses, clamped to `SYNAPSE_BONUS_CAP`, first cut +X% per strong synapse, total ≤ +30%). The maze reads synapse state **read-only** (it does not create/strengthen/decay synapses). With no strong synapse the bonus is `1.0`. **Locus**: the maze supplies the on-grid location — the committed `synapses` list (~135 route-crossings, each tagged with its `[A,B]` family pair) maps a connectome family-pair to the weave bridge where their corridors cross; that bridge lights when the pair's synapse forms/strengthens. A family pair with no committed crossing falls back to the nearest bridge to its corridors' meeting region.
- **LTD decay is NOT a maze mechanic** (owner-cut). connectome's own 7-day decay state is unchanged, but the maze bonus only keys off the *current* strong state — no maze-side decay penalty.
- *Alternatives (vetoed)*: grid shortcut / unlock fusion / co-fire combo multiplier. Chosen = capped energy bonus (predictable, runaway-safe, LTP-faithful).

### D7 — Neuro metaphor mapping (OE-grounded; cite in spec + UI copy)
| Game element | Neuro reality | OE anchor (CrossRef-validated) |
|---|---|---|
| Grid corridor | Axon tract / nerve fiber bundle | Salzer *Glia* 2008 (10.1002/glia.20750); Debanne *Physiol Rev* 2011 (10.1152/physrev.00048.2009) |
| Walker traversing a corridor (smooth) | Action potential propagating away from the soma | Debanne *Physiol Rev* 2011 |
| (future item) discrete cell-jump | Saltatory conduction, nodes of Ranvier | Cohen *Cell* 2020 (10.1016/j.cell.2019.11.039) |
| Intersection cell | Synapse (junction connecting two neurons) | Südhof *Neuron* 2018 (10.1016/j.neuron.2018.09.040) |
| Co-fire strengthens synapse → bonus | LTP / Hebbian "fire together, wire together" | Bliss & Collingridge *Nature* 1993 (10.1038/361031a0); Brown *Science* 1988 (10.1126/science.2903551) |

The 11 families remain the 11 exam subjects; no neurotransmitter grouping is claimed.

### D8 — Schema: Dexie v17 + R2 17, partial reset, fixture
- **Dexie `.version(16)` → `.version(17)`**: maze state stays in `meta` key-value (no store change). The v16→v17 upgrade callback clears the retired four-branch **economy** keys `maze:{da,5ht,gaba,glu}:{earned,settles}` (economy reset) but **preserves** `maze:{da,5ht,gaba,glu}:starterFamily` (first-pull state — the new maze still reads these to light first-pull starter nodes). Add fixture `db-v16-to-v17-migration.test.ts` (canonical pattern from `db-v15-to-v16`).
- **R2 `SCHEMA_VERSION` 16 → 17**: additive + reader-tolerance (v16 drops unknown 11-family keys; v17 reading v16 finds no 11-family keys → fresh). Update `bundles.ts` allowlist (add 11-family earned/settles; keep starterFamily; the 4-branch earned/settles become unused-but-tolerated) + history comment. Worker unchanged.
- **`SYNCED_META_KEYS`** (`tables.ts`): remove the 8 four-branch earned/settles keys, add the 22 per-family earned/settles keys; **keep** the 4 `maze:<branch>:starterFamily` keys (first-pull, untouched).

### D9 — first-pull: untouched (mechanical import relocation only)
first-pull keeps its current behavior (4 pulls, gift semantics, once-only, writes `maze:<branch>:starterFamily`). The new maze reads those 4 legacy keys via `litNodesWithStarter` to light those families' representative (border-nearest) nodes — so first-pull's "lights a node" requirement still holds with zero first-pull edits. The only mechanical change: `NT_BRANCHES` / `FAMILIES_BY_BRANCH` / `branchOfFamily` move from `lib/maze/graph.ts` (being rewritten) into the content package (`families.ts`, alongside `FAMILY_NT_BRANCH`); `first-pull.ts` / `first-pull-keys.ts` re-point their import. No behavior change → `neurons-first-pull` is NOT a modified capability.

### D10 — Colors: neutral grouping palette
Replace `--nt-da/5ht/gaba/glu` (`theme-pixel-neurons/src/index.ts`) with a neutral palette (color + line-style + node-shape redundancy for color-blind support) asserting no NT taxonomy. `FAMILY_NT_BRANCH`-keyed consumers (character-card, variant-decor) keep their own internal coloring unchanged.

### D11 — Render: zoomable brain-skinned weave **canvas tilemap** + corridor-frontier fog + contextual camera
A new `components/maze/MazeGrid.tsx` renderer draws to a `<canvas>` (chosen over SVG for the cell count) consuming the committed grid graph with **pan/zoom** (wheel + drag, briefly overriding the auto-camera). Fog is **corridor-frontier-based** (each family's winding route drawn faintly = "the path exists"; the explored prefix up to the walker drawn bright; nodes render only once lit) — NOT a rot.js wall-occlusion pass (the committed JSON omits walls; D1). It renders: the 11 winding family corridors as **axon-fiber tiles** (colour + node-shape redundant encoding); the over/under weave gap at each crossing (the under family's fiber gapped at the cell — the weave look); the crossing **nodes** (variant slots, fogged until reached); the **synapse** boutons (lit when the connectome forms them, weight by state); a per-family **walker** as an HTML overlay (`VariantSprite` / growth-cone) positioned from the same camera. Single `useMaze` mount on the homepage (double-mount → double pulls; `promote-maze-to-home` lesson).

### D12 — Brain visual design language + GBA-style pixel tilemap (owner-directed, 2026-06-05)
The maze must **read as a brain**, not a bare grid (owner: "改設計語言讓迷宮看起來更像大腦…背景或 grid 上加神經纖維或其他底圖"), AND the owner refined the art direction this session: **keep the committed weave routes, but render each grid cell as a GBA-寶可夢-style pixel-art tile** ("保留 grid 路線，但是每一格 grid 會填入像素畫圖片，像是 GBA 遊戲一樣"). Layers, back-to-front: (a) a chunky checker-dither **neural-tissue 底圖** field on the dark `--signal-bg` palette; (b) the weave corridors as **axon-fiber** pixel tiles (myelin-segment highlight = nodes of Ranvier nod) — faint where unexplored, bright on the lit prefix; (c) crossing-synapses as **synaptic-bouton** glyphs (cyan `--signal-cyan`, brightening when potentiated); (d) the center as a dense **synaptic core**. Family corridors keep the neutral redundant encoding (D10) over the fiber base.

**Tile-source plan (owner delegated the pick — hybrid, evaluated by the seamless-tiling constraint):** the renderer draws each cell via a `drawCell`-style call so the tile backend is swappable. First cut (this change) = **procedural pixel-art tiles drawn on the canvas** (crisp, palette-limited — ships + verifies the whole maze end-to-end with zero asset risk). Polish (deferred follow-up `polish-neurons-maze-tileset`): **Aseprite-authored** connecting structural tiles (bg / axon corridor 直·彎·T·十字 / over-under bridge / fog — these MUST tile seamlessly) + **Gemini/codex-generated** standalone hero glyphs (節點神經元 / synapse bouton / 中心 soma core / 邊界入口 / walker — no edge continuity needed → AI art is safe + nicer), exported to a 16×16 atlas the renderer blits behind the same `drawCell` seam. Open-source CC0 sets: scanned for palette inspiration only (brain-themed seamless tilesets don't exist off-the-shelf).

## Risks / Trade-offs

- **11-pool pacing fragmentation (P1 夯 risk)** → recalibrated base + reading-to-active-families + every multiplier capped (D5). Telemetry-tune post-dogfood; isolated constants.
- **Maze too complex → perf / readability** → zoom/pan + contextual camera (D-camera) keep it navigable; FOV recompute memoized on frontier change only; verify mobile fps at the target grid size.
- **Generation not complex enough** → open-source-maze fallback (D1) + radial center extensions (D3) as the complexity escape hatch.
- **Save reset frustrates players** → only the per-branch economy resets; collection + first-pull starter state preserved; no banner.
- **rot.js / forked-maze bundle size** → import only Map/Path/FOV (tree-shake); verify bundle delta.
- **Synapse bonus compounding** → independently capped (`SYNAPSE_BONUS_CAP`), additive not multiplicative across synapses.
- **first-pull starter keys are per-branch but maze is per-family** → the ≤4 starter families named in the legacy keys are looked up by familyId (the key *value*), so lighting works without per-family starter keys; the orphaned per-branch *earned/settles* are reset, the *starterFamily* keys are read.

## Migration Plan

- **Deploy**: client-only + bundle schema bump; Worker bundle-opaque (no Worker deploy). Ship via `deploy-cf-pages.yml` on main push (neurons build).
- **Upgrade**: Dexie v16→v17 callback clears the 4 branch economy keys (reset), keeps starterFamily; 11-family keys start absent → fresh maze. R2 v16↔v17 tolerance covers the brief mixed-version window.
- **Rollback**: revert the change; only the per-branch maze economy is reset in either direction (collection + first-pull preserved), so rollback is symmetric / low-loss.

## Open Questions

1. ✅ **RESOLVED (visual pass 2026-06-05)** — Maze: 99×99, EllerMaze base + braid 0.7 + WEAVE 0.7 → ~1300 over/under bridges; WIND=10 winding routes; ~135 crossing-synapses; all 110 nodes at crossings. Own in-house weave generator (externals didn't integrate). No radial extensions needed.
2. **Reading accrual target** — active-families-even-split (chosen) vs single focus-family.
3. **Synapse bonus exact %** (`SYNAPSE_BONUS_CAP`, per-synapse %) — first cut +X%/synapse ≤ +30%; telemetry-tunable.
4. **Contextual-camera zoom level + transition** — exact zoom factor for the quiz-focus framing and whole-map reading framing; tune at the renderer visual pass.
5. **Brain backdrop fidelity** (D12) — inline texture/`<filter>` vs a build-time backdrop PNG; decide at the renderer visual pass.

## Deferred follow-up — neural-circuit "discovery location" naming (owner-requested 2026-06-05)

> **RESOLVED at resume 2026-06-05 — KEEP SEPARATE.** Owner confirmed: this change ships the maze redesign ONLY (brain aesthetic D11+D12 + weave grid + 11 pools + synapse bonus). The circuit-location naming + 「在 XXX 尋獲的神經元」 provenance 稱號 is NOT in this change's scope/tasks — it becomes a future change `name-neurons-maze-circuit-locations` (needs the batched OE query below + touches the variant title/provenance system). The committed `grid-graph.json` does NOT carry `synapses[].location` yet; that change will add it.

Give each crossing-synapse a **neuroscience circuit/pathway/location name** (e.g. a real tract / nucleus / loop) and surface it as a **Pikmin-Bloom-style provenance**: when a variant is collected at a crossing node, its title/稱號 reads 「在 XXX 尋獲的神經元」 (XXX = that crossing's circuit-location name). Plan:
- **Batch OE query (next session, one shot)**: ask OpenEvidence for a curated list of ~N (≥ the distinct crossing count / a sensible pool, e.g. 60–135) real neuroanatomical circuit/pathway/nucleus/loop names suitable as evocative "discovery locations," each with a one-line function (OE-grounded, peer-defensible — owner is a med student). Owner explicitly OK'd batching ("量有點大可以一次問").
- **Assign** each committed crossing-synapse a name from the pool (build-time, into `grid-graph.json` `synapses[].location`).
- **Surface** in the variant title/caption at mint time (touches the variant title/caption system — `neuron-variant-gacha` / `neurons-variant-collection-view` / character-card). Likely a **separate follow-up change** (`name-neurons-maze-circuit-locations`) layered on this one, since it touches the title/provenance system beyond the maze. Decide fold-in vs separate at resume.
