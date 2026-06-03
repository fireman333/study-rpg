# neurons-dmn-fate-cards Specification

## Purpose

Implements a mixed-trigger (time-axis + behavior-axis) fate-card collection system for neurons-mode themed on Default Mode Network (DMN) — the brain's resting-state network that produces "spontaneous insight" while the player rests. Catalog ships 20 cards across 4-tier rarity (P1 鑽石 × 2 / P2 金 × 4 / P3 銀 × 6 / P4 銅 × 8) with weights 2/10/30/58. Each card simultaneously triggers a one-time event (one of five `eventKind` values: family-buff / variant-rate-up / quick-review-batch / streak-shield / hidden-reveal) AND enters a permanent Pokédex-style closed-cap collection. Pool-removal ensures unique draws; collection completes at 20/20 and the draw button disables. Cross-device sync uses a critical monotonic-union merge on the dispatch log to prevent re-trigger races on bundle apply.

## Requirements

### Requirement: DMN fate-card draw entitlement SHALL accrue via mixed time-axis and behavior-axis triggers with per-day caps

The neurons-tw mode SHALL grant DMN fate-card draws from two independent trigger axes, capped per local-TZ calendar day:

- **Time axis** (cap 2 draws/day): for every 30 minutes of accrued reading-timer activity within the current local-TZ day, the system SHALL grant +1 draw, up to a maximum of 2 time-axis draws per day. The accrual counter `dmnTimeAxisMinutesAccrued` SHALL reset to 0 at local-TZ midnight via the same lazy daily-reset job that `connectome-collection` uses.
- **Behavior axis** (cap 3 draws/day): the system SHALL grant +1 bonus draw on each of the following events emitted by `connectome-collection`, up to a maximum of 3 behavior-axis draws per day:
  - `connectome.variantSlotUnlocked`
  - `connectome.synapseFormed` (new cross-family synapse created on N=5 same-day co-firing)
  - `connectome.synapseStrengthened` (existing synapse transitions dormant→weak or weak→strong)

These three primitives are chosen because they map naturally to "meaningful collection milestone" without requiring a daily-open streak service (which neurons-tw does not implement; correct-answer streak is per-question, not per-day).

The combined entitlement (time + behavior) SHALL be tracked as a single integer counter `dmnDrawsAvailable` (monotonic during the day, decremented on consume). Both axis counters reset at local-TZ midnight; entitled draws already accrued but unused SHALL persist across days (no expiry).

Until the reading-timer service is wired (deferred to sibling change `polish-neurons-pre-ship`), the time axis SHALL be inactive (`dmnTimeAxisMinutesAccrued` stays 0) and DMN draws SHALL come exclusively from the behavior axis.

#### Scenario: Time-axis draw granted at 30-minute accrual mark

- **GIVEN** the reading-timer service is wired and `dmnTimeAxisMinutesAccrued = 29`
- **WHEN** the player accrues 1 more minute of reading time
- **THEN** `dmnTimeAxisMinutesAccrued` SHALL become 30
- **AND** `dmnDrawsAvailable` SHALL increment by 1
- **AND** `dmnTimeAxisDrawsConsumedToday` SHALL increment by 1

#### Scenario: Time-axis cap at 2 draws per day

- **GIVEN** the player has already accrued 2 time-axis draws today (`dmnTimeAxisDrawsConsumedToday = 2`)
- **WHEN** the player accrues additional 30+ minutes of reading time (would cross 90/120/... minute marks)
- **THEN** no additional time-axis draws SHALL be granted
- **AND** `dmnDrawsAvailable` SHALL NOT increment from time-axis triggers
- **AND** `dmnTimeAxisMinutesAccrued` SHALL continue to accumulate (cap is on draws granted, not on minutes tracked)

#### Scenario: Behavior-axis draw on synapse formed

- **GIVEN** `dmnBehaviorAxisDrawsConsumedToday = 0`
- **WHEN** `connectome-collection` emits `connectome.synapseFormed` (player triggered cross-family same-day co-firing reaching N=5 threshold)
- **THEN** `dmnDrawsAvailable` SHALL increment by 1
- **AND** `dmnBehaviorAxisDrawsConsumedToday` SHALL increment by 1

