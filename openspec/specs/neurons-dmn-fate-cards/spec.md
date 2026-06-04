# neurons-dmn-fate-cards Specification

## Purpose

Implements a mixed-trigger (expedition-axis + behavior-axis) fate-card collection system for neurons-mode themed on Default Mode Network (DMN) — the brain's resting-state network that produces "spontaneous insight" while the player rests. The closed-cap consumable catalog ships 22 cards across 4-tier rarity (P1–P4) with rarity weights summing to 100, spanning six consumable `eventKind` values (family-buff / variant-rate-up / quick-review-batch / hidden-reveal / surge / bolus); `streak-shield` is removed for integrity. Drawing a card does NOT auto-fire its effect — each draw deposits one consumable into the `inventory` backpack (`neurons-acceleration-system`) for manual activation, OR at low probability awards a permanent equipment/companion from the separate `neurons-acceleration-system` P1–P5 catalog. Pool-removal ensures unique consumable draws; the consumable dex completes at 22/22 and draws then only roll equipment. Cross-device sync uses a critical monotonic-union merge on the dispatch log to prevent re-trigger races on bundle apply.

## Requirements

### Requirement: DMN fate-card draw entitlement SHALL accrue via mixed time-axis and behavior-axis triggers with per-day caps

The neurons-tw mode SHALL grant DMN fate-card draws from two independent trigger axes, capped per local-TZ calendar day:

- **Expedition axis** (cap = milestone count = 2 draws/day): on each completed 出征 expedition session, let `pool` = the wrong-question count at session open (`questionHistory.lastResult === 'wrong'`, the value the session was launched against) and `cleared` = the number of those cleared this session (correct answers in the wrong-only pool — each a wrong→correct flip). For each milestone in `DMN_EXPEDITION_MILESTONES` (default `[{ pct: 0.25, min: 3, max: 15 }, { pct: 0.50, min: 6, max: 30 }]`) whose threshold `clamp(round(pct × pool), min, max)` is satisfied by `cleared`, the system SHALL grant +1 draw, up to the per-day cap (= `DMN_EXPEDITION_MILESTONES.length`) enforced via `dmnTimeAxisDrawsConsumedToday`. The clamp keeps draws reachable on large backlogs and non-trivial on tiny backlogs while preserving the proportional (percentage) feel in the mid band. Cumulative expedition clears for the current day are tracked in `dmnTimeAxisMinutesAccrued` (legacy key name retained for sync-schema stability; now stores expedition clears, NOT reading minutes) for display / telemetry only — it does NOT gate draws.
  - NOTE — legacy storage names + source change: this axis was historically the "reading-time axis" (30 min reading → +1 draw). As of `add-neurons-expedition-rewards` its input is expedition clears, NOT reading minutes; reading-timer activity SHALL NOT grant DMN draws (reading still fuels maze energy + `totalStudyMinutes`). The persisted meta counters keep their legacy names `dmnTimeAxisMinutesAccrued` / `dmnTimeAxisDrawsConsumedToday` to avoid a `SYNCED_META_KEYS` change and an R2 bundle `SCHEMA_VERSION` bump.
- **Behavior axis** (cap 3 draws/day): the system SHALL grant +1 bonus draw on each of the following events emitted by `connectome-collection`, up to a maximum of 3 behavior-axis draws per day:
  - `connectome.variantSlotUnlocked`
  - `connectome.synapseFormed` (new cross-family synapse created on N=5 same-day co-firing)
  - `connectome.synapseStrengthened` (existing synapse transitions dormant→weak or weak→strong)

These three primitives are chosen because they map naturally to "meaningful collection milestone" without requiring a daily-open streak service (which neurons-tw does not implement; correct-answer streak is per-question, not per-day).

The combined entitlement (expedition + behavior) SHALL be tracked as a single integer counter `dmnDrawsAvailable` (monotonic during the day, decremented on consume). Both axis day-counters reset at local-TZ midnight; entitled draws already accrued but unused SHALL persist across days (no expiry).

#### Scenario: Expedition session clears the first (25%) milestone → 1 draw

- **GIVEN** `dmnTimeAxisDrawsConsumedToday = 0` and a session opened against a wrong pool of 40 (so milestone thresholds are `clamp(round(0.25×40),3,15)=10` and `clamp(round(0.50×40),6,30)=20`)
- **WHEN** the player completes the session having cleared 12 wrong-questions
- **THEN** `dmnDrawsAvailable` SHALL increment by 1 (12 ≥ 10 but < 20)
- **AND** `dmnTimeAxisDrawsConsumedToday` SHALL increment by 1

#### Scenario: Clearing the second (50%) milestone in one session → 2 draws

- **GIVEN** `dmnTimeAxisDrawsConsumedToday = 0` and a session opened against a wrong pool of 40 (thresholds 10 and 20)
- **WHEN** the player completes the session having cleared 20 wrong-questions
- **THEN** `dmnDrawsAvailable` SHALL increment by 2 (both milestones met)
- **AND** `dmnTimeAxisDrawsConsumedToday` SHALL increment by 2

