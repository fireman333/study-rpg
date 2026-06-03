# neurons-brain-maze Specification

## Purpose

A fog-of-war exploration view over a DA-pathway brain map for `apps/neurons-tw`, on an independent `/maze-beta` route (MVP vertical slice; does not touch the connectome / collection views). Studying DA subjects (藥理 / 公衛) and reading accrue "growth signal" that advances a growth cone along dopaminergic white-matter tracts; reaching a fogged node reveals + collects that node's variant slot (1 node = 1 of the 20 DA variant slots). The base-map fiber graph is produced by a build-time pipeline (image → HSV mask → Zhang-Suen skeleton → hub-rooted Dijkstra walk paths → RDP → committed graph JSON; zero runtime recomputation). Display obeys the open-collection paradigm: fog of war (no pre-revealed shape / rarity), pure-count chip 「🧠 已連線 X 個腦區」 (no denominator), no completion milestone. Lit-node state is derived from collected variants (painless migration). Designed per-branch so 5HT / GABA / Glu regions can be added additively.
## Requirements
### Requirement: Independent maze-beta route

The system SHALL expose a brain-maze exploration view at the route `/maze-beta` in `apps/neurons-tw`, covering all four neurotransmitter regions (DA = 藥理學 + 公共衛生學, 20 nodes; 5HT = 寄生蟲學 + 組織學, 20 nodes; GABA = 生物化學 + 病理學 + 免疫學, 30 nodes; Glu = 解剖學 + 生理學 + 胚胎學 + 微生物學, 40 nodes; 110 nodes total), derived from `FAMILY_NT_BRANCH` and the 110-variant catalog. The maze SHALL NOT modify, read-write, or visually alter the existing connectome / Collection 2.0 view. The route MUST be fully additive and reversible.

#### Scenario: Maze-beta route renders independently

- **WHEN** the user navigates to `/maze-beta`
- **THEN** the four-region brain map renders with its exploration UI
- **AND** the existing connectome / collection view is unchanged and continues to function

#### Scenario: All four NT regions present

- **WHEN** the maze loads its node set
- **THEN** it contains exactly the nodes for all four NT branches (DA 20 + 5HT 20 + GABA 30 + Glu 40 = 110), each derived from `FAMILY_NT_BRANCH` and the 110-variant catalog
- **AND** each branch's node count equals that branch's variant-slot count

### Requirement: Node-to-variant-slot binding

Each maze node SHALL correspond to exactly one neuron variant slot (1 node = 1 variant slot), across all four NT branches. The node identity SHALL be bound to a skeleton topology feature (endpoint or branch point) of its branch's base-map graph, not to a hand-placed coordinate.

#### Scenario: One node per variant slot per branch

- **WHEN** the maze graph set is loaded
- **THEN** for each NT branch the count of that branch's nodes equals the count of that branch's variant slots (DA 20 / 5HT 20 / GABA 30 / Glu 40)
- **AND** each node maps to a distinct `{familyId, slotIndex}` pair with no cross-branch collisions

### Requirement: Growth-signal exploration economy

The system SHALL maintain a separate "growth signal" pool per NT branch. A correct quiz answer or reading time SHALL accrue growth signal into the pool of the branch that the answered subject belongs to, resolved via `FAMILY_NT_BRANCH`. Signal accrual SHALL be scaled by the active answer streak and by that branch's team speed. When a branch's region is visible, accrued signal SHALL advance that branch's growth cone along the current fiber toward the next fogged node (immediate visual feedback). The system MUST NOT introduce any monetary, IAP, ad-reward, or non-gameplay path to advance exploration or settle nodes.

#### Scenario: A correct answer accrues to the subject's branch pool

