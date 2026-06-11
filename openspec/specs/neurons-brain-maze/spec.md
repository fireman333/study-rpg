# neurons-brain-maze Specification

## Purpose

A fog-of-war exploration view over a single unified **square grid** maze covering all 11 subject families on one shared grid — no neurotransmitter regions, no brain-shaped silhouette — that is the `apps/neurons-tw` homepage (`/`; the prior `/maze-beta` route redirects here). Studying a subject and reading accrue **per-family neural energy** (11 pools, one per subject family) that is BOTH the exploration fuel AND the pull cost: as a family's accrued energy crosses each settle's front-loaded ramped cost `cost(N)`, that family's growth cone advances along its winding corridor and the settle consumes `cost(N)` energy + triggers exactly one random `pullVariant` for the reached node's family (二週目: continued settles keep pulling within the family — dupes feed fusion) — the maze node settle is the ONLY pull path (no manual pull). The grid graph is committed (built by `scripts/build-grid-maze.mjs`; zero runtime recomputation). Display obeys the open-collection paradigm: fog of war (no pre-revealed shape / rarity), pure-count chip (no denominator), no completion milestone. Lit-node state is derived from the per-family frontier (cumulative settle count), NOT from collected variants (settle pulls are random). Each family enters from a distinct border cell and routes toward the shared center along a winding corridor; the cells where two families' routes cross at a bridge are the maze's synapses, and the connectome synapse network is rendered as a read-only overlay on the grid.
## Requirements
### Requirement: Maze is the homepage route

The system SHALL render the unified square grid maze on the neurons-tw homepage at route `/` in `apps/neurons-tw`, covering all 11 subject families on one shared grid (no neurotransmitter regions). The prior beta route `/maze-beta` SHALL redirect to `/`. There SHALL be exactly **one** maze canvas instance on the homepage, and that canvas SHALL remain in the same stable DOM node across all layout-state changes — collapse / expand / desktop detail-mode / mobile dock SHALL be CSS class-toggle / grid-template changes only, never a re-parent or remount of the canvas. The maze SHALL be **embedded in the homepage's family-grid master-detail surface** (per `neurons-homepage`) rather than rendered as a standalone full-width centerpiece: on wide viewports (≥ 768px) as the **sticky detail panel** beside the family-card list when no family is selected, and as a **full-width detail panel** (the maze below a dock header, with the card grid collapsed and a single-row family chip rail below) when a family is selected; on narrow viewports (< 768px) as a single panel that **docks directly under the tapped family card** (CSS-positioned, DOM unchanged) without a page scroll-jump. The maze SHALL be **collapsed by default to a slim teaser strip**, expanding when the player taps the teaser or any family card; the expand/collapse preference SHALL persist device-locally (NOT synced), while the mobile dock anchor SHALL be ephemeral device-local-only state (NOT persisted, NOT synced). The maze SHALL NOT animate the size of its canvas container (size changes SHALL snap); the displayed-canvas backing store SHALL be capped both by the per-platform DPR cap AND by a display-area clamp so the larger detail-mode / dock stage cannot exceed the canvas-memory budget. When expanded the maze SHALL host its own exploration UI (walker, fog, synapse overlay, 🔭 全覽 recenter) and SHALL remain the canonical view of the whole connectome (the per-subject view is this same map framed to a family, not a separate maze).

#### Scenario: Grid maze renders embedded in the homepage master-detail

- **WHEN** the user navigates to `/`
- **THEN** the unified square grid maze is present as the family-grid master-detail's detail panel (one canvas instance), collapsed to a teaser by default
- **AND** no four-region brain map and no connectome tree is rendered
- **AND** expanding it (teaser tap or family-card tap) reveals the full maze with its exploration UI

#### Scenario: Legacy maze-beta route redirects home

- **WHEN** the user navigates to `/maze-beta`
- **THEN** the app redirects to `/`

#### Scenario: All 11 families present on the grid

- **WHEN** the maze loads its node set
- **THEN** the grid contains the border entry, corridor, and nodes for all 11 families
- **AND** each family's node count equals that family's variant-slot count

