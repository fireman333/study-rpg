# neurons-connector-family Specification

## Purpose

Defines the connector neuron collectible in `apps/neurons-tw` — a "bridge class" distinct from the subject families and the variant gacha. A connector hub neuron bridges two subject families (modules); it is unlocked the first time that pair's synaptic wire reaches `strong`, and is a permanent collectible decoupled from the connectome's gameplay wire state. The set is closed (one connector per unordered family pair = 11C2 = 55), persisted in its own Dexie table, synced additively with union/monotonic merge, and rendered with a shared set of generic bridge-neuron sprites over a procedural split-color card fallback. Neuroscience framing (OE/PubMed-verified): connector hub / high participation coefficient / rich-club integration substrate (van den Heuvel & Sporns 2013 *J Neurosci*; Schroeter 2015; Senden 2018; Bagarinao 2020).

## Requirements

### Requirement: Closed connector set

The system SHALL define a closed set of connector neurons derived from the subject families, with exactly one connector per unordered pair of distinct families. With 11 families this set SHALL contain 11C2 = 55 connectors. The set SHALL NOT be a gacha pool, SHALL NOT be drawn by any random roll, and SHALL NOT introduce a 12th subject family — connectors are a distinct "bridge class".

Each connector SHALL be identified by a canonical `pairKey`: the two family ids sorted by a deterministic, stable string comparison and joined with `|` (e.g. `生物化學|藥理學`). The same pair SHALL always produce the same `pairKey` regardless of argument order.

#### Scenario: Set size matches family count

- **WHEN** the connector catalog is derived from the 11 `FAMILY_IDS`
- **THEN** it contains exactly 55 entries, each a distinct unordered family pair, with no duplicates and no self-pairs

#### Scenario: pairKey is order-independent

- **WHEN** a connector key is requested for families (A, B) and again for (B, A)
- **THEN** both calls return the identical canonical `pairKey`

#### Scenario: No monetary or random path

- **WHEN** a connector is obtained
- **THEN** it is obtained only via the wire-strong unlock trigger (below) — never via a gacha roll, purchase, ad reward, or any random draw

### Requirement: Unlock on first strong wire

The system SHALL permanently unlock a pair's connector the first time that pair's synaptic wire transitions into the `strong` state. The trigger SHALL observe the existing `weak → strong` transition produced during expedition settlement (the `connectome.synapseStrengthened` event), and SHALL NOT require any new player action beyond the study/expedition that strengthens the wire.

Unlocking SHALL be idempotent: a wire that re-enters `strong` after the connector already exists SHALL NOT create a duplicate and SHALL NOT change the original unlock time.

**Unlock provenance (`unlockSource`).** Each connector row SHALL carry an optional `unlockSource: 'validated' | 'legacy-backfill'` field stamped at unlock time. Forward unlocks (a wire transitioning to `strong` on or after the connector-feature install) SHALL stamp `'validated'`. Backfilled unlocks for wires whose `lastCoFireDate` precedes the conduction-rework ship epoch SHALL stamp `'legacy-backfill'` (see the backfill Requirement). A connector row without an `unlockSource` field (legacy rows from before this change shipped) SHALL be tolerated as `unknown` provenance — readers SHALL NOT crash, retry, or backfill it; it stays in the collection as-is.

The connector row itself, its `pairKey`, and its「monotonic permanence」 are identical regardless of provenance. `unlockSource` is a display-only marker (see the collection-page Requirement); it does NOT gate ownership, sync, or any downstream stat.

#### Scenario: First strong wire unlocks the connector

- **WHEN** the wire for pair (A, B) transitions from `weak` to `strong` and no connector exists yet for that `pairKey`
- **THEN** the connector for (A, B) is unlocked and persisted with an unlock timestamp
- **AND** `unlockSource` SHALL be stamped `'validated'`

#### Scenario: Re-strengthening does not duplicate

