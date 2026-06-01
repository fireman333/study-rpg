# neuron-variant-gacha Specification

## Purpose

AP-slot-driven variant collection for neurons-mode. Subscribes to `connectome.variantSlotUnlocked` events from `connectome-collection`, rolls a P1-P5 rarity per slot (with slot-4 P3 / slot-5 P2 pity floors via deterministic reroll), persists the result in a `neuronVariants` Dexie table with composite PK `(familyId, slotIndex)`, surfaces a modal+toast reveal, and powers a `🧬 X / 5` collection chip on each family card. Closed cap = 11 families × 5 slots = 55 lifetime variants — Pokédex-style progression target. Backfills variants for already-unlocked slots silently on first boot post-upgrade. Borrowed pattern from 二階 `recruitment-gacha` per `neurons-mode` Req 5; no doctor/hospital semantics.

## Requirements

### Requirement: Variant gacha SHALL subscribe to connectome variant-slot-unlock events as sole roll trigger

The neurons mode SHALL register a singleton subscriber against the `connectome-collection` event bus at app boot. The subscriber SHALL handle `connectome.variantSlotUnlocked` events as the **only** mechanism that produces new `neuronVariant` rows. The system SHALL NOT expose a manual roll button, a ticket-consume affordance, a fate-card grant path, or any other roll trigger.

Each event payload `{ familyId, slotIndex, apAtUnlock }` SHALL be processed in three phases:

1. **Idempotency guard**: read `db.neuronVariants.get([familyId, slotIndex])` — if a row already exists, return without rolling, persisting, or emitting UI
2. **Roll + persist**: roll rarity per the weight distribution + slot-floor requirements, compose displayName per the displayName requirement, write the row inside a single Dexie transaction
3. **Reveal**: emit modal+toast UI **only after** the Dexie transaction commits successfully

The subscriber SHALL NOT block the event bus — synchronous failure inside the handler SHALL be logged via `console.error` and SHALL NOT throw to the event emitter.

#### Scenario: First slot-unlock event creates a variant row and surfaces UI

- **GIVEN** the `neuronVariants` table contains no row for `(familyId='藥理學', slotIndex=1)`
- **WHEN** `connectome.variantSlotUnlocked` fires with payload `{ familyId: '藥理學', slotIndex: 1, apAtUnlock: 10 }`
- **THEN** the `neuronVariants` table SHALL contain a new row with `familyId='藥理學'`, `slotIndex=1`, a rolled `rarity ∈ {P1, P2, P3, P4, P5}`, a composed `displayName`, the resolved `spriteKey`, and a `rolledAt` timestamp
- **AND** `VariantUnlockModal` SHALL render with the new variant's details
- **AND** a toast SHALL push onto `ConnectomeToastHost`

#### Scenario: Duplicate event for already-filled slot is a no-op

- **GIVEN** the `neuronVariants` table already contains a row for `(familyId='藥理學', slotIndex=1)` with `rarity='P3'`, persisted at `rolledAt=T_prior`
- **WHEN** `connectome.variantSlotUnlocked` fires again with payload `{ familyId: '藥理學', slotIndex: 1, apAtUnlock: 10 }`
- **THEN** the existing row SHALL remain unchanged (no new `rolledAt`, no rarity reroll)
- **AND** no `VariantUnlockModal` SHALL render
- **AND** no toast SHALL fire
- **AND** the `neuronVariants` table row count SHALL NOT increase

#### Scenario: Subscriber failure does not crash event publisher

- **GIVEN** the subscriber handler encounters an unexpected error (e.g., transient Dexie quota exhaustion)
- **WHEN** the error is raised inside the handler
- **THEN** the error SHALL be caught and logged via `console.error`
- **AND** the connectome event publisher SHALL NOT receive a thrown exception
- **AND** the next event SHALL still be processed normally

### Requirement: Rarity weight distribution SHALL be P5/P4/P3/P2/P1 = 60/25/10/4/1

Each variant roll SHALL select a rarity tier from the canonical weight table summing to 100:

| Tier | Weight |
|---|---|
| P5 拉完了 | 60 |
| P4 NPC | 25 |
| P3 人上人 | 10 |
| P2 頂級 | 4 |
| P1 夯 | 1 |

The weight table SHALL be exported as a single named constant `VARIANT_RARITY_WEIGHTS` from `packages/content-neurons-tw/src/variants.ts`. Dogfood balance adjustments SHALL be performed by editing only this constant. This change SHALL NOT redeclare or fork the weight table inside `@study-rpg/core` — core's existing `rollGacha` helper consumes the content-pack-supplied weights.

#### Scenario: Weight constant is exported and matches the canonical distribution

- **WHEN** a consumer imports `VARIANT_RARITY_WEIGHTS` from `@study-rpg/content-neurons-tw`
- **THEN** the import SHALL be an array `[{id:'P5',weight:60},{id:'P4',weight:25},{id:'P3',weight:10},{id:'P2',weight:4},{id:'P1',weight:1}]` or an equivalent record `{P5:60,P4:25,P3:10,P2:4,P1:1}`
- **AND** the weights SHALL sum to exactly 100

#### Scenario: 10000-roll distribution within tolerance for slots 1-3 (no floor active)

- **GIVEN** a fresh `GachaStats` with no floor active and slot 1
- **WHEN** 10,000 rolls are simulated with a fixed PRNG seed
- **THEN** the P5 count SHALL fall within `[5800, 6200]` (60% ± 2%)
- **AND** the P1 count SHALL fall within `[80, 120]` (1% ± 0.2%)
- **AND** no other rarity SHALL appear

### Requirement: Slot 4 SHALL guarantee P3-or-better rarity floor, slot 5 SHALL guarantee P2-or-better floor, slots 1–3 SHALL have no floor

The neurons mode SHALL enforce a per-slot rarity floor:

| Slot index | Floor |
|---|---|
| 1, 2, 3 | none (pure-weight roll) |
| 4 | P3 (P3 / P2 / P1 acceptable) |
| 5 | P2 (P2 / P1 acceptable) |

The floor enforcement strategy SHALL mirror the `recruitment-gacha` targeted-ticket consume path: deterministic reroll up to `VARIANT_REROLL_CAP = 5` times against the canonical weight table; accept the first roll meeting the floor; if all 5 rerolls fail, force-sample uniformly from the floor tier. The floor mapping SHALL be exported as `SLOT_RARITY_FLOOR: Record<number, Rarity | null>` from `packages/content-neurons-tw/src/variants.ts`.

The persisted `neuronVariant.wasPityFloor` flag SHALL be `true` for every variant rolled on a slot whose `SLOT_RARITY_FLOOR` entry is non-null (slots 4 and 5), and `false` otherwise (slots 1, 2, 3). The flag is therefore a per-slot tag indicating that the floor mechanism was operative — not a per-roll indicator of whether reroll-or-force-sample actually fired. This shape is intentional: it keeps the UI 保底 chip semantically tied to the slot (and therefore predictable to the player who learns that slots 4/5 always carry the chip), rather than dependent on opaque RNG outcomes.

#### Scenario: Slot 4 roll that produces P4 on first attempt SHALL reroll until ≥ P3 or force P3

- **GIVEN** slot 4 with PRNG sequence producing P4, P4, P3 on attempts 1, 2, 3
- **WHEN** the variant is rolled
- **THEN** the accepted result SHALL be P3 (attempt 3)
- **AND** the persisted `rarity` SHALL equal `'P3'`
- **AND** `wasPityFloor` SHALL be `true` (rerolls occurred)

#### Scenario: Slot 4 first-attempt P3 result SHALL accept without reroll but still flag pity-floor

- **GIVEN** slot 4 with PRNG producing P3 on attempt 1
- **WHEN** the variant is rolled
- **THEN** the accepted result SHALL be P3
- **AND** `wasPityFloor` SHALL be `true` (slot has a floor and the result is at the floor tier — this signals the player that the floor was operative)

#### Scenario: Slot 5 all 5 rerolls below P2 forces P2 sample