#### Scenario: Per-subject view is the whole map focused, not an isolated mini-maze

- **WHEN** the player selects a family card
- **THEN** the single embedded maze expands (if collapsed) and flies its camera to that family's cluster, with the rest of the connectome (neighbouring families + cross-subject synapses) still part of the same map
- **AND** a 🔭 全覽 control returns the camera to the whole-connectome view
- **AND** no second canvas or isolated single-family maze is mounted

### Requirement: Node-to-variant-slot binding

Each maze node SHALL correspond to exactly one neuron variant slot (1 node = 1 variant slot), across all 11 families. The node identity SHALL be bound to a cell on its family's corridor in the committed grid graph (a grid-topology feature), not to a hand-placed free coordinate.

#### Scenario: One node per variant slot per family

- **WHEN** the grid graph is loaded
- **THEN** for each family the count of that family's nodes equals the count of that family's variant slots
- **AND** each node maps to a distinct `{familyId, slotIndex}` pair with no cross-family collisions

### Requirement: Growth-signal exploration economy

The system SHALL maintain a per-FAMILY **neural-energy** pool (11 pools) that is BOTH the exploration fuel and the pull cost (one currency per family, no separate manual-pull balance). A correct quiz answer in subject S SHALL accrue energy into family S's own pool directly (S is the family — no neurotransmitter-branch indirection). Reading time SHALL accrue **entirely to the single subject family the player has selected for the current reading session** (the per-subject reading model — there SHALL be no even-split across families); switching the reading subject SHALL end the prior session before the new family begins accruing. Accrual SHALL be scaled by the active answer streak, by that family's mastery tier, by the capped acceleration energy multiplier `energyAccel`, and by the capped acceleration speed multiplier `speedAccel`, plus the collected-count exploration-speed buff. **A family's own accrual SHALL NOT be self-multiplied by any synapse factor** (the prior self-multiplying strong-synapse `synapseBonus` is removed). Instead, a separate ADDITIVE **synaptic conduction** step (per `connectome-collection`) MAY grant a family extra energy from its wired neighbors' batched earnings — this is additive cross-flow into the pool, not a multiplier on the family's own accrual, and an unwired family is never affected. The settle cost SHALL follow the front-loaded **capped** pacing schedule `cost(N) = round(PACING_BASE × (1 + PACING_K · min(N, RAMP_CAP_N)))` for the N-th cumulative settle within a family (0-indexed); the ramp climbs for the first `RAMP_CAP_N` settles and then **flattens** to a constant `round(PACING_BASE × (1 + PACING_K · RAMP_CAP_N))` for every later settle. First-cut constants (dogfood-telemetry-tunable): `PACING_BASE = 11`, `PACING_K = 0.10`, `RAMP_CAP_N = 20`, `CORRECT_ENERGY = 3`, `READING_ENERGY = 3`. The cumulative settle **index** N itself SHALL remain uncapped; only the per-settle `cost(N)` function is capped. A family's frontier advances inward from its border entry while `earned − Σcost(settled) ≥ cost(nextNode)`. The system MUST NOT introduce any monetary, IAP, ad-reward, or non-gameplay path to advance exploration or settle nodes.

#### Scenario: Correct answer accrues energy scaled by the non-synapse multipliers

- **WHEN** the player answers correctly in subject S
- **THEN** earned energy is added to family S's pool, scaled by streak, S's mastery, capped `energyAccel`, capped `speedAccel`, and the collected-count buff
- **AND** no synapse self-multiplier SHALL be applied to S's own accrual (conduction, if any, is a separate additive step to neighbors per `connectome-collection`)

#### Scenario: A family's own accrual is unchanged by its synapses

- **GIVEN** family A participates in several `strong` synapses
- **WHEN** the player answers correctly in A
- **THEN** A's OWN energy accrual SHALL be identical to the case where A has zero synapses (the self-multiplying `synapseBonus` is removed)
- **AND** A's wired neighbors MAY separately receive additive conduction from A's batched earnings (per `connectome-collection`), which does not alter A's own pool

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

