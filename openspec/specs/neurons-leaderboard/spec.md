# neurons-leaderboard Specification

## Purpose

Opt-in global ranking for M_3rd track `apps/neurons-tw` with 6 filter tabs (composite / variants / AP / synapse / study / settles), Top 100 + my-rank chip, Cloudflare D1-backed (`leaderboard_neurons` table) with hourly KV-cached snapshots refreshed twice per hour by the existing Worker scheduled cron (shared with `hospital-leaderboard` schedule). 5 public numeric fields (`variant_count` 0–110 distinct collected, shown without a denominator / `total_AP` / `synapse_strong` / `total_study_min` / `total_settles` maze exploration progress) plus 2-12 codepoint case-insensitive-unique nickname. The open-collection范式 retired the `family_complete` signal (its D1 column is left vestigial, unused). Anti-cheat policy is full-trust + UI footer disclosure ("自填無驗證"); Worker enforces only sanity bounds + nickname format validation.

Composite ranking sorts by `variant_count DESC, total_study_min DESC` (clean tie-break chain, no weighted formula). Data plane is fully isolated from 二階 `hospital-leaderboard`: separate D1 table, separate KV prefix `leaderboard:neurons:top100:*`, separate endpoint prefix `/leaderboard/neurons/*`, separate nickname uniqueness pool. Reserves one nullable column `badges_csv` from day-one schema for `add-neurons-achievements` population — no migration needed.

Borrowed pattern from 二階 `hospital-leaderboard` per `neurons-mode` Req 5 borrowing rules: independent capability spec, independent infrastructure, no modification of source capability. Cloud-sync push integration deferred to `add-neurons-deploy` — this capability ships endpoints + UI + manual-push button as interim, scheduled cron is fully wired and self-refreshing.
## Requirements
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

### Requirement: Nickname SHALL be 2–12 codepoints, case-insensitive unique, with debounced async uniqueness check

The system SHALL require the player to provide a display nickname during the opt-in flow. The nickname MUST be 2 to 12 Unicode codepoints in length (`[...str].length`), MUST be case-insensitive unique across all opted-in neurons-tw players (e.g. `wlk` collides with `WLK` and `Wlk`), and MAY be left blank — in which case the system falls back to the player's Google display name (subject to the same length + uniqueness rules).

The nickname uniqueness pool SHALL be isolated per app per `neurons-mode` Req 4: a `wlk` nickname in 二階 `hospital-leaderboard` does NOT collide with `wlk` in `neurons-leaderboard`. Each app maintains an independent `nickname_lower` index in its own D1 table.

The nickname MUST be uniqueness-checked against the backend with a debounced async call (400ms after last keystroke) before submission. Submission SHALL be rejected if the nickname is already taken at submit time.

#### Scenario: Nickname under 2 codepoints rejected

- **WHEN** the player enters a nickname of length 0 or 1 codepoint and the nickname field is non-blank
- **THEN** the field SHALL show an inline error「暱稱長度需 2–12 字元」and submission SHALL be blocked

#### Scenario: Nickname over 12 codepoints rejected

- **WHEN** the player enters a nickname of length > 12 Unicode codepoints
- **THEN** the field SHALL show「暱稱長度需 2–12 字元」and submission SHALL be blocked

#### Scenario: Case-insensitive uniqueness collision within neurons app

- **WHEN** the player enters「WLK」and another opted-in neurons-tw player's stored nickname is「wlk」
- **THEN** the debounced uniqueness check SHALL return「已被使用」and the field SHALL display the error inline

#### Scenario: Nickname collision pool is per-app

- **GIVEN** another player has nickname `wlk` registered in 二階 `leaderboard_m2` table only
- **WHEN** a neurons-tw player attempts to register nickname `wlk` and 沒有 row exists in `leaderboard_neurons` with `nickname_lower = 'wlk'`
- **THEN** the uniqueness check SHALL return「available」(true)
- **AND** the player SHALL successfully claim `wlk` in `leaderboard_neurons` without affecting 二階

#### Scenario: Blank nickname falls back to Google display name

- **WHEN** the player leaves the nickname field blank and submits
- **THEN** the system SHALL persist the player's Google display name as the leaderboard `nickname` value, subject to the same length and uniqueness rules; if the Google name violates these rules, the system SHALL block submission and prompt the player to set a custom nickname