- **GIVEN** slot 5 with PRNG producing P5, P4, P3, P5, P4 across 5 attempts
- **WHEN** the variant is rolled
- **THEN** after exhausting `VARIANT_REROLL_CAP = 5` attempts, the system SHALL force-sample uniformly from the P2 pool
- **AND** the persisted `rarity` SHALL equal `'P2'`
- **AND** `wasPityFloor` SHALL be `true`

#### Scenario: Slot 5 natural P1 on first attempt skips reroll

- **GIVEN** slot 5 with PRNG producing P1 on attempt 1
- **WHEN** the variant is rolled
- **THEN** the accepted result SHALL be P1
- **AND** `wasPityFloor` SHALL be `true` (P1 satisfies the P2 floor, but the floor mechanism is operative since slot 5 has a non-null floor)

#### Scenario: Slot 1 P5 roll SHALL accept and NOT flag pity-floor

- **GIVEN** slot 1 with PRNG producing P5 on attempt 1
- **WHEN** the variant is rolled
- **THEN** the accepted result SHALL be P5
- **AND** `wasPityFloor` SHALL be `false` (slot 1 has no floor)

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

### Requirement: Existing pre-upgrade saves with already-unlocked AP slots SHALL be silently backfilled with variants on first boot after upgrade

When this capability ships to a player whose Dexie save already contains `familyAccrual` rows with non-empty `unlockedSlots[]` arrays (i.e., AP threshold crossings that occurred before this change landed), the system SHALL retroactively roll + persist a variant for every such `(familyId, slotIndex)` pair on the first app boot post-upgrade.

The backfill SHALL:

- Run **silently** — NO `VariantUnlockModal` SHALL render and NO `VariantUnlockToast` SHALL push for any backfilled variant. The player MUST NOT see modal/toast spam for variants conceptually "already earned" before the upgrade
- Apply the same roll mechanics as a fresh unlock event: `rollGachaWithFloor` with `SLOT_RARITY_FLOOR[slotIndex]` enforcement, composed displayName, persisted `wasPityFloor` tag
- Use a sentinel `apAtUnlock = -1` value to mark backfilled rows (the historical AP value is not recoverable; `-1` signals "backfilled, not directly recorded")
- Be idempotent: if a `(familyId, slotIndex)` row already exists in `neuronVariants`, no reroll SHALL occur and no overwrite SHALL happen
- Fire-and-forget: backfill failures SHALL NOT block app boot or interfere with rendering

The backfill SHALL run AFTER `registerVariantGachaSubscriber` so that subsequent fresh unlock events follow the normal modal+toast reveal path. Backfill SHALL NOT register a second subscriber.

The connectome page family-card chip SHALL update to reflect backfilled variants in the same render cycle as fresh-unlock variants (live `useEffect` query).

#### Scenario: v2 save with 3 already-unlocked slots backfills 3 variants silently

- **GIVEN** a Dexie v2 → v3 upgraded save where `familyAccrual['藥理學'].unlockedSlots = [1, 2, 3]` and `neuronVariants` is empty
- **WHEN** the app boots and the content pack loads
- **THEN** 3 `neuronVariants` rows SHALL be created for `(藥理學, 1)`, `(藥理學, 2)`, `(藥理學, 3)`
- **AND** each row's `rarity` SHALL be a rolled value following the canonical weight distribution + slot-floor rules
- **AND** zero `VariantUnlockModal` SHALL render during backfill
- **AND** zero `VariantUnlockToast` SHALL push during backfill
- **AND** the 藥理學 family-card chip SHALL display `🧬 3 / 5` once initial render completes

#### Scenario: Mixed state — some variants already exist, others need backfill

- **GIVEN** a save where `familyAccrual['解剖學'].unlockedSlots = [1, 2, 3]` AND `neuronVariants` already contains a row for `(解剖學, 1)` (player crossed slot 1 after upgrade, before backfill ran in a prior boot)
- **WHEN** the app boots
- **THEN** 2 new rows SHALL be created for `(解剖學, 2)` and `(解剖學, 3)`
- **AND** the existing `(解剖學, 1)` row SHALL remain unchanged (idempotency)
- **AND** the family-card chip SHALL display `🧬 3 / 5`