The maze SHALL be a continuous pull-cadence gate, NOT a one-pull-per-node finite budget. Each settle SHALL be indexed by the family's cumulative settle count `N` (0-indexed, NOT capped at the family's node count). On each settle the system SHALL consume `cost(N)` from the family's pool, then trigger exactly one `pullVariant` (per `neuron-variant-gacha`), emitting the same reveal / provenance / achievement / leaderboard side-effects as any pull. The pull MAY yield a new variant or a dupe (dupes feed `add-neurons-dupe-fusion`). The pull's behavior SHALL depend on lap: while the family still has fogged **first-route** nodes, the settle lights the next first-route node and rolls a **random within-tier** variant (P0 soft-pity); once all of the family's first-route nodes are lit, the family enters **二回目** (per `neurons-maze-second-lap`) and each subsequent settle lights the next **second-route** node in route order and **deterministically** unlocks that position's location variant (no rarity roll). Node "lighting" SHALL cap at the family's TOTAL node count (first route + second route) as a visual indicator; once even the second route is fully lit, pulls MAY continue via dupe handling without lighting further nodes. A settle SHALL play a reveal chime. The maze node settle SHALL be the ONLY mechanism producing variants — there SHALL be no always-available manual pull.

#### Scenario: Each settle consumes its ramped cost and triggers one pull

- **WHEN** family F's accumulated energy reaches the next settle threshold at cumulative settle index N
- **THEN** `cost(N)` energy is consumed from F's pool
- **AND** exactly one `pullVariant` for F is triggered (first route: random rarity + P0 pity; 二回目: the deterministic position-bound location variant)
- **AND** a reveal chime plays

#### Scenario: Second lap lights new nodes and unlocks position variants

- **WHEN** all of family F's first-route nodes are lit and the player accrues another `cost(N)` of energy
- **THEN** a settle lights F's next second-route node in route order
- **AND** it deterministically unlocks that position's location variant (per `neurons-maze-second-lap`), not a least-collected re-roll
- **AND** the 🧠 lit-node count rises until it reaches F's combined (first + second route) total

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

The system SHALL render the synapse network as an overlay on the maze grid: each formed synapse (a co-firing **/ co-repair** family pair, per `connectome-collection`) SHALL be drawn at/through its synapse-intersection cell(s), with visual weight reflecting synapse state (dormant / weak / strong). The overlay SHALL be read-only with respect to synapse STATE — it SHALL NOT create, strengthen, or decay synapses (that mechanic is owned by `connectome-collection`). The overlay SHALL update as synapse state changes and SHALL be toggleable consistent with the maze's display model, and SHALL default to visible as the homepage's prominent connectome layer. The overlay SHALL ALSO surface synaptic conduction: when a `connectome.conductionPulse` event fires (per `connectome-collection`), the overlay SHALL animate a pulse traveling the corresponding wire from source family to target family. The overlay remains read-only with respect to synapse STATE and the conduction mechanic (it renders; it does not create/strengthen/decay synapses nor compute conduction energy — those are owned by `connectome-collection`).

#### Scenario: Formed synapse renders at its intersection

- **WHEN** a synapse exists between families A and B
- **THEN** an edge/marker is drawn at the A–B synapse-intersection cell on the grid
- **AND** its visual weight reflects the synapse's current state

#### Scenario: Overlay is render-only and default-visible

- **WHEN** a synapse strengthens or decays
- **THEN** the overlay updates its visual weight
- **AND** the synapse data/state itself is unchanged by the overlay
- **AND** the overlay defaults to visible (prominent connectome layer) and remains toggleable

#### Scenario: Conduction pulse animates along the wire

- **WHEN** a `connectome.conductionPulse { fromFamily, toFamily, amount }` event fires
- **THEN** the overlay SHALL animate a pulse traveling that wire from `fromFamily` toward `toFamily`
- **AND** the overlay SHALL NOT itself grant or modify any energy (it renders the already-granted conduction)

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

