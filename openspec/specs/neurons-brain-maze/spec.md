# neurons-brain-maze Specification

## Purpose

A fog-of-war exploration view over a four-region brain map that is the `apps/neurons-tw` homepage (`/`; the prior `/maze-beta` route redirects here). Studying a subject and reading accrue per-NT-branch **neural energy** that is BOTH the exploration fuel AND the pull cost: as a branch's accrued energy crosses each settle's front-loaded ramped cost `cost(N)`, the growth cone advances along its white-matter tracts and the settle consumes `cost(N)` energy + triggers exactly one random `pullVariant` for the reached node's family (二週目: the branch's least-collected family) — the maze node settle is the ONLY pull path (no manual pull). The base-map fiber graph is produced by a build-time pipeline (image → HSV mask → Zhang-Suen skeleton → hub-rooted Dijkstra walk paths → RDP → committed graph JSON; zero runtime recomputation). Display obeys the open-collection paradigm: fog of war (no pre-revealed shape / rarity), pure-count chip 「🧠 已連線 X 個腦區」 (no denominator), no completion milestone. Lit-node state is derived from the per-branch frontier (cumulative settle count), NOT from collected variants (settle pulls are random). The connectome synapse network is rendered as a read-only overlay on the brain map. Designed per-branch (DA / 5HT / GABA / Glu).
## Requirements
### Requirement: Maze is the homepage route

The system SHALL render the brain-maze exploration view as the neurons-tw homepage at route `/` in `apps/neurons-tw`, covering all four neurotransmitter regions (DA = 藥理學 + 公共衛生學; 5HT = 寄生蟲學 + 組織學; GABA = 生物化學 + 病理學 + 免疫學; Glu = 解剖學 + 生理學 + 胚胎學 + 微生物學), derived from `FAMILY_NT_BRANCH` and the variant catalog. The prior beta route `/maze-beta` SHALL redirect to `/`. The maze SHALL host the homepage's existing companion surfaces (CTA toolbar, family grid, DMN progress ring, onboarding) per the `neurons-homepage` capability.

#### Scenario: Maze renders as the homepage

- **WHEN** the user navigates to `/`
- **THEN** the four-region brain map renders as the homepage centerpiece with its exploration UI
- **AND** the connectome tree is no longer the homepage centerpiece

#### Scenario: Legacy maze-beta route redirects home

- **WHEN** the user navigates to `/maze-beta`
- **THEN** the app redirects to `/`

#### Scenario: All four NT regions present

- **WHEN** the maze loads its node set
- **THEN** it contains the nodes for all four NT branches, each derived from `FAMILY_NT_BRANCH` and the variant catalog
- **AND** each branch's node count equals that branch's variant-slot count

### Requirement: Node-to-variant-slot binding

Each maze node SHALL correspond to exactly one neuron variant slot (1 node = 1 variant slot), across all four NT branches. The node identity SHALL be bound to a skeleton topology feature (endpoint or branch point) of its branch's base-map graph, not to a hand-placed coordinate.

#### Scenario: One node per variant slot per branch

- **WHEN** the maze graph set is loaded
- **THEN** for each NT branch the count of that branch's nodes equals the count of that branch's variant slots (DA 20 / 5HT 20 / GABA 30 / Glu 40)
- **AND** each node maps to a distinct `{familyId, slotIndex}` pair with no cross-branch collisions

### Requirement: Growth-signal exploration economy

The system SHALL maintain a per-NT-branch **neural-energy** pool that is BOTH the exploration fuel and the pull cost (one currency, no separate manual-pull balance). A correct quiz answer SHALL accrue energy into the pool of the branch that the answered subject belongs to, resolved via `FAMILY_NT_BRANCH`; reading time SHALL accrue across all four branch pools (even split). Accrual SHALL be scaled by the active answer streak, by that branch's mastery tier, and by the **acceleration energy multiplier** `energyAccel` (the additive, hard-capped pool from `neurons-acceleration-system` — composing active consumables such as the reframed `family-buff`/`bolus` and owned energy-lane permanents). A branch's frontier position SHALL be determined by its accumulated earned energy against the cumulative pacing cost of the nodes already settled — i.e. the frontier advances while `earned − Σcost(settled) ≥ cost(nextNode)`. The system MUST NOT introduce any monetary, IAP, ad-reward, or non-gameplay path to advance exploration or settle nodes.

#### Scenario: A correct answer accrues to the subject's branch pool