#### Scenario: Fresh save with no unlocked slots needs no backfill

- **GIVEN** a brand-new save where `familyAccrual.toArray()` returns rows with `unlockedSlots = []` for every family
- **WHEN** the app boots
- **THEN** `neuronVariants` SHALL remain empty after backfill completes
- **AND** no events SHALL fire
- **AND** all family-card chips SHALL display `🧬 0 / 5`

#### Scenario: Future fresh unlock after backfill follows normal reveal path

- **GIVEN** the backfill has completed and the player has some backfilled variants
- **WHEN** the player subsequently answers a quiz question that crosses a new AP threshold for a previously-locked slot
- **THEN** the `connectome.variantSlotUnlocked` event SHALL fire as normal
- **AND** the registered subscriber SHALL roll + persist a new variant
- **AND** `VariantUnlockModal` SHALL render AND a toast SHALL push (full reveal ceremony, since this is an "in-the-moment" unlock, not a backfilled one)

### Requirement: Variant SHALL be persisted in `neuronVariants` Dexie table with composite primary key `(familyId, slotIndex)`

The `apps/neurons-tw` Dexie schema SHALL bump from v2 to v3 by adding a `neuronVariants` table with the following shape:

```typescript
interface NeuronVariantRow {
  familyId: string                          // e.g., '藥理學'
  slotIndex: 1 | 2 | 3 | 4 | 5
  rarity: 'P1'|'P2'|'P3'|'P4'|'P5'
  displayName: string                       // composed: '<catalog name> · <rarity title>'
  spriteKey: string                         // 'variant:<familyId>:<slotIndex>' (theme pack key)
  rolledAt: number                          // Date.now() at gacha event
  wasPityFloor: boolean                     // true iff slot had a non-null floor (slots 4/5)
}
```

The primary key SHALL be the composite `[familyId, slotIndex]`. The schema SHALL include a secondary index on `rolledAt` for chronological queries. The Dexie v3 upgrade SHALL NOT modify any existing v2 table.

#### Scenario: Dexie v3 upgrade creates neuronVariants table with composite PK

- **GIVEN** a save at Dexie schema v2 (pre-this-change)
- **WHEN** the app boots after this change ships
- **THEN** Dexie SHALL execute the v2→v3 upgrade callback
- **AND** the `neuronVariants` table SHALL be created with PK `[familyId, slotIndex]` and index on `rolledAt`
- **AND** all v2 tables (`familyAccrual`, `synapses`, etc.) SHALL remain intact with all rows preserved

#### Scenario: Composite PK enforces lifetime uniqueness

- **GIVEN** a row exists at `(familyId='藥理學', slotIndex=1)` with `rarity='P3'`
- **WHEN** the application attempts to write a second row at `(familyId='藥理學', slotIndex=1)` with `rarity='P5'`
- **THEN** the existing row SHALL be overwritten (Dexie `put`) — but per the idempotency requirement, the service layer SHALL pre-check and prevent this write from being attempted
- **AND** the total row count for this `(familyId, slotIndex)` pair SHALL be exactly 1

### Requirement: Content pack SHALL ship a 55-entry `NEURON_VARIANT_CATALOG` with one named variant per `(familyId, slotIndex)` pair

The `@study-rpg/content-neurons-tw` package SHALL export a constant `NEURON_VARIANT_CATALOG: NeuronVariantDef[]` containing exactly **55 entries** = 11 neuron families × 5 slot indices each. Each entry SHALL have:

```typescript
interface NeuronVariantDef {
  familyId: string                          // one of the 11 neuron family IDs per wire-neurons-content-and-theme
  slotIndex: 1 | 2 | 3 | 4 | 5
  displayName: string                       // unique persona name reflecting the slot's narrative role
  spriteKey: string                         // 'variant:<familyId>:<slotIndex>'
  description: string                       // 1-2 sentence flavour blurb (player-facing)
}
```

Catalog entries SHALL NOT declare rarity — rarity is rolled per-save by the gacha event. The catalog SHALL be the single source of truth for variant `displayName` + `description`; the gacha service reads from it at roll time.