The maze SHALL be styled to read as brain tissue, not a bare grid: a soft neural-tissue backdrop (cortical-fold / myelin texture on the dark signal palette), the weave corridors styled as axon fibers, the crossing-synapses as synaptic-bouton glyphs (brightening when potentiated), and the center as a dense synaptic core. The brain styling SHALL be realized through a **crafted 16×16 pixel-art tile atlas** (GBA-寶可夢 art direction) blitted at nearest-neighbor (no smoothing), NOT through procedural primitive shapes. Corridor fiber tiles SHALL be selected by **autotiling** — each corridor cell's structural tile (straight / curve / T-junction / 4-way cross / cap) is chosen from that cell's connectivity to its neighbours along the family routes, and the over/under weave at a crossing renders the over fiber unbroken and the under fiber gapped. Corridor colour SHALL be tinted at render time from a single neutral fiber tile set rather than per-family atlas art: a family's **exclusive** corridor segments SHALL be rendered in that family's colour, while a **shared** corridor cell SHALL render concentric thin bands of the up-to-3 most-progressed families that have walked it (per the route-colour requirement), with the gold myelin demoted to a base sheath rather than the dominant band — so a family's exclusive route is colour-traceable and the densely-shared lattice (84% of corridor cells are shared, 62% by ≥4 families) stays legible without an unrenderable per-family band stack. The brain styling SHALL NOT obscure the redundant family encoding (corridor colour + node colour + node-shape) and SHALL respect reduced-motion (no required animation to perceive structure).

#### Scenario: Maze is visually brain-themed

- **WHEN** the maze renders
- **THEN** corridors read as neural fibers over a neural-tissue backdrop, with synaptic-bouton crossing glyphs and a dense central core
- **AND** the family colour / node-shape encoding remains distinguishable over the brain styling

#### Scenario: Corridor tiles follow their direction

- **WHEN** a corridor turns, branches, or crosses another corridor
- **THEN** the rendered fiber tile matches the cell's connectivity (a curve at a turn, a junction where routes meet, a straight along a run)
- **AND** at a weave crossing the over fiber renders unbroken while the under fiber is gapped

#### Scenario: Corridor colour is traceable on exclusive segments and legible on shared ones

- **WHEN** the maze renders multiple families' corridors
- **THEN** a family's exclusive corridor segments are drawn in that family's colour (tinted from one neutral fiber tile set), so those segments trace that family
- **AND** a shared corridor cell shows concentric thin bands of its up-to-3 most-progressed families, with the gold myelin demoted to a base sheath rather than dominating
- **AND** node colour + node-shape redundancy (and the distinct carved route) remains so families stay distinguishable on shared segments and for color-blind users

### Requirement: Maze SHALL render from a committed pixel-art tile atlas with graceful fallback

The maze renderer SHALL draw cells by blitting from a single committed pixel-art atlas asset (`apps/neurons-tw/src/assets/maze/tiles/maze-atlas.png`) addressed through a tile-index map, using `imageSmoothingEnabled = false` for crisp pixel scaling. The atlas SHALL contain the seamless structural tiles (neural-tissue background, axon corridor straight / curve / T / cross / cap, over-under weave bridge, fog) and the standalone hero glyphs (variant node neuron, synaptic bouton, center soma core, border entry portal, walker). Atlas adoption SHALL NOT change the committed maze routes, economy, schema, or sync (no Dexie or R2 bundle version bump). If the atlas asset fails to load, the renderer SHALL fall back to the procedural draw so the maze never displays broken images. To bound per-frame fill cost on high-cost canvas platforms, the renderer MAY cap the device-pixel-ratio backing-store resolution lower on Safari / iOS (e.g. 1.5×) than on other engines (2×), provided `imageSmoothingEnabled` stays off so the pixel-art tiles remain crisp; this platform-adaptive cap SHALL NOT change routes, economy, schema, or sync.

#### Scenario: Cells blit from the atlas

- **WHEN** the maze renders with the atlas loaded
- **THEN** each cell is drawn by blitting the indexed tile from the atlas at nearest-neighbor scaling

#### Scenario: Missing atlas degrades gracefully

- **WHEN** the atlas asset fails to load
- **THEN** the renderer draws the maze with the procedural fallback (no broken-image placeholder, no crash)

#### Scenario: Atlas adoption is presentation-only

