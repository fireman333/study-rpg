## MODIFIED Requirements

### Requirement: Variant pulls SHALL be triggered by maze node settle as the only pull path

The neurons mode SHALL produce `neuronVariants` rows **only** via the maze settle cadence (per `neurons-brain-maze`), which is a continuous pull-cadence gate (not a finite one-pull-per-node budget): each cumulative settle index `N` in a family consumes `cost(N)` energy from that family's pool and triggers exactly one `pullVariant` for that family. While the family has fogged **first-route** nodes the pull rolls a **random within-tier** variant for the family being lit; once all of the family's first-route nodes are lit the family enters **二回目** (per `neurons-maze-second-lap`) and each settle **deterministically** unlocks the next second-route position's **location variant** (no rarity roll) rather than re-rolling least-collected. There SHALL be no player-initiated pull button, no slot-unlock subscriber, and no manual ticket/fate-card pull path. The pull itself SHALL NOT deduct a separate flat currency (the per-family energy consumed at the settle is the cost). On success, inside a single Dexie transaction, the system SHALL increment `familyAccrual.pullCount`, then EITHER (first route) roll a rarity tier (P0 soft-pity applied) and select a variant uniformly within the rolled tier among that family's catalog variants, OR (二回目) select the deterministic location variant bound to the settled second-route position; and either persist a new row (`copies = 1`, provenance stamped) or increment `copies` on the existing row (mint a new individual per `add-neurons-dupe-fusion`). A pull MAY yield a dupe. The reveal SHALL fire only after commit.

#### Scenario: A settle triggers exactly one pull for that family

- **GIVEN** family F's accumulated energy reaches the settle threshold at cumulative index N
- **WHEN** the settle resolves
- **THEN** `cost(N)` energy is consumed from family F's pool
- **AND** exactly one `pullVariant` runs for F (first route: random within-tier on the lit-node slot; 二回目: the deterministic location variant for the settled second-route position), persisting a new row or `copies` increment
- **AND** the reveal fires only after the transaction commits

#### Scenario: Pull cost is the consumed maze energy, not a flat currency

- **WHEN** a settle-triggered pull runs
- **THEN** no separate flat `PULL_COST` is deducted (the consumed per-family `cost(N)` energy was the cost)

#### Scenario: No player-initiated pull path exists

- **WHEN** the player is on the `/collection` page
- **THEN** there SHALL be no pull button and no energy-balance HUD (the page is the dex + tier-promote/fusion surface only)
- **AND** the only mechanism creating `neuronVariants` rows is the maze node settle