- **WHEN** a wire that already has an unlocked connector decays and later returns to `strong`
- **THEN** no second connector is created and the original unlock timestamp is preserved
- **AND** the original `unlockSource` (if present) SHALL NOT be overwritten

#### Scenario: Non-strong transitions do not unlock

- **WHEN** a wire forms (`dormant → weak`) or conducts without changing tier
- **THEN** no connector is unlocked

#### Scenario: Existing unlocked-without-provenance row is tolerated

- **GIVEN** a connector row persisted before this change shipped (no `unlockSource` field)
- **WHEN** the collection page renders or sync round-trips the row
- **THEN** the row SHALL be displayed and synced normally
- **AND** the system SHALL NOT attempt to retroactively classify or backfill its provenance

### Requirement: Monotonic permanence

Once unlocked, a connector SHALL be permanent. It SHALL remain in the collection even if its wire later decays `strong → weak → dormant`, and SHALL be decoupled from the「穩定連線數」narrative stat (which may exclude decayed or legacy wires). No operation SHALL delete or re-lock a connector.

#### Scenario: Wire decay does not remove the connector

- **WHEN** an unlocked connector's wire decays below `strong` (or to `dormant`)
- **THEN** the connector remains unlocked and visible in the collection

### Requirement: Retroactive backfill on upgrade

