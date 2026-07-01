# neuron-variant-fusion Specification

## Purpose

Give the neurons-mode energy axis a meaningful end-point for duplicate neurons. Today `neuron-variant-gacha` is open-collection (always pullable, dupes accumulate as `neuronVariants.copies`) and dupes have no use or collection value (the "dupe black hole"). This capability turns each duplicate into an **individual** (Pikmin Bloom style — every copy is its own row in a new `neuronInstances` table, with its own birth-context art) that the player may **keep** (collection value) or **selectively fuse** via tier-promote (consume K same-rarity surplus individuals → mint one higher-tier individual). It introduces no new currency, does not change rarity rolls, does not change the `neuronVariants` primary key or the pyramid model, and is purely additive at the data layer (new table + additive R2 bundle field). Scope excludes AP→mastery (`#2`), maze-as-home (`#3`), cosmetic energy sinks, and any non-fusion acquisition of context-art.

## Requirements

### Requirement: Each pull SHALL mint an individual in a new `neuronInstances` table

Every `pullVariant` and `mintVariantSlot` result (new variant OR dupe) SHALL, in the same Dexie transaction that writes `neuronVariants`, insert one row into a new `neuronInstances` table. The `neuronVariants` table SHALL retain its composite primary key `(familyId, slotIndex)` and its `copies` field, where `copies` retains its existing **monotonic lifetime-mint-count** semantics (incremented on every mint for that slot, never decremented — so its R2 MAX-merge sync remains valid). The "current owned individual count" SHALL be DERIVED from `neuronInstances` (rows with `consumedAt == null`), NOT from `copies`.

The instance row shape SHALL be:

```ts
interface NeuronInstanceRow {
  instanceId: string        // device-stable, immutable, generated at mint
  familyId: string
  slotIndex: number
  rarity: VariantRarity
  spriteKey: string
  rolledAt: number          // this individual's own birth instant
  provenance?: NeuronVariantProvenance  // this individual's own birth context (軸B art)
  consumedAt: number | null // null = held; set once when consumed by a promote (soft-delete)
}
```

`instanceId` SHALL be a device-stable string (e.g. `${familyId}:${slotIndex}:${rolledAt}:${rand}`) — NOT a Dexie `++id` auto-increment (auto-increment collides across devices under sync).

#### Scenario: New variant pull mints a slot row and an individual

- **GIVEN** the player owns no `(藥理學, 2)` variant
- **WHEN** a pull resolves to `(藥理學, 2)` rarity P4
- **THEN** a `neuronVariants` row SHALL exist for `(藥理學, 2)` with `copies = 1`
- **AND** exactly one `neuronInstances` row SHALL exist for `(藥理學, 2)` with `consumedAt = null` and its own `rolledAt` + `provenance`

#### Scenario: Dupe pull increments copies AND mints a second individual

- **GIVEN** a `neuronVariants` row for `(藥理學, 2)` with `copies = 1` and one held instance
- **WHEN** a dupe pull resolves to `(藥理學, 2)`
- **THEN** the `neuronVariants` row `copies` SHALL become 2 (still one `neuronVariants` row)
- **AND** a SECOND `neuronInstances` row SHALL exist for `(藥理學, 2)`, with its own distinct `instanceId`, `rolledAt`, and `provenance`
- **AND** the two individuals SHALL be able to render different context-art (different brainwave band / decor field)

### Requirement: Dexie SHALL bump to v13 adding `neuronInstances`, expanding existing copies into individuals

The Dexie schema SHALL add `this.version(13)` with the new store `neuronInstances: 'instanceId, familyId, slotIndex, rarity, consumedAt'` (all existing stores and their index strings unchanged — no primary-key change to any existing table). The v13 upgrade callback SHALL, for each existing `neuronVariants` row with `copies = N ≥ 1`, generate N instance rows: the first SHALL inherit that row's existing `provenance` and `rolledAt`; the remaining N−1 SHALL have synthetic `instanceId`s, `provenance = undefined` (rendered as 元老 / 傳承, consistent with existing absent-provenance handling), and `rolledAt = row.rolledAt`. The upgrade SHALL NOT reset the collection, SHALL NOT reset neural energy, and SHALL NOT show a migration banner.

