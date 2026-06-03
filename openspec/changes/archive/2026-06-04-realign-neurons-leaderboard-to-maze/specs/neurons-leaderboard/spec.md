# neurons-leaderboard (delta)

## REMOVED Requirements

### Requirement: Five filter tabs SHALL provide composite ranking plus four single-dimension rankings

**Reason**: Superseded by the six-tab version below — adds the「探索進度」(`total_settles`) axis so the board reflects post-`promote-maze-to-home` maze progression. The requirement name embeds the tab count, so it is removed and re-added rather than modified in place.

### Requirement: Hourly KV cache refresh SHALL pre-compute all five filter snapshots twice per hour

**Reason**: Superseded by the six-snapshot version below (adds the `settles` KV snapshot). The requirement name embeds the snapshot count, so it is removed and re-added.

## ADDED Requirements

### Requirement: Six filter tabs SHALL provide composite ranking plus five single-dimension rankings

The leaderboard UI SHALL provide **six** filter tabs that determine the ranking criterion. The default tab SHALL be「綜合排名」. Switching tabs SHALL update the displayed ranking without re-querying if the data is already cached client-side for the current half-hour.

| Tab order | Tab | Sort key |
|---|---|---|
| 1 | 綜合排名 | `variant_count DESC, total_study_min DESC` |
| 2 | 變體收集排名 | `variant_count DESC` |
| 3 | AP 排名 | `total_AP DESC` |
| 4 | Synapse 強連結排名 | `synapse_strong DESC` |
| 5 | 累積唸書時間排名 | `total_study_min DESC` |
| 6 | 探索進度排名 | `total_settles DESC` |

The new「探索進度排名」tab ranks players by `total_settles` — the cumulative count of maze settles across all four NT branches (each settle = one variant pull; the maze is the only pull path post-`promote-maze-to-home`). This axis reflects the central new progression that `variant_count` only partially proxies (dupe-fusion means duplicate pulls do not raise the distinct `variant_count`).

The `total_AP` axis (「AP 排名」) SHALL remain unchanged — it still maps to the visible per-family AP number on the FamilyPicker card. The `family_complete` field SHALL NOT participate in any ranking (the open-collection范式 retires the family-completion concept). `variant_count` remains the distinct-collection signal.

#### Scenario: Default tab is 綜合排名

- **WHEN** the player opens the leaderboard tab for the first time within a session
- **THEN** the「綜合排名」tab SHALL be selected by default and its rows displayed first

#### Scenario: Switching filter tabs updates the displayed ranking

- **WHEN** the player clicks the「AP 排名」tab
- **THEN** the displayed top-100 list SHALL re-order by `total_AP DESC` from the same half-hourly snapshot, and the player's own my-rank chip SHALL update to show their AP-only rank

#### Scenario: 探索進度 tab ranks by total settles

- **WHEN** the player clicks the「探索進度排名」tab
- **THEN** the displayed top-100 list SHALL re-order by `total_settles DESC` from the same half-hourly snapshot, and the player's my-rank chip SHALL update to show their settles-only rank

#### Scenario: Composite ranking tie-breaker order

- **WHEN** two players have identical `variant_count` in the 綜合排名 tab
- **THEN** the player with higher `total_study_min` SHALL rank above; if both tie, ordering MAY be arbitrary but MUST be stable within a single snapshot

#### Scenario: Synapse tab empty-state copy for early game

- **WHEN** the「Synapse 強連結排名」tab is selected AND all top-100 rows have `synapse_strong = 0`
- **THEN** the UI SHALL render an explanatory empty-state「期待第一個 strong synapse 上榜！同一天兩個 family 各答對 5 題形成 synapse, 連續同日重激發兩次達 strong 狀態」alongside (not replacing) the row list

### Requirement: Hourly KV cache refresh SHALL pre-compute all six filter snapshots twice per hour

The leaderboard backend SHALL pre-compute the top-100 ranking for each of the **six** filter tabs **twice per hour** via the existing Worker scheduled cron trigger at minutes `:00` and `:30` (shared with 二階 `hospital-leaderboard` schedule, no additional cron expression). Client read requests SHALL fetch from the KV cache, NOT directly from D1. The system MAY serve a stale snapshot (older than 30 min) if the cron has not yet refreshed, but MUST surface a「上次更新：HH:MM」timestamp in the leaderboard UI.

#### Scenario: 30-min cron pre-computes all six neurons filters