On the first load after the connector feature is installed, the system SHALL scan existing synaptic wires and unlock the connector for every pair whose wire is currently in the `strong` state, **including legacy「早期連線」wires** (those whose `lastCoFireDate` precedes the conduction-rework ship epoch per `connectome-collection`'s legacy-trace Requirement). Backfilled connectors SHALL be marked unlocked with a deterministic timestamp and SHALL be idempotent across repeated upgrades (no duplicates).

**Lifetime ownership vs currently-validated split (explicit).** The decision to include legacy wires in the backfill is by design: connector collection SHALL track「the player has ever wired this pair into `strong` state」 (lifetime ownership, mirroring the connector's existing「monotonic permanence」 rule), NOT「the player currently maintains a validated wire for this pair」 (which is owned by `connectome-collection`'s 穩定連線數 stat). The two surfaces ARE intentionally distinct:

| Surface | What it tracks | Where defined |
|---|---|---|
| Connector count (`🔗 X 隻`) | Lifetime ever-wired pairs (incl. legacy + decayed) | This capability |
| 穩定連線數 narrative stat | Currently-validated wires (excludes legacy + dormant) | `connectome-collection` |

A divergence between connector count and 穩定連線數 (e.g.「5 connectors / 0 stable wires」 immediately after upgrade for a save with 5 legacy strong wires) is **expected and correct**, not a bug. It mirrors the lifetime-vs-currently-held split already adopted for variant collection (`copies` lifetime mint vs `ownedSlotCount` held).

**Provenance stamping.** Backfilled connectors whose underlying wire's `lastCoFireDate` precedes the ship epoch SHALL stamp `unlockSource: 'legacy-backfill'`. Backfilled connectors whose underlying wire's `lastCoFireDate` is post-epoch (an edge case: the wire is fresh but the backfill happens to see it as `strong`) SHALL stamp `unlockSource: 'validated'`.

#### Scenario: Existing strong wires backfill on upgrade

- **WHEN** a save with one or more currently-`strong` wires is loaded for the first time after upgrade
- **THEN** each such pair's connector is unlocked immediately, before any new expedition

#### Scenario: Legacy strong wire backfill stamps legacy-backfill provenance

- **GIVEN** a save with a `strong` wire whose `lastCoFireDate` precedes the conduction-rework ship epoch
- **WHEN** the backfill helper runs
- **THEN** the connector SHALL be unlocked
- **AND** `unlockSource` SHALL be stamped `'legacy-backfill'`

#### Scenario: Post-epoch strong wire backfill stamps validated provenance

- **GIVEN** a save with a `strong` wire whose `lastCoFireDate` is on or after the conduction-rework ship epoch but the backfill helper has not yet run (e.g. a save that strengthened a wire post-epoch but installed the connector feature later)
- **WHEN** the backfill helper runs
- **THEN** the connector SHALL be unlocked
- **AND** `unlockSource` SHALL be stamped `'validated'`

#### Scenario: Backfill is idempotent

- **WHEN** the upgrade/backfill path runs and a connector for a pair already exists
- **THEN** it is left unchanged (no duplicate, no timestamp overwrite, no `unlockSource` overwrite)

#### Scenario: Connector count and 穩定連線數 are independent stats by design

- **GIVEN** a save with 5 legacy strong wires (pre-epoch `lastCoFireDate`) and 0 post-epoch validated wires
- **WHEN** the homepage renders 穩定連線數 and the collection page renders the connector section
- **THEN** the connector section SHALL show「🔗 5 隻」 (lifetime ever-wired)
- **AND** 穩定連線數 SHALL show `0` (currently-validated, per `connectome-collection`)
- **AND** the divergence SHALL NOT be surfaced as an error or warning

### Requirement: Cross-device union merge

Connector unlocks SHALL sync across devices additively. Merge SHALL be a union by `pairKey` with monotonic semantics: a connector present on either device SHALL be present after merge, and a connector SHALL never be removed by a stale device that has not yet seen it. When both sides have the same connector, the earlier `unlockedAt` SHALL win.

The sync payload SHALL be additive and reader-tolerant: an older client SHALL safely ignore the connector data, and a newer client reading an older payload SHALL preserve its locally unlocked connectors.

#### Scenario: Union across devices

- **WHEN** device 1 has unlocked connector X and device 2 has unlocked connector Y, and they sync
- **THEN** both devices end with connectors X and Y unlocked

#### Scenario: Stale device cannot un-unlock

- **WHEN** a device that has not unlocked connector X pushes its state after another device unlocked X
- **THEN** connector X remains unlocked everywhere

#### Scenario: Older client tolerates connector payload

- **WHEN** a client that predates the connector feature reads a payload containing connector data
- **THEN** it ignores the unknown data without error and does not lose its other state

### Requirement: Collection-page connector section

The collection page SHALL present a dedicated「連結神經元」section, separate from the per-family variant sections, as a flat grid not grouped by family. The section SHALL use the same **open-collection** model as the per-family variant sections (`neurons-variant-collection-view`): it SHALL render ONLY the connectors the player has unlocked — no locked silhouettes, no dimmed or fog placeholders for un-unlocked pairs — and the closed-set total (55) SHALL be hidden from the player. Progress SHALL render as a pure count (`🔗 X 隻`), NOT as an `N/55` fraction. Each unlocked connector SHALL render as a colored card (its registered sprite when present, else the procedural split-color fallback per the Procedural placeholder visual Requirement).

The closed 55-set, the unlock trigger, monotonic permanence, backfill, and sync requirements are unchanged — only the collection-page presentation changes (locked entries are no longer shown, and the total is no longer surfaced).

**Provenance display (optional).** When rendering an unlocked connector whose `unlockSource` is `'legacy-backfill'` AND whose underlying wire is currently in the historical / legacy trace state per `connectome-collection`'s legacy-trace Requirement (i.e. `lastCoFireDate` still precedes the ship epoch — the player has not yet re-validated it via a new expedition co-repair), the UI MAY render an unobtrusive provenance marker (e.g. a small「早期連線·已收藏」 chip, or a faint border treatment). The marker SHALL NOT gate or affect ownership and SHALL NOT change the count. Once a re-validation co-repair updates the underlying wire's `lastCoFireDate` to ≥ the ship epoch, the marker SHALL disappear at next render. A connector with `unlockSource` of `'validated'` or `undefined` (unknown) SHALL NOT show the marker.

The provenance marker is a UI affordance, not a contract: this Requirement uses MAY rather than SHALL because the marker is non-load-bearing — a build that omits it is still correct, but a build that shows it SHALL follow the rule above (only render for `'legacy-backfill'` + currently-legacy wire, never for other combinations).

#### Scenario: Section shows only unlocked connectors

- **WHEN** the player opens the collection page with K connectors unlocked (of the closed 55-set)
- **THEN** a「連結神經元」section is shown with exactly K colored connector cards
- **AND** NO locked silhouette / dimmed / fog placeholder renders for the (55 − K) un-unlocked pairs
- **AND** the count renders as「🔗 K 隻」with no `/55` denominator, and the closed-set total SHALL NOT be surfaced to the player

#### Scenario: Empty until first unlock

- **GIVEN** the player has unlocked no connectors
- **WHEN** the connector section renders
- **THEN** it shows zero connector cards (an empty or hint state), with no silhouettes and no `0/55`

#### Scenario: Section is independent of family filter grouping

- **WHEN** the connector section is rendered
- **THEN** the unlocked connectors appear in a single flat grid spanning all pairs, not nested inside any one family's section

#### Scenario: Legacy-backfill provenance marker only shows for currently-legacy wires

- **GIVEN** the UI implements the optional provenance marker
- **AND** the collection has two unlocked connectors: one with `unlockSource: 'legacy-backfill'` whose wire is still legacy, and one with `unlockSource: 'legacy-backfill'` whose wire has been re-validated post-epoch
- **WHEN** the section renders
- **THEN** the first connector SHALL show the「早期連線·已收藏」 marker
- **AND** the second connector SHALL NOT show the marker (re-validated, so no longer a current legacy state)

#### Scenario: Validated and unknown provenance never show legacy marker

- **GIVEN** the UI implements the optional provenance marker
- **AND** two unlocked connectors with `unlockSource: 'validated'` and `unlockSource: undefined` (pre-change legacy row)
- **WHEN** the section renders
- **THEN** neither connector SHALL show the legacy marker

### Requirement: Procedural placeholder visual

Each connector SHALL render its registered sprite when one is present, and fall back to a procedural visual when none is present. Connector sprite art ships as a shared set of generic "bridge hub neuron" variety sprites distributed across the closed set (keyed `connector:<pairKey>`) — NOT per-pair-themed: subject identity is carried by the split-color frame, and the sprite provides only visual charm. The procedural fallback derives from the two families' colors: a split-color frame using both families' `FAMILY_COLOR`, plus a shared bridge/axon silhouette and a synaptic glow, requiring no image asset. When a connector sprite is present it SHALL be used; when absent, the procedural placeholder SHALL be shown; a missing sprite SHALL never produce a broken image.

#### Scenario: Procedural placeholder when no sprite present

- **WHEN** a connector has no registered sprite asset
- **THEN** it renders as a split-color frame of its two family colors with a bridge silhouette and glow, with no broken image

#### Scenario: Sprite override when present

- **WHEN** a connector's sprite asset (`connector:<pairKey>`) is registered
- **THEN** that sprite is used in place of the procedural placeholder

#### Scenario: Generic sprite set distributed across the closed set

- **WHEN** the connector sprite set is shipped
- **THEN** a shared set of generic bridge-neuron variants covers all 55 pairkeys (one registered sprite per pairkey), with the split-color frame distinguishing each pair

### Requirement: Connector card label surfaces the 科目

Each unlocked connector card SHALL label both bridged families with their 科目 (subject id), not the
neuron cell-type persona alone, so the player can tell which two subjects the connection bridges. The
label SHALL use the same `科目（cell-type）` form as the per-family sections
(`CollectionPage.familyDisplayLabel`), falling back to the 科目 alone when a subject has no distinct
cell-type. Both the visible pair label and the card's `aria-label` SHALL use this form.

#### Scenario: Connector card shows 科目（cell-type）

- **WHEN** an unlocked connector bridging 藥理學 and 病理學 renders
- **THEN** the card SHALL display `藥理學（VTA Dopaminergic） ⇌ 病理學（Striatal MSN）` (科目 leading), NOT `VTA Dopaminergic ⇌ Striatal MSN`
- **AND** the card's `aria-label` SHALL name both 科目