- **WHEN** the user answers a question correctly in subject S
- **THEN** earned energy is added to the per-branch pool of `FAMILY_NT_BRANCH[S]` (scaled by streak, mastery, and the capped `energyAccel`)
- **AND** no other branch's pool is changed by that event
- **AND** when that branch's region is visible the growth cone advances toward its next fogged node

#### Scenario: Reading time feeds branch pools

- **WHEN** the user accrues reading time
- **THEN** earned energy is added across the four branch pools (even split) at the reading rate

#### Scenario: Acceleration energy multiplier composes under its cap

- **WHEN** active energy-lane consumables and owned permanents raise `energyAccel` toward its cap
- **THEN** the per-event accrual is multiplied by the clamped `energyAccel` (never exceeding `ENERGY_ACCEL_CAP`)
- **AND** with no active consumable and no owned permanent `energyAccel` SHALL be `1.0` (no change to prior behavior)

#### Scenario: No monetary path

- **WHEN** any exploration advance or node settle is triggered
- **THEN** the trigger is a gameplay action (correct answer / reading time) only
- **AND** no real-money, IAP, or ad-reward path exists to advance or settle

### Requirement: Exploration teams from collected variants

Collected variants SHALL act as exploration units ("Pikmin"), partitioned by NT branch; each branch's team explores its own region. Per branch, base exploration speed SHALL be a fixed positive value so that a player with an empty team for that branch can still make progress. A larger or rarer set of collected variants in a branch SHALL increase that branch's team exploration speed (a buff that never hard-blocks progress). The effective exploration speed SHALL additionally be scaled by the **acceleration speed multiplier** `speedAccel` (the additive, hard-capped pool from `neurons-acceleration-system` — composing active speed-lane consumables such as `surge` and owned speed-lane permanents), clamped to `SPEED_ACCEL_CAP`.

#### Scenario: Empty branch team still progresses

- **WHEN** a player with zero collected variants in branch B accrues growth signal in B
- **THEN** exploration in B still advances at the fixed base speed (never zero / blocked)

#### Scenario: Collected variants buff the owning branch's speed

- **WHEN** a player has collected more (or rarer) variants in branch B
- **THEN** branch B's team exploration speed is higher than its base speed
- **AND** the speed increases monotonically with B's collection strength
- **AND** collecting variants in branch B does not change another branch's team speed

#### Scenario: Acceleration speed multiplier composes under its cap

- **WHEN** active `surge` consumables and/or owned speed-lane permanents raise `speedAccel`
- **THEN** the branch's effective exploration speed SHALL be multiplied by the clamped `speedAccel` (never exceeding `SPEED_ACCEL_CAP`)
- **AND** with no speed boost active `speedAccel` SHALL be `1.0`

### Requirement: Node settle is a continuous pull-cadence gate (not a finite per-node budget)

The maze SHALL be a continuous pull-cadence gate, NOT a one-pull-per-node finite budget. Each settle SHALL be indexed by the branch's cumulative settle count `N` (0-indexed, NOT capped at the branch's node count). On each settle the system SHALL consume that settle's pacing cost `cost(N)` from the branch's energy pool, then trigger exactly one `pullVariant` (per `neuron-variant-gacha`), emitting the same reveal / provenance / achievement / leaderboard side-effects as any pull, including random rarity roll and P0 soft-pity. The pull MAY yield a new variant or a dupe (dupes feed `add-neurons-dupe-fusion`). The pull's target family SHALL be: while the branch still has fogged nodes, the family of the node being lit (`MazeNode.familyId`); once all of the branch's nodes are lit (second-lap / 二週目), the branch's least-collected family (weighted toward unowned slots so the random long tail converges toward completion). Node "lighting" SHALL cap at the branch's node count as a visual exploration-progress indicator, but pulls SHALL continue past it. A settle SHALL play a reveal chime. The maze node settle SHALL be the ONLY mechanism producing variants — there SHALL be no always-available manual pull.

#### Scenario: Each settle consumes its ramped cost and triggers one pull

- **WHEN** the branch's accumulated energy reaches the next settle threshold at cumulative settle index N in branch B
- **THEN** `cost(N)` energy is consumed from branch B's pool
- **AND** exactly one `pullVariant` is triggered (random rarity + P0 pity)
- **AND** a reveal chime plays

#### Scenario: Pre-completion pull targets the lit node's family

- **WHEN** a settle resolves while branch B still has fogged nodes and the node being lit has `familyId` F
- **THEN** the pull's target family is F
- **AND** the result is a variant within F determined by the gacha roll (new variant or dupe)

#### Scenario: Pulls continue past all-nodes-lit (二週目)

