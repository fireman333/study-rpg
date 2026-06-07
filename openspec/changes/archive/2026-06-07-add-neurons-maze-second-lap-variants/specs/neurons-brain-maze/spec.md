## MODIFIED Requirements

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
