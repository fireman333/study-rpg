## MODIFIED Requirements

### Requirement: Tier-promote SHALL be unaffected by nicknames and a consumed individual's nickname SHALL NOT be displayed

Tier-promote (dupe-fusion) eligibility and consumption logic SHALL NOT be changed by the
presence of nicknames. A nickname row for an individual that has been consumed
(`consumedAt !== null`) SHALL NOT be displayed anywhere (the collection view renders only
held individuals), and SHALL NOT be hard-deleted (avoiding a delete-vs-LWW resurrection),
so it simply becomes inert data referencing a monotonically-consumed individual.

#### Scenario: Fusion behavior unchanged by nicknames
- **WHEN** a family has surplus (duplicate) individuals of a rarity tier, some of which carry nicknames
- **THEN** `eligibleSurplusByTier` and `promoteTier` ignore nicknames entirely — the surplus pool (duplicates beyond the protected oldest-per-slot) is computed from `neuronInstances` only

#### Scenario: Consumed individual's nickname is inert
- **WHEN** a named individual is consumed by a tier-promote (its `consumedAt` is set)
- **THEN** the individual no longer appears in the collection view
- **AND** its `instanceNicknames` row is retained but never rendered (referencing a consumed individual)