#### Scenario: Daily reset of both axis counters at local-TZ midnight

- **GIVEN** the local time is 23:59 with `dmnTimeAxisDrawsConsumedToday = 2`, `dmnBehaviorAxisDrawsConsumedToday = 3`, `dmnTimeAxisMinutesAccrued = 78`, and `dmnDrawsAvailable = 4` (4 unused)
- **WHEN** the local clock crosses midnight and the player triggers any interaction (the lazy daily-reset job runs)
- **THEN** `dmnTimeAxisDrawsConsumedToday` SHALL reset to 0
- **AND** `dmnBehaviorAxisDrawsConsumedToday` SHALL reset to 0
- **AND** `dmnTimeAxisMinutesAccrued` SHALL reset to 0
- **AND** `dmnDrawsAvailable` SHALL remain at 4 (unused draws persist across days)

### Requirement: DMN card catalog SHALL define exactly 20 cards across 4-tier rarity (P1–P4) with weights 2/10/30/58

The `packages/content-neurons-tw` package SHALL export a `DMN_CARD_CATALOG: DmnCardDef[]` containing exactly 20 cards distributed across 4 rarity tiers:

- **P1** (rarity weight 2%): 2 cards
- **P2** (rarity weight 10%): 4 cards
- **P3** (rarity weight 30%): 6 cards
- **P4** (rarity weight 58%): 8 cards

Each `DmnCardDef` entry SHALL contain:
- `cardId: string` — globally unique kebab-case identifier (e.g., `dmn-burst-firing-p1-1`)
- `rarity: 'P1' | 'P2' | 'P3' | 'P4'`
- `displayName: string` — player-facing card name (Traditional Chinese)
- `description: string` — 1–2 sentence flavour blurb with neuroscience narrative anchor
- `eventKind: DmnEventKind` — one of the 5 enum values (see event-pool requirement)
- `artworkId: string` — sprite registry key (placeholder this change; real art via follow-up change)

The catalog SHALL NOT declare 5-tier rarity (no P5 entries), distinguishing it from `neuron-variant-gacha`'s P1–P5 ladder.

#### Scenario: Catalog size and rarity distribution verified

- **GIVEN** the published `DMN_CARD_CATALOG`
- **THEN** `DMN_CARD_CATALOG.length` SHALL equal 20
- **AND** the count of `rarity === 'P1'` entries SHALL equal 2
- **AND** the count of `rarity === 'P2'` entries SHALL equal 4
- **AND** the count of `rarity === 'P3'` entries SHALL equal 6
- **AND** the count of `rarity === 'P4'` entries SHALL equal 8

#### Scenario: Card IDs are globally unique

- **GIVEN** the published `DMN_CARD_CATALOG`
- **THEN** `new Set(catalog.map(c => c.cardId)).size` SHALL equal `catalog.length` (20)

### Requirement: DMN catalog build-time validator SHALL reject invalid catalogs

The package SHALL ship a `validateDmnCardCatalog(catalog)` function that throws on any of the following:

- Catalog size ≠ 20
- Rarity distribution ≠ 2/4/6/8 across P1/P2/P3/P4
- Duplicate `cardId` values
- Any catalog entry missing any required field (`cardId`, `rarity`, `displayName`, `description`, `eventKind`, `artworkId`)
- `rarity` value not in `{'P1','P2','P3','P4'}`
- `eventKind` value not in the 5 defined enum values
- Fewer than 1 card per `eventKind` value (avoid unreachable event types)

The validator SHALL be invoked at build time (e.g., via `tsx scripts/verify-validator.ts` or equivalent) and CI SHALL fail if validation fails.

#### Scenario: Validator rejects catalog with wrong size

- **GIVEN** a candidate catalog with `length = 19`
- **WHEN** `validateDmnCardCatalog(candidate)` is called
- **THEN** the function SHALL throw an error containing the message `catalog size must equal 20, got 19`