- **WHEN** this change ships
- **THEN** the committed `grid-graph.json` routes, the per-family economy, the Dexie schema version, and the R2 bundle `SCHEMA_VERSION` are all unchanged

#### Scenario: DPR backing-store is capped lower on Safari / iOS

- **WHEN** the maze renders on a Safari / iOS engine
- **THEN** the device-pixel-ratio backing store MAY be capped lower (e.g. 1.5×) than on other engines (2×) to reduce per-frame fill cost
- **AND** `imageSmoothingEnabled` stays off so the tiles remain crisp
- **AND** routes, economy, schema, and sync are unchanged

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

The maze camera SHALL frame the view by the player's current activity, and SHALL accept manual control on both desktop and touch devices. While the player is answering a quiz, the camera SHALL zoom in to the answered subject's family walker so the player watches that character move along its corridor as the answer resolves/settles. While the player is reading a **chosen subject**, the camera SHALL focus that subject's family cluster (not the whole map). Manual control SHALL remain available on desktop (wheel-zoom + drag-pan) and on touch devices (**two-finger pinch-zoom + one-finger pan + double-tap to recenter**); the contextual framing is the default per activity and yields to manual control. Tapping a subject in the family picker SHALL fly the camera to that family's cluster as a **sticky manual focus** that holds until the next user interaction (pan / zoom / another family / recenter); a **recenter control** SHALL return to the default whole-map framing. The answer-driven auto-focus SHALL remain time-boxed but SHALL NOT interrupt an active sticky manual focus. Zoom SHALL be continuous and clamped (between whole-map fit and single-cluster framing) and SHALL NOT be persisted across sessions (returning to the homepage resets to the default framing). Manual touch/drag/zoom SHALL be scoped so it does not hijack page scroll. Under reduced-motion the camera transition SHALL degrade to an instant cut (no animated zoom).

#### Scenario: Quiz answering zooms to the answered family's walker

- **WHEN** the player answers a question in subject S
- **THEN** the camera zooms in to family S's walker and the player sees it move along its corridor (the resolving settle, if any, animates there)

#### Scenario: Reading focuses the chosen subject's family

- **WHEN** the player is in a reading session for a chosen subject S
- **THEN** the camera focuses family S's cluster (not the whole map)

#### Scenario: Mobile touch zoom and pan

- **WHEN** the player uses two fingers to pinch or one finger to drag on the maze on a touch device
- **THEN** the maze zooms (pinch) or pans (drag) accordingly
- **AND** the gesture does not hijack page vertical scroll
- **AND** a double-tap recenters to the default whole-map framing

#### Scenario: Manual family focus is sticky until the next interaction

- **WHEN** the player taps a subject in the family picker
- **THEN** the camera flies to that family's cluster and stays there
- **AND** it does not auto-expire back to the whole map after a delay
- **AND** an answer-driven auto-focus does not interrupt the active sticky manual focus

#### Scenario: Recenter returns to the whole-map framing

- **WHEN** the player activates the recenter control while focused on a family
- **THEN** the camera returns to the default whole-map framing and clears the sticky manual focus

#### Scenario: Reduced-motion uses an instant camera cut

- **WHEN** reduced-motion is enabled and the activity or focus changes
- **THEN** the camera changes framing with an instant cut, not an animated zoom

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

### Requirement: Quiz-time maze-energy feedback strip with settle-threshold escalation

After a correct answer, the QuizModal SHALL surface a lightweight, **non-interactive** maze-energy feedback strip above the explanation (詳解) showing the answered subject's family and the energy gained toward that family's next maze node. The strip SHALL be presentational only — it SHALL NOT accept pinch/pan/wheel input (`pointer-events: none`) and SHALL NOT itself perform the settle/pull (the homepage maze performs settles). When the correct answer's accrual **crosses the threshold to settle the next node** for that family (the family's affordable-settle count increases), the strip SHALL escalate to a brief mini-maze animation that replays the walker advancing one node. The escalation animation SHALL bound its cost: its animation loop SHALL run only for the duration of the ~2-second advance then stop, SHALL render only the focused family's sub-view, and SHALL NOT run during the modal's enter/exit transition. The strip SHALL be responsive (compact on mobile so it does not push the explanation below the fold) and SHALL degrade under reduced-motion to a static end-state cue. The strip SHALL NOT appear while the player is still reading the question stem (only after the answer is submitted). On modal close the homepage maze SHALL still perform its existing activity-contextual auto-zoom to the answered family.