- **WHEN** the Worker scheduled trigger fires at `:00` or `:30` of each hour
- **THEN** the system SHALL run six D1 queries (one per filter) on `leaderboard_neurons` table and write the resulting top-100 row arrays to six KV keys (`leaderboard:neurons:top100:composite | variants | ap | synapse | study | settles`), and SHALL log a single line entry for monitoring

#### Scenario: Client read serves KV cache

- **WHEN** a client GETs `/leaderboard/neurons/settles`
- **THEN** the Worker SHALL return the value from `leaderboard:neurons:top100:settles` KV key directly, without querying D1, and include a `last_updated_at` timestamp in the response

#### Scenario: Stale snapshot served on cron failure

- **WHEN** the Worker scheduled cron fails to run for two consecutive scheduled slots
- **THEN** the client SHALL still receive the most recent successful snapshot from KV; the UI SHALL surface the「上次更新：HH:MM」timestamp so the player can detect staleness

## MODIFIED Requirements

### Requirement: Opt-in modal SHALL gate leaderboard participation with consent checkbox and nickname

The system SHALL present a one-time opt-in modal the first time an authenticated player opens the neurons-tw `/leaderboard` tab. The modal SHALL:

- Explicitly list the public fields that will be visible to other players: 變體收集數量 (`variant_count`) / Action Potential 總量 (`total_AP`) / Strong Synapse 數 (`synapse_strong`) / 累積唸書時間 (`total_study_min`) / 探索進度（settle 次數）(`total_settles`) — plus the chosen 暱稱 (`nickname`). The retired `family_complete` field SHALL NOT be listed.
- Include an unchecked checkbox labelled「同意公開以上資訊」; the「加入排行榜」submit button SHALL remain disabled until the checkbox is checked
- Include a nickname input with inline length + uniqueness validation
- Include a「了解更多 — 隱私說明」link that expands an inline section explaining what is stored, who can see it, and how to opt out / delete
- NOT auto-submit and NOT pre-check the consent checkbox
- Re-appear on subsequent visits until the player either successfully opts in or explicitly dismisses via「不再顯示」

#### Scenario: First-time visit shows opt-in modal

- **WHEN** an authenticated player clicks the「排名」tab and has never previously opted in or declined
- **THEN** the system displays the opt-in modal listing the public fields plus the nickname field, with the consent checkbox unchecked and the submit button disabled

#### Scenario: Public-field list includes settles and excludes family_complete

- **WHEN** the opt-in modal renders its public-field disclosure list
- **THEN** the list SHALL include 探索進度（`total_settles`）
- **AND** the list SHALL NOT include 完整集齊家族數（`family_complete`）

#### Scenario: Consent checkbox gates submission

- **WHEN** the opt-in modal is displayed and the player has not checked the consent checkbox
- **THEN** the「加入排行榜」submit button SHALL be disabled and a tooltip / inline label explains「請先勾選同意才能加入」

#### Scenario: Cancelling opt-in leaves player off the leaderboard

- **WHEN** the player closes the opt-in modal without submitting
- **THEN** no row SHALL be written to the leaderboard backend, the leaderboard tab SHALL show a「未加入」empty state for the player's own status row, and the modal SHALL re-appear on the next visit until the player either opts in or dismisses via「不再顯示」

### Requirement: Top 100 list plus my-rank chip SHALL render in pixel-art tabular grid

The leaderboard UI SHALL display up to 100 ranked rows for the active filter as a pixel-art tabular grid (not an unstyled list), rendering one row per opted-in player with cells for: rank / nickname / `variant_count` (a **pure count**, no `/N` denominator — the catalog total is hidden) / `total_AP` / `synapse_strong` / `total_study_min` (formatted as `Xh Ym`) / `total_settles` (探索, integer count). The grid SHALL NOT render a `family_complete` cell. The grid SHALL use the existing pixel design tokens (`--frame-cell-light` / `--frame-cell-dark` border colors from `theme-pixel-neurons`, `--accent-gold` for rank-1 emphasis, Cubic 11 font for nicknames and numeric stats) so the visual style matches the rest of the neurons-tw UI shell.

The player's own current rank SHALL remain accessible regardless of scroll position via either the existing sticky top chip OR a new sticky-bottom "my row" repeat that mirrors the user's row data.

#### Scenario: Top 100 displayed when ≥ 100 opted-in players