#### Scenario: Validator rejects catalog with unreachable event type

- **GIVEN** a candidate catalog where no card has `eventKind === 'streak-shield'`
- **WHEN** `validateDmnCardCatalog(candidate)` is called
- **THEN** the function SHALL throw an error indicating which `eventKind` value lacks coverage

### Requirement: Five DMN event types SHALL be defined with bounded magnitudes

The `DmnEventKind` enum SHALL include exactly these five values, each with a defined runtime effect:

| `eventKind` | Effect | Magnitude bound |
|---|---|---|
| `family-buff` | Randomly select 1 of the 11 neuron families; for the next 1 hour wall-clock, correct answers attributed to that family SHALL grant +2 AP instead of +1 | +1 extra AP per correct answer, capped at 1-hour duration |
| `variant-rate-up` | Override the rarity weight table for the **next** `connectome.variantSlotUnlocked` event from the player's session, using weights 20/30/30/15/5 instead of the default 60/25/10/4/1 | Single slot unlock, then revert to default weights |
| `quick-review-batch` | Immediately surface 5 SRS-due questions in a chained quiz modal (any subject), bypassing the normal SRS queue UI | 5 questions; correct answers grant normal AP + correct-streak |
| `streak-shield` | Grant a single-use streak immunity token; the next time the player would lose their daily streak (1 day of no app open), the token SHALL be consumed instead and streak preserved | 1 single-use token, never expires |
| `hidden-reveal` | Reveal the `artworkId` of the next undrawn P1 DMN card in the catalog as a "spoiler hint" — the card's silhouette in `DmnCollectionPage` SHALL render with reduced opacity instead of solid silhouette | UI-only effect; zero gameplay impact |

Each `eventKind` SHALL have **at least 3 cards** in the catalog carrying it (5 × 3 = 15 minimum allocation; remaining 5 catalog slots distribute by rarity preference).

#### Scenario: family-buff dispatches with bounded duration

- **WHEN** a card with `eventKind === 'family-buff'` is drawn and dispatched
- **THEN** a new row SHALL be added to `dmnActiveBuffs` with `buffKind: 'family-buff'`, `familyId: <randomly selected>`, and `expiresAt: <now + 1 hour>`
- **AND** quiz-rewards service SHALL grant +2 AP for correct answers matching that `familyId` until `expiresAt` is reached
- **AND** at `expiresAt`, the row SHALL be removed (or marked expired) and AP grant SHALL revert to +1

#### Scenario: variant-rate-up consumed by single slot unlock

- **GIVEN** the player has an active `variant-rate-up` buff and 0 variant slots unlocked in the current session
- **WHEN** the player triggers the next `connectome.variantSlotUnlocked` event
- **THEN** the `neuron-variant-gacha` roll for that slot SHALL use weights 20/30/30/15/5 instead of the default
- **AND** after the roll completes, the buff SHALL be marked consumed and removed from `dmnActiveBuffs`
- **AND** subsequent slot unlocks SHALL revert to default rarity weights

### Requirement: Drawing a DMN card SHALL produce exactly one new dmnCard row + one event dispatch + permanent collection entry

When `dmnDrawsAvailable >= 1` and the player triggers a draw, the system SHALL:

1. Decrement `dmnDrawsAvailable` by 1
2. Select one card from the catalog where `cardId NOT IN (already-owned cardIds)` using weighted random sampling (weights = rarity weights 2/10/30/58 for P1/P2/P3/P4 cards remaining)
3. Insert a new `dmnCards` row with `(cardId, obtainedAt, rarity, eventKind, artworkId)`
4. Dispatch the card's `eventKind` via `dmn-event-dispatcher.ts` (see event-dispatch requirement)
5. Append `(cardId, dispatchedAt: <now>)` to `dmnEventLog`
6. Display `DmnCardReveal` UI (modal or toast based on rarity — P1/P2 modal, P3/P4 toast)
7. Mark the card as permanently collected in `DmnCollectionPage`

