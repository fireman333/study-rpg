# neuron-variant-gacha Specification

## Purpose

Player-initiated, currency-gated variant collection for neurons-mode. Study (correct answers + reading minutes) mints neural energy; the player spends it on a per-family `pullVariant` that rolls a P0–P5 pyramid rarity (explicit per-catalog-entry rarity; P0 apex via soft-pity, excluded once owned), persists the result in a `neuronVariants` Dexie table with composite PK `(familyId, slotIndex)`, and surfaces a modal+toast reveal. Open collection — pulling never disables on completion (a fully-collected family yields a dupe, `copies + 1`), and family cards show a pure-count `🧬 X 隻` chip with no denominator and no celebratory full-collection state (the finite catalog total is hidden from the player). Borrowed pattern from 二階 `recruitment-gacha` per `neurons-mode` Req 5; no doctor/hospital semantics.
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
(NOT changed — Dexie cannot change a PK in an upgrade). `slotIndex` ranges `0..N-1`
where `N` is the family's pyramid total (variants the catalog declares for that
family); **slot 0 SHALL remain the family's P0 apex**. The row shape SHALL be:

```typescript
interface NeuronVariantRow {
  familyId: string
  slotIndex: number          // 0..N-1 (unique within family; 0 = P0 apex)
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

### Requirement: Variant rarity SHALL be an explicit per-variant property decoupled from slot index

`NeuronVariantDef.rarity` SHALL be an **explicit field authored per catalog entry**,
NOT derived from `slotIndex`. `slotIndex` SHALL be a within-family unique index
`0..N-1` whose only fixed meaning is **slot 0 = the family's P0 apex**; it SHALL NOT
encode the rarity tier. The `SLOT_RARITY` map SHALL NOT be used as the rarity source
(a family may declare multiple variants sharing the same tier). The catalog remains
the single source of truth for variant `displayName` / `description` / `rarity`.

#### Scenario: Two variants of the same family share a tier with distinct slot indices

- **GIVEN** family `藥理學` declares two `P5` variants
- **WHEN** the catalog is inspected
- **THEN** both SHALL have `rarity === 'P5'` with distinct `slotIndex` values, and
  neither rarity SHALL be inferred from `slotIndex`

#### Scenario: Slot 0 remains the P0 apex

- **WHEN** any family's `slotIndex === 0` entry is read
- **THEN** its `rarity` SHALL be `'P0'`

### Requirement: Content pack SHALL ship a per-family pyramid `NEURON_VARIANT_CATALOG` with an explicit rarity per variant

The `@study-rpg/content-neurons-tw` package SHALL export `NEURON_VARIANT_CATALOG:
NeuronVariantDef[]` shaped as a **per-family rarity pyramid**: each family declares a
variable number of variants per tier, with rising rarity holding fewer variants and
exactly one P0 apex (`slotIndex = 0`) per family. The catalog SHALL currently ship
**110 variants = 11 families × 10 slots** (uniform per family:
P0×1 / P1×1 / P2×2 / P3×2 / P4×2 / P5×2). Each entry SHALL have:

```typescript
interface NeuronVariantDef {
  familyId: string
  slotIndex: number                     // 0..N-1 unique within family; 0 = P0 apex
  rarity: 'P0'|'P1'|'P2'|'P3'|'P4'|'P5' // EXPLICIT per variant (not derived)
  displayName: string
  spriteKey: string                     // 'variant:<familyId>:<slotIndex>'
  description: string
}
```

A build-time `assertCatalogShape` guard SHALL enforce: every family has exactly one
P0 at `slotIndex === 0`; `slotIndex` values are contiguous `0..N-1` and unique within
each family; `rarity ∈ {P0..P5}`; rising rarity holds no more variants than the tier
below it (pyramid invariant); and `spriteKey === 'variant:' + familyId + ':' + slotIndex`.

#### Scenario: Catalog is a per-family pyramid with one P0 apex each

- **WHEN** a consumer imports `NEURON_VARIANT_CATALOG`
- **THEN** every family SHALL have exactly one `rarity === 'P0'` entry at `slotIndex === 0`
- **AND** within each family, for every adjacent rarity pair the rarer tier SHALL
  declare no more variants than the commoner tier (pyramid invariant)
- **AND** each family's `slotIndex` values SHALL be contiguous `0..N-1` and unique

#### Scenario: Catalog ships 110 variants across 11 families of 10 slots each

- **WHEN** a consumer imports `NEURON_VARIANT_CATALOG`
- **THEN** `NEURON_VARIANT_CATALOG` SHALL contain exactly 110 entries
- **AND** every family SHALL declare exactly 10 variants (`VARIANT_COUNT_BY_FAMILY[f] === 10`)
- **AND** each family's per-tier counts SHALL be `P0×1 / P1×1 / P2×2 / P3×2 / P4×2 / P5×2`
- **AND** each family's `slotIndex` values SHALL be contiguous `0..9`

#### Scenario: Rarity is read from the explicit field, not the slot index

- **GIVEN** a family with two `P5` variants at `slotIndex` 1 and 2
- **WHEN** the pull service resolves a variant's rarity
- **THEN** it SHALL read the entry's explicit `rarity` field, not `SLOT_RARITY[slotIndex]`

### Requirement: Theme pack SHALL register one variant sprite key per catalog entry plus terminal default

The `theme-pixel-neurons` `SPRITE_MAP` SHALL include `variant:<familyId>:<slotIndex>`
for **every** catalog entry (one key per pyramid slot) plus the terminal
`variant:default` fallback. All 110 keys (`slotIndex 0..9` per family) SHALL resolve to
**real art** PNGs: the 77 keys shipped before this change (`slotIndex 0..6`) keep their
existing PNGs, and the 33 new keys (`slotIndex 7 / 8 / 9`) SHALL each ship a real PNG
in this change (no placeholders). The terminal `variant:default` remains as a defensive
fallback so the lookup SHALL never produce a broken image.

#### Scenario: Every catalog key resolves to real art

- **WHEN** the developer iterates all `(familyId, slotIndex)` pairs in the catalog
- **THEN** `SPRITE_MAP['variant:'+familyId+':'+slotIndex]` SHALL resolve to a non-empty
  real-art URL for each (the `variant:default` fallback SHALL be unused in practice)

#### Scenario: P0 keys resolve to real art

- **WHEN** the developer reads a `variant:<familyId>:0` key
- **THEN** it SHALL resolve to a real (non-placeholder) P0 sprite PNG

### Requirement: Variant collection SHALL sync via the neurons R2 bundle with copies MAX-merge and cross-version tolerance

The variant collection SHALL sync via the neurons R2 bundle: variants ride inside the `neuronVariants` rows, and the bundle `SCHEMA_VERSION` SHALL bump from 9 to 10 (additive). The `neuronVariants` adapter
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

#### Scenario: v9 client tolerates a v10 bundle

- **GIVEN** a client at `SCHEMA_VERSION = 9` reads a bundle at version 10
- **WHEN** the bundle is validated
- **THEN** no error SHALL be raised and unknown keys SHALL be dropped

### Requirement: Study activity SHALL mint a neural-energy pull currency

The neurons mode SHALL maintain a study-gated **neural energy** currency partitioned **per NT branch** (DA / 5HT / GABA / Glu), persisted as per-branch monotonic meta counters `maze:<branch>:earned` (and a per-branch consumed view via settle count). The faucet SHALL be: **+`CORRECT_ANSWER_ENERGY` (=3)** per correct answer, accrued into the branch of the answered subject resolved via `FAMILY_NT_BRANCH` (awarded in/after `recordCorrectAnswer`); and **+`READING_MINUTE_ENERGY` (=2)** per accrued reading minute, split evenly across the four branch pools. Per-branch energy SHALL be the maze exploration fuel and is consumed at node settle (per `neurons-brain-maze`), NOT spent on a player-initiated pull. There SHALL be **no real-money** path. The faucet constants SHALL live in `content-neurons-tw` as the single source of truth. Per-branch `earned` counters SHALL sync via the `counters.ts` MAX-merge post-pass. The legacy single global `neuralEnergyEarned/neuralEnergySpent` balance (whose only sink was the removed manual pull) is retired; its meta keys MAY remain present but unused (reader-tolerant) for rollback safety.

#### Scenario: Correct answer mints energy into the subject's branch

- **GIVEN** the player answers a question correctly in subject S
- **WHEN** the energy faucet runs
- **THEN** `maze:<FAMILY_NT_BRANCH[S]>:earned` SHALL increase by `CORRECT_ANSWER_ENERGY` (=3)
- **AND** no other branch's earned counter SHALL change from that event

#### Scenario: Reading minute mints energy across branches

- **GIVEN** the reading timer accrues one full minute
- **THEN** `READING_MINUTE_ENERGY` (=2) SHALL be split evenly across the four branch `earned` counters

#### Scenario: No global manual-pull balance remains in use

- **WHEN** the player studies
- **THEN** energy is accrued only into per-branch maze fuel
- **AND** no spendable global balance gates a player-initiated pull (the manual pull is removed)

### Requirement: Variant pulls SHALL be triggered by maze node settle as the only pull path

The neurons mode SHALL produce `neuronVariants` rows **only** via the maze settle cadence (per `neurons-brain-maze`), which is a continuous pull-cadence gate (not a finite one-pull-per-node budget): each cumulative settle index `N` in a branch consumes `cost(N)` energy from the branch pool and triggers exactly one `pullVariant`. The pull's target family SHALL be the lit node's `MazeNode.familyId` while the branch has fogged nodes, and the branch's least-collected family (weighted toward unowned slots) once all the branch's nodes are lit (二週目) — so the random long tail converges toward completion and never dead-ends. There SHALL be no player-initiated pull button, no slot-unlock subscriber, and no manual ticket/fate-card pull path. The pull itself SHALL NOT deduct a separate flat currency (the per-branch energy consumed at the settle is the cost). On success, inside a single Dexie transaction, the system SHALL increment `familyAccrual.pullCount`, roll a rarity tier (P0 soft-pity applied), select a variant uniformly within the rolled tier among that family's catalog variants, and either persist a new row (`copies = 1`, provenance stamped) or increment `copies` on the existing row (mint a new individual per `add-neurons-dupe-fusion`). A pull MAY yield a dupe in any tier (dupes feed `add-neurons-dupe-fusion`). The reveal SHALL fire only after commit.

#### Scenario: A settle triggers exactly one pull for the resolved family

- **GIVEN** branch B's accumulated energy reaches the settle threshold at cumulative index N
- **WHEN** the settle resolves
- **THEN** `cost(N)` energy is consumed from branch B's pool
- **AND** exactly one `pullVariant` runs for the resolved family (lit node's family pre-completion; B's least-collected family in 二週目), rolling a tier and persisting a new row or `copies` increment
- **AND** the reveal fires only after the transaction commits

#### Scenario: Pull cost is the consumed maze energy, not a flat currency

- **WHEN** a settle-triggered pull runs
- **THEN** no separate flat `PULL_COST` is deducted (the consumed per-branch `cost(N)` energy was the cost)

#### Scenario: No player-initiated pull path exists

- **WHEN** the player is on the `/collection` page
- **THEN** there SHALL be no pull button and no energy-balance HUD (the page is the dex + tier-promote/fusion surface only)
- **AND** the only mechanism creating `neuronVariants` rows is the maze node settle

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

