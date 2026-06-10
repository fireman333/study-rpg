## MODIFIED Requirements

### Requirement: Variant pulls SHALL be triggered by maze node settle as the only pull path

The neurons mode SHALL produce `neuronVariants` rows **only** via the maze settle cadence (per `neurons-brain-maze`), which is a continuous pull-cadence gate (not a finite one-pull-per-node budget): each cumulative settle index `N` in a family consumes `cost(N)` energy from that family's pool and triggers exactly one `pullVariant` for that family. While the family has fogged **first-route** nodes the pull rolls a rarity tier then performs a **fill-missing-first within-tier pick** for the family being lit; once all of the family's first-route nodes are lit the family enters **二回目** (per `neurons-maze-second-lap`) and each settle **deterministically** unlocks the next second-route position's **location variant** (no rarity roll) rather than re-rolling least-collected. There SHALL be no player-initiated pull button, no slot-unlock subscriber, and no manual ticket/fate-card pull path. The pull itself SHALL NOT deduct a separate flat currency (the per-family energy consumed at the settle is the cost). On success, inside a single Dexie transaction, the system SHALL increment `familyAccrual.pullCount`, then EITHER (first route) roll a rarity tier (P0 soft-pity applied; cross-tier rarity RNG unchanged) and then select within the rolled tier by **preferring an unowned slot** in that tier — falling back to a uniform-random pick among the tier's slots (yielding a dupe) **only when every slot in the tier is already owned** — among that family's catalog variants (二回目 `isLocation` variants always excluded from this pick), OR (二回目) select the deterministic location variant bound to the settled second-route position; and either persist a new row (`copies = 1`, provenance stamped) or increment `copies` on the existing row (mint a new individual per `add-neurons-dupe-fusion`). A pull MAY yield a dupe (only once its tier is fully owned, or in 二回目/past-both-routes dupe handling). The reveal SHALL fire only after commit.

If no `familyAccrual` row exists yet for the family (fresh save, or a sync-hydration race where the row has not yet been applied), the pull transaction SHALL **lazily seed** a default zero-initialized `familyAccrual` row (`ap = 0`, `firedToday = false`, `lastFireDate = null`, `unlockedSlots = []`, `sameDayCorrect = 0`, `pullCount = 0`) for that family **inside the same transaction** before incrementing `pullCount`, rather than failing the pull. The lazy-seed path SHALL be robust regardless of effect / hydration ordering, so a family's first auto-pull is never dropped.

#### Scenario: A settle triggers exactly one pull for that family

- **GIVEN** family F's accumulated energy reaches the settle threshold at cumulative index N
- **WHEN** the settle resolves
- **THEN** `cost(N)` energy is consumed from family F's pool
- **AND** exactly one `pullVariant` runs for F (first route: roll a tier then fill-missing-first within that tier; 二回目: the deterministic location variant for the settled second-route position), persisting a new row or `copies` increment
- **AND** the reveal fires only after the transaction commits

#### Scenario: Pull on a family with no pre-existing accrual row lazily seeds the row

- **GIVEN** family F has no `familyAccrual` row yet (fresh save, or a sync-hydration race where the row has not been applied)
- **WHEN** a settle-triggered `pullVariant` runs for F
- **THEN** the system SHALL lazily seed a default `familyAccrual` row for F (`ap = 0`, `pullCount = 0`, `unlockedSlots = []`) inside the pull transaction
- **AND** the pull SHALL proceed, increment `pullCount` to 1, and persist the minted variant + individual
- **AND** the pull SHALL NOT error out or drop the variant

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