If `dmnDrawsAvailable === 0`, the draw button SHALL be disabled and clicking it SHALL show a tooltip explaining how to earn more draws (time axis / behavior axis).

#### Scenario: Drawing a card decrements availability and creates card row

- **GIVEN** `dmnDrawsAvailable = 3` and 5 cards already owned
- **WHEN** the player taps the draw button and a card is rolled
- **THEN** `dmnDrawsAvailable` SHALL become 2
- **AND** the `dmnCards` table SHALL gain exactly 1 new row
- **AND** the new row's `cardId` SHALL NOT match any of the 5 already-owned cardIds

#### Scenario: Drawing with zero availability is blocked

- **GIVEN** `dmnDrawsAvailable = 0`
- **WHEN** the player taps the draw button
- **THEN** no roll SHALL occur
- **AND** no `dmnCards` row SHALL be created
- **AND** the UI SHALL display tooltip explaining how to earn draws

### Requirement: Catalog SHALL be closed-cap — collection completes at 20 cards

When the player has drawn all 20 cards (`dmnCards.length === 20`), the system SHALL:

- Disable the draw button permanently
- Display "DMN 圖鑑已完整" message in lieu of the draw button
- Continue to grant `dmnDrawsAvailable` increments (counter still tracks for parity), but no draws can be redeemed
- NOT reset the catalog or allow re-drawing already-owned cards

#### Scenario: 20th card drawn marks catalog complete

- **GIVEN** the player has 19 cards owned
- **WHEN** the player draws the 20th and final card
- **THEN** `dmnCards.length` SHALL become 20
- **AND** the draw button SHALL render as disabled with completion message
- **AND** subsequent grants to `dmnDrawsAvailable` SHALL NOT enable the button (gated on `cards.length < 20`)

### Requirement: DMN event log SHALL be idempotent and use monotonic-union merge for cross-device sync

The `dmnEventLog` table SHALL maintain `(cardId, dispatchedAt, deviceId)` rows for every dispatched event. The system SHALL guarantee:

- Each `cardId` SHALL appear at most once in `dmnEventLog` per save (idempotent on duplicate dispatch attempts)
- Cross-device sync SHALL use **monotonic-union merge** (not LWW): if device A has `dmnEventLog[cardId-X]` present and device B does not, the union SHALL include `cardId-X` (preserving the "already dispatched" signal across devices)
- The dispatcher SHALL check `dmnEventLog` before dispatching: if `(cardId)` already present, the event SHALL NOT re-trigger (preventing double family-buff stacks, double quick-review-batch surfaces, etc.)

#### Scenario: Duplicate dispatch attempt is no-op

- **GIVEN** `dmnEventLog` contains a row for `cardId = dmn-burst-firing-p1-1`
- **WHEN** something attempts to dispatch the same card again (e.g., bundle sync round-trip)
- **THEN** no new row SHALL be added to `dmnEventLog`
- **AND** no effect of the `eventKind` SHALL be re-applied (no double buff stack, no double SRS batch)

#### Scenario: Cross-device sync preserves dispatched signal via monotonic-union

- **GIVEN** device A has `dmnEventLog` containing `[cardId-X, cardId-Y]` and device B has `dmnEventLog` containing `[cardId-Y, cardId-Z]`
- **WHEN** both devices push and pull bundles
- **THEN** both devices' `dmnEventLog` SHALL converge to `[cardId-X, cardId-Y, cardId-Z]` (union of all)
- **AND** neither device SHALL trigger re-dispatch of any of the three cards

### Requirement: DMN UI SHALL exist in independent modal + collection page without modifying connectome SVG

The DMN UI surface SHALL be implemented as:
- `DmnDrawModal` — full-screen modal for triggering the draw animation
- `DmnCardReveal` — sub-component for showing the rolled card (modal-form for P1/P2, toast-form for P3/P4)
- `DmnCollectionPage` — new route at `/dmn`, displays all 20 cards with silhouettes for undrawn slots
- `DmnDrawButton` — top-nav or floating button showing `dmnDrawsAvailable` count