#### Scenario: Correct answer shows the energy feedback strip

- **WHEN** the player answers a question correctly in subject S
- **THEN** a non-interactive feedback strip appears above the 詳解 showing family S and the energy gained toward S's next node
- **AND** the strip does not accept pinch/pan/wheel input
- **AND** the strip is not shown before the answer is submitted

#### Scenario: Crossing a settle threshold escalates to a one-node advance animation

- **WHEN** a correct answer's accrual raises family S's affordable-settle count (a node settle is now due)
- **THEN** the strip escalates to a brief mini-maze animation replaying the walker advancing one node
- **AND** the animation loop runs only for that ~2-second advance and then stops

#### Scenario: Feedback strip is responsive and reduced-motion safe

- **WHEN** the QuizModal is viewed on a narrow phone, or with reduced-motion enabled
- **THEN** the strip stays compact (it does not push the explanation below the fold) and, under reduced-motion, shows a static end-state cue instead of the animation

#### Scenario: Strip does not perform the settle

- **WHEN** the feedback strip or its escalation animation plays
- **THEN** the actual energy consumption, pull, and walker advance are performed by the homepage maze reconcile, not by the strip
- **AND** the strip remains a display-only replay

### Requirement: Selecting a family SHALL spotlight its tract, with reverse walker-select

When a family is selected (its card tapped, per `neurons-homepage`), the single embedded maze SHALL **emphasise** that family's tract — dimming the other families' corridors + lit nodes while keeping cross-subject synapse sparks and landmarks at full strength (the「fire together, wire together」cross-subject metaphor is NOT weakened) — and SHALL surface a clear-emphasis affordance (🔭 全覽, and a 🎯 chip where the topbar is shown). Conversely, **tapping a family's walker sprite on the maze** (a clean tap, not a pan/drag) SHALL select that family, focus the camera on it (a sticky focus emitted through the focus bus, so that any layout resize from entering detail mode does not reframe the camera to the whole map), and scroll its card into view. Clearing the emphasis (全覽 / 🎯✕) SHALL flow through the recenter bus so the card selection and the maze emphasis clear together (one selection state); on narrow viewports the recenter SHALL clear the spotlight while leaving the maze panel docked.

#### Scenario: Card tap spotlights the family tract
- **WHEN** the player selects a family card
- **THEN** the maze dims the other families' tracts + lit nodes and the selected family's tract is emphasised
- **AND** cross-subject synapse sparks + landmarks remain at full strength
- **AND** a clear-emphasis control (🔭 全覽 / 🎯) is available

#### Scenario: Tapping a walker selects its card
- **WHEN** the player taps a family's walker sprite on the maze (a clean tap, not a pan/drag)
- **THEN** that family becomes selected, the camera focuses on it (sticky), and its card scrolls into view
- **AND** when this enters detail mode and resizes the stage, the camera stays on the tapped family (it is not reframed to the whole map)

### Requirement: Crossing a settle threshold SHALL play a one-shot neuron-travel reward animation

When a family's accumulated maze energy (from correct answers + per-subject reading) crosses a settle threshold that advances its growth cone — observed from the **existing** economy/settle signal; this requirement adds NO new counter and changes NO economy value or persistence — the maze SHALL play a one-shot animation of that family's walker travelling forward along its axon path (eased motion along the corridor polyline, a family-colour trail, and an arrival flourish). The animation SHALL be a **transient self-cancelling** effect (no steady-state render loop), SHALL be **deferred until any variant-reveal modal queue is idle** so it plays unobstructed, and SHALL degrade under `prefers-reduced-motion` to an instant snap (no travel). An advance that arrives via background state hydration / cloud rehydration (already-reconciled, no live settle tick) SHALL NOT trigger it.