#### Scenario: Nickname is changeable post opt-in

- **WHEN** an opted-in player edits their nickname via the settings panel
- **THEN** the new nickname SHALL be subject to the same length and uniqueness checks, and on save SHALL update both the local profile and the next D1 upsert; there SHALL be no cooldown or rate limit on nickname changes

### Requirement: Five filter tabs SHALL provide composite ranking plus four single-dimension rankings

The leaderboard UI SHALL provide **five** filter tabs that determine the ranking criterion. The default tab SHALL be「綜合排名」. Switching tabs SHALL update the displayed ranking without re-querying if the data is already cached client-side for the current half-hour.

| Tab order | Tab | Sort key |
|---|---|---|
| 1 | 綜合排名 | `variant_count DESC, total_study_min DESC` |
| 2 | 變體收集排名 | `variant_count DESC` |
| 3 | AP 排名 | `total_AP DESC` |
| 4 | 累積唸書時間排名 | `total_study_min DESC` |
| 5 | 探索進度排名 | `total_settles DESC` |

The「Synapse 強連結排名」axis (formerly tab 4, sorting by `synapse_strong DESC`) SHALL be removed — it was a weak competitive axis (a small integer that can decay) with no gameplay stake, and is dropped without replacement as part of demoting the synapse/connectome surface ahead of a later load-bearing redesign. The `composite` (綜合排名) ranking SHALL NOT weight `synapse_strong`; if the prior composite formula included a synapse term, it SHALL be recomputed from the remaining signals (`variant_count`, `total_study_min`).

The「探索進度排名」tab ranks players by `total_settles` — the cumulative count of maze settles across all four maze regions (each settle = one variant pull; the maze is the only pull path post-`promote-maze-to-home`). This axis reflects the central new progression that `variant_count` only partially proxies (dupe-fusion means duplicate pulls do not raise the distinct `variant_count`).

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

#### Scenario: No synapse ranking tab is presented

- **WHEN** the player opens the leaderboard
- **THEN** the tab strip SHALL render exactly five tabs and SHALL NOT include a「Synapse 強連結排名」tab
- **AND** no client request SHALL be issued for a `synapse` filter snapshot

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

### Requirement: Hourly KV cache refresh SHALL pre-compute all five filter snapshots twice per hour

The leaderboard backend SHALL pre-compute the top-100 ranking for each of the **five** filter tabs **twice per hour** via the existing Worker scheduled cron trigger at minutes `:00` and `:30` (shared with 二階 `hospital-leaderboard` schedule, no additional cron expression). Client read requests SHALL fetch from the KV cache, NOT directly from D1. The system MAY serve a stale snapshot (older than 30 min) if the cron has not yet refreshed, but MUST surface a「上次更新：HH:MM」timestamp in the leaderboard UI.

#### Scenario: 30-min cron pre-computes all five neurons filters

- **WHEN** the Worker scheduled trigger fires at `:00` or `:30` of each hour
- **THEN** the system SHALL run five D1 queries (one per filter) on `leaderboard_neurons` table and write the resulting top-100 row arrays to five KV keys (`leaderboard:neurons:top100:composite | variants | ap | study | settles`), and SHALL log a single line entry for monitoring
- **AND** the system SHALL NOT compute or write a `leaderboard:neurons:top100:synapse` KV key

#### Scenario: Client read serves KV cache

- **WHEN** a client GETs `/leaderboard/neurons/settles`
- **THEN** the Worker SHALL return the value from `leaderboard:neurons:top100:settles` KV key directly, without querying D1, and include a `last_updated_at` timestamp in the response

#### Scenario: Stale snapshot served on cron failure

- **WHEN** the Worker scheduled cron fails to run for two consecutive scheduled slots
- **THEN** the client SHALL still receive the most recent successful snapshot from KV; the UI SHALL surface the「上次更新：HH:MM」timestamp so the player can detect staleness

### Requirement: Worker upsert endpoint SHALL accept all neurons leaderboard fields with sanity bounds and LWW

The Worker `POST /leaderboard/neurons/upsert` endpoint SHALL enforce last-write-wins semantics using `updated_at` (millisecond epoch) and SHALL reject payloads whose values fall outside known sanity bounds:

- `variant_count ∈ [0, NEURON_VARIANT_TOTAL]` (the current catalog total; raised from the prior 110 bound to the second-lap-expanded total by this change — second-lap location variants are distinct collectibles that count toward `variant_count`)
- `total_AP ≥ 0`
- `synapse_strong ≥ 0`
- `total_study_min ≥ 0`
- `total_settles ≥ 0` (finite integer)
- `nickname` length 2-12 codepoints, matches stored regex (basic anti-injection: no control chars, no leading/trailing whitespace)
- `badges_csv` (when present) matches `^([a-z]+:P[1-4])(,[a-z]+:P[1-4]){0,5}$` (mirror 二階 pattern, ≤ 6 entries, ≤ 60 chars)

The `family_complete` field SHALL NO LONGER be validated, sorted, or required; if present in a legacy payload it SHALL be ignored (not written). The endpoint SHALL touch only the neurons code path (`/leaderboard/neurons/*`, `leaderboard_neurons` table, `leaderboard:neurons:top100:*` KV); the 二階 `leaderboard_m2` path SHALL be unchanged. Rejected payloads SHALL log a structured warning but MUST NOT surface a UI error to the player (silent server-side filtering, mirror 二階 pattern). The D1 table SHALL declare `CHECK` constraints matching every numeric sanity bound as defence-in-depth (including `variant_count BETWEEN 0 AND <NEURON_VARIANT_TOTAL>` and `total_settles >= 0`); raising the `variant_count` CHECK SHALL be applied via the Cloudflare dashboard / per-statement `--command` and recorded in `d1_migrations` (wrangler 4.x rejects the multi-statement table-recreate). The Worker bound SHALL be redeployed before any client can send `variant_count` above the prior 110 bound.

The request MUST be authenticated (Supabase JWT in `Authorization: Bearer <token>` header). The Worker SHALL verify the JWT via the existing JWKS endpoint reused from `leaderboard.ts`. The `user_id` SHALL be derived from the JWT `sub` claim, NOT from the request body.

#### Scenario: Older updated_at rejected

- **WHEN** an upsert arrives with `updated_at` older than the existing D1 row's `updated_at`
- **THEN** the Worker SHALL leave the existing row unchanged and respond `200 OK` (avoid client retry storm)

#### Scenario: variant_count up to the expanded catalog total is accepted

- **WHEN** an upsert arrives with `variant_count = NEURON_VARIANT_TOTAL` (a fully-collected player on the expanded catalog)
- **THEN** the Worker SHALL accept it (within the `[0, NEURON_VARIANT_TOTAL]` bound) and the D1 `CHECK` SHALL NOT reject it

#### Scenario: Out-of-bounds variant_count rejected at the expanded bound

- **WHEN** an upsert arrives with `variant_count = NEURON_VARIANT_TOTAL + 1` or `variant_count = -1`
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

The system SHALL provide a client-side adapter `pushNeuronsLeaderboardRow(client)` that builds the upsert payload from local Dexie state (`ownedSlotCount(db)` → `variant_count`; `familyAccrual` → `total_AP`; `synapses` where `state='strong'` → `synapse_strong`; `meta['totalStudyMinutes']` → `total_study_min`; sum of `meta['maze:da:settles']` + `['maze:5ht:settles']` + `['maze:gaba:settles']` + `['maze:glu:settles']` → `total_settles`; `leaderboardProfile` → `nickname` + `is_public`) and POSTs to `/leaderboard/neurons/upsert`. The adapter SHALL NOT compute or send `family_complete`. The `variant_count` field SHALL be sourced from the canonical `ownedSlotCount` projection defined in `neuron-variant-fusion` (counting slots with at least one held individual), NOT from `db.neuronVariants.count()` directly — this excludes ghost slots produced by cross-device fusion races from the leaderboard ranking signal. The four `maze:<branch>:settles` keys are the same per-branch settle counters used by the maze economy (`lib/maze/economy.ts`) and are already members of `SYNCED_META_KEYS`, so `total_settles` is cross-device-correct; each SHALL be read defensively (`Number(value) || 0`) so a missing key (legacy save) contributes 0.

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

#### Scenario: variant_count computed from the ownedSlotCount projection at push time

- **WHEN** the adapter builds the payload
- **THEN** `variant_count` SHALL equal `ownedSlotCount(db)` (distinct slots with ≥ 1 held individual) computed at push time, NOT a raw `db.neuronVariants` row count and NOT cached from a separate source
- **AND** the payload SHALL NOT include a `family_complete` field

