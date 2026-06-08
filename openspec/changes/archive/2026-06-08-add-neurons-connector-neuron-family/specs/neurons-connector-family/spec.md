## ADDED Requirements

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

#### Scenario: First strong wire unlocks the connector

- **WHEN** the wire for pair (A, B) transitions from `weak` to `strong` and no connector exists yet for that `pairKey`
- **THEN** the connector for (A, B) is unlocked and persisted with an unlock timestamp

#### Scenario: Re-strengthening does not duplicate

- **WHEN** a wire that already has an unlocked connector decays and later returns to `strong`
- **THEN** no second connector is created and the original unlock timestamp is preserved

#### Scenario: Non-strong transitions do not unlock

- **WHEN** a wire forms (`dormant → weak`) or conducts without changing tier
- **THEN** no connector is unlocked

### Requirement: Monotonic permanence

Once unlocked, a connector SHALL be permanent. It SHALL remain in the collection even if its wire later decays `strong → weak → dormant`, and SHALL be decoupled from the「穩定連線數」narrative stat (which may exclude decayed or legacy wires). No operation SHALL delete or re-lock a connector.

#### Scenario: Wire decay does not remove the connector

- **WHEN** an unlocked connector's wire decays below `strong` (or to `dormant`)
- **THEN** the connector remains unlocked and visible in the collection

### Requirement: Retroactive backfill on upgrade

On the first load after the connector feature is installed, the system SHALL scan existing synaptic wires and unlock the connector for every pair whose wire is currently in the `strong` state, including legacy「早期連線」wires. Backfilled connectors SHALL be marked unlocked with a deterministic timestamp and SHALL be idempotent across repeated upgrades (no duplicates).

#### Scenario: Existing strong wires backfill on upgrade

- **WHEN** a save with one or more currently-`strong` wires is loaded for the first time after upgrade
- **THEN** each such pair's connector is unlocked immediately, before any new expedition

#### Scenario: Backfill is idempotent

- **WHEN** the upgrade/backfill path runs and a connector for a pair already exists
- **THEN** it is left unchanged (no duplicate, no timestamp overwrite)

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

The collection page SHALL present a dedicated「連結神經元」section showing collection progress as `N/55`, separate from the per-family variant sections, as a flat grid not grouped by family. Unlocked connectors SHALL render as colored cards; locked connectors SHALL render as silhouettes.

#### Scenario: Section shows progress and states

- **WHEN** the player opens the collection page with K connectors unlocked
- **THEN** a「連結神經元 K/55」section is shown with K colored connector cards and (55 − K) locked silhouettes

#### Scenario: Section is independent of family filter grouping

- **WHEN** the connector section is rendered
- **THEN** connectors appear in a single flat grid spanning all pairs, not nested inside any one family's section

### Requirement: Procedural placeholder visual

Each connector SHALL render with a procedural visual derived from its two families' colors: a split-color frame using both families' `FAMILY_COLOR`, plus a shared bridge/axon silhouette and a synaptic glow — requiring no per-connector image asset. The rendering SHALL support a future per-pair sprite: when a connector sprite (keyed `connector:<pairKey>`) is present it SHALL be used; when absent, the procedural placeholder SHALL be shown, and a missing sprite SHALL never produce a broken image.

#### Scenario: Procedural placeholder when no sprite present

- **WHEN** a connector has no registered sprite asset
- **THEN** it renders as a split-color frame of its two family colors with a bridge silhouette and glow, with no broken image

#### Scenario: Sprite override when present

- **WHEN** a connector's sprite asset (`connector:<pairKey>`) is registered
- **THEN** that sprite is used in place of the procedural placeholder
