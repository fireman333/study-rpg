## MODIFIED Requirements

### Requirement: Drawing a DMN card SHALL roll equipment first, else deposit a consumable to the backpack

When `dmnDrawsAvailable >= 1` and the player triggers a draw, the system SHALL:

1. Spend one draw entitlement: within the draw transaction, re-check `dmnDrawsAvailable >= 1` (derived from `dmnGrantsTotal − dmnLifetimeDrawsConsumed`); if it has fallen to 0 the draw SHALL be a no-op returning null. Otherwise increment `dmnLifetimeDrawsConsumed` by 1 and re-derive `dmnDrawsAvailable = clamp(dmnGrantsTotal − dmnLifetimeDrawsConsumed, ≥ 0)`.
2. Roll `EQUIPMENT_DRAW_RATE` against the unowned equipment pool (`neurons-acceleration-system`) ONLY when at least one equipment id is unowned. On a hit with unowned equipment remaining → award one unowned equipment (rarity-rolled) and STOP (no consumable for this draw).
3. Otherwise (equipment roll missed, OR no unowned equipment remains) select one consumable card by rarity weights across the **full** 22-card catalog (NOT the unowned subset — consumables are repeatable). This card MAY already be in the dex.
   - Increment the matching `inventory` backpack count by 1 (stock is unbounded).
   - If the card is NOT yet in `dmnCards` (first-seen): insert a `dmnCards` collection row AND append `(cardId, dispatchedAt, deviceId)` to `dmnEventLog`.
   - If the card IS already in `dmnCards` (duplicate): the engine SHALL NOT write `dmnCards` (preserving the first-seen `obtainedAt`) and SHALL NOT write `dmnEventLog` (preserving the at-most-once provenance row). The draw still succeeds and returns a result flagged `duplicate: true`.
4. Display the reveal UI distinguishing equipment vs first-seen consumable vs duplicate consumable (`已在圖鑑 · 庫存 +1`).

Consumables are NEVER exhausted — a draw with `dmnDrawsAvailable >= 1` SHALL always produce a result (equipment or consumable). There SHALL be no both-pools-exhausted no-op state and no "consumable dex full forces equipment" path. If `dmnDrawsAvailable === 0`, the draw button SHALL be disabled with a tooltip explaining how to earn draws.

#### Scenario: First-seen consumable draw records collection + backpack stock

- **GIVEN** `dmnDrawsAvailable = 3`, the equipment roll misses, and the rolled card is NOT yet in the dex
- **WHEN** the player draws
- **THEN** `dmnDrawsAvailable` SHALL become 2
- **AND** the `dmnCards` table SHALL gain exactly 1 new collection row
- **AND** the matching `inventory` count SHALL increment by 1
- **AND** the result SHALL be flagged `duplicate: false`
- **AND** the consumable's effect SHALL NOT fire automatically

#### Scenario: Duplicate consumable draw succeeds and only increments stock

- **GIVEN** `dmnDrawsAvailable = 3` and the rolled consumable is already in the dex
- **WHEN** the player draws
- **THEN** `dmnDrawsAvailable` SHALL become 2
- **AND** `dmnLifetimeDrawsConsumed` SHALL increment by 1
- **AND** the matching `inventory` count SHALL increment by 1
- **AND** the `dmnCards` row count SHALL be unchanged and the existing row's `obtainedAt` SHALL be preserved
- **AND** no new `dmnEventLog` row SHALL be written for that `cardId`
- **AND** the result SHALL be flagged `duplicate: true`

#### Scenario: Equipment draw awards a permanent and skips the consumable

- **GIVEN** the equipment roll hits with a non-empty unowned pool
- **WHEN** the draw resolves
- **THEN** exactly one new `equipment` row SHALL be inserted
- **AND** no `dmnCards` or `inventory` change SHALL occur for that draw

#### Scenario: Draw with all equipment owned still yields consumable stock (never inert)

- **GIVEN** the player owns every equipment id AND has the full 22-card dex AND `dmnDrawsAvailable = 1`
- **WHEN** the player draws
- **THEN** `dmnDrawsAvailable` SHALL become 0
- **AND** the matching `inventory` count SHALL increment by 1 (a duplicate consumable)
- **AND** the draw SHALL NOT return a no-op / `pools_exhausted` result

## REMOVED Requirements

### Requirement: Consumable catalog SHALL be closed-cap — collection completes at 22 cards

**Reason**: Consumables are backpack 補給品 (activated for an effect, decrementing stock). Drawing a duplicate should add usable stock, not be excluded. The closed-cap rule blocked re-draws and forced equipment-only draws after 22 cards, which surfaced to players as「抽卡失敗 — 沒有可用次數或卡池已空」even while undrawn equipment remained and the player wanted more consumable stock.

**Migration**: No data migration. `dmnCards` already holds at most one first-seen row per `cardId`; existing saves keep their dex unchanged. Going forward, a draw whose rolled consumable is already in the dex adds `inventory` stock without touching `dmnCards` (see the repeatable-draws requirement). No Dexie / R2 schema change.

## ADDED Requirements

### Requirement: Consumable draws SHALL be repeatable with a first-seen dex and unbounded stock

The consumable draw path SHALL be repeatable. `dmnCards` SHALL hold at most one row per `cardId` — a first-seen collection log that completes at 22 unique faces and never resets. `inventory` SHALL accrue unbounded per-`eventKind` stock. A draw that yields an already-collected consumable SHALL still spend one draw entitlement and increment `inventory`, and SHALL NOT reset, re-order, duplicate, or re-stamp `dmnCards` rows.

#### Scenario: Drawing past a complete dex keeps adding stock

- **GIVEN** the player has all 22 consumable faces in the dex and `dmnDrawsAvailable = 5`
- **WHEN** the player draws and a consumable is rolled
- **THEN** the draw SHALL succeed (not be refused as "complete")
- **AND** `dmnCards` SHALL remain at 22 rows
- **AND** the rolled consumable's `inventory` count SHALL increment by 1

### Requirement: DMN collection progress SHALL total 34 (consumable dex + equipment)

The DMN collection progress indicator SHALL count `dmnCards` owned (0–22 consumable faces) PLUS owned equipment (0–12) against a total of **34**. The homepage stat card and the draw modal SHALL both render this `(owned / 34)` total. The draw action SHALL be gated solely by `dmnDrawsAvailable >= 1`; there SHALL be no separate "collection complete" disabled state, because consumables are never exhausted.

#### Scenario: Collection chip and modal show owned / 34

- **GIVEN** the player owns 22 consumable faces and 4 of 12 equipment
- **WHEN** the homepage stat card and the draw modal render the DMN collection progress
- **THEN** both SHALL display `26 / 34`
- **AND** the draw button SHALL be enabled iff `dmnDrawsAvailable >= 1`
