## MODIFIED Requirements

### Requirement: Push leaderboard row SHALL be triggered on cloud sync when wired (deferred), with manual-push button as interim

The system SHALL provide a client-side adapter `pushNeuronsLeaderboardRow(client)` that builds the upsert payload from local Dexie state (`neuronVariants` → `variant_count`; `familyAccrual` → `total_AP`; `synapses` where `state='strong'` → `synapse_strong`; `meta['totalStudyMinutes']` → `total_study_min`; sum of `meta['maze:da:settles']` + `['maze:5ht:settles']` + `['maze:gaba:settles']` + `['maze:glu:settles']` → `total_settles`; `leaderboardProfile` → `nickname` + `is_public`) and POSTs to `/leaderboard/neurons/upsert`. The adapter SHALL NOT compute or send `family_complete`. The four `maze:<branch>:settles` keys are the same per-branch settle counters used by the maze economy (`lib/maze/economy.ts`) and are already members of `SYNCED_META_KEYS`, so `total_settles` is cross-device-correct; each SHALL be read defensively (`Number(value) || 0`) so a missing key (legacy save) contributes 0.

The adapter SHALL be wired into the cloud-sync pipeline: after every **successful** sync push, the system SHALL automatically upsert the opted-in player's leaderboard row by invoking the adapter from the sync engine's `onPushComplete` hook, piggy-backing the existing R2 bundle push debounce window. The automatic upsert SHALL be gated on the local `leaderboardProfile.opted_in === true` and SHALL carry the player's current `is_public` flag. The automatic path SHALL NOT write any synced Dexie table (in particular it SHALL NOT write `last_pushed_at`), so it cannot re-trigger the push scheduler and create a self-perpetuating push loop. A failure of the automatic upsert (network / auth / Worker rejection) SHALL be logged and SHALL NOT fail or interrupt the sync push.

The adapter SHALL ALSO remain reachable via the manual paths:

- **Settings panel manual button**「立即更新排行榜」which calls the adapter directly when clicked
- **Opt-in modal submission**, which always pushes a fresh row on success
- **Opt-out toggle**, which pushes `is_public = 0` immediately

Players who have never opted in SHALL NOT have their data pushed, on any path (automatic or manual).

#### Scenario: Opted-in player's row auto-upserts after a successful sync push

- **WHEN** an opted-in player's gameplay (collecting a variant / answering / accruing reading minutes / lighting a maze node) drives a successful cloud-sync push
- **THEN** the system SHALL invoke the adapter from `onPushComplete` and upsert the current row (including `variant_count` / `total_AP` / `total_study_min` / `total_settles` / `badges_csv`) with no manual action

#### Scenario: Automatic upsert does not loop the push engine

- **WHEN** the automatic upsert runs after a successful push
- **THEN** it SHALL write no synced Dexie table, and therefore SHALL NOT schedule a further push, leaving the engine idle once gameplay activity stops

#### Scenario: Automatic upsert failure does not break sync

- **WHEN** the automatic leaderboard upsert fails (e.g. network error or Worker rejection)
- **THEN** the error SHALL be logged on the `[leaderboard]` channel and the sync engine's push SHALL complete normally with no surfaced error

#### Scenario: Settings manual-push button triggers upsert

- **GIVEN** an opted-in player on `LeaderboardSettingsControls`
- **WHEN** the player clicks「立即更新排行榜」
- **THEN** the adapter SHALL build the current payload (including `total_settles`) and POST to `/leaderboard/neurons/upsert`
- **AND** the button SHALL disable for 3 seconds after click to prevent rate-storm

#### Scenario: total_settles computed from the four maze settles meta keys at push time

- **WHEN** the adapter builds the payload
- **THEN** `total_settles` SHALL equal the sum of `meta['maze:da:settles']`, `meta['maze:5ht:settles']`, `meta['maze:gaba:settles']`, `meta['maze:glu:settles']`, each coerced via `Number(...) || 0`
- **AND** a player who has never settled any maze node SHALL push `total_settles = 0`

#### Scenario: Opted-out player still upserts is_public=0

- **WHEN** an opted-out player triggers a manual push or opt-out toggle
- **THEN** the leaderboard adapter SHALL still POST to `/leaderboard/neurons/upsert` with `is_public: 0`, so that the D1 row remains current if the player re-opens opt-in later, but the row SHALL be excluded from KV snapshots

#### Scenario: Player who never opted in does not push

- **WHEN** an authenticated player who has never opted in triggers any path that would otherwise upsert
- **THEN** the leaderboard adapter SHALL skip the upsert call entirely; no D1 row SHALL be created

#### Scenario: variant_count computed from neuronVariants by client at push time

- **WHEN** the adapter builds the payload
- **THEN** `variant_count` SHALL equal `count of rows in db.neuronVariants` computed from `db.neuronVariants.toArray()` at push time, NOT cached from a separate source
- **AND** the payload SHALL NOT include a `family_complete` field

#### Scenario: synapse_strong computed from synapses table at push time

- **WHEN** the adapter builds the payload
- **THEN** `synapse_strong` SHALL equal `count of rows in db.synapses where state === 'strong'`
