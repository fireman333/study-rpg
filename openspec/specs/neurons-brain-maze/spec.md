# neurons-brain-maze Specification

## Purpose

A fog-of-war exploration view over a single unified **square grid** maze covering all 11 subject families on one shared grid — no neurotransmitter regions, no brain-shaped silhouette — that is the `apps/neurons-tw` homepage (`/`; the prior `/maze-beta` route redirects here). Studying a subject and reading accrue **per-family neural energy** (11 pools, one per subject family) that is BOTH the exploration fuel AND the pull cost: as a family's accrued energy crosses each settle's front-loaded ramped cost `cost(N)`, that family's growth cone advances along its winding corridor and the settle consumes `cost(N)` energy + triggers exactly one random `pullVariant` for the reached node's family (二週目: continued settles keep pulling within the family — dupes feed fusion) — the maze node settle is the ONLY pull path (no manual pull). The grid graph is committed (built by `scripts/build-grid-maze.mjs`; zero runtime recomputation). Display obeys the open-collection paradigm: fog of war (no pre-revealed shape / rarity), pure-count chip (no denominator), no completion milestone. Lit-node state is derived from the per-family frontier (cumulative settle count), NOT from collected variants (settle pulls are random). Each family enters from a distinct border cell and routes toward the shared center along a winding corridor; the cells where two families' routes cross at a bridge are the maze's synapses, and the connectome synapse network is rendered as a read-only overlay on the grid.
## Requirements
### Requirement: Maze is the homepage route

The system SHALL render the unified square grid maze as the neurons-tw homepage at route `/` in `apps/neurons-tw`, covering all 11 subject families on one shared grid (no neurotransmitter regions). The prior beta route `/maze-beta` SHALL redirect to `/`. The maze SHALL host the homepage's existing companion surfaces (CTA toolbar, family grid, DMN progress ring, onboarding) per the `neurons-homepage` capability.

#### Scenario: Grid maze renders as the homepage

- **WHEN** the user navigates to `/`
- **THEN** the unified square grid maze renders as the homepage centerpiece with its exploration UI
- **AND** no four-region brain map and no connectome tree is the centerpiece

#### Scenario: Legacy maze-beta route redirects home

- **WHEN** the user navigates to `/maze-beta`
- **THEN** the app redirects to `/`

#### Scenario: All 11 families present on the grid

- **WHEN** the maze loads its node set
- **THEN** the grid contains the border entry, corridor, and nodes for all 11 families
- **AND** each family's node count equals that family's variant-slot count

### Requirement: Node-to-variant-slot binding

Each maze node SHALL correspond to exactly one neuron variant slot (1 node = 1 variant slot), across all 11 families. The node identity SHALL be bound to a cell on its family's corridor in the committed grid graph (a grid-topology feature), not to a hand-placed free coordinate.

#### Scenario: One node per variant slot per family

- **WHEN** the grid graph is loaded
- **THEN** for each family the count of that family's nodes equals the count of that family's variant slots
- **AND** each node maps to a distinct `{familyId, slotIndex}` pair with no cross-family collisions

### Requirement: Growth-signal exploration economy

The system SHALL maintain a per-FAMILY **neural-energy** pool (11 pools) that is BOTH the exploration fuel and the pull cost (one currency per family, no separate manual-pull balance). A correct quiz answer in subject S SHALL accrue energy into family S's own pool directly (S is the family — no neurotransmitter-branch indirection). Reading time SHALL accrue across the families the player has begun collecting (even split among families with ≥1 collected variant; if none collected, even split across all 11). Accrual SHALL be scaled by the active answer streak, by that family's mastery tier, by the capped acceleration energy multiplier `energyAccel`, and by the capped synapse cross-family bonus. The settle cost SHALL follow the front-loaded pacing schedule `cost(N) = round(PACING_BASE × (1 + PACING_K · N))` for the N-th cumulative settle within a family (0-indexed, uncapped into 二週目), recalibrated for per-family fragmentation (first-cut `PACING_BASE = 14`, `PACING_K = 0.10`, `CORRECT_ENERGY = 3`, `READING_ENERGY = 3`; dogfood-telemetry-tunable). A family's frontier advances inward from its border entry while `earned − Σcost(settled) ≥ cost(nextNode)`. The system MUST NOT introduce any monetary, IAP, ad-reward, or non-gameplay path to advance exploration or settle nodes.