#### Scenario: Small-backlog floor prevents trivially cheap draws

- **GIVEN** `dmnTimeAxisDrawsConsumedToday = 0` and a session opened against a wrong pool of 8 (so the first threshold is `clamp(round(0.25×8),3,15)=clamp(2,3,15)=3`)
- **WHEN** the player completes the session having cleared 2 wrong-questions
- **THEN** no expedition-axis draw SHALL be granted (2 < the floored threshold 3)

#### Scenario: Large-backlog ceiling keeps draws reachable

- **GIVEN** `dmnTimeAxisDrawsConsumedToday = 0` and a session opened against a wrong pool of 300 (so the first threshold is `clamp(round(0.25×300),3,15)=clamp(75,3,15)=15`)
- **WHEN** the player completes the session having cleared 15 wrong-questions
- **THEN** `dmnDrawsAvailable` SHALL increment by 1 (the ceiling makes the milestone attainable rather than requiring 75)

#### Scenario: Daily cap across multiple sessions

- **GIVEN** the player has already consumed 2 expedition-axis draws today (`dmnTimeAxisDrawsConsumedToday = 2`)
- **WHEN** the player completes another session that satisfies one or both milestones
- **THEN** no additional expedition-axis draw SHALL be granted
- **AND** `dmnDrawsAvailable` SHALL NOT increment from the expedition axis

#### Scenario: Behavior-axis draw on synapse formed

- **GIVEN** `dmnBehaviorAxisDrawsConsumedToday = 0`
- **WHEN** `connectome-collection` emits `connectome.synapseFormed` (player triggered cross-family same-day co-firing reaching N=5 threshold)
- **THEN** `dmnDrawsAvailable` SHALL increment by 1
- **AND** `dmnBehaviorAxisDrawsConsumedToday` SHALL increment by 1

#### Scenario: Daily reset of both axis counters at local-TZ midnight

- **GIVEN** the local time is 23:59 with `dmnTimeAxisDrawsConsumedToday = 2`, `dmnBehaviorAxisDrawsConsumedToday = 3`, cumulative expedition clears today = 22, and `dmnDrawsAvailable = 4` (4 unused)
- **WHEN** the local clock crosses midnight and the player triggers any interaction (the lazy daily-reset job runs)
- **THEN** `dmnTimeAxisDrawsConsumedToday` SHALL reset to 0
- **AND** `dmnBehaviorAxisDrawsConsumedToday` SHALL reset to 0
- **AND** the cumulative expedition-clears counter (`dmnTimeAxisMinutesAccrued`) SHALL reset to 0
- **AND** `dmnDrawsAvailable` SHALL remain at 4 (unused draws persist across days)

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
- Expose `creditExpeditionDraws(pool: number, cleared: number)` which the expedition completion path (`onExpeditionComplete`) SHALL invoke on each completed session: it evaluates the `DMN_EXPEDITION_MILESTONES` thresholds against `cleared`, grants the corresponding draws subject to the per-day cap, and updates the cumulative expedition-clears counter for display
- Run daily-reset lazily on the first user interaction crossing local-TZ midnight (mirrors `connectome-collection` pattern)
- Persist all state via Dexie writes wrapped in transactions; emit informational logs after commit (no external event subscriber consumes `dmn.drawsGranted` yet)

The previously-exposed `ReadingTimerSubscriber` interface (reading-minute accrual) SHALL be removed; reading-timer no longer feeds the DMN axis.

#### Scenario: Trigger detector initializes on app boot

- **GIVEN** the neurons-tw app starts up
- **WHEN** the main entry (e.g., `App.tsx` or `main.tsx`) calls `initializeDmnTrigger()`
- **THEN** connectome event bus listeners SHALL be registered exactly once (singleton; second call is no-op)
- **AND** `creditExpeditionDraws` SHALL be exported for the expedition completion path to invoke

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

The `neurons-dmn-fate-cards` capability SHALL ensure that every DMN fate-card sprite key declared by the current `DMN_CARD_CATALOG` (the **22** entries after `add-neurons-acceleration-system` removed `streak-shield` and added the `surge` + `bolus` consumable kinds) plus the shared `dmn:card-back` key — total **23** — has a corresponding real pixel-art PNG file registered in `theme-pixel-neurons`'s `SPRITE_MAP`. "Real artwork" means: a per-card PNG file at `packages/theme-pixel-neurons/sprites/cards/<cardId>.png` (for individual cards) or `packages/theme-pixel-neurons/sprites/cards/card-back.png` (for the shared back), NOT the 1×1 transparent-PNG data URI placeholder.

