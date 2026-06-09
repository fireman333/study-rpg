# neurons-connector-family Specification (delta)

## MODIFIED Requirements

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