#### Scenario: A correct answer accrues to its family's pool

- **WHEN** the user answers a question correctly in subject S
- **THEN** earned energy is added to family S's pool (scaled by streak, S's mastery, capped `energyAccel`, and S's capped synapse bonus)
- **AND** no other family's pool is changed by that event

#### Scenario: Reading time feeds the player's active families

- **WHEN** the user accrues reading time and has ≥1 collected variant
- **THEN** earned energy is split evenly across the families in which the player has collected variants
- **AND** when the player has no collected variants the split is even across all 11 families

#### Scenario: Recalibrated front-loaded pacing applies per family

- **WHEN** energy accrues and settles in any family
- **THEN** the `cost(N) = round(PACING_BASE × (1 + PACING_K · N))` schedule applies with the recalibrated shared constants
- **AND** the first settle (N=0) costs `PACING_BASE` (cheap onboarding) and later settles cost strictly more (K > 0)

#### Scenario: No monetary path

- **WHEN** any exploration advance or node settle is triggered
- **THEN** the trigger is a gameplay action (correct answer / reading time) only
- **AND** no real-money, IAP, or ad-reward path exists to advance or settle

### Requirement: Exploration teams from collected variants

Collected variants SHALL act as exploration units partitioned by FAMILY; each family's team explores its own corridor from the border inward. Per family, base exploration speed SHALL be a fixed positive value so a player with an empty team for that family can still make progress. A larger or rarer set of collected variants in a family SHALL increase that family's team exploration speed (a capped buff that never hard-blocks progress, `SPEED_BUFF_PER_VARIANT` / `SPEED_BUFF_CAP`). The effective exploration speed SHALL additionally be scaled by the capped acceleration speed multiplier `speedAccel`, clamped to `SPEED_ACCEL_CAP`.

#### Scenario: Empty family team still progresses

- **WHEN** a player with zero collected variants in family F accrues growth signal in F
- **THEN** exploration in F still advances at the fixed base speed (never zero / blocked)

#### Scenario: Collected variants buff the owning family's speed

- **WHEN** a player has collected more (or rarer) variants in family F
- **THEN** family F's team exploration speed is higher than its base, increasing monotonically with F's collection strength up to `1 + SPEED_BUFF_CAP`
- **AND** collecting variants in F does not change another family's team speed

#### Scenario: Acceleration speed multiplier composes under its cap

- **WHEN** active `surge` consumables and/or owned speed-lane permanents raise `speedAccel`
- **THEN** the family's effective exploration speed is multiplied by the clamped `speedAccel` (never exceeding `SPEED_ACCEL_CAP`)
- **AND** with no speed boost active `speedAccel` SHALL be `1.0`

### Requirement: Node settle is a continuous pull-cadence gate (not a finite per-node budget)

The maze SHALL be a continuous pull-cadence gate, NOT a one-pull-per-node finite budget. Each settle SHALL be indexed by the family's cumulative settle count `N` (0-indexed, NOT capped at the family's node count). On each settle the system SHALL consume `cost(N)` from the family's pool, then trigger exactly one `pullVariant` (per `neuron-variant-gacha`), emitting the same reveal / provenance / achievement / leaderboard side-effects as any pull. The pull MAY yield a new variant or a dupe (dupes feed `add-neurons-dupe-fusion`). The pull's target family SHALL be: while the family still has fogged nodes, that family itself; once all of the family's nodes are lit (二週目), the family continues pulling toward its own least-collected slots. Node "lighting" SHALL cap at the family's node count as a visual indicator, but pulls SHALL continue past it. A settle SHALL play a reveal chime. The maze node settle SHALL be the ONLY mechanism producing variants — there SHALL be no always-available manual pull.