These components SHALL NOT modify, render into, or otherwise touch:
- `connectome-collection`'s SVG / force-simulation / SYNAPSE_TIMINGS token
- `neuron-variant-gacha`'s `VariantUnlockModal` / `VariantUnlockToast`
- Connectome page layout or family card structure

DMN UI SHALL use motion primitives from `neurons-motion-library` (mirroring existing reveal patterns) but render in its own React tree branch.

#### Scenario: DMN modal opens without affecting connectome page

- **GIVEN** the player is on `/connectome` and `dmnDrawsAvailable >= 1`
- **WHEN** the player clicks `DmnDrawButton`
- **THEN** `DmnDrawModal` SHALL open as a top-layer overlay
- **AND** the connectome SVG SHALL continue to render unchanged behind the modal
- **AND** no force-simulation tick SHALL be paused or modified

#### Scenario: DMN collection page is reachable via /dmn route

- **GIVEN** the player navigates to `https://med-study-rpg.com/neurons/dmn`
- **WHEN** the page mounts
- **THEN** `DmnCollectionPage` SHALL render a 4×5 grid showing all 20 catalog cards
- **AND** drawn cards SHALL render with full artwork (placeholder this change)
- **AND** undrawn cards SHALL render as silhouettes (or reduced-opacity silhouettes if `hidden-reveal` event has been triggered)

### Requirement: DMN trigger detector SHALL initialize at app boot as a single service

A new service `apps/neurons-tw/src/lib/services/dmn-trigger.ts` SHALL be initialized at app boot via the app's main entry point. The service SHALL:

- Register listeners on the connectome event bus for `connectome.variantSlotUnlocked`, `connectome.synapseFormed`, and `connectome.synapseStrengthened`
- Expose a `ReadingTimerSubscriber` interface that reading-timer service (when wired in `polish-neurons-pre-ship`) SHALL invoke on each tick to accumulate `dmnTimeAxisMinutesAccrued`
- Run daily-reset lazily on the first user interaction crossing local-TZ midnight (mirrors `connectome-collection` pattern)
- Persist all state via Dexie writes wrapped in transactions; emit informational logs after commit (no external event subscriber consumes `dmn.drawsGranted` yet)

#### Scenario: Trigger detector initializes on app boot

- **GIVEN** the neurons-tw app starts up
- **WHEN** the main entry (e.g., `App.tsx` or `main.tsx`) calls `initializeDmnTrigger()`
- **THEN** connectome event bus listeners SHALL be registered exactly once (singleton; second call is no-op)
- **AND** `ReadingTimerSubscriber` interface SHALL be exposed for the timer service to discover (currently stub — no timer wires it)

### Requirement: Dexie schema SHALL bump from v5 to v6 adding dmnCards table and meta keys

The neurons-tw local Dexie database SHALL be bumped from version 5 to version 6 in `apps/neurons-tw/src/lib/db.ts`. The v6 upgrade SHALL be purely additive:

- New table `dmnCards`:
  - Primary key: `cardId` (string)
  - Indexed columns: `obtainedAt` (epoch ms), `rarity`
  - Other columns: `eventKind`, `artworkId`, `displayName`
- New `meta` keys (single-row key-value entries, mirroring existing `meta` pattern):
  - `dmnTimeAxisMinutesAccrued` (number, daily-reset)
  - `dmnTimeAxisDrawsConsumedToday` (number, daily-reset)
  - `dmnBehaviorAxisDrawsConsumedToday` (number, daily-reset)
  - `dmnDrawsAvailable` (number, monotonic — never decremented at midnight, only on consume)
  - `dmnLastDailyResetDate` (ISO date, local-TZ)
  - `dmnLifetimeDrawsConsumed` (number, monotonic — telemetry)
  - `dmnStreakShieldAvailable` ('true' / 'false', dispatcher flag)
  - `dmnHiddenRevealedArtworkIds` (CSV string, dispatcher state)
