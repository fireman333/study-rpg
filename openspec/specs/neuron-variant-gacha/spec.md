# neuron-variant-gacha Specification

## Purpose

AP-slot-driven variant collection for neurons-mode. Subscribes to `connectome.variantSlotUnlocked` events from `connectome-collection`, rolls a P1-P5 rarity per slot (with slot-4 P3 / slot-5 P2 pity floors via deterministic reroll), persists the result in a `neuronVariants` Dexie table with composite PK `(familyId, slotIndex)`, surfaces a modal+toast reveal, and powers a `🧬 X / 5` collection chip on each family card. Closed cap = 11 families × 5 slots = 55 lifetime variants — Pokédex-style progression target. Backfills variants for already-unlocked slots silently on first boot post-upgrade. Borrowed pattern from 二階 `recruitment-gacha` per `neurons-mode` Req 5; no doctor/hospital semantics.
## Requirements
### Requirement: Core SHALL expose `rollGachaWithFloor` generic helper without breaking existing gacha / loot APIs

`packages/core/src/lib/gacha.ts` SHALL export a generic `rollGachaWithFloor(config, stats, floor, rerollCap, rng?)` function:

- `config: GachaConfig` — same shape as existing `rollGacha`
- `stats: GachaStats` — same shape; pity counter unused for this path (slot floor is the only pity-like mechanism, no rolls-since-rare counter)
- `floor: TierId | null` — null = no floor (degenerates to single-shot `rollGacha`); non-null = enforce floor
- `rerollCap: number` — max reroll attempts before force-sample (callers pass `5`)
- `rng?` — optional injectable RNG for testability

The existing `rollGacha(config, stats, rng?)` signature, return shape `{ tier, wasPity, newStats }`, and behaviour SHALL remain identical. The existing `loot.ts` public API (`rollLoot`, `rollRarity`, `DEFAULT_RARITY_WEIGHTS`, `PITY_SR_THRESHOLD`, `PITY_SSR_THRESHOLD`, `initialLootStats`) SHALL remain unchanged. `packages/core/` SHALL remain content-agnostic — `rollGachaWithFloor` SHALL NOT reference `'P1'..'P5'` or `'家醫科'` or any content-domain literal.

#### Scenario: Existing rollGacha signature unchanged

- **GIVEN** any pre-existing caller of `rollGacha(config, stats)` from `recruitment-gacha` or 一階 loot
- **WHEN** the gacha refactor is applied
- **THEN** the function signature SHALL be unchanged
- **AND** the return shape `{ tier, wasPity, newStats }` SHALL be unchanged
- **AND** the rarity distribution SHALL be statistically identical (chi-square comparison over 10k rolls, p > 0.05)

#### Scenario: rollGachaWithFloor delegates to rollGacha when floor is null

- **GIVEN** `floor = null`
- **WHEN** `rollGachaWithFloor(config, stats, null, 5, rng)` is called
- **THEN** the return value SHALL equal `rollGacha(config, stats, rng)` (same tier outcome for identical PRNG, `wasPity` flag preserved from inner call)
- **AND** no reroll SHALL occur

#### Scenario: rollGachaWithFloor returns floor tier after exhausting reroll budget

- **GIVEN** `floor = 'P2'`, `rerollCap = 5`, PRNG sequence produces 5 consecutive tiers below P2
- **WHEN** `rollGachaWithFloor` is called
- **THEN** after 5 rerolls, the function SHALL force-sample from the `'P2'` tier
- **AND** the returned `wasPity` flag SHALL be `true`

#### Scenario: Force-sampled result keeps stats consistent with the returned tier

- **GIVEN** `floor = 'P2'`, `rerollCap = 5`, all 5 PRNG attempts produce tiers below P2 (so the function force-samples at P2)
- **WHEN** `rollGachaWithFloor` returns
- **THEN** the returned `newStats.rollsSinceLast['P2']` SHALL equal `0` (force-sample at floor is treated as a hit for stats purposes)
- **AND** `newStats.rollsSinceLast` for every tier with rank ≤ floor's rank SHALL equal `0`
- **AND** `newStats.rollsSinceLast` for every tier with rank > floor's rank (e.g. `'P1'` when floor is `'P2'`) SHALL carry forward the pre-force-sample increment from the last reroll (force-sampling P2 does NOT clear the P1 counter)
- **AND** `newStats.totalRolls` SHALL equal the input `stats.totalRolls + rerollCap` (each reroll counted)

### Requirement: Variant SHALL be persisted in `neuronVariants` Dexie table with composite primary key `(familyId, slotIndex)`

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

