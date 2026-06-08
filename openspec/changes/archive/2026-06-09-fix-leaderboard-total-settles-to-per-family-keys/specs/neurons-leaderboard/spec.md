## MODIFIED Requirements

### Requirement: Push leaderboard row SHALL be triggered on cloud sync when wired (deferred), with manual-push button as interim

The system SHALL provide a client-side adapter `pushNeuronsLeaderboardRow(client)` that builds the upsert payload from local Dexie state (`ownedSlotCount(db)` → `variant_count`; `familyAccrual` → `total_AP`; `synapses` where `state='strong'` → `synapse_strong`; `meta['totalStudyMinutes']` → `total_study_min`; sum of `meta['maze:<familyId>:settles']` across every `familyId` declared by the content pack (`FAMILY_IDS`, currently 11 families) → `total_settles`; `leaderboardProfile` → `nickname` + `is_public`) and POSTs to `/leaderboard/neurons/upsert`. The adapter SHALL NOT compute or send `family_complete`. The `variant_count` field SHALL be sourced from the canonical `ownedSlotCount` projection defined in `neuron-variant-fusion` (counting slots with at least one held individual), NOT from `db.neuronVariants.count()` directly — this excludes ghost slots produced by cross-device fusion races from the leaderboard ranking signal. Each per-family `maze:<familyId>:settles` key SHALL be read defensively (`Number(value) || 0`) so a missing key (legacy save) contributes 0; the same defensive pattern applies to `meta['totalStudyMinutes']` and any other monotonic counter. The per-family settles counters are written by `lib/maze/economy.ts` (`settlesKey(familyId)`) and are already members of `SYNCED_META_KEYS`, so `total_settles` is cross-device-correct.

**Legacy 4-branch settles keys are retired.** Pre-`decouple-neurons-subjects-from-nt-branches` (archived 2026-06-06) saves may physically contain `meta['maze:da:settles']` / `meta['maze:5ht:settles']` / `meta['maze:gaba:settles']` / `meta['maze:glu:settles']` keys; these SHALL NOT be read by the adapter (leave-and-ignore). The current per-family schema fully supersedes them; the adapter SHALL aggregate only `maze:<familyId>:settles` keys for current `FAMILY_IDS`.

The adapter SHALL be wired into the cloud-sync pipeline: after every **successful** sync push, the system SHALL automatically upsert the opted-in player's leaderboard row by invoking the adapter from the sync engine's `onPushComplete` hook, piggy-backing the existing R2 bundle push debounce window. The automatic upsert SHALL be gated on the local `leaderboardProfile.opted_in === true` and SHALL carry the player's current `is_public` flag. The automatic path SHALL NOT write any synced Dexie table (in particular it SHALL NOT write `last_pushed_at`), so it cannot re-trigger the push scheduler and create a self-perpetuating push loop. A failure of the automatic upsert (network / auth / Worker rejection) SHALL be logged and SHALL NOT fail or interrupt the sync push.

The adapter SHALL ALSO remain reachable via the manual paths:

- **Settings panel manual button**「立即更新排行榜」which calls the adapter directly when clicked
- **Opt-in modal submission**, which always pushes a fresh row on success
- **Opt-out toggle**, which pushes `is_public = 0` immediately

Players who have never opted in SHALL NOT have their data pushed, on any path (automatic or manual).

#### Scenario: Opted-in player's row auto-upserts after a successful sync push

- **WHEN** an opted-in player's gameplay (collecting a variant / answering / accruing reading minutes / lighting a maze node) drives a successful cloud-sync push
- **THEN** the system SHALL invoke the adapter from `onPushComplete` and upsert the current row (including `variant_count` / `total_AP` / `total_study_min` / `total_settles` / `badges_csv`) with no manual action
- **AND** `variant_count` SHALL equal `ownedSlotCount(db)` at the time of the push
- **AND** `total_settles` SHALL equal the sum of `meta['maze:<familyId>:settles']` over every `familyId` in `FAMILY_IDS` (currently 11 families)

#### Scenario: Ghost slot does NOT inflate variant_count on the leaderboard

- **GIVEN** a player whose Dexie state has 27 `neuronVariants` rows but `ownedSlotCount(db) = 26` (one ghost slot from a cross-device fusion race per `neuron-variant-fusion`)
- **WHEN** the adapter builds the upsert payload
- **THEN** the payload's `variant_count` SHALL be `26`, NOT `27`
- **AND** the player's leaderboard rank SHALL reflect the corrected (lower) value after Worker accepts the upsert

#### Scenario: total_settles aggregates per-family settle keys only

- **GIVEN** a player whose `meta` table contains `maze:藥理學:settles = 40`, `maze:解剖學:settles = 25`, `maze:組織學:settles = 18`, and 8 other family keys at 0, AND legacy keys `maze:da:settles = 99` and `maze:gaba:settles = 77` physically present from a pre-`decouple` save
- **WHEN** the adapter builds the upsert payload
- **THEN** `total_settles` SHALL be `83` (sum of the per-family keys for current `FAMILY_IDS`: 40 + 25 + 18 + 0×8)
- **AND** the legacy 4-branch keys SHALL NOT contribute (the implementation SHALL NOT read them)
- **AND** missing per-family keys SHALL contribute 0 via the defensive `Number(value) || 0` pattern

#### Scenario: Automatic upsert does not loop the push engine

- **WHEN** the automatic upsert runs after a successful push
- **THEN** it SHALL write no synced Dexie table, and therefore SHALL NOT schedule a further push, leaving the engine idle once gameplay activity stops

#### Scenario: Automatic upsert failure does not break sync

- **WHEN** the automatic leaderboard upsert fails (e.g. network error or Worker rejection)
- **THEN** the error SHALL be logged on the `[leaderboard]` channel and the sync engine's push SHALL complete normally with no surfaced error