- **WHEN** the leaderboard backend has ≥ 100 opted-in players and the player views any filter tab
- **THEN** the UI SHALL display 100 rows in a single scrollable tabular grid where each row aligns its cells vertically with the row above and below

#### Scenario: variant_count cell shows a pure count

- **WHEN** any row renders its `variant_count` cell
- **THEN** the cell SHALL show the integer count alone, with no `/55`, `/77`, `/110`, or any denominator suffix
- **AND** no `family_complete` cell SHALL be present in the row

#### Scenario: Settles cell renders the player's total settles

- **WHEN** any row renders its `total_settles` (探索) cell
- **THEN** the cell SHALL show the integer settle count
- **AND** when the「探索進度排名」tab is active, that cell SHALL carry the primary-stat emphasis styling

#### Scenario: All rows displayed when < 100 opted-in players

- **WHEN** the leaderboard backend has fewer than 100 opted-in players
- **THEN** the UI SHALL display all available rows and SHALL show a counter「目前 N 位玩家加入排行」at the top or bottom of the grid

#### Scenario: Rank 1 / 2 / 3 visually distinguished

- **WHEN** any row's display rank is 1, 2, or 3
- **THEN** that row's rank cell SHALL be styled with gold (rank 1) / silver (rank 2) / bronze (rank 3) accent color and pixel-art emboss, distinct from the default frame color used by ranks 4–100

### Requirement: Worker upsert endpoint SHALL accept all neurons leaderboard fields with sanity bounds and LWW

The Worker `POST /leaderboard/neurons/upsert` endpoint SHALL enforce last-write-wins semantics using `updated_at` (millisecond epoch) and SHALL reject payloads whose values fall outside known sanity bounds:

- `variant_count ∈ [0, 110]` (the current catalog total `NEURON_VARIANT_TOTAL`; raised from the legacy 77 bound by this change)
- `total_AP ≥ 0`
- `synapse_strong ≥ 0`
- `total_study_min ≥ 0`
- `total_settles ≥ 0` (finite integer; new field)
- `nickname` length 2-12 codepoints, matches stored regex (basic anti-injection: no control chars, no leading/trailing whitespace)
- `badges_csv` (when present) matches `^([a-z]+:P[1-4])(,[a-z]+:P[1-4]){0,5}$` (mirror 二階 pattern, ≤ 6 entries, ≤ 60 chars)

The `family_complete` field SHALL NO LONGER be validated, sorted, or required; if present in a legacy payload it SHALL be ignored (not written). The endpoint SHALL touch only the neurons code path (`/leaderboard/neurons/*`, `leaderboard_neurons` table, `leaderboard:neurons:top100:*` KV); the 二階 `leaderboard_m2` path SHALL be unchanged. Rejected payloads SHALL log a structured warning but MUST NOT surface a UI error to the player (silent server-side filtering, mirror 二階 pattern). The D1 table SHALL declare `CHECK` constraints matching every numeric sanity bound as defence-in-depth (including `variant_count BETWEEN 0 AND 110` and `total_settles >= 0`).

The request MUST be authenticated (Supabase JWT in `Authorization: Bearer <token>` header). The Worker SHALL verify the JWT via the existing JWKS endpoint reused from `leaderboard.ts`. The `user_id` SHALL be derived from the JWT `sub` claim, NOT from the request body.

#### Scenario: Older updated_at rejected

- **WHEN** an upsert arrives with `updated_at` older than the existing D1 row's `updated_at`
- **THEN** the Worker SHALL leave the existing row unchanged and respond `200 OK` (avoid client retry storm)

#### Scenario: variant_count up to the catalog total is accepted

- **WHEN** an upsert arrives with `variant_count = 110` (a fully-collected player)
- **THEN** the Worker SHALL accept it (within the `[0, 110]` bound) and the D1 `CHECK` SHALL NOT reject it

#### Scenario: Out-of-bounds variant_count rejected at the 110 bound

- **WHEN** an upsert arrives with `variant_count = 111` or `variant_count = -1`
- **THEN** the Worker SHALL discard the upsert, log a structured warning with the offending user_id, and respond `200 OK` with `dropped: "variant_count_oob"` without writing to D1

#### Scenario: Negative total_settles rejected

- **WHEN** an upsert arrives with `total_settles = -1` or a non-finite value
- **THEN** the Worker SHALL discard the upsert, log a structured warning, and respond `200 OK` with `dropped: "total_settles_oob"` without writing to D1

#### Scenario: Legacy family_complete field is ignored