- **WHEN** all of branch B's nodes are already lit and the player accrues another `cost(N)` of energy
- **THEN** a pull still triggers (the maze does not dead-end), targeting B's least-collected family
- **AND** the 🧠 lit-node count remains capped at B's node count (visual), while pull/settle count continues to grow

#### Scenario: No manual pull path coexists

- **WHEN** the player wants to collect a variant
- **THEN** the only path is the maze settle cadence (there is no always-available manual pull button)

### Requirement: Fog-of-war display

Unexplored nodes SHALL be rendered as fog: no silhouette, no pre-revealed shape, no pre-revealed rarity. The NT region outline SHALL be visible (the player knows a DA region exists), but the individual nodes within the region SHALL remain fogged until explored. Fog SHALL clear progressively as nodes are lit.

#### Scenario: Unexplored node shows no pre-revealed information

- **WHEN** a node has not yet been explored
- **THEN** it renders as fog with no silhouette, shape, or rarity hint
- **AND** the surrounding DA region outline is still visible

#### Scenario: Fog clears on lighting

- **WHEN** a node is lit (explored or migrated)
- **THEN** the fog around that node clears and the node renders as a lit connected-region marker (a two-layer dot — branch-colour fill, white edge), with its grown-axon path drawn
- **AND** the variant joins the collection (revealed via the settle modal on exploration; visible in the collection view)

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

Lit-node state SHALL be derived from the per-branch frontier progress (cumulative settle count) UNIONed with the first-pull starter-lit node(s), NOT from collected variants in general — because under random settle pulls the variant collected at a settle is not necessarily the lit node's own slot. The frontier-lit nodes of a branch SHALL be the first `min(settles, nodeCount)` nodes in hub-distance (`pathLen`) order. The starter-lit node of a branch SHALL be the representative node (hub-nearest, deterministic tie-break) of the family chosen by the one-time first-pull for that branch, persisted in `meta['maze:<branch>:starterFamily']`; it lights even when `settles = 0`. The branch's lit set SHALL be the set union of its frontier-lit nodes and its starter-lit node, deduplicated by node identity (a node reached by both first-pull and the frontier is lit exactly once). Collection progress is tracked separately (the 🧬 count + the collection dex). The system SHALL NOT run a backfill, duplicate-store frontier lit state, or show a migration banner. Existing players' per-branch `settles` (preserved from the pre-change maze) keep their frontier; their existing collected variants remain in the collection unchanged. A player who collected variants via the (removed) manual pull but never explored the maze simply starts the frontier at their stored `settles` (no regression — exploring yields additional random pulls).

#### Scenario: Lit nodes derive from frontier unioned with starter-lit, not general collection

- **WHEN** a branch has `settles = K` and a first-pull starter family is recorded
- **THEN** the lit set is the union of the first `min(K, nodeCount)` nodes in `pathLen` order and the starter family's representative node
- **AND** the lit set does NOT otherwise depend on which specific variants were collected

#### Scenario: Starter node lit at zero settles

- **WHEN** a branch has `settles = 0` and `meta['maze:<branch>:starterFamily']` is set to family F
- **THEN** F's representative node is lit
- **AND** no frontier nodes are lit (since `settles = 0`)

#### Scenario: Frontier reaching the starter node does not double-light

- **WHEN** the frontier later advances to include the node already lit by first-pull
- **THEN** that node is lit exactly once (set union dedup), with no visual conflict

#### Scenario: No backfill or migration banner

- **WHEN** an existing player first opens the maze homepage
- **THEN** their stored per-branch `settles` and their collected variants are both preserved
- **AND** no backfill write or migration banner occurs

### Requirement: Build-time image-to-graph pipeline

The base-map fiber graph SHALL be produced by a build-time pipeline (run once, output committed as a static JSON asset, zero runtime recomputation): load a flat-saturated single-color (per-branch) base image → per-pixel HSV-threshold color mask → optional morphological close (repair 1–3px gaps; off by default for clean source images) → Zhang-Suen skeletonize → convert skeleton to a graph (degree-1 = endpoint, degree-2 = continuation, degree-≥3 = branch) → trace edges into ordered polylines → route hub-rooted walk paths to each node (Dijkstra) → simplify polylines (RDP) → arc-length parameterize → write graph JSON. Analysis resolution SHALL be at least 384×256. The runtime SHALL consume the JSON only and SHALL NOT recompute skeletonization.

#### Scenario: Pipeline emits a static graph JSON

- **WHEN** the build-time pipeline runs on the DA base image
- **THEN** it writes a graph JSON containing nodes (with topology kind: endpoint / branch) and per-node hub-rooted walk polylines
- **AND** the analysis was performed at ≥ 384×256 resolution

