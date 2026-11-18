## MODIFIED Requirements

### Requirement: Account-switch wipe covers all synced surfaces plus local drafts

The account-switch wipe helper SHALL clear (a) every Dexie table registered in `NEURONS_ADAPTERS` (the table list SHALL be derived from the adapter registry, not hand-maintained), (b) within the `meta` table, the keys in `SYNCED_META_KEYS` **plus every key under the entire daily-prescription namespace prefix `prescription:v1:`** — which spans the **synced daily-quest table** (`plan` / `wrong` / `breadth` / `completed` / `reward` / `cramRescue` / `wire` / `tierClaim`, per the `neurons-daily-prescription` daily-state sync requirement), the device-local ritual keys (`lightsOut` / `localSeed`), AND the synced NG-0717 lineage-imprint keepsake sub-prefix `prescription:v1:ng0717:imprint:` — because that state is account-OWNED rather than device-local: the `completed:<date>` keys drive the account's NG-0717 maturation stage, the tier claims and progress keys are its daily-quest state, and the imprint keys are its keepsake, so leaving them would bleed the outgoing account's NG-0717 stage / keepsake / today's progress / claimed tiers into the next account — **plus every key under the single-subject-rescue namespace prefix `rescue:v1:`** (the synced rescue plan envelope and the run-scoped confidence / override keys, per the `neurons-single-subject-rescue` rescue key-family requirement), because a rescue plan, its confidence signals, and its stop-loss overrides are likewise account-OWNED exam state that must not bleed into the next account. (The wipe's SCOPE for the prescription prefix is unchanged by the daily-state sync — the whole `prescription:v1:` prefix was already cleared; only its description changed, from mostly-local-only to mostly-synced. The `rescue:v1:` prefix is a NEW wipe surface added by `add-neurons-rescue-r2-sync`.) Device-local meta keys OUTSIDE these prefixes (e.g. onboarding flags, `prescription:homeCollapsed`) SHALL be preserved, and the device-local rescue telemetry (localStorage) is outside the wipe's Dexie scope by construction. The helper SHALL also clear (c) the local-only `mockExamDrafts` table, because drafts contain the previous account's answer content. The wipe SHALL NOT create any cloud-side effect (no push, no delete request).

#### Scenario: Wipe clears adapter tables and synced meta only

- **WHEN** the wipe helper runs on a device with data in all 22 Dexie tables
- **THEN** the 21 adapter-registered tables (including `handoutClozeState`) and `mockExamDrafts` are empty, synced meta keys (including `clozeMaturityDrawsCredited`) are deleted, and device-local meta keys (e.g. onboarding flags) remain

#### Scenario: Wipe clears the account-owned prescription state and NG-0717 keepsake

- **WHEN** the wipe helper runs on a device carrying the previous account's daily-prescription state — the completion keys (`prescription:v1:completed:<date>`) that drive its NG-0717 maturation stage, the plan / wrong / breadth / reward / cramRescue / wire / tierClaim keys, the local ritual keys (lightsOut / localSeed), and the NG-0717 lineage-imprint keys under `prescription:v1:ng0717:imprint:`
- **THEN** every key under the `prescription:v1:` prefix SHALL be deleted — so the next account inherits neither the previous account's NG-0717 maturation stage, nor its keepsake buds, nor today's prescription progress or claimed tiers (no "混血 NG-0717") — while device-local meta keys outside that prefix (e.g. `prescription:homeCollapsed`, onboarding flags) remain

#### Scenario: Wipe clears the account-owned rescue state

- **WHEN** the wipe helper runs on a device carrying the previous account's rescue state — the plan envelope at `rescue:v1:plan` and run-scoped `rescue:v1:conf:*` / `rescue:v1:ovr:*` keys
- **THEN** every key under the `rescue:v1:` prefix SHALL be deleted, so the next account inherits no rescue plan, confidence signals, or stop-loss overrides
- **AND** device-local rescue telemetry (localStorage) is not a Dexie surface and is not touched by this helper

#### Scenario: Wipe stays in lockstep with future adapters

- **WHEN** a future change registers a new TableAdapter in `NEURONS_ADAPTERS`
- **THEN** the wipe helper covers the new table with no further code change, and a Vitest lock fails if any adapter name has no corresponding Dexie table

## ADDED Requirements

### Requirement: The neurons bundle SHALL carry handout cloze card state and the cloze maturity ledger from bundle schema version 29

The R2 `'neurons'` bundle SHALL carry the `handoutClozeState` Dexie table through its own adapter registered in `NEURONS_ADAPTERS`, whose row semantics and merge rule are owned by `neurons-handout-cloze-review`. It SHALL also carry the meta key `clozeMaturityDrawsCredited`, listed in `SYNCED_META_KEYS` and in the post-pull MAX-merge counter set, so that the value converges to the numeric MAX of the two sides regardless of which side the meta adapter's first-write-wins transport kept.

Adding them SHALL raise the bundle's `SCHEMA_VERSION` from 28 to 29. Without the raise, a client that predates them could overwrite the cloud bundle with a snapshot that lacks the table key and the meta key, and every device would then read the learner's collected cards and their schedules as empty. With the raise, the existing Worker refusal of a `schema_version` downgrade SHALL stop that client's push before any bytes are written, and the client SHALL show the existing one-time reload prompt.

A version 29 client reading a bundle of version 28 or older SHALL treat the missing table key as an empty table and the missing meta key as absent, without an error and without deleting local rows. The push-trigger table set and the account-switch wipe SHALL include `handoutClozeState` by derivation from the adapter registry, not by a hand-maintained list.

The card telemetry log and the daily push journal of `neurons-handout-cloze-review` SHALL NOT enter the bundle.

#### Scenario: A version 29 client reads a version 28 bundle
- **GIVEN** a cloud bundle with `schema_version: 28` and no card-state key
- **WHEN** a version 29 client applies it
- **THEN** no error SHALL be thrown AND local `handoutClozeState` rows SHALL be unchanged

#### Scenario: A version 28 client cannot strip the key
- **GIVEN** a cloud bundle with `schema_version: 29` carrying card state
- **WHEN** a version 28 client attempts to push
- **THEN** the push SHALL be refused by the downgrade guard AND the cloud bundle SHALL still carry the card state

#### Scenario: The maturity ledger is not rolled back by a stale device
- **GIVEN** local `clozeMaturityDrawsCredited = 3`
- **AND** a pulled bundle carries `clozeMaturityDrawsCredited = 2`
- **WHEN** the post-pull backfill runs
- **THEN** local `clozeMaturityDrawsCredited` SHALL remain `3`

#### Scenario: The card table is a push trigger
- **WHEN** a learner collects a card while signed in
- **THEN** a debounced push SHALL be scheduled without any other table being written