The catalog SHALL be exported alongside `DEFAULT_VARIANT_TITLE_BY_RARITY: Record<Rarity, string>` (defined in a separate requirement below).

#### Scenario: Catalog covers exactly 55 entries

- **WHEN** a consumer imports `NEURON_VARIANT_CATALOG`
- **THEN** the array SHALL have length 55
- **AND** for every combination of `familyId ∈ {11 families}` × `slotIndex ∈ {1,2,3,4,5}`, there SHALL be exactly one entry

#### Scenario: Catalog entry has all required fields populated with non-empty strings

- **GIVEN** any catalog entry
- **THEN** `familyId`, `displayName`, `spriteKey`, `description` SHALL each be non-empty strings
- **AND** `slotIndex` SHALL be one of `1 | 2 | 3 | 4 | 5`
- **AND** `spriteKey` SHALL equal `'variant:' + familyId + ':' + slotIndex` exactly

### Requirement: Content pack SHALL export a default variant-title mapping per rarity tier

The `@study-rpg/content-neurons-tw` package SHALL export a constant `DEFAULT_VARIANT_TITLE_BY_RARITY: Record<Rarity, string>` mapping each rarity tier to a neuron-flavoured suffix used when composing the persisted `displayName`. The mapping SHALL be:

| Rarity | Title |
|---|---|
| P1 | `神經元始祖` |
| P2 | `共振核心` |
| P3 | `穩態突觸` |
| P4 | `漂移末梢` |
| P5 | `失活幼苗` |

The composed displayName at roll time SHALL be `"<catalog.displayName> · <DEFAULT_VARIANT_TITLE_BY_RARITY[rarity]>"` — e.g., a 藥理學 slot 1 catalog entry named `初代代謝師` rolled as P2 SHALL produce stored `displayName = "初代代謝師 · 共振核心"`.

This mapping is content-pack-specific. Forks for other domains MAY export their own mapping using the same key shape.

#### Scenario: Mapping is exported and complete

- **WHEN** a consumer imports `DEFAULT_VARIANT_TITLE_BY_RARITY` from `@study-rpg/content-neurons-tw`
- **THEN** the mapping SHALL contain entries for all 5 rarity tiers (`P1`, `P2`, `P3`, `P4`, `P5`)
- **AND** `DEFAULT_VARIANT_TITLE_BY_RARITY.P1` SHALL equal `"神經元始祖"`
- **AND** `DEFAULT_VARIANT_TITLE_BY_RARITY.P5` SHALL equal `"失活幼苗"`

#### Scenario: Composed displayName joins catalog name and rarity title with middle dot

- **GIVEN** a catalog entry `{ familyId: '解剖學', slotIndex: 3, displayName: '皮層繪圖師' }`
- **WHEN** the gacha rolls this slot as P1
- **THEN** the persisted `neuronVariant.displayName` SHALL equal `"皮層繪圖師 · 神經元始祖"`

### Requirement: Theme pack SHALL register 55 placeholder variant sprite keys plus terminal default

The `theme-pixel-neurons` package's `SPRITE_MAP` SHALL include, at minimum:

- 55 entries with keys `'variant:<familyId>:<slotIndex>'` covering every catalog entry — each resolving to a **real GBA-era pixel-art PNG** under `packages/theme-pixel-neurons/sprites/variants/<familyId>-<slotIndex>.png`, NOT the 1×1 transparent-PNG scaffold placeholder.
- 1 terminal fallback entry `'variant:default'` — this terminal fallback MAY remain the 1×1 transparent-PNG placeholder.

Each variant sprite SHALL be a 384×384 PNG with transparent background and 16-color quantization (GBA-era pixel-art aesthetic, consistent with the `image_gen_routing.md` Gemini recipe), and SHALL communicate at least three identity dimensions:

1. **Source neuron-type silhouette** consistent across the family's 5 slots — the 5 slots SHALL read as ONE neuron archetype evolving, not 5 unrelated creatures (e.g. 生物化學 = Cerebellar Purkinje → elaborate planar dendritic-tree silhouette in all 5; 生理學 = Cortical Pyramidal L5 → triangular soma in all 5).
2. **NT-branch color tint** from the four-color palette: DA gold (藥理學 / 公共衛生學), 5HT red (寄生蟲學 / 組織學), GABA blue (生物化學 / 病理學 / 免疫學), Glu green (解剖學 / 生理學 / 胚胎學 / 微生物學).
3. **Career-stage progression** matching the slot's catalog persona name + flavour blurb in `NEURON_VARIANT_CATALOG`: slot 1 = newcomer / 初代 (plainer, smaller) escalating to slot 5 = legendary apex / 傳奇 (grander, more ornate / radiant), with accessories reflecting the per-slot persona.

The fallback chain for variant sprite resolution SHALL be unchanged:

```
variant:<familyId>:<slotIndex>     (real PNG after this change)
  → variant:<familyId>:default     (per-family fallback — NOT registered, reserved for future)
  → variant:default:<rarity>       (rarity-tier fallback — NOT registered, reserved for future)
  → variant:default                (terminal fallback — transparent placeholder)
```

Other sprite categories (items / cosmetics / skill placeholders / core scaffold keys) MAY remain on the transparent placeholder until their respective consumer capabilities ship.

#### Scenario: Theme pack registers all 55 variant keys as real art

- **WHEN** the developer iterates over all 55 `(familyId, slotIndex)` combinations
- **THEN** for each pair, `SPRITE_MAP['variant:' + familyId + ':' + slotIndex]` SHALL resolve to a non-empty URL pointing at a real PNG file under `packages/theme-pixel-neurons/sprites/variants/`
- **AND** the resolved URL SHALL NOT be the 1×1 transparent-PNG data URI
- **AND** no two of the 55 variants SHALL share the same sprite file

#### Scenario: Within-family silhouette coherence and slot progression

- **GIVEN** a human reviewer opens the 5 slot sprites for 生物化學 (Cerebellar Purkinje — Mathematician, GABA blue)
- **THEN** all 5 SHALL share a recognizable Purkinje planar-dendritic-tree silhouette and a GABA-blue tint
- **AND** slot 1 (初代算術員) SHALL read as a plainer / smaller newcomer and slot 5 (平衡學至高神) SHALL read as a grander / more ornate apex

#### Scenario: Terminal fallback remains placeholder

- **WHEN** the developer reads `SPRITE_MAP['variant:default']`
- **THEN** the lookup SHALL resolve to a non-empty URL
- **AND** this terminal fallback MAY be the 1×1 transparent-PNG placeholder

### Requirement: Unlock reveal SHALL surface both a modal and a toast, sourced from the motion library

When a variant gacha roll succeeds, the system SHALL render two user-facing elements:

1. **`VariantUnlockModal`**: full-screen overlay, dismiss-required. Content: resolved sprite image (`<img>` with `image-rendering: pixelated`), the variant's family `displayName` (from `wire-neurons-content-and-theme`), the variant's composed `displayName` (catalog name + rarity title), a rarity badge (P-N label + Chinese tier name per `priority_levels.md`), the slot index chip (`Slot <N>`), and a `保底` indicator iff `wasPityFloor === true`
2. **`VariantUnlockToast`**: pushed onto the existing `ConnectomeToastHost` (top-right vertical stack), 8-second auto-dismiss sourced from `TOAST_AUTO_DISMISS_MS` (imported from `'../lib/motion'`)

Both components SHALL consume `neurons-motion-library` primitives:

- Modal entry animation SHALL use Framer Motion variants; `useRespectsReducedMotion` SHALL degrade entry to opacity fade only when OS preference is `reduce`
- Toast SHALL follow the same reduced-motion treatment as `ConnectomeToastHost` (slide-from-right → opacity-fade on `reduce`)
- Neither component SHALL declare local literal `8000` or `0.3` timing constants — all timings SHALL be imported from the motion library

The modal SHALL only render after the Dexie transaction commits (per the subscriber requirement). The modal SHALL NOT block input on the underlying page so that toast notifications for subsequent slot unlocks (impossible by AP-increment-1 rule but defensive) still surface.