- **WHEN** an upsert arrives carrying a `family_complete` value (from an old client)
- **THEN** the Worker SHALL NOT validate or persist it as a ranking signal and SHALL still accept the rest of the payload (no rejection on its account)

#### Scenario: Missing JWT rejected with 401

- **WHEN** the endpoint receives a request without a valid Supabase JWT in the Authorization header
- **THEN** the Worker SHALL respond `401 Unauthorized` without executing any D1 query

#### Scenario: user_id derived from JWT, not body

- **GIVEN** a request body containing `user_id: "evil-attacker-uuid"` but a valid JWT for `sub: "real-player-uuid"`
- **WHEN** the upsert endpoint processes the request
- **THEN** the D1 row SHALL be written with `user_id = "real-player-uuid"` (from JWT)
- **AND** the `user_id` value in the request body SHALL be ignored

### Requirement: Push leaderboard row SHALL be triggered on cloud sync when wired (deferred), with manual-push button as interim

The system SHALL provide a client-side adapter `pushNeuronsLeaderboardRow(client)` that builds the upsert payload from local Dexie state (`neuronVariants` → `variant_count`; `familyAccrual` → `total_AP`; `synapses` where `state='strong'` → `synapse_strong`; `meta['totalStudyMinutes']` → `total_study_min`; sum of `meta['maze:da:settles']` + `['maze:5ht:settles']` + `['maze:gaba:settles']` + `['maze:glu:settles']` → `total_settles`; `leaderboardProfile` → `nickname` + `is_public`) and POSTs to `/leaderboard/neurons/upsert`. The adapter SHALL NOT compute or send `family_complete`.

The four `maze:<branch>:settles` meta keys are the same per-branch settle counters used by the maze economy (`lib/maze/economy.ts`) and are already members of `SYNCED_META_KEYS`, so `total_settles` is cross-device-correct. Each key SHALL be read defensively (`Number(value) || 0`) so a missing key (legacy save) contributes 0.

The adapter SHALL be reachable via the existing manual paths (settings panel「立即更新排行榜」button, opt-in modal submission, opt-out toggle); `buildLeaderboardPayload` SHALL be the single payload builder shared by all of them.

Players who have never opted in SHALL NOT have their data pushed.

#### Scenario: Settings manual-push button triggers upsert

- **GIVEN** an opted-in player on `LeaderboardSettingsControls`
- **WHEN** the player clicks「立即更新排行榜」
- **THEN** the adapter SHALL build the current payload (including `total_settles`) and POST to `/leaderboard/neurons/upsert`
- **AND** the button SHALL disable for 3 seconds after click to prevent rate-storm

#### Scenario: total_settles computed from the four maze settles meta keys at push time

- **WHEN** the adapter builds the payload
- **THEN** `total_settles` SHALL equal the sum of `meta['maze:da:settles']`, `meta['maze:5ht:settles']`, `meta['maze:gaba:settles']`, `meta['maze:glu:settles']`, each coerced via `Number(...) || 0`
- **AND** a player who has never settled any maze node SHALL push `total_settles = 0`

#### Scenario: variant_count computed from neuronVariants by client at push time

- **WHEN** the adapter builds the payload
- **THEN** `variant_count` SHALL equal `count of rows in db.neuronVariants` computed from `db.neuronVariants.toArray()` at push time, NOT cached from a separate source
- **AND** the payload SHALL NOT include a `family_complete` field

#### Scenario: synapse_strong computed from synapses table at push time

- **WHEN** the adapter builds the payload
- **THEN** `synapse_strong` SHALL equal `count of rows in db.synapses where state === 'strong'`

#### Scenario: Player who never opted in does not push

- **WHEN** an authenticated player who has never opted in triggers any path that would otherwise upsert
- **THEN** the leaderboard adapter SHALL skip the upsert call entirely; no D1 row SHALL be created

### Requirement: D1 schema SHALL include a reserved `badges_csv` column for future achievement integration

The `leaderboard_neurons` D1 table SHALL include `badges_csv TEXT NOT NULL DEFAULT ''` (populated with `<category>:P<tier>` CSV entries, max 60 chars, max 6 entries) and `total_settles INTEGER NOT NULL DEFAULT 0` (the maze exploration-progress ranking field). The Worker `upsert` endpoint SHALL accept `badges_csv` and `total_settles` as payload fields; missing `badges_csv` SHALL be treated as `''`, missing `total_settles` SHALL be treated as `0`.