#### Scenario: A live settle plays the travel animation
- **WHEN** a family's energy crosses a settle threshold during play (a live advance)
- **THEN** its walker animates travelling forward along its path with a trail + arrival flourish
- **AND** the effect is one-shot (no persistent loop) and a single maze canvas is used
- **AND** if a variant-reveal modal is open, the travel is deferred until the reveal queue is idle

#### Scenario: Reduced-motion and hydration do not animate
- **WHEN** reduced-motion is active, OR the advance came from state hydration / cloud rehydration rather than a live settle
- **THEN** the walker snaps to its new position with no travel animation

### Requirement: Maze SHALL render as a static panorama with event-driven overlays (no per-frame repaint)

The maze SHALL render its base scene (brain-tissue tiles, corridors, gold myelin sheaths, progress-ranked colour bands, neuron-symbol landmarks, and node pins) into **offscreen maze-resolution bitmaps baked on demand** — once on mount and again only on discrete changes (exploration progress, settle progress, synapse change, theme switch) — NOT repainted every animation frame. The only maze canvas in the DOM SHALL be a single **viewport-sized display canvas**; the camera (`{cx, cy, z}` — maze-space centre + zoom) SHALL be realized by **blitting the camera's slice of the offscreen scene into the display canvas via `drawImage` on discrete events** (input events, re-bakes, resizes, one-shot animation frames) — NOT as a CSS transform of a full-resolution stage (a full-resolution composited canvas layer is rasterized at devicePixelRatio and OOM-kills the iOS Safari content process) and NOT as a steady-state repaint loop. The renderer SHALL NOT run a continuous steady-state `requestAnimationFrame` loop; transient rAFs MAY drive one-shot animations (the input-coalescing redraw, a walker settle-travel, a focus fly) and each SHALL self-stop on completion and be cancelled on unmount. The camera SHALL be **pan-bounded**: the visible rect SHALL never stray beyond the maze plus a fixed margin of cells (and SHALL lock to centre when the visible rect is wider than maze + margin). Pan and zoom SHALL update only on user input — wheel-zoom + drag-pan on desktop, pinch-zoom on touch — with input bursts coalesced to at most one blit per displayed frame, and SHALL preserve page-scroll containment (the maze SHALL NOT trap page scroll). All dynamic elements SHALL be **event-driven overlays over that single canvas** updating only when their state changes, never at a fixed frame rate: the exploration **walker** (a DOM overlay positioned from the camera; glides on a settle, idle-breathes via compositor-only CSS keyframes on unlocked representatives), **fog/node reveal** (a one-shot reveal ring when a node lights), the **synapse overlay** (sparks baked into the scene, re-baked when wires change, with one-shot pulse rings on wiring and on a conduction pulse), **focus-on-family** (a one-shot self-stopping rAF camera fly to that family's cluster — which also serves as the per-subject focused view), and the **ambient firing** animation (a small bounded set of compositor-driven CSS-keyframe glow dots at live synapse cells, hidden with the synapse overlay toggle and under reduced-motion). The same static renderer SHALL serve both desktop and mobile (a single renderer). This change SHALL preserve all existing maze behaviour — routes, fog-of-war exploration, settle/pull economy, synapse formation/strengthening, focus-on-family, atlas rendering + graceful fallback — and SHALL NOT change `grid-graph.json` routes, the per-family economy, the Dexie schema, or the R2 bundle `SCHEMA_VERSION`. (The route **colour** model is upgraded per the route-colour requirement below — not preserved — but adds no new state.)

#### Scenario: No continuous per-frame repaint at rest
- **WHEN** the maze is displayed and the player is not interacting and no exploration/wiring event is in flight
- **THEN** the renderer SHALL NOT be repainting the canvas every frame (no steady-state `requestAnimationFrame` loop)
- **AND** the base scene remains displayed statically

