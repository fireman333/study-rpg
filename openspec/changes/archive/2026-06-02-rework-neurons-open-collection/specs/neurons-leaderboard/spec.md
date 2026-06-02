## MODIFIED Requirements

### Requirement: Five filter tabs SHALL provide composite ranking plus four single-dimension rankings

The leaderboard UI SHALL provide **five** filter tabs that determine the ranking criterion. The default tab SHALL be「綜合排名」. Switching tabs SHALL update the displayed ranking without re-querying if the data is already cached client-side for the current half-hour.

| Tab order | Tab | Sort key |
|---|---|---|
| 1 | 綜合排名 | `variant_count DESC, total_study_min DESC` |
| 2 | 變體收集排名 | `variant_count DESC` |
| 3 | AP 排名 | `total_AP DESC` |
| 4 | Synapse 強連結排名 | `synapse_strong DESC` |
| 5 | 累積唸書時間排名 | `total_study_min DESC` |

The `family_complete` field SHALL NOT participate in any ranking (the open-collection范式 retires the family-completion concept). `variant_count` is the sole collection-ranking signal.

#### Scenario: Default tab is 綜合排名

- **WHEN** the player opens the leaderboard tab for the first time within a session
- **THEN** the「綜合排名」tab SHALL be selected by default and its rows displayed first

#### Scenario: Switching filter tabs updates the displayed ranking

- **WHEN** the player clicks the「AP 排名」tab
- **THEN** the displayed top-100 list SHALL re-order by `total_AP DESC` from the same hourly snapshot, and the player's own my-rank chip SHALL update to show their AP-only rank

#### Scenario: Composite ranking tie-breaker order

- **WHEN** two players have identical `variant_count` in the 綜合排名 tab
- **THEN** the player with higher `total_study_min` SHALL rank above; if both tie, ordering MAY be arbitrary but MUST be stable within a single snapshot

#### Scenario: Synapse tab empty-state copy for early game

- **WHEN** the「Synapse 強連結排名」tab is selected AND all top-100 rows have `synapse_strong = 0`
- **THEN** the UI SHALL render an explanatory empty-state「期待第一個 strong synapse 上榜！同一天兩個 family 各答對 5 題形成 synapse, 連續同日重激發兩次達 strong 狀態」alongside (not replacing) the row list

### Requirement: Top 100 list plus my-rank chip SHALL render in pixel-art tabular grid

The leaderboard UI SHALL display up to 100 ranked rows for the active filter as a pixel-art tabular grid (not an unstyled list), rendering one row per opted-in player with cells for: rank / nickname / `variant_count` (a **pure count**, no `/N` denominator — the catalog total is hidden) / `total_AP` / `synapse_strong` / `total_study_min` (formatted as `Xh Ym`). The grid SHALL NOT render a `family_complete` cell. The grid SHALL use the existing pixel design tokens (`--frame-cell-light` / `--frame-cell-dark` border colors from `theme-pixel-neurons`, `--accent-gold` for rank-1 emphasis, Cubic 11 font for nicknames and numeric stats) so the visual style matches the rest of the neurons-tw UI shell.

The player's own current rank SHALL remain accessible regardless of scroll position via either the existing sticky top chip OR a new sticky-bottom "my row" repeat that mirrors the user's row data.

#### Scenario: Top 100 displayed when ≥ 100 opted-in players

- **WHEN** the leaderboard backend has ≥ 100 opted-in players and the player views any filter tab
- **THEN** the UI SHALL display 100 rows in a single scrollable tabular grid where each row aligns its cells vertically with the row above and below

#### Scenario: variant_count cell shows a pure count

- **WHEN** any row renders its `variant_count` cell
- **THEN** the cell SHALL show the integer count alone, with no `/55`, `/77`, or any denominator suffix
- **AND** no `family_complete` cell SHALL be present in the row

#### Scenario: All rows displayed when < 100 opted-in players

- **WHEN** the leaderboard backend has fewer than 100 opted-in players
- **THEN** the UI SHALL display all available rows and SHALL show a counter「目前 N 位玩家加入排行」at the top or bottom of the grid

#### Scenario: Rank 1 / 2 / 3 visually distinguished

- **WHEN** any row's display rank is 1, 2, or 3
- **THEN** that row's rank cell SHALL be styled with gold (rank 1) / silver (rank 2) / bronze (rank 3) accent color and pixel-art emboss, distinct from the default frame color used by ranks 4–100

### Requirement: Worker upsert endpoint SHALL accept all neurons leaderboard fields with sanity bounds and LWW

The Worker `POST /leaderboard/neurons/upsert` endpoint SHALL enforce last-write-wins semantics using `updated_at` (millisecond epoch) and SHALL reject payloads whose values fall outside known sanity bounds:

- `variant_count ∈ [0, 77]`
- `total_AP ≥ 0`
- `synapse_strong ≥ 0`
- `total_study_min ≥ 0`
- `nickname` length 2-12 codepoints, matches stored regex (basic anti-injection: no control chars, no leading/trailing whitespace)
- `badges_csv` (when present) matches `^([a-z]+:P[1-4])(,[a-z]+:P[1-4]){0,5}$` (mirror 二階 pattern, ≤ 6 entries, ≤ 60 chars)

The `family_complete` field SHALL NO LONGER be validated, sorted, or required; if present in a legacy payload it SHALL be ignored (not written). The endpoint SHALL touch only the neurons code path (`/leaderboard/neurons/*`, `leaderboard_neurons` table, `leaderboard:neurons:top100:*` KV); the 二階 `leaderboard_m2` path SHALL be unchanged. Rejected payloads SHALL log a structured warning but MUST NOT surface a UI error to the player (silent server-side filtering, mirror 二階 pattern). The D1 table SHALL declare `CHECK` constraints matching every numeric sanity bound as defence-in-depth.

The request MUST be authenticated (Supabase JWT in `Authorization: Bearer <token>` header). The Worker SHALL verify the JWT via the existing JWKS endpoint reused from `leaderboard.ts`. The `user_id` SHALL be derived from the JWT `sub` claim, NOT from the request body.

#### Scenario: Older updated_at rejected

- **WHEN** an upsert arrives with `updated_at` older than the existing D1 row's `updated_at`
- **THEN** the Worker SHALL leave the existing row unchanged and respond `200 OK` (avoid client retry storm)

#### Scenario: Out-of-bounds variant_count rejected at the 77 bound

- **WHEN** an upsert arrives with `variant_count = 78` or `variant_count = -1`
- **THEN** the Worker SHALL discard the upsert, log a structured warning with the offending user_id, and respond `200 OK` with `dropped: "variant_count_oob"` without writing to D1

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

The system SHALL provide a client-side adapter `pushNeuronsLeaderboardRow(client)` that builds the upsert payload from local Dexie state (`neuronVariants` → `variant_count`; `familyAccrual` → `total_AP`; `synapses` where `state='strong'` → `synapse_strong`; existing study-minute accumulator → `total_study_min`; `leaderboardProfile` → `nickname` + `is_public`) and POSTs to `/leaderboard/neurons/upsert`. The adapter SHALL NOT compute or send `family_complete`.

The adapter SHALL be wired into the cloud-sync pipeline in a separate follow-up change (`add-neurons-deploy`), piggy-backing the existing R2 bundle push debounce window. In the interim (this change ships with no cloud sync), the adapter SHALL be reachable via:

- **Settings panel manual button**「立即更新排行榜」which calls the adapter directly when clicked
- **Opt-in modal submission**, which always pushes a fresh row on success
- **Opt-out toggle**, which pushes `is_public = 0` immediately

Players who have never opted in SHALL NOT have their data pushed.

#### Scenario: Settings manual-push button triggers upsert

- **GIVEN** an opted-in player on `LeaderboardSettingsControls`
- **WHEN** the player clicks「立即更新排行榜」
- **THEN** the adapter SHALL build the current payload and POST to `/leaderboard/neurons/upsert`
- **AND** the button SHALL disable for 3 seconds after click to prevent rate-storm

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

### Requirement: D1 schema SHALL include a reserved `badges_csv` column for future achievement integration

The `leaderboard_neurons` D1 table SHALL include one nullable column reserved for `add-neurons-achievements`:

- `badges_csv TEXT DEFAULT ''` — populated with `<category>:P<tier>` CSV entries, max 60 chars, max 6 entries

The Worker `upsert` endpoint SHALL accept `badges_csv` as an optional payload field; missing values SHALL be treated as default empty string.

This change SHALL NOT add or drop any D1 column. The `variant_count` column is the sole collection metric. The pre-existing `family_complete` column SHALL be left **vestigial** (no longer written, sorted, or read) — SQLite column-drop is avoided as unnecessary; a future cleanup MAY drop it. No new D1 migration is required by this change.

#### Scenario: No new D1 column is added or dropped

- **WHEN** the developer inspects the table via `wrangler d1 execute study-rpg-leaderboard --command "PRAGMA table_info(leaderboard_neurons)"`
- **THEN** the table SHALL retain `variant_count` and `badges_csv`
- **AND** the `family_complete` column SHALL still exist physically but be unused (no read/sort/write path)
- **AND** the `leaderboard_m2` table SHALL remain untouched

#### Scenario: variant_count is the sole collection signal

- **WHEN** the leaderboard ranks or displays collection progress
- **THEN** it SHALL use `variant_count` only
- **AND** SHALL NOT read `family_complete` from any row
