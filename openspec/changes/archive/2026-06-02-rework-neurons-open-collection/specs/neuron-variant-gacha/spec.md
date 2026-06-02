## MODIFIED Requirements

### Requirement: Player SHALL initiate variant pulls per family by spending neural energy

The neurons mode SHALL expose a player-initiated `pullVariant(familyId)` action that
is the **only** mechanism producing `neuronVariants` rows. A pull SHALL require
balance ≥ `PULL_COST` (=20); otherwise it SHALL be rejected (no spend). A pull SHALL
NOT be gated on collection completeness — a fully-collected family is still pullable
(the result is necessarily a duplicate). On success, inside a single Dexie
transaction, the system SHALL: add `PULL_COST` to `neuralEnergySpent`, increment
`familyAccrual.pullCount`, roll a rarity tier (P0 soft-pity applied), **select a
variant within the rolled tier (uniform among that family's catalog variants of that
tier)**, and either persist a new row (`copies = 1`, provenance stamped) or increment
`copies` on the existing row. A pull MAY yield a dupe in any tier (no new-variant
guarantee beyond P0 pity; the dupe sink is a later phase `add-neurons-dupe-fusion`).
The reveal SHALL fire only after commit. There SHALL be NO slot-unlock subscriber and
NO manual ticket/fate-card roll path.

#### Scenario: Pull spends cost and yields a variant within the rolled tier

- **GIVEN** balance ≥ 20 and family `藥理學` not fully collected
- **WHEN** the player pulls `藥理學` and the rolled tier has two variants
- **THEN** `neuralEnergySpent` SHALL increase by 20, `familyAccrual['藥理學'].pullCount`
  SHALL increment by 1, and the result SHALL be one of that tier's two variants —
  either a new row (`copies = 1`) or a `copies` increment on an owned one

#### Scenario: Pull rejected when balance below cost

- **GIVEN** balance < 20
- **WHEN** a pull is attempted
- **THEN** no spend SHALL occur, no row/copies SHALL change, and the pull SHALL be a no-op

#### Scenario: Pull on a fully-collected family yields a dupe (no rejection)

- **GIVEN** all of `免疫學`'s variants are collected AND balance ≥ 20
- **WHEN** a pull is attempted for `免疫學`
- **THEN** the pull SHALL proceed (spend 20, `pullCount` +1) and resolve to a duplicate
  (`copies` increment on an existing row), with NO rejection and NO 全部收集 state

### Requirement: Connectome page family cards SHALL display collected-variant count

The connectome homepage family card SHALL render a `🧬 X 隻` chip, where `X` is the
count of `neuronVariants` rows for that `familyId`. The chip SHALL be a **pure count**
with no denominator — it SHALL NOT render `X / N`, a catalog total, a progress
indicator, or a celebratory `X === N` (gold / 🏆) full-collection state (those leak
the hidden cap). The chip SHALL update live via `useLiveQuery` and SHALL be visible
even when nothing is collected (`🧬 0 隻`).

#### Scenario: Chip reflects live pure count

- **GIVEN** the `neuronVariants` table contains 3 rows for `familyId='解剖學'`
- **WHEN** the connectome homepage renders
- **THEN** the 解剖學 card SHALL display `🧬 3 隻` (no denominator)

#### Scenario: Fully-collected family shows no celebratory or denominator state

- **GIVEN** all variants for `familyId='免疫學'` are collected
- **WHEN** the homepage renders
- **THEN** the chip SHALL render `🧬 <count> 隻` with no `/N`, no gold/🏆 accent, and no
  reward side-effect

#### Scenario: Empty family shows zero count

- **GIVEN** the `neuronVariants` table has no rows for `familyId='病理學'`
- **WHEN** the homepage renders
- **THEN** the 病理學 card SHALL display `🧬 0 隻`

### Requirement: Existing collection SHALL be fully reset on the Dexie v11 upgrade with no grandfather

The Dexie schema SHALL bump to **v12**. The v11→v12 `.upgrade()` callback SHALL clear
the `neuronVariants` table and reset every `familyAccrual` row's `unlockedSlots` to
`[]` and `pullCount` to `0` (so P0 pity restarts on the fresh collection). It SHALL
NOT change the `neuronVariants` primary key. Study progress (AP, synapses, mastery,
question history, bookmarks, achievements, `totalStudyMinutes`) **and the
neural-energy balance counters (`neuralEnergyEarned` / `neuralEnergySpent`)** SHALL be
preserved. There SHALL be NO grandfather logic and NO migration banner. A
`db-v11-to-v12-migration.test.ts` fixture (per the `dexie-fixture-lint` rule) SHALL
seed a v11 save and assert the reset + preservation split. (This is the third
collection reset; it is an owner-chosen clean slate, not a row-shape necessity.)

#### Scenario: v12 upgrade clears collection and resets pity, preserves study + energy

- **GIVEN** a v11 save with collected variants, non-zero AP, synapses, and a non-zero
  neural-energy balance
- **WHEN** the DB opens at v12
- **THEN** `neuronVariants` SHALL be empty and every `familyAccrual.pullCount` SHALL be `0`
- **AND** AP, synapses, mastery rows, and the `neuralEnergyEarned`/`neuralEnergySpent`
  counters SHALL be unchanged

#### Scenario: No banner or grandfather path

- **WHEN** an existing player opens the app after upgrade
- **THEN** no migration banner SHALL appear and no pre-upgrade variant SHALL survive