#### Scenario: Runtime does not recompute

- **WHEN** the maze loads at runtime
- **THEN** it reads the committed graph JSON
- **AND** it does not run skeletonization or image analysis at runtime

### Requirement: Runtime sprite walks the fiber center

At runtime the exploration sprite SHALL move by arc-length tween along an edge polyline, so it travels along the visual center of the base-map fiber (not a pixel grid, not a fiber edge). Any pathfinding (BFS / Dijkstra) SHALL be used only for route selection between nodes, never for the visual movement itself.

#### Scenario: Sprite travels the fiber centerline smoothly

- **WHEN** the sprite advances along an edge
- **THEN** it follows the polyline by arc-length, staying on the fiber centerline
- **AND** the motion is smooth (continuous arc-length interpolation), not pixel-grid stepping

### Requirement: Exploration walker sprite

Per NT branch, the leading exploration sprite (the growth cone) that walks that branch's fiber SHALL be rendered as the player's representative collected variant for that branch — selected as the rarest collected variant in that branch, tie-broken by most-recently collected. When the player has zero collected variants in a branch, the system SHALL render a generic growth-cone fallback sprite for that branch instead. Each branch's walker selection SHALL be recomputed when the player's collection changes.

#### Scenario: Walker is the branch's representative collected variant

- **WHEN** the player has at least one collected variant in branch B
- **THEN** branch B's walking sprite renders as B's rarest collected variant's 立繪 (tie-broken by most-recently collected)

#### Scenario: Empty branch team uses fallback growth-cone sprite

- **WHEN** the player has zero collected variants in branch B
- **THEN** branch B's walking sprite renders as a generic growth-cone fallback sprite
- **AND** exploration in B still advances at the fixed base speed

#### Scenario: Walker updates as collection changes

- **WHEN** the player collects a rarer variant in branch B than B's current walker
- **THEN** branch B's walking sprite updates to the new representative variant

### Requirement: Maze progress persistence

The system SHALL persist per-branch earned-energy accrual and per-node settle progress. The change SHALL persist these in the existing `meta` key-value store using per-branch keys (`maze:<branch>:earned` for the monotonic synced accrual, `maze:<branch>:settles` for the settle/pull count) without a Dexie schema version bump. Both per-branch key families SHALL be added to `SYNCED_META_KEYS` and resolve via the existing MAX-merge counter post-pass (monotonic). If a dedicated Dexie object store is introduced instead, the change MUST include a v(N-1)→v(N) upgrade fixture per the project Dexie-upgrade-fixture rule.

#### Scenario: Per-branch progress survives reload

- **WHEN** the player advances exploration in any branch and reloads the app
- **THEN** each branch's earned-energy accrual and settle count are restored independently

#### Scenario: Per-branch progress syncs cross-device

- **WHEN** the player accrues energy / settles in branch B on device 1 and studies on device 2
- **THEN** `maze:B:earned` and `maze:B:settles` converge via MAX-merge across devices
- **AND** lit-node state remains derived from collected variants (no separate lit-state sync)

#### Scenario: Schema-bump path requires fixture

- **WHEN** the implementation introduces a new Dexie object store for maze state (rather than using `meta`)
- **THEN** a v(N-1)→v(N) upgrade fixture test accompanies the schema bump

### Requirement: Color-blind-friendly team encoding

The maze SHALL encode each NT branch's identity using three redundant channels — color, line style, and node shape — so that all four branches are distinguishable from each other without relying on color alone, including when multiple branches are rendered overlaid.

#### Scenario: Four branches distinguishable without color

- **WHEN** the four branches are rendered overlaid with color information removed (grayscale)
- **THEN** every branch is still distinguishable from the other three by line style and node shape

### Requirement: Multi-branch overlay rendering with branch filter chips

The maze SHALL render the four NT regions z-stacked on a single shared brain outline (interwoven view). The system SHALL provide a filter-chip control that toggles the visibility of each NT branch; by default all four branches SHALL be visible. Toggling a branch off SHALL hide that branch's tract layer, nodes, fog, and walker; the shared brain outline SHALL remain visible regardless of branch toggles. Hiding a branch SHALL NOT pause or alter that branch's growth-signal accrual or settles (visibility is display-only).

#### Scenario: Default shows all four branches overlaid

- **WHEN** the user first opens `/maze-beta`
- **THEN** all four NT regions render overlaid on the shared brain outline
- **AND** all four branch filter chips are in the active (shown) state

#### Scenario: Toggling a branch chip hides that branch only

- **WHEN** the user toggles branch B's filter chip off
- **THEN** B's tract, nodes, fog, and walker are hidden
- **AND** the other branches and the shared brain outline remain visible

