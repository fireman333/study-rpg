## MODIFIED Requirements

### Requirement: Account-switch wipe covers all synced surfaces plus local drafts

The account-switch wipe helper SHALL clear (a) every Dexie table registered in `NEURONS_ADAPTERS` (the table list SHALL be derived from the adapter registry, not hand-maintained), (b) within the `meta` table, the keys in `SYNCED_META_KEYS` **plus every key under the entire daily-prescription namespace prefix `prescription:v1:`** — which spans the **synced daily-quest table** (`plan` / `wrong` / `breadth` / `completed` / `reward` / `cramRescue` / `wire` / `tierClaim`, per the `neurons-daily-prescription` daily-state sync requirement), the device-local ritual keys (`lightsOut` / `localSeed`), AND the synced NG-0717 lineage-imprint keepsake sub-prefix `prescription:v1:ng0717:imprint:` — because that state is account-OWNED rather than device-local: the `completed:<date>` keys drive the account's NG-0717 maturation stage, the tier claims and progress keys are its daily-quest state, and the imprint keys are its keepsake, so leaving them would bleed the outgoing account's NG-0717 stage / keepsake / today's progress / claimed tiers into the next account — **plus every key under the single-subject-rescue namespace prefix `rescue:v1:`** (the synced rescue plan envelope and the run-scoped confidence / override keys, per the `neurons-single-subject-rescue` rescue key-family requirement), because a rescue plan, its confidence signals, and its stop-loss overrides are likewise account-OWNED exam state that must not bleed into the next account. (The wipe's SCOPE for the prescription prefix is unchanged by the daily-state sync — the whole `prescription:v1:` prefix was already cleared; only its description changed, from mostly-local-only to mostly-synced. The `rescue:v1:` prefix is a NEW wipe surface added by `add-neurons-rescue-r2-sync`.) Device-local meta keys OUTSIDE these prefixes (e.g. onboarding flags, `prescription:homeCollapsed`) SHALL be preserved, and the device-local rescue telemetry (localStorage) is outside the wipe's Dexie scope by construction. The helper SHALL also clear (c) the local-only `mockExamDrafts` table, because drafts contain the previous account's answer content. The wipe SHALL NOT create any cloud-side effect (no push, no delete request).

#### Scenario: Wipe clears adapter tables and synced meta only

- **WHEN** the wipe helper runs on a device with data in all 21 Dexie tables
- **THEN** the 20 adapter-registered tables and `mockExamDrafts` are empty, synced meta keys are deleted, and device-local meta keys (e.g. onboarding flags) remain

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

### Requirement: Synced meta set SHALL admit a prefix-matched key family for dynamic keepsakes

The synced-meta membership test SHALL admit, in addition to the enumerated `SYNCED_META_KEYS` allowlist, keys matching a small set of explicit **registered key-family matchers** — prefix (or prefix + date-window) tests introduced for dynamic key families that cannot be enumerated: the NG-0717 lineage imprints (`prescription:v1:ng0717:imprint:`, subject × date), the prescription daily-quest families (`prescription:v1:{plan,wrong,breadth,completed,reward,cramRescue,wire,tierClaim}:…`, date-keyed, per the `neurons-daily-prescription` daily-state sync requirement), and the single-subject-rescue family (`rescue:v1:plan` plus the run-scoped `rescue:v1:{conf,ovr}:{planCreatedAt}:…` keys within a trailing run-sync window, per the `neurons-single-subject-rescue` rescue key-family requirement). Both the `metaAdapter` snapshot (which rows enter the bundle) and its apply (which incoming rows are accepted) SHALL use the SAME membership test (allowlist OR registered matcher), so the two directions never diverge. A matcher SHALL be specific enough to match ONLY its intended key family and SHALL NOT capture sibling keys under a shared ancestor namespace (e.g. the prescription daily-state matcher SHALL NOT match `prescription:v1:lightsOut:` or `prescription:v1:localSeed`, which stay local-only; the imprint prefix SHALL NOT match the daily-state families; the rescue matcher SHALL NOT match any `rescue:v1:*` key other than `plan` and in-window `conf:`/`ovr:` keys — rescue telemetry stays device-local).

A registered key family SHALL satisfy ONE of two merge contracts:

- **(a) Write-once presence keys**, merged by the metaAdapter's existing first-write-wins rule — where first-write-wins equals a UNION (e.g. imprints; the prescription `wrong` / `breadth` / `completed` / `reward` / `cramRescue` / `wire` / `tierClaim` families); or
- **(b) A family with a registered backfill post-pass that defines its merge**, run on pull completion — e.g. the prescription `plan:{date}` family, whose earliest-createdAt-wins MIN-LWW is enforced by `backfill/prescription-plan.ts`, and the rescue family, whose latest-action-wins envelope LWW (`rescue:v1:plan`, explicit-null clears) and per-key LWW (`conf:` on `at`, `ovr:` on `setAt`) are enforced by `backfill/rescue.ts`; for such a family the metaAdapter's first-write-wins is only a transport default that the post-pass deterministically reconciles.

Registering a family whose values mutate or delete WITHOUT a registered post-pass defining a convergent merge would be incorrect and SHALL NOT be done. The matcher constants SHALL be single-sourced from the service that mints the keys (imported, not re-declared) so the sync filter and the key mint cannot drift.

#### Scenario: Snapshot and apply use the same allowlist-or-matcher membership test
- **WHEN** the metaAdapter snapshots meta rows and later applies incoming meta rows
- **THEN** both SHALL include a key iff it is in `SYNCED_META_KEYS` OR it matches a registered key-family matcher, so no key syncs in one direction but not the other

#### Scenario: A registered matcher matches only its intended family
- **WHEN** the registered prescription matchers are evaluated against `prescription:v1:lightsOut:2026-07-07` and `prescription:v1:localSeed`
- **THEN** neither key SHALL be treated as synced (the daily-state matcher and the imprint prefix are each exact to their intended families)

#### Scenario: Write-once families merge by first-write-wins UNION
- **WHEN** a write-once prefix-matched key (an imprint bud, a `wrong:{date}:{qid}` credit, a `tierClaim:{date}:{tier}` marker) is present on one device and absent on another
- **THEN** the merge SHALL add it where absent (first-write-wins) and SHALL never delete it, yielding a UNION across devices

#### Scenario: A post-pass family converges deterministically in any pull order
- **WHEN** two devices hold divergent `prescription:v1:plan:{date}` values for the same date and pulls happen in either order
- **THEN** the registered backfill post-pass SHALL converge both devices to the plan with the smaller `(createdAt, seed)` (earliest-createdAt wins), never leaving the transport's first-write-wins as the final state for that family

#### Scenario: The rescue post-pass family converges deterministically in any pull order
- **WHEN** two devices hold divergent `rescue:v1:plan` envelopes (or divergent `conf:`/`ovr:` records for the same key) and pulls happen in either order
- **THEN** the `backfill/rescue.ts` post-pass SHALL converge both devices — the envelope with the greater `updatedAt` wins (explicit-null envelopes included; ties broken by a deterministic total order over the serialized value), and each `conf:`/`ovr:` key resolves to the record with the greater `at`/`setAt` — never leaving the transport's first-write-wins as the final state for that family
