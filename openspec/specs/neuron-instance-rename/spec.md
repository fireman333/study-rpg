# neuron-instance-rename Specification

## Purpose

Per-instance custom nicknames for neurons-tw. Each collected neuron individual (a `neuronInstances` row from the dupe-fusion individual layer) can be given a player-chosen nickname on the `/collection` 個體 view, displayed alongside its persona identity (nickname primary, `persona · rarity` subtitle). Nicknames live in a dedicated Dexie store `instanceNicknames` (schema version 14, keyed by the device-stable `instanceId`) and sync cross-device via per-row last-write-wins on `updatedAt` — mutable + clearable, so a cleared nickname is an empty-string row with a fresh `updatedAt` (not a deleted row), which propagates the clear without a delete-vs-LWW resurrection. The individuals view opens for any owned slot (including singletons) so every neuron is renamable. Tier-promote (dupe-fusion) is unchanged: a consumed individual's nickname row is inert because the collection renders only held individuals and `consumedAt` is monotonic. Created by archiving change `add-neurons-instance-rename`.

## Requirements

### Requirement: Players SHALL be able to name, rename, and clear a custom nickname per held neuron individual

The collection view SHALL provide an affordance to assign a custom nickname to any
**held individual** (`neuronInstances` row with `consumedAt === null`), identified by
its `instanceId`. The player SHALL be able to change the nickname or clear it. A
cleared nickname SHALL be represented as an empty string with a fresh `updatedAt`
(not a deleted row), so the clear action propagates cross-device under last-write-wins.
Nicknames are private: there SHALL be NO uniqueness, NFKC, or content-filter constraint.
The nickname SHALL be trimmed and length-capped on input.

#### Scenario: Assign a nickname to a held individual
- **WHEN** the player opens the individuals view for an owned slot and submits a non-empty nickname for a held individual
- **THEN** an `instanceNicknames` row keyed by that `instanceId` is persisted with the trimmed nickname and a current `updatedAt`
- **AND** the individual immediately re-renders showing the nickname (live query)

#### Scenario: Clear a nickname falls back to persona
- **WHEN** the player clears (empties) the nickname of a previously-named individual
- **THEN** the stored nickname becomes an empty string with a fresh `updatedAt`
- **AND** the individual re-renders showing only its persona identity (no nickname)

#### Scenario: Every held individual is renamable, including singletons
- **WHEN** an owned slot has exactly one held individual
- **THEN** the individuals view is still reachable for that slot
- **AND** that single individual exposes the rename affordance

### Requirement: A named individual SHALL display its nickname alongside its persona identity

When a held individual has a non-empty nickname, the collection view SHALL show the
nickname as the primary label and the persona identity (`persona · rarity` — the slot's
existing `displayName`) as a secondary sub-label. An individual without a nickname SHALL
display only its persona identity, unchanged from prior behavior. The slot card header
SHALL continue to show the slot persona name and SHALL NOT be replaced by any nickname.

#### Scenario: Named individual shows nickname primary + persona subtitle
- **WHEN** a held individual has nickname "小藍"
- **THEN** the individual renders "小藍" as the primary label and its `persona · rarity` as a secondary sub-label

#### Scenario: Unnamed individual unchanged
- **WHEN** a held individual has no nickname (no row, or empty-string row)
- **THEN** the individual renders only its persona identity, with no nickname element

### Requirement: Instance nicknames SHALL persist locally and sync cross-device via last-write-wins

Nicknames SHALL be stored in a dedicated Dexie store `instanceNicknames` (additive in
schema version 14; no existing store's primary key changes). The cross-device sync
adapter SHALL resolve per row by last-write-wins on `updatedAt` (mirroring the
`questionFlags` adapter) and SHALL be additive to the R2 bundle (`SCHEMA_VERSION` 12 → 13)
with reader tolerance: an older client SHALL drop the unknown bundle key without error,
and a newer client reading an older bundle SHALL preserve local nicknames (omission ≠ clear).
Nicknames SHALL NOT be merged with monotonic semantics (they are mutable).

#### Scenario: Newer edit wins across devices
- **WHEN** device A and device B both hold an `instanceNicknames` row for the same `instanceId` and B's `updatedAt` is greater
- **THEN** after sync both devices converge to B's nickname value

#### Scenario: Schema-version forward tolerance
- **WHEN** a schema-version-12 client pulls a schema-version-13 bundle containing `instanceNicknames`
- **THEN** the client drops the unknown key and does not error
- **AND** a schema-version-13 client reading a schema-version-12 bundle (no `instanceNicknames` key) preserves its local nicknames rather than clearing them

#### Scenario: v13 → v14 upgrade is additive and lossless
- **WHEN** an existing client at Dexie version 13 opens at version 14
- **THEN** the open succeeds without a DatabaseClosedError
- **AND** the new empty `instanceNicknames` store exists and all prior data is intact

### Requirement: Tier-promote SHALL be unaffected by nicknames and a consumed individual's nickname SHALL NOT be displayed

Tier-promote (dupe-fusion) eligibility and consumption logic SHALL NOT be changed by the
presence of nicknames. A nickname row for an individual that has been consumed
(`consumedAt !== null`) SHALL NOT be displayed anywhere (the collection view renders only
held individuals), and SHALL NOT be hard-deleted (avoiding a delete-vs-LWW resurrection),
so it simply becomes inert data referencing a monotonically-consumed individual.

#### Scenario: Fusion behavior unchanged by nicknames
- **WHEN** a family has held individuals of a rarity tier, some of which carry nicknames
- **THEN** `eligibleForTier` and `promoteTier` ignore nicknames entirely — the fusable pool (the tier's full held set) and the dupes-first consume order are computed from `neuronInstances` only

#### Scenario: Consumed individual's nickname is inert
- **WHEN** a named individual is consumed by a tier-promote (its `consumedAt` is set)
- **THEN** the individual no longer appears in the collection view
- **AND** its `instanceNicknames` row is retained but never rendered (referencing a consumed individual)