- New table `dmnEventLog`:
  - Primary key: `cardId`
  - Indexed columns: `dispatchedAt`
  - Other columns: `deviceId`
- New table `dmnActiveBuffs`:
  - Primary key: auto-incremented `id`
  - Indexed columns: `expiresAt`, `buffKind`
  - Other columns: `familyId` (nullable, used by `family-buff` only), `payload` (JSON blob, reserved), `sourceCardId`

The upgrade SHALL handle existing v5 saves without data loss; new tables start empty and new meta keys default appropriately on first read.

#### Scenario: v5 → v6 upgrade preserves existing data

- **GIVEN** an existing v5 save with populated `connectome`, `meta` (existing keys), `neuronVariants`, `achievements`, `leaderboardProfile` tables
- **WHEN** the player opens the app on a build with Dexie v6 schema
- **THEN** all existing tables SHALL retain their data
- **AND** new tables `dmnCards`, `dmnEventLog`, `dmnActiveBuffs` SHALL be created empty
- **AND** new `meta` keys SHALL default to 0 / empty string / null as appropriate
- **AND** the upgrade SHALL complete without throwing

### Requirement: R2 bundle SHALL serialize dmn-* tables via dedicated adapters with documented merge strategies

The neurons R2 bundle (`users/<user_id>/neurons-snapshot.json.gz`) SHALL include three new adapter-keyed arrays in its `data` map, contributed by adapters registered in `NEURONS_ADAPTERS`:

- `dmnCards: DmnCardRow[]` — first-write-wins per `cardId`; if both sides have a row, keep the EARLIER `obtainedAt` (closed-cap collection — parallels `neuronVariants` immutability)
- `dmnEventLog: DmnEventLogRow[]` — **monotonic-union merge** (not LWW; see event-log requirement). Both sides converge to the same set; earlier `dispatchedAt` wins as the provenance instant
- `dmnActiveBuffs: DmnActiveBuffRow[]` — only non-expired rows pushed (`expiresAt > now`); incoming rows with `expiresAt <= now` rejected on apply; dedupe by `sourceCardId` to avoid double-buffing on sync round-trip

Additionally, the `meta` adapter's `SYNCED_META_KEYS` allowlist SHALL include all 8 DMN meta keys listed in the Dexie schema requirement.

All three adapter arrays SHALL be optional in the bundle data map (absent when local table is empty). A client at higher `SCHEMA_VERSION` reading a bundle from a lower-version client SHALL treat missing adapter keys as preserve-on-omission: local tables retain existing values, NOT overwritten with empty.

#### Scenario: Bundle round-trip preserves dmn-* state across same-version clients

- **GIVEN** device A writes a bundle with `data.dmnCards = [card-1]`, `data.dmnEventLog = [{cardId: 'card-1', dispatchedAt: 1700000000000, deviceId: 'A'}]`
- **WHEN** device B pulls the bundle and `applyBundleSnapshot` runs
- **THEN** device B's local `dmnCards` SHALL contain `card-1`
- **AND** device B's local `dmnEventLog` SHALL contain the dispatched entry
- **AND** dispatcher SHALL NOT re-trigger `card-1`'s event (idempotency via event log check)

### Requirement: DMN fate cards SHALL have real artwork registered in `theme-pixel-neurons`

The `neurons-dmn-fate-cards` capability SHALL ensure that every DMN fate-card sprite key declared by `add-neurons-dmn-fate-card` (the 20 entries in `DMN_CARD_CATALOG` plus the shared `dmn:card-back` key, total 21) has a corresponding real pixel-art PNG file registered in `theme-pixel-neurons`'s `SPRITE_MAP`. "Real artwork" means: a per-card PNG file at `packages/theme-pixel-neurons/sprites/cards/<cardId>.png` (for individual cards) or `packages/theme-pixel-neurons/sprites/cards/card-back.png` (for the shared back), NOT the 1×1 transparent-PNG data URI placeholder shipped during the original DMN fate-card change.

Each card sprite SHALL visually communicate at least two identity dimensions:

