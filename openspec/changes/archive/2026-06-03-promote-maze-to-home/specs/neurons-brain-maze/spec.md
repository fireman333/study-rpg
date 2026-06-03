## MODIFIED Requirements

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

### Requirement: Growth-signal exploration economy

The system SHALL maintain a per-NT-branch **neural-energy** pool that is BOTH the exploration fuel and the pull cost (one currency, no separate manual-pull balance). A correct quiz answer SHALL accrue energy into the pool of the branch that the answered subject belongs to, resolved via `FAMILY_NT_BRANCH`; reading time SHALL accrue across all four branch pools (even split). Accrual SHALL be scaled by the active answer streak and by that branch's team speed. A branch's frontier position SHALL be determined by its accumulated earned energy against the cumulative pacing cost of the nodes already settled — i.e. the frontier advances while `earned − Σcost(settled) ≥ cost(nextNode)`. The system MUST NOT introduce any monetary, IAP, ad-reward, or non-gameplay path to advance exploration or settle nodes.

#### Scenario: A correct answer accrues to the subject's branch pool

- **WHEN** the user answers a question correctly in subject S
- **THEN** earned energy is added to the per-branch pool of `FAMILY_NT_BRANCH[S]` (scaled by streak and that branch's team-speed multipliers)
- **AND** no other branch's pool is changed by that event
- **AND** when that branch's region is visible the growth cone advances toward its next fogged node

#### Scenario: Reading time feeds branch pools

- **WHEN** the user accrues reading time
- **THEN** earned energy is added across the four branch pools (even split) at the reading rate

#### Scenario: Streak accelerates accrual

- **WHEN** the user has an active correct-answer streak
- **THEN** the per-event earned-energy accrual is higher than with no streak

#### Scenario: No monetary path

- **WHEN** any exploration advance or node settle is triggered
- **THEN** the trigger is a gameplay action (correct answer / reading time) only
- **AND** no real-money, IAP, or ad-reward path exists to advance or settle

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

### Requirement: Collected-variant to lit-node migration

Lit-node state SHALL be derived from the per-branch frontier progress (cumulative settle count), NOT from collected variants — because under random settle pulls the variant collected at a settle is not necessarily the lit node's own slot. The lit nodes of a branch SHALL be the first `min(settles, nodeCount)` nodes in hub-distance (`pathLen`) order. Collection progress is tracked separately (the 🧬 count + the collection dex). The system SHALL NOT run a backfill, duplicate-store lit state, or show a migration banner. Existing players' per-branch `settles` (preserved from the pre-change maze) keep their frontier; their existing collected variants remain in the collection unchanged. A player who collected variants via the (removed) manual pull but never explored the maze simply starts the frontier at their stored `settles` (no regression — exploring yields additional random pulls).

#### Scenario: Lit nodes derive from frontier, not collection

- **WHEN** a branch has `settles = K`
- **THEN** the first `min(K, nodeCount)` nodes in `pathLen` order are lit
- **AND** the lit set does NOT depend on which specific variants were collected

#### Scenario: No backfill or migration banner

- **WHEN** an existing player first opens the maze homepage
- **THEN** their stored per-branch `settles` and their collected variants are both preserved
- **AND** no backfill write or migration banner occurs

## ADDED Requirements

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