### Requirement: Content pack SHALL export a default variant-title mapping per rarity tier

The package SHALL export `DEFAULT_VARIANT_TITLE_BY_RARITY: Record<Rarity, string>`
covering `P0..P5`, used to compose the persisted `displayName` as
`"<catalog.displayName> · <title>"`. The mapping SHALL include a P0 title (e.g.
`始源核`) in addition to the existing P1–P5 titles.

#### Scenario: Mapping is complete for all six tiers

- **WHEN** a consumer imports `DEFAULT_VARIANT_TITLE_BY_RARITY`
- **THEN** it SHALL contain entries for `P0`, `P1`, `P2`, `P3`, `P4`, `P5`
- **AND** `DEFAULT_VARIANT_TITLE_BY_RARITY.P0` SHALL be a non-empty string

### Requirement: Unlock reveal SHALL surface both a modal and a toast, sourced from the motion library

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

### Requirement: Connectome page family cards SHALL display collected-variant count

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

### Requirement: Each variant SHALL capture study-context provenance at mint time

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

### Requirement: Variants without provenance SHALL be treated as 元老 (傳承) individuals without any backfill write

Variants minted before this change have no `provenance`. The system SHALL treat `provenance === undefined` as a 元老 / 傳承 individual and SHALL NOT perform any migration write to backfill old rows (absence is the marker). For such rows the system SHALL derive a display date from the existing `rolledAt` and a subject from `familyId`, with no special tags.

#### Scenario: Pre-upgrade row renders as 元老 with no write

- **GIVEN** a `neuronVariant` row exists with `rolledAt` set and `provenance === undefined`
- **WHEN** the collection loads after upgrade
- **THEN** the row SHALL be treated as a 元老 individual
- **AND** no write SHALL be performed to that row to add provenance
- **AND** its caption SHALL derive the date from `rolledAt` and the subject from `familyId`

#### Scenario: New row is never a 元老 individual

- **GIVEN** a variant minted after this change with a populated `provenance`
- **WHEN** the collection loads
- **THEN** the variant SHALL NOT be treated as a 元老 individual

### Requirement: Dex card SHALL render a single-line birth caption derived from provenance

Each variant's dex card SHALL display exactly one birth caption line derived from its `provenance` (or the 元老 fallback when absent). The caption SHALL include the birth date and subject; the 救贖 and 里程碑 conditions SHALL be reflected inline in the same line. The caption SHALL NOT introduce a second line, chip cluster, or modal for provenance.

#### Scenario: Standard variant caption shows date, count, subject

- **GIVEN** a variant with `provenance = { bornAtISO: '2026-06-01', apAtUnlock: 10, wasRedemption: false, streakAtMint: 3 }` for `藥理學`
- **WHEN** its dex card renders
- **THEN** a single caption line SHALL show the birth date `2026-06-01`, the subject `藥理學`, and the answered-count milestone (`10`)

#### Scenario: 救贖 individual caption reflects the redemption inline

- **GIVEN** a variant with `provenance.wasRedemption === true`
- **WHEN** its dex card renders
- **THEN** the single caption line SHALL convey that the variant was born from answering a previously-wrong question

#### Scenario: 里程碑 individual caption reflects the streak inline

- **GIVEN** a variant flagged 里程碑 (`streakAtMint >= MILESTONE_STREAK_THRESHOLD`)
- **WHEN** its dex card renders
- **THEN** the single caption line SHALL convey the streak milestone

#### Scenario: 元老 individual caption uses the fallback form

- **GIVEN** a variant with `provenance === undefined`
- **WHEN** its dex card renders
- **THEN** the single caption line SHALL show the `rolledAt`-derived date + `familyId` subject + a 傳承/元老 marker, with no 救贖/里程碑 tags

### Requirement: Provenance SHALL be display-only and SHALL NOT affect any gacha mechanic

Provenance SHALL be read in this capability only by the caption renderer. The presence, absence, or contents of `provenance` SHALL NOT change rarity rolls, the `VARIANT_RARITY_WEIGHTS` distribution, slot rarity floors, the AP unlock ladder, the closed cap of 55, or any other gacha behavior. The shipped roll-and-persist path and its tests SHALL remain unchanged except for the additive provenance write.

#### Scenario: Rarity outcome is independent of provenance

- **GIVEN** two slot-1 unlocks with identical PRNG state but different provenance (one redemption, one not)
- **WHEN** each variant is rolled
- **THEN** both SHALL receive the same rarity (provenance does not influence the roll)

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

