## RENAMED Requirements

- FROM: `### Requirement: Lineage imprint state SHALL persist in local-only meta keys with no schema or sync change`
- TO: `### Requirement: Lineage imprint state SHALL persist as a cross-device write-once keepsake`

## MODIFIED Requirements

### Requirement: Lineage imprint state SHALL persist as a cross-device write-once keepsake

All lineage-imprint state SHALL live in the existing `meta` key-value table under the `prescription:v1:ng0717:imprint:<subjectId>:<date>` namespace as **write-once** presence keys (set to a truthy value, never deleted). Imprint keys SHALL participate in cross-device sync as a **keepsake**: they join the synced meta set via a key **prefix** (`prescription:v1:ng0717:imprint:`) rather than an enumerated allowlist entry (the keys are dynamic — subject × date). Because the keys are write-once presence markers, their cross-device merge SHALL be **first-write-wins UNION** (the same convergence as the set-once `mazeSecondLapCelebrated:<family>` keys): a bud grown on either device ends up present on both, and a family's `touches` accumulates across devices as the UNION of its per-date keys. NO backfill post-pass and NO new R2 adapter SHALL be added. This SHALL be an **additive** R2 bundle `SCHEMA_VERSION` bump with reader tolerance (an older client reading a newer bundle SHALL silently drop the imprint keys it does not recognise; a newer client reading an older bundle without imprint keys SHALL preserve its local imprints — first-write-wins never deletes local keys absent from the incoming bundle). The prefix SHALL match ONLY imprint keys and SHALL NOT sync any other `prescription:v1:*` key (plan / wrong / breadth / completed / reward / lightsOut / localSeed remain local-only daily state). NO Dexie `.version()` bump SHALL be introduced (the keys already exist locally; only the meta sync filter widens). Imprints SHALL remain **monotonic**; no spendable or bidirectional counter SHALL be added.

#### Scenario: Imprint keys are write-once and sync via the prefix as a UNION keepsake
- **WHEN** a device grows an imprint key `prescription:v1:ng0717:imprint:藥理學:2026-07-05`
- **THEN** it SHALL be written once (truthy, never deleted) and SHALL be included in the device's synced meta snapshot by matching the imprint prefix
- **AND** on a second device the merge SHALL add that key if absent (first-write-wins UNION), so the bud appears on both devices and `touches` reflects the union of per-date keys

#### Scenario: Only imprint keys sync, not other prescription state
- **WHEN** the synced meta snapshot is built
- **THEN** keys under `prescription:v1:ng0717:imprint:` SHALL be included, and other `prescription:v1:*` keys (plan / wrong / breadth / completed / reward / lightsOut / localSeed) SHALL NOT be included

#### Scenario: Additive schema bump is reader-tolerant in both directions
- **WHEN** a client on the previous `SCHEMA_VERSION` reads a bundle containing imprint keys
- **THEN** it SHALL silently drop those keys (not in its allowlist/prefix), with no error
- **AND WHEN** a client on the new `SCHEMA_VERSION` reads an older bundle with no imprint keys
- **THEN** it SHALL preserve its local imprints (first-write-wins never deletes local keys absent from the incoming bundle)

#### Scenario: No Dexie bump and no bidirectional counter
- **WHEN** the keepsake sync is implemented
- **THEN** there SHALL be no Dexie `.version()` bump and no spendable/bidirectional counter — only the meta sync filter widens to include the imprint prefix and the R2 `SCHEMA_VERSION` bumps additively