#### Scenario: Ghost slot does NOT inflate variant_count on the leaderboard

- **GIVEN** a player whose Dexie state has 27 `neuronVariants` rows but `ownedSlotCount(db) = 26` (one ghost slot from a cross-device fusion race per `neuron-variant-fusion`)
- **WHEN** the adapter builds the upsert payload
- **THEN** the payload's `variant_count` SHALL be `26`, NOT `27`
- **AND** the player's leaderboard rank SHALL reflect the corrected (lower) value after Worker accepts the upsert

#### Scenario: synapse_strong computed from synapses table at push time

- **WHEN** the adapter builds the payload
- **THEN** `synapse_strong` SHALL equal `count of rows in db.synapses where state === 'strong'`

### Requirement: Opt-out toggle SHALL hide row from snapshots without deleting D1 row

The system SHALL provide a「公開到排行榜」toggle in `LeaderboardSettingsControls`. When toggled off, the system SHALL POST to `/leaderboard/neurons/opt-out` which sets `is_public = 0` for the player's D1 row. Subsequent KV snapshots MUST exclude `is_public = 0` rows. The D1 row itself MUST be preserved so the player can re-enable opt-in without losing rank history.

#### Scenario: Toggling opt-out hides player from snapshots

- **WHEN** an opted-in player turns off the「公開到排行榜」toggle
- **THEN** the next hourly KV refresh SHALL exclude this player's row from all six filter snapshots, and the player's my-rank chip SHALL switch to「未加入排行」state

#### Scenario: Re-enabling opt-in restores ranking

- **WHEN** an opted-out player turns the toggle back on
- **THEN** the leaderboard adapter SHALL POST `is_public = 1` on next sync (or manual push), and the player SHALL appear in the next hourly KV snapshot without re-entering nickname or re-consenting

### Requirement: Account deletion SHALL remove leaderboard row irreversibly

The system SHALL extend the existing `safeResetAccountData()` flow (or equivalent neurons-tw account-reset entry) so that when a player triggers account deletion, the D1 leaderboard row for that `user_id` SHALL also be deleted via `DELETE /leaderboard/neurons/me`. The deletion MUST be irreversible from the player's perspective — re-creating an account starts fresh on the leaderboard.

The Worker endpoint MUST authenticate via JWT and SHALL only delete the row matching `user_id = jwt.sub`. Deleting other players' rows SHALL NOT be possible.

#### Scenario: Account deletion triggers leaderboard row delete

- **WHEN** a player triggers `safeResetAccountData` from the settings panel
- **THEN** within the same atomic flow, the client SHALL call `DELETE /leaderboard/neurons/me` to remove the D1 row, and the next KV snapshot MUST NOT contain the deleted user_id

#### Scenario: Cross-user delete attempt rejected

- **GIVEN** a malicious request with valid JWT for player A but a request body claiming to delete player B
- **WHEN** the Worker processes `DELETE /leaderboard/neurons/me`
- **THEN** the Worker SHALL only delete the row for `user_id = jwt.sub` (player A)
- **AND** player B's row SHALL remain untouched

### Requirement: Privacy and integrity disclosures SHALL surface on the leaderboard footer

The leaderboard UI footer SHALL display, at all times when the leaderboard list is visible, two disclosure lines:

1.「資料為玩家本機記錄、自填無驗證」(integrity disclosure — anti-cheat policy mirror 二階)
2.「累積唸書計時自 neurons-tw 上線（YYYY-MM-DD）起算；neurons-tw 與 二階 排行榜各自獨立」(scope disclosure)

The opt-in modal MUST additionally surface a link to a「隱私說明」section explaining what is stored, who can see it, and how to opt out / delete.

#### Scenario: Footer integrity disclosure always visible

- **WHEN** the leaderboard list is rendered on any filter tab
- **THEN** both disclosure lines SHALL be visible at the bottom of the page, not requiring scroll past the list to surface

#### Scenario: Opt-in modal links to privacy section

- **WHEN** the opt-in modal is displayed
- **THEN** the modal SHALL include a「了解更多 — 隱私說明」link that expands an inline section (or opens a sub-modal) explaining the privacy model, opt-out, and deletion paths

### Requirement: Nickname uniqueness check endpoint SHALL respond with case-insensitive availability