A v12→v13 upgrade fixture SHALL exist (per `docs/DEXIE_UPGRADE_FIXTURE_RULE.md`) that seeds a v12 database (including at least one `neuronVariants` row with `copies = 3`), reopens at v13, and asserts the expansion.

#### Scenario: v12→v13 expands a copies=3 row into 3 individuals

- **GIVEN** a v12 database with a `neuronVariants` row `(藥理學, 2)` `copies = 3` carrying a `provenance`
- **WHEN** the database is reopened at v13
- **THEN** the open SHALL succeed with no `DatabaseClosedError`
- **AND** `neuronInstances` SHALL contain exactly 3 rows for `(藥理學, 2)`, all `consumedAt = null`
- **AND** exactly one of them SHALL carry the original `provenance`; the other two SHALL have `provenance = undefined`

#### Scenario: v13 upgrade preserves study progress and energy

- **GIVEN** a v12 database with non-zero `neuralEnergyEarned`, family AP, mastery, and question history
- **WHEN** the database is reopened at v13
- **THEN** `neuralEnergyEarned`, `neuralEnergySpent`, family AP, mastery, and question history SHALL be unchanged

### Requirement: Player SHALL be able to tier-promote by consuming K same-rarity surplus individuals

The system SHALL offer an opt-in **tier-promote** action: consume K held (`consumedAt == null`) SURPLUS (duplicate) individuals of the same `rarity` tier `T` within one family → mint one new individual of the next-rarer tier `T−1` in that same family. K SHALL be a single tunable constant (default `3`). Fusion consumes **duplicates only**: the eligible-to-consume pool for a tier `T` SHALL be the held individuals at tier `T` minus the protected oldest individual of each `T` slot (see the last-copy-protection requirement). The count surfaced to the player (the fusion button numerator) SHALL be this duplicate surplus, NOT the total held — the button and the tooltip SHALL make clear it counts duplicates.

The promote SHALL prefer an **unowned** `T−1` slot in the family; if every `T−1` slot is already owned, it SHALL mint a new individual of an already-owned `T−1` slot (a valid dupe individual under open-collection). Promotion of the rarest tier (P0) SHALL be unavailable (no `T−1`). The promote SHALL NOT spend neural energy and SHALL NOT introduce any new currency.

Consuming an individual SHALL set its `consumedAt` (soft-delete) rather than deleting the row; `neuronVariants.copies` SHALL NOT be decremented (it is a lifetime-mint count). The minted higher-tier individual SHALL go through the existing mint path (emit `variantRolled` reveal, stamp provenance, fire achievement / leaderboard / connectome hooks).

#### Scenario: Promote consumes 3 surplus P4 individuals and mints a P3 individual