The 6 cards added by `add-neurons-acceleration-system` — `dmn-locus-coeruleus-burst-p2`, `dmn-lactate-shuttle-p2`, `dmn-dopamine-gain-p3`, `dmn-astrocyte-fuel-p3`, `dmn-noradrenaline-spray-p4`, `dmn-glycogen-burst-p4` — SHALL each have a real PNG (generated by `generate-acceleration-sprites`). The 4 card PNGs corresponding to the removed `streak-shield` cards (`dmn-pcc-pulse-p2`, `dmn-temporal-pole-anchor-p3`, `dmn-micro-context-guard-p4`, `dmn-small-circuit-immunity-p4`) SHALL be removed from the theme package in lockstep with their catalog removal, leaving no orphaned card sprite.

Each card sprite SHALL visually communicate at least two identity dimensions:

1. **DMN / mechanism concept** named in the card's `displayName` and `description` (e.g., `dmn-locus-coeruleus-burst-p2` 「藍斑核爆發」 → a brainstem nucleus erupting in a noradrenaline burst; `dmn-lactate-shuttle-p2` 「乳酸穿梭」 → an astrocyte handing lactate fuel to a neuron). Surge cards (NE/DA phasic gain → speed) SHALL lean neuromodulator-cool (electric blue / magenta); bolus cards (astrocyte-neuron lactate shuttle → energy) SHALL lean warm amber metabolic.
2. **Rarity tier** visible at the card edges via border / glow / framing color (P1 鑽石 → gold inner glow + diamond corners; P2 金 → ornate gold border; P3 銀 → silver border; P4 銅 → thin bronze border).

Card sprites SHALL be 384×384 PNG with transparent background and 16-color quantization (GBA-era pixel-art aesthetic), consistent with the documented `image_gen_routing.md` recipe. Card prompts SHALL include an explicit no-text constraint (no captions, labels, or rarity-badge glyphs baked into the art).

The shared `dmn:card-back` sprite MAY be opaque (non-transparent background) since it represents a physical card flipped face-down.

This requirement supersedes the original placeholder mapping for DMN sprite keys only. Other sprite categories declared by `theme-pixel-neurons` (items / cosmetics / skill placeholders / variant gacha / 6 core scaffold keys) MAY remain on the transparent-PNG placeholder until their respective consumer capabilities ship. (Permanent equipment artwork is locked separately by `neurons-acceleration-system`.)

#### Scenario: Theme pack ships real artwork per DMN card

- **GIVEN** the `neurons-dmn-fate-cards` capability is active and `theme-pixel-neurons` is loaded
- **WHEN** any consumer (`DmnCollectionPage`, `DmnDrawModal`, backpack panel, etc.) reads `SPRITE_MAP['dmn:card:dmn-mpfc-reverberation-p2']` or any other current-catalog card key
- **THEN** the resolved URL SHALL point to a real PNG file under `packages/theme-pixel-neurons/sprites/cards/`
- **AND** the resolved URL SHALL NOT be the 1×1 transparent-PNG data URI placeholder

#### Scenario: All 22 cards + 1 shared card-back covered, surge/bolus included

- **GIVEN** the 22 cardIds declared by the current `DMN_CARD_CATALOG` in `@study-rpg/content-neurons-tw` plus the shared `dmn:card-back` key
- **WHEN** the developer iterates over those keys and checks `SPRITE_MAP[key]`
- **THEN** each lookup SHALL return a real PNG URL (not the transparent placeholder)
- **AND** the 6 surge/bolus cards added by `add-neurons-acceleration-system` SHALL each resolve to a real PNG
- **AND** no two cards SHALL share the same sprite file (except the shared `dmn:card-back`)

#### Scenario: Removed streak-shield cards leave no orphaned sprite

- **GIVEN** `streak-shield` was removed from `DMN_CARD_CATALOG` by `add-neurons-acceleration-system`
- **WHEN** the developer lists `packages/theme-pixel-neurons/sprites/cards/`
- **THEN** the 4 streak-shield card PNGs SHALL NOT be present
- **AND** every remaining card PNG SHALL correspond to a current `DMN_CARD_CATALOG` entry or the shared `card-back`

#### Scenario: Sprite communicates rarity tier at a glance

- **GIVEN** a user opens the `/dmn` backpack consumable dex showing unlocked cards
- **WHEN** the user visually scans the grid without reading any text labels
- **THEN** the four rarity tiers (P1/P2/P3/P4) SHALL each have a consistent border / glow framing convention
- **AND** surge cards SHALL read neuromodulator-cool while bolus cards read metabolic-warm

#### Scenario: Other sprite categories may remain placeholder until consumer ships

- **GIVEN** variant gacha / cosmetic / item / skill placeholder consumer capabilities have not yet shipped their own artwork
- **WHEN** the developer reads `SPRITE_MAP['cosmetic-head-soma-newcomer-halo']` or similar non-card, non-equipment key
- **THEN** the resolved URL MAY still be the transparent-PNG placeholder
- **AND** this is acceptable until the respective consumer capability ships its own asset-generation change
