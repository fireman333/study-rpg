## MODIFIED Requirements

### Requirement: Variant pulls SHALL be triggered by maze node settle as the only pull path

The neurons mode SHALL produce `neuronVariants` rows **only** via the maze settle cadence (per `neurons-brain-maze`), which is a continuous pull-cadence gate (not a finite one-pull-per-node budget): each cumulative settle index `N` in a family consumes `cost(N)` energy from that family's pool and triggers exactly one `pullVariant` for that family. While the family has fogged **first-route** nodes the pull rolls a rarity tier then performs a **fill-missing-first within-tier pick** for the family being lit; once all of the family's first-route nodes are lit the family enters **二回目** (per `neurons-maze-second-lap`) and each settle **deterministically** unlocks the next second-route position's **location variant** (no rarity roll) rather than re-rolling least-collected. There SHALL be no player-initiated pull button, no slot-unlock subscriber, and no manual ticket/fate-card pull path. The pull itself SHALL NOT deduct a separate flat currency (the per-family energy consumed at the settle is the cost). On success, inside a single Dexie transaction, the system SHALL increment `familyAccrual.pullCount`, then EITHER (first route) roll a rarity tier (P0 soft-pity applied; cross-tier rarity RNG unchanged) and then select within the rolled tier by **preferring an unowned slot** in that tier — falling back to a uniform-random pick among the tier's slots (yielding a dupe) **only when every slot in the tier is already owned** — among that family's catalog variants (二回目 `isLocation` variants always excluded from this pick), OR (二回目) select the deterministic location variant bound to the settled second-route position; and either persist a new row (`copies = 1`, provenance stamped) or increment `copies` on the existing row (mint a new individual per `add-neurons-dupe-fusion`). A pull MAY yield a dupe (only once its tier is fully owned, or in 二回目/past-both-routes dupe handling). The reveal SHALL fire only after commit.

#### Scenario: A settle triggers exactly one pull for that family

- **GIVEN** family F's accumulated energy reaches the settle threshold at cumulative index N
- **WHEN** the settle resolves
- **THEN** `cost(N)` energy is consumed from family F's pool
- **AND** exactly one `pullVariant` runs for F (first route: roll a tier then fill-missing-first within that tier; 二回目: the deterministic location variant for the settled second-route position), persisting a new row or `copies` increment
- **AND** the reveal fires only after the transaction commits

#### Scenario: Within-tier pick fills an unowned slot before producing a dupe

- **GIVEN** a first-route pull rolls rarity tier T, and family F owns some but not all of T's catalog slots
- **WHEN** the within-tier pick resolves
- **THEN** the pick SHALL select one of T's **unowned** slots (persisting a new variant), NOT an already-owned slot
- **AND** a within-tier dupe SHALL be produced only when every slot in tier T is already owned

#### Scenario: Cross-tier rarity RNG is preserved

- **WHEN** a first-route pull rolls its rarity tier
- **THEN** the tier SHALL be drawn from the unchanged `VARIANT_RARITY_WEIGHTS` distribution (e.g. P1 at its rare weight), so pulling a rare tier remains a genuine RNG event
- **AND** the fill-missing-first behavior SHALL apply ONLY to the slot choice *within* the already-rolled tier

#### Scenario: Pull cost is the consumed maze energy, not a flat currency

- **WHEN** a settle-triggered pull runs
- **THEN** no separate flat `PULL_COST` is deducted (the consumed per-family `cost(N)` energy was the cost)

#### Scenario: No player-initiated pull path exists

- **WHEN** the player is on the `/collection` page
- **THEN** there SHALL be no pull button and no energy-balance HUD (the page is the dex + tier-promote/fusion surface only)
- **AND** the only mechanism creating `neuronVariants` rows is the maze node settle

## ADDED Requirements

### Requirement: P1 tier SHALL converge via a silent soft-pity

Each family's lone **P1** route-1 variant SHALL be guaranteed to converge through a soft-pity ramp analogous to the P0 pity, so that a completionist is never blocked indefinitely on the single 1.3%-weight P1 roll. The effective P1 probability per pull SHALL be `clamp(max(0, pullCount − P1_PITY_START) * P1_PITY_RAMP, 0, 1)` (per-family `pullCount`), checked only when the family's P1 is NOT yet owned and AFTER the P0-pity check. First-cut constants (dogfood-tunable): `P1_PITY_START = 30`, `P1_PITY_RAMP = 0.06`. Once the family's P1 is owned, the P1-pity SHALL be inert (P1 then rolls only via the normal weighted distribution, which still produces dupe individuals once owned). Crucially, the P1 soft-pity SHALL be **silent**: a P1 obtained while the P1-pity ramp was active SHALL NOT set any pity-floor flag (no analogue to P0's `wasPityFloor`) and SHALL NOT surface any "保底" / pity indicator in the UI — the player experiences obtaining P1 as luck. The cross-tier rarity weight table and the P0 pity SHALL be unchanged by this requirement.

#### Scenario: P1 pity is inactive before the pity start

- **GIVEN** `pullCount = 10`, the family's P1 is not owned, and the P0-pity check did not fire
- **WHEN** the P1 pity contribution is computed
- **THEN** it SHALL be 0 (P1 is reachable this pull only via the normal weighted roll)

#### Scenario: P1 pity ramps the lone P1 toward certainty

- **GIVEN** the family's P1 is not owned and `pullCount` is well past `P1_PITY_START`
- **WHEN** the effective P1-pity rate is computed
- **THEN** it SHALL ramp toward 1.0 so the P1 converges within a bounded number of further pulls

#### Scenario: P1 pity is silent (no surfaced floor flag)

- **GIVEN** a P1 is minted while its pity ramp was active
- **WHEN** the variant row is persisted and the reveal fires
- **THEN** NO pity-floor flag SHALL be set on the row (unlike P0's `wasPityFloor`)
- **AND** the UI SHALL NOT display any "保底" / guaranteed-pity indicator for the P1

#### Scenario: P1 pity goes inert once P1 is owned

- **GIVEN** the family already owns its P1
- **WHEN** subsequent pulls roll
- **THEN** no P1-pity contribution SHALL be applied (P1 is reachable only via the normal weighted distribution, yielding dupe individuals)