The `variant_count` column `CHECK` constraint SHALL be `BETWEEN 0 AND 110` (the current catalog total). Because SQLite cannot `ALTER` a `CHECK` constraint, raising it from the legacy `BETWEEN 0 AND 55` and adding the `total_settles` column SHALL be performed by a single new migration (`0006_neurons_variant_cap_and_settles.sql`) using the canonical `CREATE _new → INSERT SELECT → DROP → RENAME → recreate-all-indexes` table-recreate pattern (mirroring `0004_bump_tier_to_4.sql`). The migration SHALL preserve the vestigial `family_complete` column (Worker `handleGetMe` still `SELECT`s it). The migration SHALL recreate all existing partial indexes and add a new partial index `idx_leaderboard_neurons_settles ON leaderboard_neurons (total_settles DESC) WHERE is_public = 1`. The `leaderboard_m2` table SHALL remain untouched.

#### Scenario: Table has total_settles column with relaxed variant_count CHECK

- **WHEN** the developer inspects the table via `wrangler d1 execute study-rpg-leaderboard --command "PRAGMA table_info(leaderboard_neurons)"` after migration 0006
- **THEN** the table SHALL contain `variant_count`, `total_settles`, and `badges_csv` columns
- **AND** the `variant_count` `CHECK` SHALL permit values up to 110
- **AND** the `family_complete` column SHALL still exist physically but be unused (no read/sort/write ranking path)
- **AND** the `leaderboard_m2` table SHALL remain untouched

#### Scenario: Migration preserves existing rows

- **WHEN** migration 0006 runs against a `leaderboard_neurons` table with existing rows
- **THEN** `SELECT COUNT(*)` SHALL return the same count before and after the migration
- **AND** existing rows SHALL acquire `total_settles = 0` (column default) until their owners next push

#### Scenario: variant_count is the sole distinct-collection signal

- **WHEN** the leaderboard ranks or displays collection progress
- **THEN** it SHALL use `variant_count` for distinct collection and `total_settles` for exploration progress
- **AND** SHALL NOT read `family_complete` from any row

### Requirement: Cron handler dispatch SHALL extend existing scheduled switch with neurons-leaderboard cron path

The Worker's `scheduled(event, env, ctx)` dispatch logic in `cloudflare/sync-worker/src/index.ts` SHALL extend the existing match against `CRON_LEADERBOARD_30MIN` (the `0,30 * * * *` cron trigger) to also call `runNeuronsLeaderboardCron(env, ctx)` immediately after `runLeaderboardCron(env, ctx)`. Both cron handlers SHALL be invoked sequentially within the same `event.cron` match arm.

`runNeuronsLeaderboardCron` SHALL be implemented in `cloudflare/sync-worker/src/neurons-leaderboard.ts` and SHALL:

1. Query `leaderboard_neurons` for rows where `is_public = 1`
2. For each of the **six** filter sort orders (composite / variants / ap / synapse / study / settles), take top 100 rows
3. Write each top-100 array to its KV key (`leaderboard:neurons:top100:<filter>`, including `leaderboard:neurons:top100:settles`)
4. Log a single structured line `[neurons-leaderboard] cron complete: 6 snapshots refreshed, N rows total`

Failures in `runNeuronsLeaderboardCron` SHALL be caught and logged via `console.error` so that they do NOT propagate up and break `runLeaderboardCron` (or vice versa). Each cron call is independently fault-tolerant.

#### Scenario: Cron at :00 dispatches both leaderboard handlers

- **WHEN** Cloudflare invokes the scheduled handler with `event.cron === '0,30 * * * *'` (or its canonical-string equivalent)
- **THEN** the handler SHALL call `runLeaderboardCron(env, ctx)` followed by `runNeuronsLeaderboardCron(env, ctx)`
- **AND** both handlers SHALL produce their respective KV snapshots (neurons producing six)
- **AND** a single Workers Log line per handler SHALL be emitted

#### Scenario: Neurons cron failure does not break 二階 cron

- **GIVEN** `runLeaderboardCron` succeeds
- **WHEN** `runNeuronsLeaderboardCron` throws (e.g., transient D1 error)
- **THEN** the error SHALL be caught with `console.error` logging the error + structured payload `{ source: 'neurons-leaderboard', error: <message> }`
- **AND** the 二階 KV snapshots SHALL remain refreshed correctly
- **AND** the next cron run SHALL retry the neurons handler
