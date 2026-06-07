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

### Requirement: Family second-lap completion SHALL play a one-time celebration animation

When a family's brain-maze (including its second lap) becomes fully lit during play — i.e. that family's frontier `target` transitions from non-null to `null` (`settles` reaches the family's full node count) — the system SHALL play a one-time celebration animation in the homepage maze band. The celebration SHALL be a non-blocking overlay (`pointer-events: none`) composed from the existing motion-library primitives (an expanding celebration halo + a particle burst at spectacle intensity) and SHALL NOT block, delay, or alter maze interaction, reconciliation, or any reward. The celebration SHALL respect `prefers-reduced-motion`: when reduced motion is set, the animated burst SHALL be omitted and the family's lit nodes SHALL remain visible as a static completed end-state.

The celebration SHALL trigger only on the live non-null → null transition observed within the session (an "event"), NOT merely on observing `target === null` (a persistent "state"), so that a family already complete at mount time does not re-celebrate.

#### Scenario: Live completion triggers the celebration

- **WHEN** a family's `target` transitions from non-null to `null` during play (its maze, including second lap, becomes fully lit)
- **AND** that family has not previously been marked celebrated
- **THEN** the homepage maze band plays one celebration animation (halo + particle burst) as a non-blocking overlay
- **AND** the celebration does not block or delay maze reconciliation, pulls, or rewards

#### Scenario: Already-complete family at mount does not celebrate

- **WHEN** the homepage mounts and a family's `target` is already `null` (completed in a prior session) and that family is already marked celebrated
- **THEN** no celebration plays for that family

#### Scenario: Reduced-motion degrades to a static completed end-state

- **WHEN** the user has `prefers-reduced-motion: reduce` set
- **AND** a family completes during play
- **THEN** the animated halo / particle burst SHALL be omitted
- **AND** the family's lit nodes SHALL remain visible as a static completed end-state

### Requirement: Second-lap completion celebration SHALL fire at most once per family across sessions and devices (synced one-shot)

The system SHALL persist a per-family "celebrated" marker so the completion celebration fires at most once per family. The marker SHALL be synced (carried in the cloud-sync surface) so that a family celebrated on one device SHALL NOT re-celebrate on another device or in a later session. The marker SHALL be additive to the sync surface and MUST NOT require a Dexie schema (`.version()`) bump. Pre-existing players SHALL NOT have already-completed families retroactively celebrated on upgrade (no backfill); only families that complete live after this change ships SHALL celebrate.

#### Scenario: Celebration does not replay in a later session on the same device

- **WHEN** a family was celebrated in a prior session
- **AND** the player reopens the app
- **THEN** that family does not celebrate again

#### Scenario: Celebration does not replay on a second device

- **WHEN** a family was celebrated on device A and its marker has synced
- **AND** the player opens the app on device B where the family's maze is already complete
- **THEN** that family does not celebrate on device B

#### Scenario: No retroactive backfill on upgrade

- **WHEN** an existing player who already completed one or more families upgrades to this change
- **THEN** no celebration fires for those already-completed families on upgrade
- **AND** a celebration fires only when a family completes live thereafter