- **WHEN** the user answers a question correctly in subject S
- **THEN** growth signal is added to the pool of `FAMILY_NT_BRANCH[S]` (scaled by streak and that branch's team-speed multipliers)
- **AND** no other branch's pool is changed by that event
- **AND** when that branch's region is visible the growth cone advances toward its next fogged node

#### Scenario: Reading time feeds branch pools

- **WHEN** the user accrues reading time
- **THEN** growth signal is added to branch pool(s) at the reading rate
- **AND** exploration advances as signal accumulates

#### Scenario: Streak accelerates accrual

- **WHEN** the user has an active correct-answer streak
- **THEN** the per-event growth-signal accrual is higher than with no streak

#### Scenario: No monetary path

- **WHEN** any exploration advance or node settle is triggered
- **THEN** the trigger is a gameplay action (correct answer / reading time) only
- **AND** no real-money, IAP, or ad-reward path exists to advance or settle

### Requirement: Exploration teams from collected variants

Collected variants SHALL act as exploration units ("Pikmin"), partitioned by NT branch; each branch's team explores its own region. Per branch, base exploration speed SHALL be a fixed positive value so that a player with an empty team for that branch can still make progress. A larger or rarer set of collected variants in a branch SHALL increase that branch's team exploration speed (a buff that never hard-blocks progress).

#### Scenario: Empty branch team still progresses

- **WHEN** a player with zero collected variants in branch B accrues growth signal in B
- **THEN** exploration in B still advances at the fixed base speed (never zero / blocked)

#### Scenario: Collected variants buff the owning branch's speed

- **WHEN** a player has collected more (or rarer) variants in branch B
- **THEN** branch B's team exploration speed is higher than its base speed
- **AND** the speed increases monotonically with B's collection strength
- **AND** collecting variants in branch B does not change another branch's team speed

### Requirement: Node settle reveals and collects the reached node

When accumulated growth signal advances exploration to reach a fogged node, the system SHALL settle: reveal the node and collect that node's specific variant slot via the existing `neuron-variant-gacha` mint path (emitting the same reveal / provenance / achievement / leaderboard side-effects as a pull; rarity = the slot's authored catalog rarity). A settle SHALL play a reveal chime. Because the frontier only ever targets fogged (uncollected) nodes, every settle yields a previously-uncollected slot (family pity is trivially satisfied). A settle SHALL NOT spend energy currency — exploration signal is the cost.

#### Scenario: Reaching a node reveals and collects it

- **WHEN** accumulated growth signal advances exploration to reach a fogged node
- **THEN** that node's variant slot is collected via the gacha mint path
- **AND** the node is lit and its variant revealed
- **AND** a reveal chime plays

#### Scenario: Every settle yields a previously-uncollected slot

- **WHEN** a settle resolves while fogged nodes remain
- **THEN** the collected slot was previously uncollected (a new node lights)

#### Scenario: Settle does not spend energy currency

- **WHEN** a node settle occurs
- **THEN** the neural-energy balance is unchanged (the cost was the exploration signal)

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

The maze SHALL display progress as a pure count chip 「🧠 已連線 X 個腦區」 with no denominator (no X/20, no X/110). The system SHALL NOT display a completion percentage, family-complete state, or any closed-cap / completion milestone.

#### Scenario: Chip shows count without denominator

- **WHEN** the player has lit X nodes
- **THEN** the chip reads 「🧠 已連線 X 個腦區」
- **AND** no total / denominator / percentage is shown

#### Scenario: No completion milestone

- **WHEN** the player lights all available nodes
- **THEN** no "family complete" or "100% complete" milestone is surfaced
- **AND** the maze does not enter a disabled / finished terminal state

### Requirement: Collected-variant to lit-node migration

Lit-node state for already-collected variants SHALL be derived from the existing collected-variant state, read-only. The system SHALL NOT duplicate-store lit state for migrated nodes, run a backfill, or show a migration banner.

#### Scenario: Existing player sees collected variants pre-lit

- **WHEN** an existing player who has collected DA variants first opens `/maze-beta`
- **THEN** the nodes for those collected variants are already lit
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

The system SHALL persist a growth-signal pool and per-node exploration progress per NT branch. The change SHOULD persist this in the existing `meta` key-value store using per-branch keys (`maze:<branch>:signal` / `maze:<branch>:settles`) without a Dexie schema version bump. Existing DA progress keys (`maze:da:signal` / `maze:da:settles`) SHALL be preserved unchanged (no DA progress reset). If a dedicated Dexie object store is introduced instead, the change MUST include a v(N-1)→v(N) upgrade fixture per the project Dexie-upgrade-fixture rule.

#### Scenario: Per-branch progress survives reload

- **WHEN** the player advances exploration in any branch and reloads the app
- **THEN** each branch's growth-signal pool and lit-node progress are restored independently

#### Scenario: Existing DA progress preserved

- **WHEN** an existing DA-only player first loads the multi-branch maze
- **THEN** their prior DA growth-signal pool and settled count are unchanged (no reset, no migration banner)

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

The other three branches SHALL inherit DA's shared code path (rendering, economy logic, graph algorithm) and SHALL use the same shared economy constants (`SIGNAL_PER_NODE`, `CORRECT_SIGNAL`, `READING_SIGNAL`, speed-buff parameters) as DA by default. Per-branch variation SHALL be limited to the branch's asset (base image, color) and that branch's pipeline-generated graph. DA's observable behaviour (graph, progress keys, settle semantics) SHALL be unchanged after the refactor.

#### Scenario: All branches use the same economy constants

- **WHEN** growth signal accrues and settles in any branch
- **THEN** the same `SIGNAL_PER_NODE` budget and base accrual constants apply as for DA (no per-branch divergence in this change)

#### Scenario: DA behaviour is a regression guard

- **WHEN** the multi-branch refactor is in place
- **THEN** DA's fog/settle/walker/persistence behaviour is equivalent to the pre-change DA-only slice (verified by the DA assertions in the maze tests)