#### Scenario: Modal renders all required content on unlock

- **GIVEN** a successful roll produces `{ familyId: '生理學', slotIndex: 2, rarity: 'P2', displayName: '電位編譯者 · 共振核心', wasPityFloor: false, spriteKey: 'variant:生理學:2' }`
- **WHEN** `VariantUnlockModal` renders
- **THEN** the modal SHALL display the family display name `生理學` (or its renamed neuron family identity)
- **AND** the modal SHALL display the variant displayName `電位編譯者 · 共振核心`
- **AND** the modal SHALL display the rarity badge `P2 頂級`
- **AND** the modal SHALL display the slot chip `Slot 2`
- **AND** the modal SHALL NOT display the `保底` indicator (since `wasPityFloor === false`)
- **AND** the sprite image SHALL render with `image-rendering: pixelated`

#### Scenario: Modal shows 保底 indicator when wasPityFloor is true

- **GIVEN** a slot 5 roll resolved as P2 with `wasPityFloor = true`
- **WHEN** the modal renders
- **THEN** the modal SHALL display a `保底` chip / badge / text marker

#### Scenario: Toast auto-dismiss sources from motion library

- **GIVEN** a developer audits `apps/neurons-tw/src/components/VariantUnlockToast.tsx`
- **WHEN** the developer searches for the literal value `8000`
- **THEN** that literal SHALL NOT appear in the file
- **AND** the file SHALL import `TOAST_AUTO_DISMISS_MS` from `'../lib/motion'` and reference it at the `setTimeout` call site

#### Scenario: Reduced-motion users get opacity-only entry

- **GIVEN** the user has set OS preference `prefers-reduced-motion: reduce`
- **WHEN** the modal mounts
- **THEN** `useRespectsReducedMotion()` SHALL return `true`
- **AND** the modal entry SHALL use `initial={{ opacity: 0 }}` → `animate={{ opacity: 1 }}` (no scale, translate, or other transform)

### Requirement: Connectome page family cards SHALL display collected-variant count

The `apps/neurons-tw/src/pages/ConnectomePage.tsx` family card SHALL render a chip showing `🧬 X / 5` per family, where `X` is the count of `neuronVariant` rows with that `familyId` and `Y` is fixed at 5 (the slot ladder size). The chip SHALL update live via Dexie `useLiveQuery` when new rows arrive.

When `X === 5` (all 5 slots filled for that family), the chip SHALL render in a celebratory variant (gold accent + 🏆 icon) without emitting any reward or modal — the celebration is purely visual.

The chip SHALL be visible regardless of whether any slot is currently unlocked — empty card shows `🧬 0 / 5`. The chip SHALL be a sibling of the existing AP / next-threshold chip on the family card, not a replacement.

#### Scenario: Family card chip reflects live variant count

- **GIVEN** the `neuronVariants` table contains 3 rows with `familyId = '解剖學'`
- **WHEN** the ConnectomePage renders
- **THEN** the 解剖學 family card SHALL display a chip with text `🧬 3 / 5`
- **AND** the chip SHALL be visually distinct from (but rendered alongside) the existing AP / next-threshold chip

#### Scenario: Chip updates without page reload after gacha roll

- **GIVEN** the 解剖學 family card displays `🧬 0 / 5`
- **WHEN** a `connectome.variantSlotUnlocked` event fires for 解剖學 slot 1 and the variant row is persisted
- **THEN** within one render cycle, the 解剖學 family card chip SHALL update to `🧬 1 / 5`
- **AND** no page reload or manual refresh SHALL be required

#### Scenario: 5/5 collection renders celebratory chip variant

- **GIVEN** the `neuronVariants` table contains 5 rows for `familyId = '免疫學'` (all slots filled)
- **WHEN** the ConnectomePage renders
- **THEN** the 免疫學 family card chip SHALL render with `🏆 5 / 5` and a gold accent style
- **AND** no toast, modal, or reward side-effect SHALL fire purely from the chip going celebratory (the celebration is purely visual; toast/modal fire only on the individual slot-unlock events)

### Requirement: Each variant SHALL capture study-context provenance at mint time

