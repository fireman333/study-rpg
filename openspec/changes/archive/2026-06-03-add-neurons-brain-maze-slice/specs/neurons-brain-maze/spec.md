## ADDED Requirements

### Requirement: Independent maze-beta route

The system SHALL expose a brain-maze exploration view at the route `/maze-beta` in `apps/neurons-tw`, scoped to the DA neurotransmitter region (families 藥理學 + 公共衛生學, 20 variant-slot nodes). The maze SHALL NOT modify, read-write, or visually alter the existing connectome / Collection 2.0 view. The route MUST be fully additive and reversible.

#### Scenario: Maze-beta route renders independently

- **WHEN** the user navigates to `/maze-beta`
- **THEN** the DA-region brain map renders with its exploration UI
- **AND** the existing connectome / collection view is unchanged and continues to function

#### Scenario: Region scope is DA only

- **WHEN** the maze loads its node set
- **THEN** it contains exactly the 20 nodes corresponding to the 藥理學 + 公共衛生學 variant slots (2 families × 10 slots), derived from `FAMILY_NT_BRANCH` and the 110-variant catalog
- **AND** no 5HT / GABA / Glu nodes are present in this slice

### Requirement: Node-to-variant-slot binding

Each maze node SHALL correspond to exactly one neuron variant slot (1 node = 1 variant slot). The node identity SHALL be bound to a skeleton topology feature (endpoint or branch point) of the base-map graph, not to a hand-placed coordinate.

#### Scenario: One node per variant slot

- **WHEN** the maze graph is loaded
- **THEN** the count of DA-region nodes equals the count of DA-region variant slots (20)
- **AND** each node maps to a distinct `{familyId, slotIndex}` pair

### Requirement: Growth-signal exploration economy

The system SHALL accumulate "growth signal" from both correct DA-subject quiz answers and reading time into a pool that advances exploration. Signal accrual SHALL be scaled by the active answer streak and by the DA team's speed. When the maze view is visible, accrued signal SHALL advance the growth cone along the current fiber toward the next fogged node (immediate visual feedback). The system MUST NOT introduce any monetary, IAP, ad-reward, or non-gameplay path to advance exploration or settle nodes.

#### Scenario: A correct answer accrues growth signal

- **WHEN** the user answers a DA-subject (藥理 / 公衛) question correctly
- **THEN** growth signal is added to the pool (scaled by streak and team-speed multipliers)
- **AND** when the maze view is open the growth cone advances along the current fiber toward the next fogged node

#### Scenario: Reading time also feeds the pool

- **WHEN** the user accrues reading time
- **THEN** growth signal is added to the pool at the reading rate
- **AND** exploration advances as signal accumulates

#### Scenario: Streak accelerates accrual

- **WHEN** the user has an active correct-answer streak
- **THEN** the per-event growth-signal accrual is higher than with no streak

#### Scenario: No monetary path

- **WHEN** any exploration advance or node settle is triggered
- **THEN** the trigger is a gameplay action (correct answer / reading time) only
- **AND** no real-money, IAP, or ad-reward path exists to advance or settle

### Requirement: Exploration teams from collected variants

Collected variants SHALL act as exploration units ("Pikmin"); the DA team explores the DA region. Base exploration speed SHALL be a fixed positive value so that a player with an empty team can still make progress. A larger or rarer set of collected DA variants SHALL increase the DA team's exploration speed (a buff that never hard-blocks progress).

#### Scenario: Empty team still progresses

- **WHEN** a player with zero collected DA variants accrues growth signal
- **THEN** exploration still advances at the fixed base speed (never zero / blocked)

#### Scenario: Collected variants buff speed

- **WHEN** a player has collected more (or rarer) DA variants
- **THEN** the DA team's exploration speed is higher than the base speed
- **AND** the speed increases monotonically with collection strength

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

The base-map fiber graph SHALL be produced by a build-time pipeline (run once, output committed as a static JSON asset, zero runtime recomputation): load a flat-saturated non-overlapping 4-color base image → per-pixel HSV-threshold color masks → morphological close (repair 1–3px gaps) → Zhang-Suen skeletonize each color mask → convert skeleton to a graph (degree-1 = endpoint, degree-2 = continuation, degree-≥3 = branch) → trace edges into ordered polylines → simplify polylines (RDP) → arc-length parameterize → write graph JSON. Analysis resolution SHALL be at least 384×256. The runtime SHALL consume the JSON only and SHALL NOT recompute skeletonization.

#### Scenario: Pipeline emits a static graph JSON

- **WHEN** the build-time pipeline runs on the DA base image
- **THEN** it writes a graph JSON containing nodes (with topology kind: endpoint / branch) and edge polylines
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

The leading exploration sprite (the growth cone) that walks the fiber SHALL be rendered as the player's representative collected DA variant — selected as the rarest collected DA variant, tie-broken by most-recently collected. When the player has zero collected DA variants, the system SHALL render a generic growth-cone fallback sprite instead. The walker selection SHALL be recomputed when the player's collection changes.

#### Scenario: Walker is the representative collected variant

- **WHEN** the player has at least one collected DA variant
- **THEN** the walking sprite renders as the rarest collected DA variant's 立繪 (tie-broken by most-recently collected)

#### Scenario: Empty team uses fallback growth-cone sprite

- **WHEN** the player has zero collected DA variants
- **THEN** the walking sprite renders as a generic growth-cone fallback sprite
- **AND** exploration still advances at the fixed base speed

#### Scenario: Walker updates as collection changes

- **WHEN** the player collects a rarer DA variant than the current walker
- **THEN** the walking sprite updates to the new representative variant

### Requirement: Maze progress persistence

The system SHALL persist the growth-signal pool and per-node exploration progress for the DA region. The slice SHOULD persist this in the existing `meta` key-value store without a Dexie schema version bump. If a dedicated Dexie object store is introduced instead, the change MUST include a v(N-1)→v(N) upgrade fixture per the project Dexie-upgrade-fixture rule.

#### Scenario: Progress survives reload

- **WHEN** the player advances exploration and reloads the app
- **THEN** the growth-signal pool and lit-node progress are restored

#### Scenario: Schema-bump path requires fixture

- **WHEN** the implementation introduces a new Dexie object store for maze state (rather than using `meta`)
- **THEN** a v(N-1)→v(N) upgrade fixture test accompanies the schema bump

### Requirement: Color-blind-friendly team encoding

The maze SHALL encode the neurotransmitter team identity using three redundant channels — color, line style, and node shape — so that team identity is distinguishable without relying on color alone.

#### Scenario: Team identity readable without color

- **WHEN** team encoding is rendered with color information removed (grayscale)
- **THEN** the team is still distinguishable by line style and node shape