The Worker SHALL expose a `GET /leaderboard/neurons/nickname-check?n=<candidate>` endpoint that returns whether the proposed nickname is available (case-insensitively) within the neurons-tw nickname pool. The client SHALL debounce calls to this endpoint with a 400ms delay after the last keystroke. The endpoint MUST be authenticated (Supabase JWT in header) to prevent unauthenticated enumeration of nicknames.

The endpoint SHALL only query `leaderboard_neurons.nickname_lower` index; it SHALL NOT query 二階 `leaderboard_m2.nickname_lower` (data isolation).

#### Scenario: Available nickname returns ok

- **WHEN** the client GETs `/leaderboard/neurons/nickname-check?n=newname` and no existing row in `leaderboard_neurons` has `nickname_lower = 'newname'`
- **THEN** the Worker SHALL respond `{"available": true}` with `200 OK`

#### Scenario: Taken nickname returns conflict

- **WHEN** the client GETs `/leaderboard/neurons/nickname-check?n=WLK` and an existing row in `leaderboard_neurons` has `nickname_lower = 'wlk'`
- **THEN** the Worker SHALL respond `{"available": false}` with `200 OK`

#### Scenario: Unauthenticated request rejected

- **WHEN** the endpoint receives a request without a valid Supabase JWT in the Authorization header
- **THEN** the Worker SHALL respond `401 Unauthorized` without executing the D1 query

#### Scenario: 二階 leaderboard nickname does NOT collide

- **GIVEN** an existing row in `leaderboard_m2` with `nickname_lower = 'wlk'`
- **AND** no existing row in `leaderboard_neurons` with `nickname_lower = 'wlk'`
- **WHEN** the client checks `'wlk'` against `/leaderboard/neurons/nickname-check`
- **THEN** the Worker SHALL respond `{"available": true}` (the 二階 row is not consulted)

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

### Requirement: HomePage promo banner SHALL surface leaderboard discovery on first visit

The neurons-tw `OverviewPage` SHALL render a dismissible promo banner at the top of the page that surfaces the leaderboard feature to all visitors (authed + anonymous). The banner SHALL include a headline, sub-line description, a call-to-action link to `/leaderboard`, and a single dismiss button (✕).

Dismiss state SHALL be persisted in localStorage under a versioned key `neurons-leaderboard-promo-banner-dismissed-v1` so future major leaderboard changes can force the banner to re-appear by bumping the version suffix. The banner styling SHALL use the existing pixel `.frame` design tokens (2px `--frame-cell-dark` border + 4px offset shadow + `--bg-cream` background + Cubic 11 font) so it visually integrates with the rest of the neurons-tw shell.

#### Scenario: Banner visible on first homepage visit

- **WHEN** any player (authed or anonymous) opens the neurons-tw `OverviewPage` AND the localStorage key `neurons-leaderboard-promo-banner-dismissed-v1` is absent or not equal to `"true"`
- **THEN** the banner SHALL render at the top of the page, above all other overview cards

#### Scenario: Banner hidden after dismiss

- **WHEN** the player clicks the dismiss button (✕) once
- **THEN** the banner SHALL hide immediately AND localStorage SHALL be updated to `"neurons-leaderboard-promo-banner-dismissed-v1" = "true"`; subsequent visits SHALL NOT render the banner unless localStorage is cleared or the version suffix bumps

#### Scenario: CTA links to leaderboard route

- **WHEN** the player clicks the call-to-action link
- **THEN** the app SHALL navigate to `/leaderboard` via the existing react-router

#### Scenario: localStorage unavailable degrades gracefully

- **WHEN** localStorage read / write throws (e.g., private mode, quota exceeded)
- **THEN** the banner SHALL treat the error as「not dismissed」and render the banner; the dismiss ✕ button SHALL still hide the banner for the current page lifetime via React state, but the dismiss SHALL NOT persist across page loads

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

### Requirement: Neurons leaderboard data plane SHALL remain isolated from 二階 hospital-leaderboard

The `neurons-leaderboard` capability SHALL maintain complete data isolation from `hospital-leaderboard`:

- **Table isolation**: `leaderboard_m2` and `leaderboard_neurons` SHALL be separate D1 tables. SQL queries SHALL never join the two tables for any purpose (analytics, ranking, badges, anything)
- **KV prefix isolation**: `leaderboard:m2:top100:*` and `leaderboard:neurons:top100:*` SHALL be separate KV key spaces. Reads on one prefix SHALL never return rows from the other
- **Endpoint isolation**: `/leaderboard/*` paths (二階) and `/leaderboard/neurons/*` paths SHALL be separate URL spaces. CORS / auth / rate-limit treatment SHALL be configured per-prefix even if currently identical
- **Nickname pool isolation**: per the「Nickname SHALL be 2-12 codepoints」requirement above — verified by the「Nickname collision pool is per-app」 scenario
- **Cross-app references absence**: neurons-tw UI SHALL NOT display 二階 leaderboard data (e.g., "you rank #5 in 二階" banner)
- **Cross-app references absence direction 2**: 二階 `LeaderboardPage` SHALL NOT display neurons-tw data (no "you also have a neurons rank" cross-promotion)

#### Scenario: 二階 LeaderboardPage shows only m2 data

- **GIVEN** a player has rows in both `leaderboard_m2` and `leaderboard_neurons`
- **WHEN** they navigate to 二階 `/leaderboard`
- **THEN** the page SHALL display only `leaderboard_m2`-derived ranking
- **AND** the page SHALL NOT display any neurons-leaderboard data

#### Scenario: neurons-tw LeaderboardPage shows only neurons data

- **GIVEN** a player has rows in both `leaderboard_m2` and `leaderboard_neurons`
- **WHEN** they navigate to neurons-tw `/leaderboard`
- **THEN** the page SHALL display only `leaderboard_neurons`-derived ranking
- **AND** the page SHALL NOT display any 二階 data

#### Scenario: Worker module separation enforced

- **WHEN** a future developer reads `cloudflare/sync-worker/src/neurons-leaderboard.ts`
- **THEN** the file SHALL NOT import from `'./leaderboard.ts'` (the 二階 module)
- **AND** the file MAY import shared helpers from a future `'./lib/auth-utils.ts'` or `'./lib/lww.ts'` (extracted as common code)
- **AND** the file SHALL NOT query `leaderboard_m2` directly

### Requirement: LeaderboardPage SHALL source the authenticated session from the app AuthContext

The neurons-tw `LeaderboardPage` SHALL obtain the current authenticated user and access token from the app's `AuthContext` (`useAuth()`), NOT from externally-passed props. It SHALL derive `userId` from `user?.id`, `accessToken` from `session?.access_token`, and a fallback display name from `user?.user_metadata?.name ?? user?.user_metadata?.full_name ?? user?.email`. The route element (`<Route path="/leaderboard" element={<LeaderboardPage />}>`) therefore requires no auth props.

This ensures the opt-in modal and the leaderboard settings controls — both gated on a present `userId` + `accessToken` — actually render for a signed-in player, and that this reachability cannot silently regress from an un-wired route. When no user is signed in, `userId` / `accessToken` SHALL be null and the page SHALL show only the read-only browse view (no opt-in modal, no settings controls).

#### Scenario: Signed-in player sees the opt-in / settings surfaces

- **WHEN** a player who is signed in (the app `AuthContext` reports a non-null `user` + `session`) opens the `/leaderboard` route and has not yet opted in or dismissed
- **THEN** `LeaderboardPage` SHALL derive `userId` + `accessToken` from `useAuth()` and the opt-in modal SHALL render
- **AND** the `LeaderboardSettingsControls` section SHALL render (containing the「公開到排行榜」toggle, nickname editor, and manual-push button)

#### Scenario: Signed-out visitor sees only the read-only view

- **WHEN** a visitor with no authenticated session opens the `/leaderboard` route
- **THEN** `useAuth()` yields null `user` / `session`, so `userId` and `accessToken` SHALL be null
- **AND** the opt-in modal and the settings controls SHALL NOT render
- **AND** the ranking tabs + Top-100 grid + footer disclosures SHALL still render (read-only browse)

#### Scenario: Route element passes no auth props

- **WHEN** the `/leaderboard` route is declared in `App.tsx`
- **THEN** it SHALL render `<LeaderboardPage />` with no `userId` / `accessToken` / `fallbackDisplayName` props
- **AND** `LeaderboardPage` SHALL be self-sufficient via `useAuth()` (the route is mounted within `<AuthProvider>`)

