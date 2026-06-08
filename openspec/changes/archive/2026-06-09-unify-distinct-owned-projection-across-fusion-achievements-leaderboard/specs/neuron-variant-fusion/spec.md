## ADDED Requirements

### Requirement: `ownedSlotCount` SHALL be the single canonical「distinct-owned」 projection

A shared pure helper `ownedSlotCount(db): number` SHALL be defined as the canonical projection for「the player's currently-owned distinct variant count」. The projection SHALL return the number of `neuronVariants` rows where at least one `neuronInstances` row exists for that `(familyId, slotIndex)` with `consumedAt == null` (i.e. at least one held individual).

Every downstream consumer that surfaces a「distinct-owned」 count to the player or to the cloud SHALL read through this projection rather than `db.neuronVariants.count()` directly. Initial consumers (pinned by their own capability spec deltas) are:

- the `🧬 X 隻` chip in `CollectionPage` / `OverviewPage` (this capability)
- the collection-milestone achievement stat `variantCount` (`neurons-achievements`)
- the leaderboard upsert payload field `variant_count` (`neurons-leaderboard`)

Any future consumer added by a new change SHALL also read through `ownedSlotCount`. Reading `db.neuronVariants.count()` directly for any「distinct-owned」 display or sync purpose SHALL be considered a regression.

The lifetime mint counter `neuronVariants.copies` is unchanged by this requirement: it remains a monotonic non-decreasing per-slot field for catalog / sync-merge purposes, and continues to be the correct source for「has this player ever pulled this slot」 catalog-level questions. The split is: `copies` answers「ever-minted (catalog history)」; `ownedSlotCount` answers「currently-held (active collection)」.

#### Scenario: Helper counts only slots with at least one held instance

- **GIVEN** a player whose Dexie state has three `neuronVariants` rows: A with 2 held individuals, B with 1 held + 1 consumed, C with 0 held + 2 consumed (a ghost slot)
- **WHEN** `ownedSlotCount(db)` is computed
- **THEN** it SHALL return 2 (A and B both have ≥ 1 held individual; C is excluded despite having a `neuronVariants` row)

#### Scenario: Helper is referenced by every downstream consumer

- **GIVEN** the chip / achievement-stat / leaderboard-payload code paths
- **WHEN** any of them produces a「distinct-owned」 value
- **THEN** that value SHALL be sourced from `ownedSlotCount(db)` (directly or via a single intermediate that wraps it)
- **AND** none of them SHALL re-derive the count from `db.neuronVariants.count()` or `db.neuronVariants.toArray().length` independently

## MODIFIED Requirements

### Requirement: Last-copy protection SHALL keep at least one individual per owned slot

A promote SHALL only consume individuals that are **surplus** — for every `(familyId, slotIndex)` the system SHALL keep at least one held individual. The eligible-to-consume pool for a tier `T` SHALL be the held individuals at tier `T` minus the protected first individual of each `T` slot. The default SHALL be to keep all individuals; promotion SHALL be entirely player-initiated.

**Cross-device limitation (acknowledged).** Last-copy protection is enforced per-device at promote time. Two devices starting from the same `(2 held individuals at one slot)` snapshot can each promote-consume one individual (each device locally thinking the other individual is the kept one). After the consumed monotonic-OR merge in the R2 bundle (per the existing fusion sync requirement), the slot can converge to **0 held individuals while the `neuronVariants` row still exists with monotonic `copies ≥ 2`** — a「ghost slot」. The cross-device race cannot be cheaply prevented without a synchronous claim protocol; instead, every downstream「distinct-owned」 consumer (chip / achievement / leaderboard) SHALL read through the canonical `ownedSlotCount` projection (this capability) so a ghost slot does NOT inflate any user-visible or cloud-visible count.

The system SHALL NOT auto-purge ghost slot `neuronVariants` rows. The lifetime `copies` field intentionally retains its monotonic semantics for catalog-history purposes; the row stays as a「once held, currently empty」 marker. A future change MAY surface a「ghost slot」 indicator in the collection view; this capability does NOT require one.

#### Scenario: The sole individual of a slot is never consumable

- **GIVEN** a family with exactly one held P4 individual at slot a and two held P4 individuals at slot b
- **WHEN** the eligible-to-consume P4 pool is computed
- **THEN** it SHALL contain exactly one individual (the surplus copy of slot b)
- **AND** the sole individual of slot a SHALL NOT be eligible

#### Scenario: Cross-device promote race produces a ghost slot but no inflated count

- **GIVEN** both devices share starting state for slot `(藥理學, 2)`: 2 held P4 individuals `I1` and `I2`, with `neuronVariants.copies = 2`
- **WHEN** device A promotes consuming `I1` (locally `I2` is the kept individual) and device B promotes consuming `I2` (locally `I1` is the kept individual) before either pushes
- **AND** both bundles round-trip through the consumed monotonic-OR merge
- **THEN** both `I1.consumedAt` and `I2.consumedAt` SHALL be set (the slot is a ghost slot)
- **AND** the `neuronVariants` row SHALL remain with `copies = 2` (monotonic lifetime count unchanged)
- **AND** `ownedSlotCount(db)` SHALL exclude this ghost slot from its return value
- **AND** the chip / achievement-stat `variantCount` / leaderboard `variant_count` SHALL all reflect the ghost-corrected count after next sync push, ticking down by exactly 1 from the pre-race value
