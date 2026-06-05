# neuron-variant-gacha (delta — redesign-neurons-maze-rotjs-grid)

Re-expresses the maze energy faucet and the settle-triggered pull path against the single-grid **11 per-family pool** model (replacing the 4 NT-branch pools). The pull mechanics (P0 pity, dupe minting, reveal-after-commit, no manual pull) are unchanged; only the per-branch → per-family indexing and the recalibrated reading rate change. The collection is NOT reset by this change (the v11 reset requirement is unchanged).

## MODIFIED Requirements

### Requirement: Study activity SHALL mint a neural-energy pull currency

The neurons mode SHALL maintain a study-gated **neural energy** currency partitioned **per family** (the 11 subject families; no neurotransmitter-branch grouping), persisted as per-family monotonic meta counters `maze:<familyId>:earned` (and a per-family consumed view via settle count). The faucet SHALL be: **+`CORRECT_ANSWER_ENERGY` (=3)** per correct answer, accrued into the answered subject's OWN family pool directly (awarded in/after `recordCorrectAnswer`, with no `FAMILY_NT_BRANCH` indirection); and **+`READING_MINUTE_ENERGY` (=3, recalibrated)** per accrued reading minute, split evenly across the families in which the player has ≥1 collected variant (if none collected, split evenly across all 11). Per-family energy SHALL be the maze exploration fuel and is consumed at node settle (per `neurons-brain-maze`), NOT spent on a player-initiated pull. There SHALL be **no real-money** path. The faucet constants SHALL live in `content-neurons-tw` as the single source of truth. Per-family `earned` counters SHALL sync via the `counters.ts` MAX-merge post-pass. The legacy single global `neuralEnergyEarned/neuralEnergySpent` balance and the retired four-branch `maze:{da,5ht,gaba,glu}:*` keys MAY remain present but unused (reader-tolerant) for rollback safety.

#### Scenario: Correct answer mints energy into the subject's own family pool

- **GIVEN** the player answers a question correctly in subject S
- **WHEN** the energy faucet runs
- **THEN** `maze:S:earned` SHALL increase by `CORRECT_ANSWER_ENERGY` (=3) (scaled by streak, mastery, capped `energyAccel`, and S's capped synapse bonus)
- **AND** no other family's earned counter SHALL change from that event

#### Scenario: Reading minute mints energy across the player's active families

- **GIVEN** the reading timer accrues one full minute
- **THEN** `READING_MINUTE_ENERGY` (=3) SHALL be split evenly across the families with ≥1 collected variant
- **AND** when the player has no collected variants it SHALL be split evenly across all 11 families

#### Scenario: No global manual-pull balance remains in use

- **WHEN** the player studies
- **THEN** energy is accrued only into per-family maze fuel
- **AND** no spendable global balance gates a player-initiated pull (the manual pull is removed)

### Requirement: Variant pulls SHALL be triggered by maze node settle as the only pull path

The neurons mode SHALL produce `neuronVariants` rows **only** via the maze settle cadence (per `neurons-brain-maze`), which is a continuous pull-cadence gate (not a finite one-pull-per-node budget): each cumulative settle index `N` in a family consumes `cost(N)` energy from that family's pool and triggers exactly one `pullVariant` for that family. While the family has fogged nodes the pull targets the family being lit; once all the family's nodes are lit (二週目) the pull targets the family's least-collected slots (weighted toward unowned) so the random long tail converges toward completion and never dead-ends. There SHALL be no player-initiated pull button, no slot-unlock subscriber, and no manual ticket/fate-card pull path. The pull itself SHALL NOT deduct a separate flat currency (the per-family energy consumed at the settle is the cost). On success, inside a single Dexie transaction, the system SHALL increment `familyAccrual.pullCount`, roll a rarity tier (P0 soft-pity applied), select a variant uniformly within the rolled tier among that family's catalog variants, and either persist a new row (`copies = 1`, provenance stamped) or increment `copies` on the existing row (mint a new individual per `add-neurons-dupe-fusion`). A pull MAY yield a dupe in any tier. The reveal SHALL fire only after commit.

#### Scenario: A settle triggers exactly one pull for that family

- **GIVEN** family F's accumulated energy reaches the settle threshold at cumulative index N
- **WHEN** the settle resolves
- **THEN** `cost(N)` energy is consumed from family F's pool
- **AND** exactly one `pullVariant` runs for F (lit-node slot pre-completion; F's least-collected slots in 二週目), rolling a tier and persisting a new row or `copies` increment
- **AND** the reveal fires only after the transaction commits

#### Scenario: Pull cost is the consumed maze energy, not a flat currency

- **WHEN** a settle-triggered pull runs
- **THEN** no separate flat `PULL_COST` is deducted (the consumed per-family `cost(N)` energy was the cost)

#### Scenario: No player-initiated pull path exists

- **WHEN** the player is on the `/collection` page
- **THEN** there SHALL be no pull button and no energy-balance HUD (the page is the dex + tier-promote/fusion surface only)
- **AND** the only mechanism creating `neuronVariants` rows is the maze node settle
