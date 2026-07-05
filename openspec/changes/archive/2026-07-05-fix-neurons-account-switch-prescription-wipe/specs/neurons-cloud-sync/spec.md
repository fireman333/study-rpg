## MODIFIED Requirements

### Requirement: Account-switch wipe covers all synced surfaces plus local drafts

The account-switch wipe helper SHALL clear (a) every Dexie table registered in `NEURONS_ADAPTERS` (the table list SHALL be derived from the adapter registry, not hand-maintained), (b) within the `meta` table, the keys in `SYNCED_META_KEYS` **plus every key under the entire daily-prescription namespace prefix `prescription:v1:`** — which spans the local-only daily-quest state (`plan` / `wrong` / `breadth` / `completed` / `reward` / `lightsOut` / `localSeed`) AND the synced NG-0717 lineage-imprint keepsake sub-prefix `prescription:v1:ng0717:imprint:`, because that state is account-OWNED rather than device-local: the `completed:<date>` keys drive the account's NG-0717 maturation stage and the imprint keys are its keepsake, so leaving them would bleed the outgoing account's NG-0717 stage / keepsake / today's progress into the next account. Device-local meta keys OUTSIDE the `prescription:v1:` prefix (e.g. onboarding flags, `prescription:homeCollapsed`) SHALL be preserved. The helper SHALL also clear (c) the local-only `mockExamDrafts` table, because drafts contain the previous account's answer content. The wipe SHALL NOT create any cloud-side effect (no push, no delete request).

#### Scenario: Wipe clears adapter tables and synced meta only

- **WHEN** the wipe helper runs on a device with data in all 21 Dexie tables
- **THEN** the 20 adapter-registered tables and `mockExamDrafts` are empty, synced meta keys are deleted, and device-local meta keys (e.g. onboarding flags) remain

#### Scenario: Wipe clears the account-owned local prescription state and NG-0717 keepsake

- **WHEN** the wipe helper runs on a device carrying the previous account's daily-prescription state — the completion keys (`prescription:v1:completed:<date>`) that drive its NG-0717 maturation stage, the plan / wrong / breadth / reward / lightsOut / localSeed keys, and the NG-0717 lineage-imprint keys under `prescription:v1:ng0717:imprint:`
- **THEN** every key under the `prescription:v1:` prefix SHALL be deleted — so the next account inherits neither the previous account's NG-0717 maturation stage, nor its keepsake buds, nor today's prescription progress (no "混血 NG-0717") — while device-local meta keys outside that prefix (e.g. `prescription:homeCollapsed`, onboarding flags) remain

#### Scenario: Wipe stays in lockstep with future adapters

- **WHEN** a future change registers a new TableAdapter in `NEURONS_ADAPTERS`
- **THEN** the wipe helper covers the new table with no further code change, and a Vitest lock fails if any adapter name has no corresponding Dexie table
