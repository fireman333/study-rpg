# neurons-maze-second-lap Specification

## Purpose

The 二回目 (second lap) extension to the neurons brain-maze: once a family's first route is fully lit, that family automatically enters a second, longer committed route that reaches new crossing positions the first route never visited. Each second-lap settle deterministically unlocks the **location variant** bound to that position (no rarity roll), rendered procedurally as the family's base sprite with a position-keyed hue/filter — zero new sprite assets. The catalog total grows past 110, computed from the single `NEURON_VARIANT_TOTAL` export.

## Requirements

### Requirement: A family SHALL enter 二回目 (second lap) automatically on full first-route completion

When a family's cumulative settle count reaches its first-route node count (`settles ≥ firstRouteNodeCount`, currently 10), that family SHALL automatically be in **二回目** state. No player action, button, or confirmation SHALL gate entry — it reuses the existing implicit `settles ≥ nodeCount` boundary. The transition SHALL be derivable purely from `maze:<familyId>:settles` (no new persisted flag).

#### Scenario: Family auto-enters second lap when first route is fully lit

- **WHEN** family F reaches `settles = firstRouteNodeCount`
- **THEN** F is in 二回目 state with no player action required
- **AND** the state is computed from `settles` alone (no new stored flag)

#### Scenario: First-route families are unaffected

- **WHEN** family F has `settles < firstRouteNodeCount`
- **THEN** F is on its first route and behaves exactly as before this change

### Requirement: Each family SHALL have a second longer committed route reaching new node positions

The build-time maze graph SHALL emit, per family, a **second route** that continues past the first route through additional crossing cells the first route never visited, committed into `grid-graph.json`. The second route SHALL be longer than the first and SHALL add `K ≥ 1` new node positions per family (`K` = the extra crossings the route naturally reaches, bounded by a sane per-family upper bound). Runtime SHALL perform ZERO route generation — it SHALL only consume the committed second route (the project "runtime does not regenerate the grid" invariant holds). Each family's second route MAY have a different shape and `K` (asymmetric across the 11 families).

#### Scenario: Second route is committed at build time

- **WHEN** the maze graph generator runs
- **THEN** each family entry in `grid-graph.json` carries a second-route polyline plus its new node cells (slot indices ≥ firstRouteNodeCount)
- **AND** runtime parses but never regenerates these

#### Scenario: Second route reaches positions the first route did not

- **WHEN** a family's second route is generated
- **THEN** its new node cells are crossing cells not occupied by that family's first-route nodes
- **AND** the second route's total arc length exceeds the first route's

### Requirement: Second-lap settles SHALL deterministically unlock the position's location variant

While a family is in 二回目, each settle at second-route node index `i` SHALL deterministically unlock the location variant bound to that position — `(familyId, secondRouteSlotIndex)` → exactly that variant — instead of rolling a random within-tier gacha. First-route settles (`settles < firstRouteNodeCount`) SHALL keep their existing random-within-tier pull behavior unchanged. The deterministic unlock SHALL still be the only pull path (triggered by settle, cost-gated by the existing `nodeCost(N)` ramp) and SHALL emit a reveal. A second-lap settle whose position variant is already owned SHALL behave per the existing dupe handling (mint a new individual / increment copies).

#### Scenario: Second-lap settle unlocks the position's specific variant

- **WHEN** family F is in 二回目 and a settle resolves at second-route node index `i`
- **THEN** the variant bound to `(F, firstRouteNodeCount + i)` is unlocked deterministically (no rarity roll)
- **AND** the existing `nodeCost(N)` energy is consumed and a reveal fires after commit

#### Scenario: First-route random gacha is unchanged

- **WHEN** family F has `settles < firstRouteNodeCount`
- **THEN** the settle rolls a random within-tier variant exactly as before (P0 soft-pity intact)

#### Scenario: Already-owned position variant follows dupe handling

- **WHEN** a second-lap settle reaches a position whose location variant is already owned
- **THEN** it mints a new individual / increments copies per the existing dupe rules (no dead-end)

### Requirement: Location variants SHALL be rendered procedurally with no new sprite asset

A location variant's visual SHALL be the family's base sprite with a position-keyed hue/filter shift derived from its location, layered via the existing context-art component (`neurons-variant-context-art`). The change SHALL add ZERO new sprite asset files. The hue/filter SHALL be deterministic from `(familyId, location)` so a second device renders identically.

#### Scenario: Location variant reuses base sprite with a derived hue/filter

- **WHEN** a location variant is displayed (reveal, dex, maze)
- **THEN** it renders the family's base sprite with a deterministic hue/filter keyed by its location
- **AND** no new sprite file is shipped for it

### Requirement: Second-lap scale SHALL be bounded but maximized

The number of new location variants per family SHALL be as many as the family's second route naturally reaches, subject to a documented sane per-family upper bound (chosen against visual density). The catalog total SHALL therefore exceed 110, and the total SHALL be computed from the catalog via the single `NEURON_VARIANT_TOTAL` export (no hard-coded literal in consumers).

#### Scenario: Catalog total derives from the catalog, not a literal

- **WHEN** the expanded catalog ships
- **THEN** `NEURON_VARIANT_TOTAL` reflects the new total (> 110)
- **AND** every collection denominator reads that export rather than a hard-coded 110