- **GIVEN** a family with ≥ K held P4 SURPLUS individuals (duplicates beyond one-per-slot) and at least one unowned P3 slot
- **WHEN** the player promotes at that P4 tier (K = 3)
- **THEN** exactly 3 surplus P4 individuals SHALL have `consumedAt` set (never a slot's protected copy)
- **AND** one new P3 individual SHALL be minted for a previously-unowned P3 slot in that family, `consumedAt = null`
- **AND** the reveal modal/toast SHALL fire for the minted P3

#### Scenario: Promote target falls back to a dupe individual when the tier is full

- **GIVEN** a family whose every P3 slot is already owned, and ≥ K held P4 surplus individuals
- **WHEN** the player promotes at the P4 tier
- **THEN** a new P3 individual SHALL be minted for an already-owned P3 slot (a dupe individual)

#### Scenario: P0 cannot be promoted

- **GIVEN** any number of held P0 individuals
- **WHEN** the player views promote options at the P0 tier
- **THEN** no promote action SHALL be offered for P0

#### Scenario: Promote is unavailable below the K threshold

- **GIVEN** a family whose surplus pool at a tier holds fewer than K individuals
- **WHEN** the player views that tier
- **THEN** the promote action SHALL be disabled with a reason indicating insufficient surplus

### Requirement: Last-copy protection SHALL keep at least one individual per owned slot

A promote SHALL only consume individuals that are **surplus** — for every `(familyId, slotIndex)` the system SHALL keep at least one held individual. The eligible-to-consume pool for a tier `T` SHALL be the held individuals at tier `T` minus the protected oldest individual of each `T` slot. Fusion therefore never destroys the sole held copy of a distinct variant single-device. The default SHALL be to keep all individuals; promotion SHALL be entirely player-initiated.

**Cross-device limitation (acknowledged).** Last-copy protection is enforced per-device at promote time. Two devices starting from the same `(2 held individuals at one slot)` snapshot can each promote-consume one individual (each device locally thinking the other is the kept one). After the consumed monotonic-OR merge in the R2 bundle, the slot can converge to **0 held individuals while the `neuronVariants` row still exists with monotonic `copies ≥ 2`** — a「ghost slot」. The cross-device race cannot be cheaply prevented without a synchronous claim protocol; instead every downstream「distinct-owned」 consumer reads through the canonical `ownedSlotCount` projection so a ghost slot does NOT inflate any user-visible or cloud-visible count, and the collection view does not render a card for it.

The system SHALL NOT auto-purge ghost slot `neuronVariants` rows. The lifetime `copies` field intentionally retains its monotonic semantics for catalog-history purposes; the row stays as a「once held, currently empty」 marker.

#### Scenario: The sole individual of a slot is never consumable

- **GIVEN** a family with exactly one held P4 individual at slot a and three held P4 individuals at slot b
- **WHEN** the eligible-to-consume P4 pool is computed
- **THEN** it SHALL contain exactly two individuals (the surplus copies of slot b)
- **AND** the sole individual of slot a SHALL NOT be eligible

#### Scenario: Individuals spread one-per-slot yield zero surplus

- **GIVEN** a family holds P4 individuals each in a DISTINCT P4 slot (one per slot)
- **WHEN** the surplus pool at the P4 tier is computed
- **THEN** it SHALL be empty (every copy is a protected last copy)
- **AND** the promote action SHALL be disabled

#### Scenario: Cross-device promote race produces a ghost slot but no inflated count

- **GIVEN** both devices share starting state for slot `(藥理學, 2)`: 2 held P4 individuals `I1` and `I2`, with `neuronVariants.copies = 2`
- **WHEN** device A promotes consuming `I1` and device B promotes consuming `I2` before either pushes
- **AND** both bundles round-trip through the consumed monotonic-OR merge
- **THEN** both `I1.consumedAt` and `I2.consumedAt` SHALL be set (the slot is a ghost slot)
- **AND** the `neuronVariants` row SHALL remain with `copies = 2` (monotonic lifetime count unchanged)
- **AND** `ownedSlotCount(db)` SHALL exclude this ghost slot from its return value

### Requirement: The fusion UI SHALL prominently indicate that only duplicates are consumed

The collection view's fusion surface SHALL render a prominent, always-visible hint (not merely a tooltip) stating that fusion consumes only DUPLICATE individuals and that the first copy of each variant is always kept. Each tier's promote button label SHALL count the duplicate surplus explicitly (e.g.「T→T−1（重複 N/K）」) so the number cannot be mistaken for the total held count. The button tooltip SHALL restate the cost and the keep-one rule.

#### Scenario: The duplicates-only hint is shown whenever fusion is offered

- **GIVEN** a family with ≥ 1 surplus (duplicate) individual at some tier
- **WHEN** the family section renders its fusion surface
- **THEN** a prominent hint SHALL state that only duplicates are fused and one copy of each variant is kept
- **AND** each tier button's numerator SHALL be that tier's duplicate surplus, labelled as duplicates (not total held)

#### Scenario: A tier with holdings but no duplicates offers no enabled fusion

- **GIVEN** a family holds individuals of a tier but zero duplicates (one per slot)
- **WHEN** the family section renders
- **THEN** no enabled fusion button SHALL be shown for that tier (surplus 0)

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

### Requirement: Individuals SHALL sync via the neurons R2 bundle with union + consumed monotonic-OR

`neuronInstances` SHALL be added to the neurons R2 bundle as an additive array key, and the bundle `SCHEMA_VERSION` SHALL bump by one (reader-tolerant: older clients drop the unknown key; newer clients reading an older bundle preserve local instances). The instances adapter SHALL merge by `instanceId` **union** (an instance present on either side is kept — individuals are immutable, mirroring the `dmnEventLog` monotonic-union discipline), and SHALL resolve `consumedAt` by **monotonic-OR** (once set on either side it stays set — mirroring `everWrong`). A consumed individual SHALL NOT resurrect across devices. The Worker SHALL require no change (bundle-opaque).

#### Scenario: An instance minted on one device appears on the other

- **GIVEN** device A mints individual `X` and device B has never seen `X`
- **WHEN** the bundle syncs both ways
- **THEN** both devices SHALL hold individual `X`

#### Scenario: A consumed individual stays consumed across devices

- **GIVEN** individual `X` is held on device B and consumed (promoted) on device A
- **WHEN** the bundle syncs both ways
- **THEN** both devices SHALL converge to `X.consumedAt` set (consumed), and `X` SHALL NOT reappear as held

#### Scenario: Older client tolerates the bumped bundle

- **GIVEN** a client at the previous bundle `SCHEMA_VERSION`
- **WHEN** it reads a bundle at the new `SCHEMA_VERSION` containing the `neuronInstances` key
- **THEN** it SHALL parse the bundle without error, dropping the unknown key

### Requirement: Collection view SHALL render individuals with per-instance context-art

The collection view SHALL render held individuals (`consumedAt == null`), grouped by family then slot, with each slot collapsible; each individual SHALL render its own context-art via `variantContextArt` computed from that individual's `provenance` + `rolledAt`. A **ghost slot** — a `neuronVariants` row with zero held individuals (every individual fused away) — SHALL NOT render a card, so the rendered cards match the family's distinct-owned `X 隻` chip. The `neuronVariants` row persists in the DB as catalog history; it simply stops rendering once nothing is held. The pure-count `🧬 X 隻` chip SHALL retain its existing **distinct-slot** semantics (X = number of owned `neuronVariants` slots with ≥ 1 held individual), with the total-individual count available as a secondary display. No denominator and no full-collection celebratory state SHALL be introduced (open-collection is preserved).

#### Scenario: Two individuals of one slot render distinct context-art

- **GIVEN** a slot with two held individuals minted at different times of day
- **WHEN** the slot is expanded in the collection view
- **THEN** both individuals SHALL render, each with its own brainwave-band letter / decor field

#### Scenario: A fully-fused-away slot stops rendering a card

- **GIVEN** a family slot whose every individual has been consumed by fusion (0 held, `neuronVariants` row still present)
- **WHEN** the family section renders
- **THEN** that slot SHALL NOT render a card
- **AND** the family's `🧬 X 隻` chip and the rendered card count SHALL agree

#### Scenario: The count chip stays distinct-slot

- **GIVEN** a family with 3 owned slots whose individuals total 7
- **WHEN** the family card chip renders
- **THEN** the `🧬 X 隻` chip SHALL show the distinct-slot count (3), not the individual total (7)

### Requirement: Promote SHALL surface in achievements and the leaderboard without a Worker schema change

The system SHALL track a monotonic promote counter and SHALL unlock achievements for the first promote and for promote-count milestones, and SHALL track the highest tier ever reached via promote. The leaderboard MAY surface the total held-individual count using existing leaderboard plumbing; any metric that would require a new D1 column SHALL be deferred to a follow-up change rather than introduced here.

#### Scenario: First promote unlocks an achievement

- **GIVEN** the player has never promoted
- **WHEN** the player completes their first tier-promote
- **THEN** a "first promote" achievement SHALL unlock

#### Scenario: Leaderboard metric needing a D1 column is deferred

- **GIVEN** a proposed leaderboard metric that requires a new D1 column
- **WHEN** scoping this change
- **THEN** that metric SHALL be deferred to a follow-up change (no D1 migration in this change)

### Requirement: Fusion SHALL NOT introduce currency or affect rarity rolls

Tier-promote and individuals SHALL be free of any monetary or new-currency path (per the loot-mechanics product principle) and SHALL NOT alter `VARIANT_RARITY_WEIGHTS`, the P0 soft-pity ramp, the rarity↔slot binding, or the pyramid invariant. The only inputs to a promote SHALL be held surplus individuals; the only outputs SHALL be `consumedAt` writes plus one minted individual.

#### Scenario: Promote does not touch energy or rarity weights

- **WHEN** any tier-promote is performed
- **THEN** `neuralEnergyEarned` and `neuralEnergySpent` SHALL be unchanged
- **AND** `VARIANT_RARITY_WEIGHTS` and the P0 soft-pity behaviour SHALL be unchanged
