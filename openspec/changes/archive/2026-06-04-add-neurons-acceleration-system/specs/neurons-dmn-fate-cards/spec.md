## MODIFIED Requirements

### Requirement: DMN card catalog SHALL define exactly 22 cards across 4-tier rarity (P1–P4) with weights summing to 100

The `packages/content-neurons-tw` package SHALL export a `DMN_CARD_CATALOG: DmnCardDef[]` containing exactly **22** consumable cards distributed across 4 rarity tiers (P1–P4). Removing `streak-shield` (4 cards) and adding two new consumable kinds (`surge`, `bolus`) at ≥ 3 cards each changes the total from 20 to 22; the per-tier counts and rarity weights SHALL be re-balanced so that rarity weights still sum to 100 and every `eventKind` retains ≥ 3 cards.

Each `DmnCardDef` entry SHALL contain `cardId`, `rarity ∈ {P1,P2,P3,P4}`, `displayName`, `description`, `eventKind ∈ the 6 consumable kinds`, and `artworkId`. The catalog SHALL NOT declare P5 entries (distinguishing it from `neuron-variant-gacha`). Permanent equipment is a **separate** P1–P5 catalog (`neurons-acceleration-system`), not part of this consumable dex.

#### Scenario: Catalog size and kind coverage verified
- **GIVEN** the published `DMN_CARD_CATALOG`
- **THEN** `DMN_CARD_CATALOG.length` SHALL equal 22
- **AND** no entry SHALL have `eventKind === 'streak-shield'`
- **AND** each of the 6 consumable kinds SHALL have ≥ 3 cards

#### Scenario: Card IDs are globally unique
- **GIVEN** the published `DMN_CARD_CATALOG`
- **THEN** `new Set(catalog.map(c => c.cardId)).size` SHALL equal `catalog.length` (22)

### Requirement: DMN catalog build-time validator SHALL reject invalid catalogs

The package SHALL ship a `validateDmnCardCatalog(catalog)` function that throws on any of the following:

- Catalog size ≠ 22
- Rarity weights not summing to 100
- Duplicate `cardId` values
- Any catalog entry missing any required field (`cardId`, `rarity`, `displayName`, `description`, `eventKind`, `artworkId`)
- `rarity` value not in `{'P1','P2','P3','P4'}`
- `eventKind` value not in the 6 defined consumable enum values (`family-buff`, `variant-rate-up`, `quick-review-batch`, `hidden-reveal`, `surge`, `bolus`) — `streak-shield` is no longer a valid kind
- Fewer than 3 cards per `eventKind` value

The validator SHALL be invoked at build time and CI SHALL fail if validation fails.

#### Scenario: Validator rejects catalog with wrong size
- **GIVEN** a candidate catalog with `length = 20`
- **WHEN** `validateDmnCardCatalog(candidate)` is called
- **THEN** the function SHALL throw an error indicating the size must equal 22

#### Scenario: Validator rejects a streak-shield entry
- **GIVEN** a candidate catalog where any card has `eventKind === 'streak-shield'`
- **WHEN** `validateDmnCardCatalog(candidate)` is called
- **THEN** the function SHALL throw an error indicating `streak-shield` is not a valid event kind

### Requirement: Six DMN consumable event kinds SHALL be defined; effects deposit to the backpack (no auto-fire)

The `DmnEventKind` enum SHALL include exactly these six consumable kinds. Drawing a card of any kind SHALL deposit one unit of that consumable into the `inventory` backpack (`neurons-acceleration-system`) — effects SHALL NOT auto-fire on draw. The player activates them manually.

| `eventKind` | Lane | Effect (on activation) |
|---|---|---|
| `family-buff` | energy | the buffed family's maze-energy faucet gains an additive `+1.0` energy bonus for 1 hour (preserves the prior `×2`) |
| `surge` | speed | exploration `speedAccel` gains an additive bonus for a time window (phasic NE/DA gain modulation, OE `10.1038/s41586-022-04782-2`) |
| `bolus` | energy | maze-energy faucet gains an additive energy bonus for a time window (acute lactate substrate, OE `10.1038/nrn.2018.19`) |
| `variant-rate-up` | — | the next `pullVariant` rolls rarity twice and keeps the rarer (single-consume) |
| `quick-review-batch` | — | arms a clickable ≤5-question 出征 mini-batch whose clears credit the expedition DMN draw axis |
| `hidden-reveal` | — | reveals the next undrawn P1 card's silhouette hint in the dex (UI-only) |

