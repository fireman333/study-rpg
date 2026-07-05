## MODIFIED Requirements

### Requirement: Account-switch wipe covers all synced surfaces plus local drafts

The account-switch wipe helper SHALL clear (a) every Dexie table registered in `NEURONS_ADAPTERS` (the table list SHALL be derived from the adapter registry, not hand-maintained), (b) within the `meta` table, the keys in `SYNCED_META_KEYS` **plus every key matching the synced imprint prefix `prescription:v1:ng0717:imprint:`** (device-local meta keys such as onboarding flags are preserved), and (c) the local-only `mockExamDrafts` table, because drafts contain the previous account's answer content. The wipe SHALL NOT create any cloud-side effect (no push, no delete request).

#### Scenario: Wipe clears adapter tables and synced meta only

- **WHEN** the wipe helper runs on a device with data in all 21 Dexie tables
- **THEN** the 20 adapter-registered tables and `mockExamDrafts` are empty, synced meta keys are deleted, and device-local meta keys (e.g. onboarding flags) remain

#### Scenario: Wipe clears synced NG-0717 imprint keepsake keys

- **WHEN** the wipe helper runs on a device that has grown NG-0717 lineage imprints (keys under `prescription:v1:ng0717:imprint:`)
- **THEN** those imprint keys SHALL be deleted along with `SYNCED_META_KEYS` (the keepsake belongs to the account being switched away from), while device-local meta keys remain

#### Scenario: Wipe stays in lockstep with future adapters

- **WHEN** a future change registers a new TableAdapter in `NEURONS_ADAPTERS`
- **THEN** the wipe helper covers the new table with no further code change, and a Vitest lock fails if any adapter name has no corresponding Dexie table

## ADDED Requirements

### Requirement: Synced meta set SHALL admit a prefix-matched key family for dynamic keepsakes

The synced-meta membership test SHALL admit, in addition to the enumerated `SYNCED_META_KEYS` allowlist, keys matching a small set of explicit **synced prefixes** — introduced for NG-0717 lineage imprints (`prescription:v1:ng0717:imprint:`) whose keys are dynamic (subject × date) and therefore cannot be enumerated. Both the `metaAdapter` snapshot (which rows enter the bundle) and its apply (which incoming rows are accepted) SHALL use the SAME membership test (allowlist OR synced-prefix), so the two directions never diverge. A synced prefix SHALL be specific enough to match ONLY its intended key family and SHALL NOT capture sibling keys under a shared ancestor namespace (e.g. `prescription:v1:ng0717:imprint:` SHALL NOT match `prescription:v1:completed:` or `prescription:v1:localSeed`). Prefix-matched keys SHALL be merged by the metaAdapter's existing first-write-wins rule; a prefix family SHALL only be used for **write-once presence keys** where first-write-wins equals a UNION (adding a prefix family whose values mutate or delete would be incorrect and SHALL NOT be done).

#### Scenario: Snapshot and apply use the same allowlist-or-prefix membership test
- **WHEN** the metaAdapter snapshots meta rows and later applies incoming meta rows
- **THEN** both SHALL include a key iff it is in `SYNCED_META_KEYS` OR it matches a registered synced prefix, so no key syncs in one direction but not the other

#### Scenario: A synced prefix matches only its intended family
- **WHEN** the imprint prefix `prescription:v1:ng0717:imprint:` is evaluated against `prescription:v1:completed:2026-07-05` and `prescription:v1:localSeed`
- **THEN** neither sibling key SHALL be treated as synced (the prefix is exact to the imprint family)

#### Scenario: Prefix families are write-once presence keys merged by first-write-wins UNION
- **WHEN** a prefix-matched imprint key is present on one device and absent on another
- **THEN** the merge SHALL add it where absent (first-write-wins) and SHALL never delete it, yielding a UNION across devices
