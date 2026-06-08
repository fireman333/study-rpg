## MODIFIED Requirements

### Requirement: `ownedSlotCount` SHALL be the single canonical「distinct-owned」 projection

A shared pure helper `ownedSlotCount(db): number` SHALL be defined as the canonical projection for「the player's currently-owned distinct variant count」. The projection SHALL return the number of `neuronVariants` rows where at least one `neuronInstances` row exists for that `(familyId, slotIndex)` with `consumedAt == null` (i.e. at least one held individual).

A **per-family** variant of the same projection SHALL also be canonical: `ownedSlotCountForFamily(db, familyId): number` (family-scoped read) and its pure core `computeOwnedSlotCountByFamily(variants, instances): Map<familyId, count>` SHALL return, for a family, the number of that family's `neuronVariants` slots with at least one held individual. Both the global and per-family projections SHALL derive from the same「a slot is owned ⟺ ≥ 1 `neuronInstances` row with `consumedAt == null` exists for it」 core, so a ghost slot is excluded identically whether counted globally or per family. The per-family projection is the canonical answer for any per-family「distinct-owned」 display; re-deriving a per-family owned count from `db.neuronVariants.where('familyId').equals(...).count()` or from `neuronVariants` row filtering is the per-family form of the same regression.

Every downstream consumer that surfaces a「distinct-owned」 count to the player or to the cloud SHALL read through the global or per-family projection (as appropriate) rather than `db.neuronVariants.count()` directly. Pinned consumers are:

- the global `🧬 X 隻` chip in `CollectionPage` / `OverviewPage` (global projection)
- the collection-milestone achievement stat `variantCount` (`neurons-achievements`, global projection)
- the leaderboard upsert payload field `variant_count` (`neurons-leaderboard`, global projection)
- the character-card `變體收集` stat `variantCount` in `buildCharacterCardPayload` (global projection)
- the variant share-card preview count in `ShareCardModal` / `loadVariantShareState` (global projection)
- the per-family `🧬 X 隻` chips in `CollectionPage` and `VariantCollectionChip` (per-family projection)

Any future consumer added by a new change SHALL also read through the appropriate projection. Reading `db.neuronVariants.count()` (globally) or `db.neuronVariants.where('familyId')…count()` / `neuronVariants` row filtering (per family) directly for any「distinct-owned」 display or sync purpose SHALL be considered a regression.

The lifetime mint counter `neuronVariants.copies` is unchanged by this requirement: it remains a monotonic non-decreasing per-slot field for catalog / sync-merge purposes, and continues to be the correct source for「has this player ever pulled this slot」 catalog-level questions. The split is: `copies` answers「ever-minted (catalog history)」; the `ownedSlotCount` family answers「currently-held (active collection)」. Card-render surfaces that are NOT a distinct-owned count — e.g. `pickBranchRepresentatives` and `familiesComplete` on the character card — MAY continue to read raw `neuronVariants` rows; this requirement constrains only「distinct-owned」 counts.

#### Scenario: Helper counts only slots with at least one held instance

- **GIVEN** a player whose Dexie state has three `neuronVariants` rows: A with 2 held individuals, B with 1 held + 1 consumed, C with 0 held + 2 consumed (a ghost slot)
- **WHEN** `ownedSlotCount(db)` is computed
- **THEN** it SHALL return 2 (A and B both have ≥ 1 held individual; C is excluded despite having a `neuronVariants` row)

#### Scenario: Per-family projection excludes a family's ghost slot

- **GIVEN** a family with two `neuronVariants` slots: one with ≥ 1 held individual and one ghost slot (every individual consumed)
- **WHEN** `ownedSlotCountForFamily(db, familyId)` (or `computeOwnedSlotCountByFamily` for that family) is computed
- **THEN** it SHALL return 1 for that family, NOT 2
- **AND** the per-family `🧬 X 隻` chip SHALL reflect 1

#### Scenario: Helper is referenced by every downstream consumer

- **GIVEN** the chip / achievement-stat / leaderboard-payload / character-card / variant-share-card code paths
- **WHEN** any of them produces a「distinct-owned」 value
- **THEN** that value SHALL be sourced from `ownedSlotCount(db)` or `ownedSlotCountForFamily(db, familyId)` (directly or via a single intermediate that wraps one of them)
- **AND** none of them SHALL re-derive the count from `db.neuronVariants.count()`, `db.neuronVariants.where('familyId')…count()`, or `db.neuronVariants.toArray().length` independently