1. **DMN concept** named in the card's `displayName` and `description` field (e.g., `dmn-mpfc-reverberation-p2` 「內側前額葉迴響」 → visual metaphor for mPFC self-referential reverberation; `dmn-hippocampal-ripples-p2` 「海馬迴漣漪」 → cross-section of hippocampus with ripple waves)
2. **Rarity tier** visible at the card edges via border / glow / framing color (P1 鑽石 → gold inner glow + diamond corners; P2 金 → ornate gold border; P3 銀 → silver border; P4 銅 → thin bronze border)

Sprites SHALL be 384×384 PNG with transparent background and 16-color quantization (GBA-era pixel-art aesthetic), consistent with the documented `image_gen_routing.md` recipe used by sibling change `generate-neurons-sprites`.

The shared `dmn:card-back` sprite MAY be opaque (non-transparent background) since it represents a physical card flipped face-down.

This requirement supersedes the original placeholder mapping for DMN sprite keys only. Other sprite categories declared by `theme-pixel-neurons` (items / cosmetics / skill placeholders / variant gacha / 6 core scaffold keys) MAY remain on the transparent-PNG placeholder until their respective consumer capabilities ship.

#### Scenario: Theme pack ships real artwork per DMN card

- **GIVEN** the `neurons-dmn-fate-cards` capability is active and `theme-pixel-neurons` is loaded
- **WHEN** any consumer (`DmnCollectionPage`, `DmnDrawModal`, future achievement modal, etc.) reads `SPRITE_MAP['dmn:card:dmn-mpfc-reverberation-p2']`
- **THEN** the resolved URL SHALL point to a real PNG file under `packages/theme-pixel-neurons/sprites/cards/`
- **AND** the resolved URL SHALL NOT be the 1×1 transparent-PNG data URI used during the original DMN fate-card change

#### Scenario: All 20 cards + 1 shared card-back covered

- **GIVEN** the 20 cardIds declared by `DMN_CARD_CATALOG` in `@study-rpg/content-neurons-tw` plus the shared `dmn:card-back` key
- **WHEN** the developer iterates over those keys and checks `SPRITE_MAP[key]`
- **THEN** each lookup SHALL return a real PNG URL (not the transparent placeholder)
- **AND** no two cards SHALL share the same sprite file (except the shared `dmn:card-back`, which by design is reused on every locked / not-yet-drawn card silhouette)

#### Scenario: Sprite visual identity reflects card neuroscience anchor

- **GIVEN** a human reviewer opens `packages/theme-pixel-neurons/sprites/cards/dmn-hippocampal-ripples-p2.png`
- **THEN** the sprite SHALL display a hippocampus-related morphology cue (curled / seahorse-shaped silhouette OR ripple-wave pattern emanating from a central focus)
- **AND** the sprite SHALL display a P2-tier gold ornate border
- **AND** the same reviewer opening `dmn-default-mode-awakening-p1.png` SHALL see a multi-region brain silhouette with mPFC + PCC + precuneus + angular gyrus glow, AND a P1-tier gold-with-diamond-corners frame

#### Scenario: Sprite communicates rarity tier at a glance

- **GIVEN** a user opens `/dmn` collection page showing all 20 unlocked cards
- **WHEN** the user visually scans the grid without reading any text labels
- **THEN** P1 cards SHALL be visually distinguishable from P2/P3/P4 cards via border / glow framing
- **AND** the four rarity tiers SHALL each have a consistent framing convention across all cards of that tier

#### Scenario: Other sprite categories may remain placeholder until consumer ships

- **GIVEN** variant gacha / cosmetic / item / skill placeholder consumer capabilities have not yet shipped their own artwork generation
- **WHEN** the developer reads `SPRITE_MAP['variant:藥理學:3']` or `SPRITE_MAP['cosmetic-head-soma-newcomer-halo']` or similar non-DMN-card key
- **THEN** the resolved URL MAY still be the transparent-PNG placeholder
- **AND** this is acceptable until the respective consumer capability ships its own asset-generation change (separate future work)
