# neuron-variant-gacha (delta) — Collection 2.0 Phase 2 spine

## REMOVED Requirements

### Requirement: Variant gacha SHALL subscribe to connectome variant-slot-unlock events as sole roll trigger

**Reason**: Variants are no longer produced by AP-threshold slot-unlock events.
Replaced by the player-initiated, currency-gated per-family pull (see ADDED
"Player SHALL initiate variant pulls per family by spending neural energy").

### Requirement: Slot 4 SHALL guarantee P3-or-better rarity floor, slot 5 SHALL guarantee P2-or-better floor, slots 1–3 SHALL have no floor

**Reason**: The slot-floor pity mechanism is removed with the slot-unlock model.
Pity is now the per-family **P0 soft-pity** (see ADDED "P0 apex tier SHALL exist per
family with a soft-pity ramp"). `SLOT_RARITY_FLOOR` / `VARIANT_REROLL_CAP` are
deleted from the content pack.

### Requirement: Existing pre-upgrade saves with already-unlocked AP slots SHALL be silently backfilled with variants on first boot after upgrade

**Reason**: The collection is **fully reset** on the v10 upgrade (no grandfather, no
backfill) — see ADDED "Existing collection SHALL be fully reset on the Dexie v10
upgrade with no grandfather".

## MODIFIED Requirements

### Requirement: Rarity weight distribution SHALL be a P0–P5 pyramid summing to 100

Each variant pull SHALL select a rarity tier from the canonical weight table:

| Tier | Weight |
|---|---|
| P5 拉完了 | 59 |
| P4 NPC | 25 |
| P3 人上人 | 10 |
| P2 頂級 | 4 |
| P1 夯 | 1.3 |
| P0 始源 | 0.7 |

The weights SHALL sum to exactly 100 and SHALL be exported as a single named
constant `VARIANT_RARITY_WEIGHTS` from `packages/content-neurons-tw/src/variants.ts`.
Dogfood balance SHALL be adjusted by editing only this constant. The base P0 weight
is further shaped by the P0 soft-pity requirement at roll time; when a family's P0 is
already owned the P0 weight SHALL be treated as 0 and its mass redistributed across
P1–P5 proportionally.

#### Scenario: Weight constant is exported and sums to 100

- **WHEN** a consumer imports `VARIANT_RARITY_WEIGHTS` from `@study-rpg/content-neurons-tw`
- **THEN** it SHALL contain all six tiers `P0..P5`
- **AND** the weights SHALL sum to exactly 100

#### Scenario: P0 excluded once the family's P0 is owned

- **GIVEN** a family whose P0 variant is already collected
- **WHEN** a pull rolls rarity for that family
- **THEN** P0 SHALL NOT be selectable and its base weight SHALL be redistributed
  across P1–P5 proportionally

### Requirement: Content pack SHALL ship a 66-entry `NEURON_VARIANT_CATALOG` with a fixed rarity per variant

The `@study-rpg/content-neurons-tw` package SHALL export `NEURON_VARIANT_CATALOG:
NeuronVariantDef[]` containing exactly **66 entries** = 11 families × 6 slot indices
(`slotIndex ∈ {0,1,2,3,4,5}`). Each entry SHALL have:

```typescript
interface NeuronVariantDef {
  familyId: string
  slotIndex: 0 | 1 | 2 | 3 | 4 | 5     // 0 = P0 apex (one per family)
  rarity: 'P0'|'P1'|'P2'|'P3'|'P4'|'P5' // FIXED per variant (Pokémon model)
  displayName: string
  spriteKey: string                     // 'variant:<familyId>:<slotIndex>'
  description: string
}
```

`rarity` SHALL equal `SLOT_RARITY[slotIndex]` where `SLOT_RARITY = {0:'P0', 1:'P5',
2:'P4', 3:'P3', 4:'P2', 5:'P1'}`. The catalog is the single source of truth for
variant `displayName` / `description` / `rarity`; the pull service reads from it.
The build-time `assertCatalogShape` guard SHALL enforce 66 entries, every
`(family, 0..5)` present, `rarity === SLOT_RARITY[slotIndex]`, and
`spriteKey === 'variant:' + familyId + ':' + slotIndex`.

#### Scenario: Catalog covers exactly 66 entries with fixed rarities

- **WHEN** a consumer imports `NEURON_VARIANT_CATALOG`
- **THEN** the array SHALL have length 66
- **AND** for every `(familyId, slotIndex ∈ {0..5})` there SHALL be exactly one entry
- **AND** each entry's `rarity` SHALL equal `SLOT_RARITY[slotIndex]`

#### Scenario: Each family has exactly one P0 variant

- **WHEN** the catalog is filtered to `rarity === 'P0'`
- **THEN** there SHALL be exactly 11 entries, one per family, each with `slotIndex === 0`

### Requirement: Content pack SHALL export a default variant-title mapping for all six rarity tiers

The package SHALL export `DEFAULT_VARIANT_TITLE_BY_RARITY: Record<Rarity, string>`
covering `P0..P5`, used to compose the persisted `displayName` as
`"<catalog.displayName> · <title>"`. The mapping SHALL include a P0 title (e.g.
`始源核`) in addition to the existing P1–P5 titles.

#### Scenario: Mapping is complete for all six tiers

- **WHEN** a consumer imports `DEFAULT_VARIANT_TITLE_BY_RARITY`
- **THEN** it SHALL contain entries for `P0`, `P1`, `P2`, `P3`, `P4`, `P5`
- **AND** `DEFAULT_VARIANT_TITLE_BY_RARITY.P0` SHALL be a non-empty string

### Requirement: Variant SHALL be persisted in `neuronVariants` with composite PK `(familyId, slotIndex)` and a `copies` count

The Dexie schema SHALL retain the composite primary key `[familyId, slotIndex]`
(NOT changed — Dexie cannot change a PK in an upgrade). `slotIndex` ranges `0..5`.
The row shape SHALL be:

```typescript
interface NeuronVariantRow {
  familyId: string
  slotIndex: number          // 0..5
  rarity: 'P0'|'P1'|'P2'|'P3'|'P4'|'P5'
  displayName: string
  spriteKey: string
  rolledAt: number
  copies: number             // ≥ 1; increments on a dupe pull (Phase 3 consumes)
  wasPityFloor: boolean      // repurposed: true iff a P0 obtained via soft-pity
  provenance?: NeuronVariantProvenance
}
```

`copies` is a non-indexed additive field (no `.stores()` index change). Row content
(`rarity`/`displayName`/`spriteKey`/`provenance`) is immutable after mint; only
`copies` mutates. The `.stores()` index string SHALL remain
`'[familyId+slotIndex], familyId, rolledAt'`.

#### Scenario: New variant persists with copies = 1

- **GIVEN** the player pulls a not-yet-owned `(familyId='藥理學', slotIndex=2)` (P4)
- **WHEN** the pull resolves
- **THEN** a row SHALL exist with `slotIndex=2`, `rarity='P4'`, `copies=1`, a composed
  `displayName`, the resolved `spriteKey`, and a `rolledAt` timestamp

#### Scenario: Dupe pull increments copies, never duplicates the row

- **GIVEN** a row exists for `(藥理學, 2)` with `copies=1`
- **WHEN** a pull resolves to the same `(藥理學, 2)`
- **THEN** the row's `copies` SHALL become 2
- **AND** the `neuronVariants` row count for that pair SHALL remain 1
- **AND** `rarity` / `displayName` / `rolledAt` SHALL be unchanged

### Requirement: Theme pack SHALL register 66 variant sprite keys plus terminal default

The `theme-pixel-neurons` `SPRITE_MAP` SHALL include `variant:<familyId>:<slotIndex>`
for every catalog entry (`slotIndex ∈ {0..5}`, 66 keys) plus the terminal
`variant:default` fallback. The 55 legacy keys (`slotIndex 1..5`) SHALL keep their
existing real PNGs. The 11 new P0 keys (`slotIndex 0`) MAY resolve to a placeholder
sprite in this phase (real P0 art is deferred to the roster-art phase); the lookup
SHALL never produce a broken image (falls back to `variant:default`).

#### Scenario: Every catalog key resolves

- **WHEN** the developer iterates all 66 `(familyId, slotIndex ∈ {0..5})` pairs
- **THEN** `SPRITE_MAP['variant:'+familyId+':'+slotIndex]` SHALL resolve to a
  non-empty URL for each, OR fall back to `variant:default` (never a broken image)

#### Scenario: P0 placeholder is acceptable this phase

- **WHEN** the developer reads a `variant:<familyId>:0` key
- **THEN** it MAY resolve to a placeholder sprite without failing the build

### Requirement: Pull reveal SHALL surface a modal and a toast, sourced from the motion library

When a pull resolves, the system SHALL render a `VariantUnlockModal` (full-screen,
dismiss-required) and push a toast onto the existing toast host. The modal SHALL show
the resolved sprite (`image-rendering: pixelated`), the family display name, the
variant's composed `displayName`, a rarity badge (P0–P5 label + tier name), a
duplicate indicator when the pull was a dupe (copy count / 碎片 hint), and a P0/pity
accent when applicable. The modal SHALL render only after the pull's Dexie
transaction commits. Timing constants SHALL be imported from the motion library
(no local `8000` / `0.3` literals). Reduced-motion SHALL degrade entry to opacity
fade. The slot-floor `保底` semantics are replaced: a `保底` marker SHALL appear iff
the variant is a P0 obtained via soft-pity (`wasPityFloor === true`).

#### Scenario: New-variant pull renders the reveal

- **GIVEN** a pull resolves to a new `(familyId='生理學', slotIndex=4, rarity='P2')`
- **WHEN** the reveal renders
- **THEN** the modal SHALL show the family name, composed `displayName`, the `P2 頂級`
  badge, and the pixelated sprite, with NO duplicate indicator

#### Scenario: Dupe pull reveal shows the duplicate indicator

- **GIVEN** a pull resolves to an already-owned variant (copies → 2)
- **WHEN** the reveal renders
- **THEN** the modal/toast SHALL convey the result is a duplicate (count / 碎片 hint)

#### Scenario: Toast auto-dismiss sources from the motion library

- **WHEN** the reveal toast component is audited for the literal `8000`
- **THEN** that literal SHALL NOT appear; the file SHALL import `TOAST_AUTO_DISMISS_MS`

### Requirement: Connectome page family cards SHALL display collected-variant count out of six

The connectome homepage family card SHALL render a `🧬 X / 6` chip, where `X` is the
count of `neuronVariants` rows for that `familyId` and 6 is the per-family tier count
(P0–P5). The chip SHALL update live via `useLiveQuery`. When `X === 6` the chip SHALL
render a celebratory variant (gold + 🏆) with no reward side-effect. The chip SHALL be
visible even when nothing is collected (`🧬 0 / 6`).

#### Scenario: Chip reflects live count out of six

- **GIVEN** the `neuronVariants` table contains 3 rows for `familyId='解剖學'`
- **WHEN** the connectome homepage renders
- **THEN** the 解剖學 card SHALL display `🧬 3 / 6`

#### Scenario: Full collection renders the celebratory chip

- **GIVEN** all 6 variants for `familyId='免疫學'` are collected
- **WHEN** the homepage renders
- **THEN** the chip SHALL render `🏆 6 / 6` with a gold accent and no reward fires

### Requirement: Each variant SHALL capture study-context provenance at pull time

When a `neuronVariants` row is created by a pull, the system SHALL stamp a
`provenance` object: `bornAtISO` (local date at pull), `apAtUnlock` (the family AP at
pull time — retained field name, now carries AP-at-pull), `wasRedemption` (always
`false` for pulls — pulls are not tied to a specific question), `streakAtMint`
(daily streak at pull). A variant minted while `streakAtMint >= MILESTONE_STREAK_THRESHOLD`
SHALL be a 里程碑 individual. Provenance SHALL be written in the same transaction as
the row and SHALL be immutable. Dupe pulls (no new row) SHALL NOT alter existing
provenance.

#### Scenario: Pull stamps provenance on a new variant

- **GIVEN** a pull mints a new variant while the player's streak is 3
- **WHEN** the row is created
- **THEN** `provenance` SHALL be `{ bornAtISO: <today>, apAtUnlock: <family AP>,
  wasRedemption: false, streakAtMint: 3 }` and it SHALL NOT be a 里程碑 individual

#### Scenario: Dupe pull does not rewrite provenance

- **GIVEN** a dupe pull increments `copies` on an existing row
- **WHEN** the pull resolves
- **THEN** the existing row's `provenance` SHALL be unchanged

### Requirement: Variant collection SHALL sync via the neurons R2 bundle with copies MAX-merge and cross-version tolerance

The variant collection SHALL sync via the neurons R2 bundle: variants ride inside the `neuronVariants` rows, and the bundle `SCHEMA_VERSION` SHALL bump from 8 to 9 (additive). The `neuronVariants` adapter
SHALL treat row identity `[familyId, slotIndex]` + content as immutable, and on
conflict SHALL resolve `copies = max(local, incoming)` and keep the earliest
`rolledAt` (a MONOTONIC carve-out — NOT LWW). Currency counters
(`neuralEnergyEarned` / `neuralEnergySpent`) and `familyAccrual.pullCount` SHALL sync
as monotonic MAX-merge values. Cross-version reads SHALL be tolerant
(`validateBundleMeta` already accepts `schema_version > SCHEMA_VERSION` and drops
unknown keys). The shared sync Worker is bundle-opaque and SHALL NOT change.

#### Scenario: copies MAX-merges across devices

- **GIVEN** device A has `(藥理學,2)` with `copies=3` and device B has `copies=1`
- **WHEN** the bundle round-trips
- **THEN** both SHALL converge to `copies=3` and the row content SHALL be unchanged

#### Scenario: v8 client tolerates a v9 bundle

- **GIVEN** a client at `SCHEMA_VERSION = 8` reads a bundle at version 9
- **WHEN** the bundle is validated
- **THEN** no error SHALL be raised and unknown currency keys SHALL be dropped

## ADDED Requirements

### Requirement: Study activity SHALL mint a neural-energy pull currency

The neurons mode SHALL maintain a single study-gated currency, **neural energy**,
persisted as two monotonic meta counters `neuralEnergyEarned` and
`neuralEnergySpent`; the spendable **balance = earned − spent** (derived, never
negative, never persisted). The faucet SHALL be: **+`CORRECT_ANSWER_ENERGY` (=3)**
per correct answer (awarded inside `recordCorrectAnswer`'s transaction) and
**+`READING_MINUTE_ENERGY` (=2)** per accrued reading minute (awarded in the
reading-timer minute side-effect). There SHALL be **no real-money** path. The
constants SHALL live in `content-neurons-tw` as the single source of truth. Both
counters SHALL sync via the `counters.ts` MAX-merge post-pass.

#### Scenario: Correct answer mints energy

- **GIVEN** the player's `neuralEnergyEarned` is `E`
- **WHEN** the player answers a question correctly
- **THEN** `neuralEnergyEarned` SHALL become `E + 3`

#### Scenario: Reading minute mints energy

- **GIVEN** the reading timer accrues one full minute
- **THEN** `neuralEnergyEarned` SHALL increase by 2

#### Scenario: Balance is earned minus spent and never negative

- **GIVEN** `neuralEnergyEarned = 50` and `neuralEnergySpent = 40`
- **WHEN** the balance is read
- **THEN** it SHALL be `10`

### Requirement: Player SHALL initiate variant pulls per family by spending neural energy

The neurons mode SHALL expose a player-initiated `pullVariant(familyId)` action that
is the **only** mechanism producing `neuronVariants` rows. A pull SHALL require
balance ≥ `PULL_COST` (=20) and that the family is not fully collected; otherwise it
SHALL be rejected (no spend). On success, inside a single Dexie transaction, the
system SHALL: add `PULL_COST` to `neuralEnergySpent`, increment
`familyAccrual.pullCount`, roll a rarity (P0 soft-pity applied), resolve the
`(familyId, rarity)` catalog variant, and either persist a new row (`copies = 1`,
provenance stamped) or increment `copies` on the existing row. The reveal SHALL fire
only after commit. There SHALL be NO slot-unlock subscriber and NO manual ticket/
fate-card roll path.

#### Scenario: Pull spends cost and yields a variant

- **GIVEN** balance ≥ 20 and family `藥理學` not fully collected
- **WHEN** the player pulls `藥理學`
- **THEN** `neuralEnergySpent` SHALL increase by 20, `familyAccrual['藥理學'].pullCount`
  SHALL increment by 1, and either a new variant row SHALL be created or an existing
  row's `copies` SHALL increment

#### Scenario: Pull rejected when balance below cost

- **GIVEN** balance < 20
- **WHEN** a pull is attempted
- **THEN** no spend SHALL occur, no row/copies SHALL change, and the pull SHALL be a no-op

#### Scenario: Pull rejected when family fully collected

- **GIVEN** all 6 variants for `免疫學` are collected
- **WHEN** a pull is attempted for `免疫學`
- **THEN** the pull SHALL be rejected with no spend (UI surfaces a 全部收集 state)

### Requirement: P0 apex tier SHALL exist per family with a soft-pity ramp

Each family SHALL have exactly one **P0** super-rare variant (`slotIndex = 0`). The
effective P0 probability per pull SHALL be
`clamp(P0_BASE_RATE + max(0, pullCount − P0_PITY_START) * P0_PITY_RAMP, 0, 1)` with
`P0_BASE_RATE = 0.007`, `P0_PITY_START = 40`, `P0_PITY_RAMP = 0.05` (per-family
`pullCount`). Past the pity start the rate ramps so P0 is near-guaranteed by
~pull 60. Once the family's P0 is owned, P0 SHALL be excluded from rolls. A P0
obtained while the pity ramp is active SHALL set `wasPityFloor = true` on its row.

#### Scenario: P0 base rate at low pull counts

- **GIVEN** `pullCount = 1` and P0 not owned
- **WHEN** the effective P0 rate is computed
- **THEN** it SHALL be ≈ 0.007 (0.7%)

#### Scenario: Soft pity ramps P0 toward certainty

- **GIVEN** `pullCount = 60` and P0 not owned
- **WHEN** the effective P0 rate is computed
- **THEN** it SHALL be ≥ 0.99 (near-guaranteed)

### Requirement: Existing collection SHALL be fully reset on the Dexie v10 upgrade with no grandfather

The Dexie schema SHALL bump to **v10**. The v9→v10 `.upgrade()` callback SHALL clear
the `neuronVariants` table, reset every `familyAccrual` row's `unlockedSlots` to `[]`
and `pullCount` to `0`, and initialize `neuralEnergyEarned` / `neuralEnergySpent` to
`'0'`. It SHALL NOT change the `neuronVariants` primary key. Study progress (AP,
synapses, mastery, question history, bookmarks, achievements, `totalStudyMinutes`)
SHALL be preserved. There SHALL be NO grandfather logic and NO migration banner. A
`db-v9-to-v10-migration.test.ts` fixture (per the `dexie-fixture-lint` rule) SHALL
seed a v9 save and assert the reset + preservation.

#### Scenario: v10 upgrade clears collection and inits currency, preserves study

- **GIVEN** a v9 save with collected variants, non-zero AP, and synapses
- **WHEN** the DB opens at v10
- **THEN** `neuronVariants` SHALL be empty, `neuralEnergyEarned`/`neuralEnergySpent`
  SHALL be `'0'`, every `familyAccrual.pullCount` SHALL be `0`
- **AND** AP, synapses, and mastery rows SHALL be unchanged

#### Scenario: No banner or grandfather path

- **WHEN** an existing player opens the app after upgrade
- **THEN** no migration banner SHALL appear and no pre-upgrade variant SHALL survive
