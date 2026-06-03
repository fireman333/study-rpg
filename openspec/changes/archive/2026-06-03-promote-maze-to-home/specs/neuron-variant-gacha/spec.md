## MODIFIED Requirements

### Requirement: Study activity SHALL mint a neural-energy pull currency

The neurons mode SHALL maintain a study-gated **neural energy** currency partitioned **per NT branch** (DA / 5HT / GABA / Glu), persisted as per-branch monotonic meta counters `maze:<branch>:earned` (and a per-branch consumed view via settle count). The faucet SHALL be: **+`CORRECT_ANSWER_ENERGY` (=3)** per correct answer, accrued into the branch of the answered subject resolved via `FAMILY_NT_BRANCH` (awarded in/after `recordCorrectAnswer`); and **+`READING_MINUTE_ENERGY` (=2)** per accrued reading minute, split evenly across the four branch pools. Per-branch energy SHALL be the maze exploration fuel and is consumed at node settle (per `neurons-brain-maze`), NOT spent on a player-initiated pull. There SHALL be **no real-money** path. The faucet constants SHALL live in `content-neurons-tw` as the single source of truth. Per-branch `earned` counters SHALL sync via the `counters.ts` MAX-merge post-pass. The legacy single global `neuralEnergyEarned/neuralEnergySpent` balance (whose only sink was the removed manual pull) is retired; its meta keys MAY remain present but unused (reader-tolerant) for rollback safety.

#### Scenario: Correct answer mints energy into the subject's branch

- **GIVEN** the player answers a question correctly in subject S
- **WHEN** the energy faucet runs
- **THEN** `maze:<FAMILY_NT_BRANCH[S]>:earned` SHALL increase by `CORRECT_ANSWER_ENERGY` (=3)
- **AND** no other branch's earned counter SHALL change from that event

#### Scenario: Reading minute mints energy across branches

- **GIVEN** the reading timer accrues one full minute
- **THEN** `READING_MINUTE_ENERGY` (=2) SHALL be split evenly across the four branch `earned` counters

#### Scenario: No global manual-pull balance remains in use

- **WHEN** the player studies
- **THEN** energy is accrued only into per-branch maze fuel
- **AND** no spendable global balance gates a player-initiated pull (the manual pull is removed)

## REMOVED Requirements

### Requirement: Player SHALL initiate variant pulls per family by spending neural energy

**Reason**: Under the maze-as-home model (`promote-maze-to-home`), the maze node is the **only** pull gate. The always-available player-initiated `/collection` pull (spend flat `PULL_COST=20`) is removed because, at ~197 energy/day income, it allowed ~10 pulls/day and bypassed the maze pacing entirely — defeating the design intent that the maze gates collection cadence.

**Migration**: Pulls are now triggered by maze node settle (ADDED requirement below). The `pullVariant` roll core (within-tier uniform pick, dupe handling, reveal-after-commit, P0 pity) is preserved — only the trigger and cost model change. The `/collection` page is retained as the collection dex + tier-promote/fusion (`add-neurons-dupe-fusion`) surface, with the pull button and balance HUD removed. The flat `PULL_COST` constant is superseded by the per-branch per-node `cost(N)` pacing schedule (`neurons-brain-maze`).

## ADDED Requirements

### Requirement: Variant pulls SHALL be triggered by maze node settle as the only pull path

The neurons mode SHALL produce `neuronVariants` rows **only** via the maze settle cadence (per `neurons-brain-maze`), which is a continuous pull-cadence gate (not a finite one-pull-per-node budget): each cumulative settle index `N` in a branch consumes `cost(N)` energy from the branch pool and triggers exactly one `pullVariant`. The pull's target family SHALL be the lit node's `MazeNode.familyId` while the branch has fogged nodes, and the branch's least-collected family (weighted toward unowned slots) once all the branch's nodes are lit (二週目) — so the random long tail converges toward completion and never dead-ends. There SHALL be no player-initiated pull button, no slot-unlock subscriber, and no manual ticket/fate-card pull path. The pull itself SHALL NOT deduct a separate flat currency (the per-branch energy consumed at the settle is the cost). On success, inside a single Dexie transaction, the system SHALL increment `familyAccrual.pullCount`, roll a rarity tier (P0 soft-pity applied), select a variant uniformly within the rolled tier among that family's catalog variants, and either persist a new row (`copies = 1`, provenance stamped) or increment `copies` on the existing row (mint a new individual per `add-neurons-dupe-fusion`). A pull MAY yield a dupe in any tier (dupes feed `add-neurons-dupe-fusion`). The reveal SHALL fire only after commit.

#### Scenario: A settle triggers exactly one pull for the resolved family

- **GIVEN** branch B's accumulated energy reaches the settle threshold at cumulative index N
- **WHEN** the settle resolves
- **THEN** `cost(N)` energy is consumed from branch B's pool
- **AND** exactly one `pullVariant` runs for the resolved family (lit node's family pre-completion; B's least-collected family in 二週目), rolling a tier and persisting a new row or `copies` increment
- **AND** the reveal fires only after the transaction commits

#### Scenario: Pull cost is the consumed maze energy, not a flat currency

- **WHEN** a settle-triggered pull runs
- **THEN** no separate flat `PULL_COST` is deducted (the consumed per-branch `cost(N)` energy was the cost)

#### Scenario: No player-initiated pull path exists

- **WHEN** the player is on the `/collection` page
- **THEN** there SHALL be no pull button and no energy-balance HUD (the page is the dex + tier-promote/fusion surface only)
- **AND** the only mechanism creating `neuronVariants` rows is the maze node settle