#### Scenario: Each settle consumes its ramped cost and triggers one pull

- **WHEN** family F's accumulated energy reaches the next settle threshold at cumulative settle index N
- **THEN** `cost(N)` energy is consumed from F's pool
- **AND** exactly one `pullVariant` for F is triggered (random rarity + P0 pity)
- **AND** a reveal chime plays

#### Scenario: Pulls continue past all-nodes-lit (二週目)

- **WHEN** all of family F's nodes are lit and the player accrues another `cost(N)` of energy
- **THEN** a pull still triggers (the maze does not dead-end), targeting F's least-collected slots
- **AND** the 🧠 lit-node count remains capped at F's node count while the pull/settle count keeps growing

#### Scenario: No manual pull path coexists

- **WHEN** the player wants to collect a variant
- **THEN** the only path is the maze settle cadence (no always-available manual pull button)

### Requirement: Fog-of-war display

Unexplored nodes SHALL be rendered as fog: no silhouette, no pre-revealed shape, no pre-revealed rarity. The grid frame and a family's corridor existence MAY be visible (the player knows a family's path exists, drawn faintly), but the individual nodes SHALL remain fogged until explored. Fog SHALL be computed from the **explored corridor frontier** (each family's lit route prefix up to its walker) and SHALL clear progressively as nodes are lit inward from the border. (The committed grid graph omits the full wall map, so runtime fog is corridor-frontier-based, not a wall-occlusion `ROT.FOV` pass — rot.js is build-time only.)

#### Scenario: Unexplored node shows no pre-revealed information

- **WHEN** a node has not yet been explored
- **THEN** it renders as fog with no silhouette, shape, or rarity hint

#### Scenario: Fog clears on lighting

- **WHEN** a node is lit
- **THEN** the fog around that node clears and the node renders as a lit marker with its grown-corridor path drawn
- **AND** the variant joins the collection (revealed via the settle modal; visible in the collection view)

### Requirement: Pure-count progress chip

The maze SHALL display exploration progress as a pure count chip 「🧠 已連線 X 個腦區」 with no denominator, where X = the number of reached (lit) nodes (capped at the total node count once fully explored). Collection progress SHALL be shown separately as a pure-count 「🧬 X 隻」 chip. The system SHALL NOT display a completion percentage, family-complete state, or any closed-cap / completion milestone on either chip. Pull/settle cadence MAY continue after all nodes are lit (二週目) without changing the 🧠 lit-node count.

#### Scenario: Node chip shows reached-node count without denominator

- **WHEN** the player has lit X nodes
- **THEN** the chip reads 「🧠 已連線 X 個腦區」 with no total / denominator / percentage

#### Scenario: Lit-node count caps while pulls continue

- **WHEN** all nodes are lit and the player keeps accruing energy (二週目)
- **THEN** the 🧠 count stays at the total node count (it does not exceed it)
- **AND** pulls continue (the 🧬 collection count may keep rising)

#### Scenario: Collection count shown separately

- **WHEN** the player has collected Y individual variants
- **THEN** a separate 「🧬 Y 隻」 chip is shown
- **AND** neither chip shows a denominator or completion milestone

### Requirement: Collected-variant to lit-node migration

Lit-node state SHALL be derived solely from the per-FAMILY frontier progress (cumulative settle count), NOT from collected variants in general and NOT from any first-pull starter overlay. A family's frontier-lit nodes SHALL be the first `min(settles, nodeCount)` nodes in **route order (along the winding corridor, entry-first)** along that family's corridor (nearest the border first, advancing inward). The lit set SHALL be exactly that frontier — the legacy first-pull starter-lit overlay is retired together with the 4-branch first-pull (the family's representative neuron is shown at the tract walker head per the walker-sprite requirement, not as a lit starter node). The system SHALL NOT run a backfill, duplicate-store frontier lit state, or show a migration banner.

#### Scenario: Lit nodes derive from the per-family border frontier

- **WHEN** a family has `settles = K`
- **THEN** the lit set is the first `min(K, nodeCount)` corridor nodes in route order (along the winding corridor, entry-first)
- **AND** the lit set does NOT depend on which specific variants were collected

#### Scenario: A fresh family has no lit nodes until its first settle

- **WHEN** a family has `settles = 0`
- **THEN** that family has zero lit nodes
- **AND** the family's representative (if first-pulled) shows at the tract walker head, not as a lit node

### Requirement: Runtime sprite walks the corridor center

At runtime the exploration sprite SHALL move by arc-length tween along its family's corridor polyline (committed in the grid graph), travelling along the visual center of the corridor (axon centerline) from the border inward — this smooth continuous movement IS the default and represents action-potential propagation. It SHALL NOT step by pixel grid. Any pathfinding SHALL be used only for route selection between nodes, never for the visual movement itself. (Discrete saltatory cell-to-cell jumping is NOT the default movement in this change; it is reserved as a possible future item effect.)

#### Scenario: Sprite travels the corridor centerline smoothly

- **WHEN** the sprite advances along a corridor segment
- **THEN** it follows the polyline by arc-length on the corridor centerline (smooth continuous interpolation)
- **AND** it does not step by pixel grid

### Requirement: Exploration walker sprite

Per family, the leading exploration sprite (the family's path representative) that walks that family's corridor SHALL be rendered as the family's **representative** collected variant when the player owns it; otherwise it SHALL fall back to the family's **rarest** collected variant (tie-broken by most-recently collected). When the player has zero collected variants in a family (no first-pull yet), the system SHALL render a **grayscale silhouette** placeholder rather than a collected neuron. Each family's walker selection SHALL be recomputed when the collection or the family's representative changes.

#### Scenario: Walker is the family's representative when set

- **WHEN** family F has a representative variant the player owns
- **THEN** F's walking sprite renders as that representative variant's 立繪

#### Scenario: Walker falls back to the rarest collected variant

- **WHEN** family F has collected variants but no representative set
- **THEN** F's walking sprite renders as F's rarest collected variant's 立繪 (tie-broken by most-recent)

#### Scenario: Empty family shows a grayscale silhouette

- **WHEN** the player has zero collected variants in family F
- **THEN** F's tract head renders a grayscale silhouette placeholder
- **AND** exploration in F still advances at the fixed base speed

### Requirement: Maze progress persistence

The system SHALL persist per-FAMILY earned-energy accrual and settle progress in the existing `meta` key-value store using per-family keys (`maze:<familyId>:earned` monotonic synced accrual, `maze:<familyId>:settles` settle/pull count). Both per-family key families SHALL be in `SYNCED_META_KEYS` and resolve via the MAX-merge counter post-pass. The legacy per-branch first-pull keys `maze:<branch>:starterFamily` and the `firstPullDone` flag are **retired**: they SHALL NOT be in `SYNCED_META_KEYS` and SHALL NOT be read by the maze; any physically-present legacy key in an existing save is ignored (leave-and-ignore). The maze Dexie schema is `.version(17)` (established by the rotjs-grid redesign); the representative change SHALL NOT bump the Dexie version. The R2 bundle `SCHEMA_VERSION` SHALL be bumped additively (17 → 18, reader-tolerant) to carry the new `firstPullFamilies` synced meta key.

#### Scenario: Per-family progress survives reload

- **WHEN** the player advances exploration in any family and reloads the app
- **THEN** each family's earned-energy accrual and settle count are restored independently

#### Scenario: Retired first-pull keys are ignored

- **WHEN** an existing save physically contains legacy `maze:<branch>:starterFamily` or `firstPullDone` keys
- **THEN** the maze ignores them and does not sync them (they are not in `SYNCED_META_KEYS`)

### Requirement: Color-blind-friendly team encoding

The maze SHALL encode each family's identity using redundant channels — a per-family **color tint**, each family's **distinct carved corridor route** through the shared grid (a spatial, non-color channel), and a per-family **node/marker shape** — so families are distinguishable without relying on color alone. The family→color mapping SHALL be a neutral, arbitrary-but-distinguishable assignment that asserts no neurotransmitter taxonomy.

#### Scenario: Families distinguishable without color

- **WHEN** the maze is rendered with color information removed (grayscale)
- **THEN** families are still distinguishable by their distinct corridor routes and node/marker shapes
- **AND** no color is presented as a neurotransmitter claim

### Requirement: Synapse network overlay on the maze grid

The system SHALL render the synapse network as an overlay on the maze grid: each formed synapse (a co-firing family pair) SHALL be drawn at/through its synapse-intersection cell(s), with visual weight reflecting synapse state (dormant / weak / strong). The overlay SHALL be read-only with respect to synapse STATE — it SHALL NOT create, strengthen, or decay synapses (that mechanic is owned by `connectome-collection`, unchanged). The overlay SHALL update as synapse state changes and SHALL be toggleable consistent with the maze's display model. (The gameplay bonus that a strong synapse confers is specified separately under "Strong synapse SHALL confer a capped cross-family energy bonus"; the overlay itself remains render-only.)

#### Scenario: Formed synapse renders at its intersection

- **WHEN** a synapse exists between families A and B
- **THEN** an edge/marker is drawn at the A–B synapse-intersection cell on the grid
- **AND** its visual weight reflects the synapse's current state

#### Scenario: Overlay reflects state changes without mutating state

- **WHEN** a synapse strengthens or decays
- **THEN** the overlay weight updates
- **AND** the synapse data/state itself is unchanged by the overlay

### Requirement: Maze SHALL be one large square zoomable structural-weave grid

The maze SHALL be a single unified **square** grid map shared by all 11 subject families — NOT four neurotransmitter regions, NOT a brain-shaped silhouette, NOT 11 separate sub-mazes. The grid SHALL be large (e.g. 99×99) and densely **weave** — hundreds of **over/under bridge** cells where one corridor passes over another without joining — and SHALL support pan/zoom (the renderer zooms so detail stays legible). Each family SHALL enter from a distinct **border** cell and route **toward the shared center** along a **winding (non-shortest) corridor** that interweaves with the other families; the cells where two families' routes cross at a bridge are the maze's **synapses**. There SHALL be no central hub origin (the center is the routing target; walkers originate at the border). The system SHALL NOT present any neurotransmitter-taxonomy grouping of the 11 families.

#### Scenario: Single square weave grid renders as the maze

- **WHEN** the maze loads
- **THEN** one unified large square grid map renders with dense over/under weave bridges (not four NT regions, not a brain silhouette), pan/zoom enabled
- **AND** all 11 families' winding corridors share the one grid coordinate space
- **AND** no neurotransmitter grouping label is shown to the player

#### Scenario: Winding family routes interweave and cross

- **WHEN** the maze graph is loaded
- **THEN** each of the 11 families has a distinct border-cell entry and a winding corridor routed toward the center
- **AND** the corridors cross one another at weave bridges (the crossing-synapses)

### Requirement: Maze SHALL read as a brain (neural-fiber design language)

The maze SHALL be styled to read as brain tissue, not a bare grid: a soft neural-tissue backdrop (cortical-fold / myelin texture on the dark signal palette), the weave corridors styled as axon fibers, the crossing-synapses as synaptic-bouton glyphs (brightening when potentiated), and the center as a dense synaptic core. The brain styling SHALL be realized through a **crafted 16×16 pixel-art tile atlas** (GBA-寶可夢 art direction) blitted at nearest-neighbor (no smoothing), NOT through procedural primitive shapes. Corridor fiber tiles SHALL be selected by **autotiling** — each corridor cell's structural tile (straight / curve / T-junction / 4-way cross / cap) is chosen from that cell's connectivity to its neighbours along the family routes, and the over/under weave at a crossing renders the over fiber unbroken and the under fiber gapped. Each family's corridor SHALL be rendered in that family's colour (so routes are traceable), tinted at render time from a single neutral fiber tile set rather than per-family atlas art. The brain styling SHALL NOT obscure the redundant family encoding (corridor colour + node colour + node-shape) and SHALL respect reduced-motion (no required animation to perceive structure).

#### Scenario: Maze is visually brain-themed

- **WHEN** the maze renders
- **THEN** corridors read as neural fibers over a neural-tissue backdrop, with synaptic-bouton crossing glyphs and a dense central core
- **AND** the family colour / node-shape encoding remains distinguishable over the brain styling

#### Scenario: Corridor tiles follow their direction

- **WHEN** a corridor turns, branches, or crosses another corridor
- **THEN** the rendered fiber tile matches the cell's connectivity (a curve at a turn, a junction where routes meet, a straight along a run)
- **AND** at a weave crossing the over fiber renders unbroken while the under fiber is gapped

#### Scenario: Each family's corridor is colour-traceable

- **WHEN** the maze renders multiple families' corridors
- **THEN** each family's corridor is drawn in that family's colour (tinted from one neutral fiber tile set), so a route can be visually traced end to end
- **AND** node colour + node-shape redundancy remains for color-blind users

### Requirement: Maze SHALL render from a committed pixel-art tile atlas with graceful fallback

The maze renderer SHALL draw cells by blitting from a single committed pixel-art atlas asset (`apps/neurons-tw/src/assets/maze/tiles/maze-atlas.png`) addressed through a tile-index map, using `imageSmoothingEnabled = false` for crisp pixel scaling. The atlas SHALL contain the seamless structural tiles (neural-tissue background, axon corridor straight / curve / T / cross / cap, over-under weave bridge, fog) and the standalone hero glyphs (variant node neuron, synaptic bouton, center soma core, border entry portal, walker). Atlas adoption SHALL NOT change the committed maze routes, economy, schema, or sync (no Dexie or R2 bundle version bump). If the atlas asset fails to load, the renderer SHALL fall back to the procedural draw so the maze never displays broken images.

#### Scenario: Cells blit from the atlas

- **WHEN** the maze renders with the atlas loaded
- **THEN** each cell is drawn by blitting the indexed tile from the atlas at nearest-neighbor scaling

#### Scenario: Missing atlas degrades gracefully

- **WHEN** the atlas asset fails to load
- **THEN** the renderer draws the maze with the procedural fallback (no broken-image placeholder, no crash)

#### Scenario: Atlas adoption is presentation-only

- **WHEN** this change ships
- **THEN** the committed `grid-graph.json` routes, the per-family economy, the Dexie schema version, and the R2 bundle `SCHEMA_VERSION` are all unchanged

### Requirement: Build-time weave pipeline SHALL emit a single committed grid graph

The maze SHALL be produced by a build-time pipeline (`scripts/build-grid-maze.mjs`, run once, output committed as a single static `assets/maze/grid-graph.json`, zero runtime recomputation): generate a base maze (`ROT.Map.EllerMaze`, fixed seed, large grid e.g. 99×99) + braid → promote a fraction of 4-way junctions to **over/under weave bridges** (the N-S corridor passes over the E-W, no join) yielding a dense structural weave (~1300 bridges) → place 11 family entry anchors on distinct border cells → route each family border→center via a **WINDING (non-shortest) waypoint path** (weave-aware, respecting the bridge no-turn constraint) so corridors meander and interweave → detect cells where two families' routes cross at a weave bridge (one H/over, one V/under) as **crossing-synapses** (~135, ≥ 110) → place each family's 10 variant-slot **nodes AT crossings on its route** (sampled in route order; pad with route cells if < 10 crossings) → write `{ gridW, gridH, center, seed, weave:[{cell,over}], families:{<familyId>:{ entryCell, path, nodeCells:[{slotIndex,cell,t,synapse}] }}, synapses:[{ cell, families:[A,B], over, under }] }`. The committed JSON intentionally OMITS the full wall map (the player only ever sees explored corridors over a fogged field — the 11 winding routes + crossings are the visible structure). The runtime SHALL consume the JSON only (no generation / routing at runtime). rot.js SHALL be used **headless at build time for maze generation** (`ROT.Map.EllerMaze` + `ROT.RNG`); `ROT.Display` SHALL NOT be used; the weave promotion, winding routing, crossing detection and over/under rendering are the app's own (no external weave dependency). rot.js is a build-time-only dependency (it is NOT in the runtime bundle).

#### Scenario: Pipeline emits one static weave grid graph

- **WHEN** the build-time pipeline runs
- **THEN** it writes a single `grid-graph.json` containing grid dimensions, center, the structural weave bridges, per-family border entry + winding path + node cells, and the crossing-synapses
- **AND** the structural weave bridge count is large (hundreds) and the crossing-synapse count is ≥ 110

#### Scenario: Every variant node sits at a route crossing

- **WHEN** the pipeline assigns each family its 10 variant-slot nodes
- **THEN** each node is placed at a cell where that family's winding route crosses another family's route (a weave bridge), except padded route cells when a route has fewer than 10 crossings

#### Scenario: Runtime does not regenerate the grid

- **WHEN** the maze loads at runtime
- **THEN** it reads the committed `grid-graph.json`
- **AND** it does not run maze generation or routing at runtime, and does not use `ROT.Display`

### Requirement: Maze camera SHALL be activity-contextual

The maze camera SHALL frame the view by the player's current activity. While the player is answering a quiz, the camera SHALL zoom in to the answered subject's family walker so the player watches that character move along its corridor as the answer resolves/settles. While the player is reading, the camera SHALL show the whole map with the ambient exploration animation across all families. Manual pan/zoom SHALL remain available; the contextual framing is the default per activity. Under reduced-motion the camera transition SHALL degrade to an instant cut (no animated zoom).

#### Scenario: Quiz answering zooms to the answered family's walker

- **WHEN** the player answers a question in subject S
- **THEN** the camera zooms in to family S's walker and the player sees it move along its corridor (the resolving settle, if any, animates there)

#### Scenario: Reading shows the whole map

- **WHEN** the player is in the reading activity
- **THEN** the camera shows the whole maze with the ambient exploration animation across families

#### Scenario: Reduced-motion uses an instant camera cut

- **WHEN** reduced-motion is enabled and the activity changes
- **THEN** the camera changes framing with an instant cut, not an animated zoom

### Requirement: Strong synapse SHALL confer a capped cross-family energy bonus

A synapse in the **strong** state (per `connectome-collection`, formed and strengthened by same-day co-firing of its two families) SHALL grant a capped cross-family energy-accrual bonus to both of its families. The bonus SHALL be additive across a family's strong synapses and clamped to `SYNAPSE_BONUS_CAP` (first-cut +X% per strong synapse, total ≤ +30%, dogfood-tunable). The maze economy SHALL READ synapse state read-only — it SHALL NOT create, strengthen, or decay synapses (that mechanic remains owned by `connectome-collection`, unchanged). The maze SHALL NOT apply any LTD/decay penalty (the bonus simply keys off the current strong state). With no strong synapse for a family the bonus SHALL be `1.0`. The bonus SHALL compose multiplicatively with the other capped accrual multipliers (streak × mastery × `energyAccel` × synapse-bonus) such that no factor and no product is unbounded.

#### Scenario: Strong synapse boosts both families' accrual under the cap

- **WHEN** families A and B share a strong synapse and the player answers an A-subject question correctly
- **THEN** A's energy accrual is multiplied by its synapse bonus (clamped to `SYNAPSE_BONUS_CAP`)
- **AND** the synapse state itself is unchanged by the maze read

#### Scenario: No strong synapse means no bonus, and no LTD penalty

- **WHEN** family A has no strong synapse (or a synapse has decayed in connectome)
- **THEN** A's synapse bonus is `1.0` (no bonus, and no maze-side decay penalty)

#### Scenario: Bonus stays capped with many strong synapses

- **WHEN** a family participates in many strong synapses
- **THEN** the summed synapse bonus does not exceed `SYNAPSE_BONUS_CAP`

### Requirement: Maze renders as a filled brain-tissue tile field with carved corridors

The maze SHALL render as a **filled** pixel-tile field: cells that are not part of a family corridor SHALL read as brain-tissue **WALL** tiles (cerebral-cortex gyri/sulci texture, with enough variation to avoid obvious repetition), and family corridors SHALL be **carved** as wide (≥ 2-cell), high-contrast path lanes — the chunky filled-maze aesthetic (C64/GBA), NOT thin threads on an empty background.

The wall field SHALL be rendered efficiently as a tiled pattern or precomputed bake (it MUST NOT blit one wall tile per grid cell every frame). Wall→corridor boundaries SHALL use consistent edge treatment derived from the corridor mask. Neuron motifs — soma **nodes**, axon/myelin **path**, **synapse** crossings, **spark** — SHALL be drawn as **render-time overlays** keyed to the maze graph, not baked into a single path tile. The canvas SHALL disable image smoothing so zoomed-in tiles stay crisp.

The default (zoomed-out) view SHALL read as a brain (filled cortical tissue with carved sulci-like paths); zooming in (existing desktop zoom/pan) SHALL reveal crisp chunky tiles. This requirement is **presentational only**: it SHALL NOT change maze topology (the committed grid graph's nodes, synapses, or weave cells), the per-family energy economy, the fog-of-war derivation, or the settle = only-pull-path mechanic. Corridor widening MAY be achieved by render-time dilation of the corridor mask without regenerating the grid graph.

#### Scenario: Filled brain-tile maze renders at default zoom

- **WHEN** the maze loads at the default zoom
- **THEN** non-corridor cells render as brain-tissue wall tiles and family corridors render as wide carved high-contrast lanes (a filled maze, not thin threads)
- **AND** the overall image reads as a brain

#### Scenario: Chunky crisp tiles on zoom-in

- **WHEN** the player zooms in with the existing desktop zoom
- **THEN** tiles render as crisp chunky pixels (no smoothing) with neuron soma / synapse / spark overlays visible on the carved paths

#### Scenario: Redesign is presentational only

- **WHEN** the filled-tile visual redesign is applied
- **THEN** maze topology (nodes / synapses / weave), the per-family energy economy, fog-of-war behavior, and the settle/pull mechanic are unchanged

### Requirement: Brain-image backdrop with neuron-symbol landmark overlays

Behind the carved-corridor tile field the maze SHALL render a **brain-image backdrop** — a muted top-down cerebral image (two hemispheres, central longitudinal fissure, white-matter fibers) — scaled to span the whole maze and drawn faintly enough that the corridors, routes, and nodes remain legible on top. The backdrop's scale and opacity SHALL be tunable, and the maze's outer (square) boundary SHALL be feathered into the panel frame so it does not read as a hard rectangle.

The maze SHALL also draw a layer of **textbook neuron-symbol landmark sprites** anchored on the committed maze graph: neuron **somata** at each family's tract origin, **synapse** boutons on the inner terminals converging toward the center, and **glia** (astrocytes, oligodendrocytes) distributed along the tracts. Landmark placement SHALL be anatomically grounded — soma at tract origins; synapse boutons at terminals, NOT at simple white-matter crossings; glia interfascicular / tiling — and landmarks SHALL be drawn UNDER the corridor routes so each axon tract flows continuously through the cell. Landmarks SHALL NOT reveal any node's identity or rarity (fog-of-war preserved); the always-visible origin somata are neutral anchors only.

This requirement is presentational only: it SHALL NOT change maze topology, the per-family energy economy, fog-of-war derivation, or the settle/pull mechanic.

#### Scenario: Brain backdrop reads at default zoom

- **WHEN** the maze loads at the default zoom
- **THEN** a muted brain image spans the maze behind the corridors, the square boundary is feathered into the dark frame, and the maze tiles + routes remain legible on top

#### Scenario: Neuron landmarks populate the tracts without breaking fog-of-war

- **WHEN** the maze renders
- **THEN** neuron-symbol sprites (soma / synapse / glia) appear at anatomically-grounded positions along the tracts, drawn under the gold routes
- **AND** no landmark reveals an unexplored node's identity or rarity