`streak-shield` is **removed** (integrity — see REMOVED). Each kind SHALL have ≥ 3 catalog cards.

#### Scenario: Drawing a consumable deposits to the backpack without firing
- **WHEN** a card of any consumable kind is drawn
- **THEN** the matching `inventory` count SHALL increment by 1
- **AND** no active-buff row SHALL be created until the player activates it
- **AND** no AP/energy/speed effect SHALL apply at draw time

#### Scenario: family-buff applies only on manual activation
- **GIVEN** an undrawn-then-drawn `family-buff` consumable sitting in the backpack
- **WHEN** the player activates it
- **THEN** a random family SHALL be buffed with `+1.0` additive energy for 1 hour
- **AND** before activation no family SHALL receive any buff

### Requirement: Drawing a DMN card SHALL roll equipment first, else deposit a consumable to the backpack

When `dmnDrawsAvailable >= 1` and the player triggers a draw, the system SHALL:

1. Decrement `dmnDrawsAvailable` by 1
2. Roll `EQUIPMENT_DRAW_RATE` against the unowned equipment pool (`neurons-acceleration-system`). On a hit with a non-empty pool → award one unowned equipment (rarity-rolled) and STOP (no consumable for this draw)
3. Otherwise select one consumable card by remaining rarity weights, insert a `dmnCards` row (collection record), and increment the matching `inventory` backpack count
4. Append `(cardId | equipmentId, dispatchedAt)` to `dmnEventLog`
5. Display the reveal UI (equipment vs consumable form)

If `dmnDrawsAvailable === 0`, the draw button SHALL be disabled with a tooltip explaining how to earn draws.

#### Scenario: Consumable draw records collection + backpack stock
- **GIVEN** `dmnDrawsAvailable = 3` and the equipment roll misses
- **WHEN** the player draws and a consumable is rolled
- **THEN** `dmnDrawsAvailable` SHALL become 2
- **AND** the `dmnCards` table SHALL gain exactly 1 new collection row
- **AND** the matching `inventory` count SHALL increment by 1
- **AND** the consumable's effect SHALL NOT fire automatically

#### Scenario: Equipment draw awards a permanent and skips the consumable
- **GIVEN** the equipment roll hits with a non-empty unowned pool
- **WHEN** the draw resolves
- **THEN** exactly one new `equipment` row SHALL be inserted
- **AND** no `dmnCards` or `inventory` change SHALL occur for that draw

### Requirement: Consumable catalog SHALL be closed-cap — collection completes at 22 cards

When the player has drawn all 22 consumable cards (`dmnCards.length === 22`), the consumable draw path SHALL be considered complete: the dex SHALL show "DMN 圖鑑已完整", and draws SHALL only ever roll equipment (until that pool is also exhausted). The catalog SHALL NOT reset or allow re-drawing owned consumables.

#### Scenario: 22nd consumable marks the consumable dex complete
- **GIVEN** the player has 21 consumable cards owned
- **WHEN** the player draws the 22nd
- **THEN** `dmnCards.length` SHALL become 22
- **AND** the consumable dex SHALL render complete
- **AND** further draws SHALL only roll equipment (or be inert if equipment is also fully owned)

## REMOVED Requirements

### Requirement: streak-shield single-use streak-immunity token

**Reason**: Integrity. `streak-shield` was the only mechanic that let a player dodge an honest correct-answer streak break (a learning crutch). Per the progression roadmap §5, all anti-learning crutches are removed; the daily-streak multiplier, the break soft-toast, and the SRS self-report buttons (honesty-positive) are retained.

**Migration**: The `streak-shield` `eventKind`, its 4 catalog cards, the dispatcher case + `consumeStreakShield` + `META_STREAK_SHIELD`, the `lib/services/streak.ts` consume site, the `dmnStreakShieldAvailable` `SYNCED_META_KEYS` entry, and the `DmnDrawModal`/`HelpMenu` copy SHALL all be removed. Already-collected `streak-shield` cards SHALL leave the closed-cap dex (count recomputed to 22); any armed shield is silently dropped (no refund — it is an integrity removal, not an economic one).