When a `neuronVariant` row is created by the slot-unlock handler, the system SHALL stamp a `provenance` object onto the row capturing the study context at the moment of minting. The `provenance` object SHALL contain:

| Field | Source | Meaning |
|---|---|---|
| `bornAtISO` | local date at mint | the variant's birth date (caption date) |
| `apAtUnlock` | event payload | the family AP at unlock (equals the slot threshold; stored for forward-compatibility) |
| `wasRedemption` | event payload | `true` if the triggering correct answer's question had `everWrong === true` before that answer |
| `streakAtMint` | streak service at mint | the player's daily streak value at mint |

A variant SHALL be flagged a 里程碑 (milestone) individual when `streakAtMint >= MILESTONE_STREAK_THRESHOLD`, a single content-pack constant defaulting to `7`. Provenance SHALL be written inside the same Dexie transaction that persists the variant row, before the reveal UI fires. Provenance SHALL be immutable after mint.

#### Scenario: Mint stamps full provenance

- **GIVEN** a slot-unlock fires for `(familyId='藥理學', slotIndex=1, apAtUnlock=10)` with `wasRedemption=false`
- **AND** the player's daily streak is 3 at mint
- **WHEN** the variant row is created
- **THEN** the row's `provenance` SHALL equal `{ bornAtISO: <today local date>, apAtUnlock: 10, wasRedemption: false, streakAtMint: 3 }`
- **AND** the variant SHALL NOT be flagged a 里程碑 individual (streak 3 < 7)

#### Scenario: Redemption answer flags 救贖 individual

- **GIVEN** the triggering correct answer's question had `everWrong === true` before this answer
- **WHEN** the variant is minted
- **THEN** the row's `provenance.wasRedemption` SHALL be `true`

#### Scenario: Streak at or above threshold flags 里程碑 individual

- **GIVEN** the player's daily streak is 7 (== `MILESTONE_STREAK_THRESHOLD`) at mint
- **WHEN** the variant is minted
- **THEN** `provenance.streakAtMint` SHALL be 7
- **AND** the variant SHALL be flagged a 里程碑 individual

#### Scenario: apAtUnlock is recorded even though it equals the slot threshold

- **GIVEN** a slot-3 unlock fires with `apAtUnlock=80`
- **WHEN** the variant is minted
- **THEN** `provenance.apAtUnlock` SHALL be 80 (stored discretely so a future capability can read it)

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

### Requirement: Provenance SHALL sync via the neurons R2 bundle with LWW and cross-version tolerance

Provenance SHALL travel inside the `neuronVariants` rows of the neurons R2 bundle. The bundle `SCHEMA_VERSION` SHALL bump from 6 to 7 (`add-neurons-variant-collection-view` already took 5 → 6). The `neuronVariants` adapter SHALL remain LWW (provenance is immutable per row, so no monotonic-merge discipline is required). Cross-version reads SHALL be tolerant: a newer client reading a bundle whose rows lack provenance SHALL treat those variants as 元老; an older client SHALL preserve the provenance field across a round-trip (it rides in the whole-row JSON).

#### Scenario: Provenance survives a push/pull round-trip

- **GIVEN** a variant with populated `provenance` is pushed to the neurons R2 bundle
- **WHEN** the same account pulls the bundle on another device
- **THEN** the pulled variant row SHALL retain its `provenance` unchanged

#### Scenario: Newer client reading older bundle treats provenance-less rows as 元老

- **GIVEN** an older bundle whose `neuronVariants` rows have no `provenance`
- **WHEN** a client at `SCHEMA_VERSION = 7` applies the bundle
- **THEN** those variants SHALL be treated as 元老 individuals
- **AND** no error SHALL be raised by bundle validation

#### Scenario: Older client preserves provenance across a round-trip

- **GIVEN** a client at `SCHEMA_VERSION = 6` reads a bundle whose `neuronVariants` rows carry `provenance`
- **WHEN** that client later pushes the bundle back
- **THEN** the `provenance` field on those rows SHALL be preserved (it is carried in the whole-row JSON even though the older client does not interpret it)