#### Scenario: Pan/zoom is an event-driven camera blit within pan bounds
- **WHEN** the player pinch-zooms (touch) or wheel-zooms + drags (desktop)
- **THEN** the camera `{cx, cy, z}` is mutated on the input event and the viewport-sized display canvas re-blits the offscreen scene (bursts coalesced to at most one blit per frame — no per-frame repaint loop, no full-resolution composited layer)
- **AND** the camera stays within the maze + margin pan bounds
- **AND** the page still scrolls normally past the maze (the maze does not trap page scroll)

#### Scenario: Dynamic elements update only on their events
- **WHEN** the player advances exploration (a settle), forms/strengthens a synapse, or taps a family card to focus
- **THEN** the corresponding overlay updates as a one-shot (walker glides/travels a segment / node reveals / synapse sparks re-bake + pulse / the camera flies to the cluster via a one-shot self-stopping rAF tween)
- **AND** none of these introduces a continuous steady-state animation loop

#### Scenario: Focus fly is one-shot and yields to the user
- **WHEN** a family-card tap, a correct-answer auto-focus, or a 🔭 recenter moves the camera
- **THEN** a transient rAF tween flies the camera to the target and stops when it arrives (cancelled on unmount)
- **AND** under reduced-motion, on a trivial delta, or when the focus coincides with a stage-layout resize (entering/exiting the detail layout) the camera snaps instantly instead
- **AND** a manual wheel / drag / pinch during the fly cancels it immediately (the player reclaims the camera)

#### Scenario: Behaviour and data are unchanged
- **WHEN** this render re-architecture ships
- **THEN** the committed `grid-graph.json` routes, the per-family economy, the Dexie schema version, and the R2 bundle `SCHEMA_VERSION` are all unchanged
- **AND** fog-of-war, settle/pull, synapse formation, focus-on-family, and atlas fallback all behave as before (the route colour model is upgraded per the route-colour requirement below)

### Requirement: Maze route colour SHALL encode each corridor cell's up-to-3 most-progressed families

The maze route layer SHALL colour each **walked** corridor cell with the colours of the **up to three most-progressed families** that pass through that cell, rendered as concentric thin bands over a neutral base myelin sheath (the gold myelin SHALL be demoted to that base/frame, no longer the dominant or default band). "Walked" means a family's exploration frontier has reached/passed the cell (reusing the existing fog/explored-prefix logic); a cell no family has walked yet SHALL remain the faint fog baseline. A cell walked by one or two families SHALL show one or two bands; a cell walked by three or more SHALL show exactly the three most-progressed (the per-cell cap is three, so a densely-shared trunk cell — up to all 11 families — SHALL NOT attempt to stack more than three bands). "Most-progressed" SHALL be ranked by each family's already-synced settle-progress counter (`maze:<familyId>:settles`, a member of `SYNCED_META_KEYS`), so the colour ordering is **consistent across devices** and the colour model SHALL add **no new meta key, no `SYNCED_META_KEYS` entry, no Dexie store, and no R2 `SCHEMA_VERSION` change**; ties (e.g. before any settle) SHALL fall back to a deterministic family order. The colour computation SHALL run inside the on-demand static base bake and be re-baked only on discrete change (a settle that changes a family's progress or the explored frontier), never per animation frame. The redundant non-colour family encoding (the distinct carved route + node/marker shape) SHALL remain intact so families stay distinguishable on shared segments and for color-blind users.

#### Scenario: Exclusive corridor cell shows its family's colour
- **WHEN** a corridor cell is on exactly one family's route and that family has walked it
- **THEN** the cell is rendered in that family's colour over the neutral base sheath

#### Scenario: Densely-shared cell shows its three most-progressed families, capped
- **WHEN** a corridor cell is shared by four or more families that have walked it
- **THEN** the cell renders exactly three concentric bands — the three most-progressed families (ranked by settle progress) — and does not attempt to render a band per family

#### Scenario: Colour ordering is consistent cross-device with zero new state
- **WHEN** the route colour bake ranks families for a shared cell
- **THEN** it ranks by the already-synced `maze:<familyId>:settles` counter, adding no new meta key and no `SYNCED_META_KEYS` / R2 `SCHEMA_VERSION` / Dexie change
- **AND** the same account on another device computes the same ordering (the rank key is MAX-merged cross-device)