#### Scenario: Hidden branch still accrues

- **WHEN** branch B is toggled off and the user answers a B-subject question correctly
- **THEN** B's growth-signal pool still accrues and B's settles still resolve
- **AND** re-showing B reflects the advanced progress

### Requirement: Branch graph co-registration

All four branch graphs SHALL share a common normalized 0..1 coordinate space over a common canvas with the brain in the same position, so that the four tract layers and their nodes overlay in register on the shared outline. The DA branch graph (`da-graph.json`) SHALL remain byte-stable (node positions unchanged) through this change.

#### Scenario: Graphs co-register on a common canvas

- **WHEN** the four branch graphs are loaded
- **THEN** all node and path coordinates are normalized 0..1 over the same canvas geometry
- **AND** the four regions overlay in register on the shared brain outline

#### Scenario: DA graph unchanged

- **WHEN** the multi-branch change is applied
- **THEN** `da-graph.json` node positions are identical to the pre-change values (byte-stable)

### Requirement: DA-as-reference inheritance

The four branches SHALL share one code path (rendering, economy logic, graph algorithm) and the same shared economy parameters by default. The settle cost SHALL follow a **front-loaded** linear-ramp pacing schedule `cost(N) = round(BASE × (1 + K·N))` for the N-th cumulative settle within a branch (0-indexed, NOT capped at the branch's node count — the ramp continues into the second lap / 二週目 so later pulls naturally cost more), replacing a single fixed `SIGNAL_PER_NODE` constant. The schedule SHALL be front-loaded (low `BASE`, steeper `K`) so the FIRST nodes are cheap (fast onboarding to the first collectible) and late nodes are expensive (long tail); `BASE` and `K` SHALL be shared across branches and documented as dogfood-telemetry-tunable first-cut values (first cut `BASE = 24`, `K = 0.10` → node 0 ≈ 24, node 109 ≈ 285). The collected-variant team-speed buff SHALL remain capped (`SPEED_BUFF_CAP`) so it cannot overrun the cost ramp. Per-branch variation SHALL be limited to the branch's asset (base image, color) and that branch's pipeline-generated graph.

#### Scenario: First node is cheap for onboarding

- **WHEN** a fresh player reaches their first node (cumulative settle index 0) in any branch
- **THEN** the cost is `BASE` (the cheapest settle), so the first collectible is reachable quickly rather than after a multi-day grind

#### Scenario: All branches use the same pacing schedule

- **WHEN** earned energy accrues and settles in any branch
- **THEN** the same `cost(N) = round(BASE × (1 + K·N))` schedule and shared `BASE`/`K` apply (no per-branch divergence in this change)

#### Scenario: Later settles cost more than earlier settles (incl. 二週目)

- **WHEN** comparing the energy cost of settle N+1 versus settle N within a branch (including N ≥ node count)
- **THEN** the cost is strictly greater for the later settle (K > 0), so the second lap is slower than the first

#### Scenario: Team-speed buff stays capped

- **WHEN** a branch's collected-variant count grows large
- **THEN** the team-speed multiplier does not exceed `1 + SPEED_BUFF_CAP`

### Requirement: Synapse network overlay on the maze brain-map

The system SHALL render the connectome synapse network as an overlay on the maze brain-map: each formed synapse (a pair of co-firing families) SHALL be drawn as an edge between the two families' node-cluster positions on the shared brain frame, with the edge's visual weight (e.g. opacity / thickness) reflecting the synapse state (dormant / weak / strong). The overlay SHALL be read-only with respect to synapse state — it SHALL NOT create, strengthen, or decay synapses (that mechanic is owned by `connectome-collection` and is unchanged). The overlay SHALL update as synapse state changes (formation / strengthening / decay) and SHALL be toggleable consistent with the maze's branch-filter display model.

#### Scenario: Formed synapse renders as a brain-map edge

- **WHEN** a synapse exists between families A and B
- **THEN** an edge is drawn between A's and B's node-cluster positions on the maze brain frame
- **AND** the edge's visual weight reflects the synapse's current state (dormant / weak / strong)

#### Scenario: Overlay reflects state changes

- **WHEN** a synapse strengthens or decays
- **THEN** the overlay edge's visual weight updates to the new state
- **AND** the synapse data/state itself is unchanged by the overlay (render-only)

#### Scenario: Overlay is toggleable

- **WHEN** the user toggles the synapse overlay off
- **THEN** the synapse edges are hidden
- **AND** the underlying synapse mechanic (formation / strengthening / decay) continues unaffected

