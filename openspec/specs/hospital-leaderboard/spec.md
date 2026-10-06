# hospital-leaderboard Specification

## Purpose

Defines the opt-in global leaderboard for 二階 `apps/medexam2-hospital-tw`: a Cloudflare-D1-backed ranking system showing all opted-in players sorted by five criteria (綜合 / 答對總題數 / 聲望 / 醫師個數 / 累積唸書時間) up to top 100, with hourly KV-cached snapshots refreshed by a Worker scheduled cron. Lives in the Cloudflare data plane (`study-rpg-leaderboard` D1 + `LEADERBOARD_KV`) and integrates with the existing R2 sync engine (shares the 3-second debounce push window). Auth uses the existing Supabase JWT bridge — the Worker only consumes the public JWKS to verify tokens, never reads Supabase data.

Strict opt-in (unchecked consent checkbox + nickname required), case-insensitive unique nicknames (2–12 codepoints), full-trust anti-cheat (sanity bounds only + 「自填無驗證」UI disclosure), and toggle-based opt-out that preserves the D1 row while excluding it from KV snapshots. Account deletion is the only path that removes the leaderboard row entirely.

The capability is independent of the M4 cloud sync data plane and the R2 migration — it does not write any Supabase tables and shares only the existing Cloudflare sync Worker for auth + endpoints.
## Requirements
### Requirement: Opt-in flow on first leaderboard visit

The system SHALL present a one-time opt-in modal the first time an authenticated player opens the leaderboard tab. The modal MUST explicitly list the data fields that will be made public (醫院 tier、聲望、醫師個數、累積唸書時間、暱稱), MUST include an unchecked checkbox labelled「同意公開以上資訊」, and MUST require the checkbox be checked before the "加入排行榜" submit button becomes enabled. The modal MUST NOT auto-submit and MUST NOT pre-check the consent checkbox.

#### Scenario: First-time visit shows opt-in modal

- **WHEN** an authenticated player clicks the「排名」tab and has never previously opted in or declined
- **THEN** the system displays a modal listing the four public fields plus the nickname field, with the consent checkbox unchecked and the submit button disabled

#### Scenario: Consent checkbox gates submission

- **WHEN** the opt-in modal is displayed and the player has not checked the consent checkbox
- **THEN** the「加入排行榜」submit button SHALL be disabled and a tooltip / inline label explains "請先勾選同意才能加入"

#### Scenario: Cancelling opt-in leaves player off the leaderboard

- **WHEN** the player closes the opt-in modal without submitting
- **THEN** no row is written to the leaderboard backend, the leaderboard tab shows a「未加入」empty state for the player's own status row, and the modal will re-appear on the next visit until the player either opts in or explicitly dismisses via "不再顯示"

### Requirement: Nickname selection during opt-in

The system SHALL require the player to provide a display nickname during the opt-in flow. The nickname MUST be 2 to 12 Unicode codepoints in length (`[...str].length`), MUST be case-insensitive unique across all opted-in players (e.g. `wlk` collides with `WLK` and `Wlk`), and MAY be left blank — in which case the system falls back to the player's Google display name. The nickname MUST be uniqueness-checked against the backend with a debounced async call before submission, and the system MUST reject submission if the nickname is already taken at submit time.

#### Scenario: Nickname under 2 codepoints rejected

- **WHEN** the player enters a nickname of length 0 or 1 codepoint and the nickname field is non-blank
- **THEN** the field SHALL show an inline error "暱稱長度需 2–12 字元" and submission SHALL be blocked

#### Scenario: Nickname over 12 codepoints rejected

- **WHEN** the player enters a nickname of length > 12 Unicode codepoints
- **THEN** the field SHALL show "暱稱長度需 2–12 字元" and submission SHALL be blocked

#### Scenario: Case-insensitive uniqueness collision

- **WHEN** the player enters「WLK」and another opted-in player's stored nickname is「wlk」
- **THEN** the debounced uniqueness check SHALL return "已被使用" and the field SHALL display the error inline

#### Scenario: Blank nickname falls back to Google display name

- **WHEN** the player leaves the nickname field blank and submits
- **THEN** the system SHALL persist the player's Google display name as the leaderboard `nickname` value, subject to the same length and uniqueness rules; if the Google name violates these rules, the system SHALL block submission and prompt the player to set a custom nickname

#### Scenario: Nickname is changeable post opt-in

- **WHEN** an opted-in player edits their nickname via the settings panel
- **THEN** the new nickname SHALL be subject to the same length and uniqueness checks, and on save SHALL update both the local profile and the next D1 upsert; there SHALL be no cooldown or rate limit on nickname changes

### Requirement: Four filter tabs for ranking criteria

The leaderboard UI SHALL provide **five** filter tabs that determine the ranking criterion. The default tab SHALL be「綜合排名」. Switching tabs SHALL update the displayed ranking without re-querying if the data is already cached client-side for the current hour.

| Tab order | Tab | Sort key |
|---|---|---|
| 1 | 綜合排名 | hospital_tier DESC, reputation DESC, doctor_count DESC |
| 2 | 答對總題數排名 | total_correct DESC |
| 3 | 聲望排名 | reputation DESC |
| 4 | 醫師個數排名 | doctor_count DESC |
| 5 | 累積唸書時間排名 | total_study_min DESC |

The「答對總題數排名」tab SHALL render at position 2 in the tab strip — immediately after「綜合排名」and before「聲望排名」— so that the most recently added discovery surface sits next to the default tab rather than at the far edge of the strip.

#### Scenario: Default tab is 綜合排名

- **WHEN** the player opens the leaderboard tab for the first time within a session
- **THEN** the「綜合排名」tab SHALL be selected by default and its rows displayed first

#### Scenario: Switching filter tabs updates the displayed ranking

- **WHEN** the player clicks the「聲望排名」tab
- **THEN** the displayed top-100 list SHALL re-order by `reputation DESC` from the same hourly snapshot, and the player's own my-rank chip SHALL update to show their reputation-only rank

#### Scenario: Composite ranking tie-breaker order

- **WHEN** two players have identical hospital_tier and reputation in the 綜合排名 tab
- **THEN** the player with higher doctor_count SHALL rank above the other; if doctor_count also ties, ordering between the tied players MAY be arbitrary but MUST be stable within a single snapshot

#### Scenario: Answer-count tab orders by total_correct

- **WHEN** the player clicks the「答對總題數排名」tab
- **THEN** the displayed top-100 list SHALL re-order by `total_correct DESC` from the same hourly snapshot, and the my-rank chip SHALL update to show the player's rank within the `correct` filter; the「答對總題數」column SHALL be bolded as the primary stat in this tab

### Requirement: Top 100 list plus my-rank chip

The leaderboard UI SHALL display up to 100 ranked rows for the active filter as a **pixel-art tabular grid** (not an unstyled list), rendering one row per opted-in player with one cell per data attribute (rank / nickname / hospital tier / reputation / doctor count / total study minutes). The hospital tier cell SHALL render the canonical short label (「診所 / 區域 / 醫中 / 大廟」) via the shared `tierLabel()` helper from `apps/medexam2-hospital-tw/src/lib/tier-labels.ts`, NOT the raw integer (`T1` / `T2` / `T3` / `T4`). The grid SHALL use the existing pixel design tokens (`--frame-dark` border, `--accent-gold` highlight, Cubic 11 font for nicknames and numeric stats) so the visual style matches the rest of the 二階 hospital UI shell. The player's own current rank SHALL remain accessible regardless of scroll position via either the existing sticky top chip OR a new sticky-bottom "my row" repeat that mirrors the user's row data.

#### Scenario: Top 100 displayed when ≥ 100 opted-in players

- **WHEN** the leaderboard backend has ≥ 100 opted-in players and the player views any filter tab
- **THEN** the UI SHALL display 100 rows in a single scrollable tabular grid where each row aligns its cells vertically with the row above and below

#### Scenario: All rows displayed when < 100 opted-in players

- **WHEN** the leaderboard backend has fewer than 100 opted-in players
- **THEN** the UI SHALL display all available rows and SHALL show a counter「目前 N 位玩家加入排行」 at the top or bottom of the grid

#### Scenario: Rank 1 / 2 / 3 visually distinguished

- **WHEN** any row's display rank is 1, 2, or 3
- **THEN** that row's rank cell SHALL be styled with gold (rank 1) / silver (rank 2) / bronze (rank 3) accent color and pixel-art emboss, distinct from the default frame color used by ranks 4–100

#### Scenario: My-row visually highlighted when present in top 100

- **WHEN** the current authenticated user's `user_id` matches one of the rows in the active filter's top 100
- **THEN** that row SHALL be highlighted with `--accent-gold` border (or equivalent pixel design token) so the user can spot themselves at a glance while scrolling

#### Scenario: My-rank chip shows when player is opted in

- **WHEN** an opted-in player views any filter tab
- **THEN** a chip SHALL display「你目前第 X 名 (共 N 人)」using the player's rank in the active filter; if the player's row is scrolled offscreen the chip MAY be pinned (e.g., via `position: sticky` or a sticky-bottom repeat row that mirrors the player's data) so it stays visible while scrolling the grid

#### Scenario: My-rank chip hidden when player is opted out

- **WHEN** a player has not opted in (or has opted out)
- **THEN** the my-rank chip SHALL be hidden and an explanation「未加入排行 — 至「設定」開啟以參與」 SHALL be shown in its place

#### Scenario: Mobile viewport prioritizes essential columns

- **WHEN** the leaderboard page is rendered at viewport width < 768 px
- **THEN** the grid SHALL show at minimum: rank, nickname, the **active filter's primary stat** bolded, and one secondary stat; non-essential columns MAY be hidden via CSS to prevent horizontal overflow; the row order and underlying row data MUST remain identical to the desktop layout

#### Scenario: Empty state preserved

- **WHEN** the active filter's snapshot has zero rows
- **THEN** the existing message「期待第一個上榜的玩家！」 SHALL render in place of the grid; no empty grid frame SHALL appear

#### Scenario: Tier cell renders canonical short label

- **WHEN** a leaderboard row has `hospital_tier = 1` (or `2` / `3` / `4`)
- **THEN** the tier cell SHALL render「診所」(or「區域」/「醫中」/「大廟」respectively) via `tierLabel(NUM_TO_TIER[row.hospital_tier])`, NOT the literal string `T1` / `T2` / `T3` / `T4`; if `hospital_tier` is outside the supported range the cell SHALL fall back to「診所」and log a `console.warn`, so a single malformed row never crashes the entire leaderboard tab

### Requirement: Hourly KV cache refresh

The leaderboard backend SHALL pre-compute the top-100 ranking for each of the **five** filter tabs **twice per hour** via a Worker scheduled cron trigger at minutes `:00` and `:30`. Client read requests SHALL fetch from the KV cache, NOT directly from D1. The system MAY serve a stale snapshot (older than 30 min) if the cron has not yet refreshed, but MUST surface a「上次更新：HH:MM」timestamp in the leaderboard UI.

#### Scenario: 30-min cron pre-computes all five filters

- **WHEN** the Worker scheduled trigger fires at `:00` or `:30` of each hour
- **THEN** the system SHALL run five D1 queries (one per filter) and write the resulting top-100 row arrays to five KV keys (`leaderboard:m2:top100:composite|reputation|doctor|study|correct`), and SHALL log a single line entry for monitoring

#### Scenario: Client read serves KV cache

- **WHEN** a client GETs `/leaderboard/composite`
- **THEN** the Worker SHALL return the value from `leaderboard:m2:top100:composite` KV key directly, without querying D1, and include a `last_updated_at` timestamp in the response

#### Scenario: Stale snapshot served on cron failure

- **WHEN** the Worker scheduled cron fails to run for two consecutive scheduled slots
- **THEN** the client SHALL still receive the most recent successful snapshot from KV; the UI SHALL surface the「上次更新：HH:MM」timestamp so the player can detect staleness

### Requirement: Push leaderboard row on cloud sync

The system SHALL upsert the player's leaderboard row to D1 via the Worker `POST /leaderboard/upsert` endpoint as part of the existing cloud sync push pipeline. The leaderboard push MUST share the same 3-second debounce window as the R2 bundle push and MUST NOT generate additional standalone network requests outside the sync cycle.

#### Scenario: Cloud sync triggers leaderboard upsert

- **WHEN** an opted-in player completes a gameplay action that triggers cloud sync (e.g. recruits a doctor, completes a study session)
- **THEN** within the next 3-second debounce window the sync engine SHALL POST the current `{user_id, nickname, hospital_tier, reputation, doctor_count, total_study_min, total_correct, is_public, updated_at}` payload to `/leaderboard/upsert` in addition to the R2 bundle push

#### Scenario: total_correct computed from questionHistory aggregate

- **WHEN** the leaderboard adapter computes the payload for an upsert
- **THEN** the `total_correct` field SHALL equal `Math.max(0, Math.floor(SUM(questionHistory.correctCount)))` across all rows in the local Dexie `questionHistory` table; the adapter SHALL NOT read from `mastery.correct` for this value because `mastery.correct` carries a partner-specialty multiplier weighting that does not match the player's intuitive「答對總題數」count, and `mastery` upserts were historically subject to outer-transaction rollback regressions that left `questionHistory` as the more reliable source

#### Scenario: Opted-out player still upserts is_public=0

- **WHEN** an opted-out player triggers cloud sync
- **THEN** the leaderboard adapter SHALL still POST to `/leaderboard/upsert` with `is_public: 0`, so that the D1 row remains current if the player re-opens opt-in later, but the row SHALL be excluded from KV snapshots

#### Scenario: Player who never opted in does not push

- **WHEN** an authenticated player who has never opted in triggers cloud sync
- **THEN** the leaderboard adapter SHALL skip the upsert call entirely; no D1 row is created

### Requirement: Server-side LWW and sanity bounds

The Worker `/leaderboard/upsert` endpoint SHALL enforce last-write-wins semantics using `updated_at` (millisecond epoch) and SHALL reject payloads whose values fall outside known sanity bounds: `hospital_tier ∈ [1, 4]`, `reputation ≥ 0`, `doctor_count ∈ [0, 50]`, `total_study_min ≥ 0`, `total_correct ≥ 0`. Rejected payloads SHALL log a structured warning but MUST NOT surface a UI error to the player (silent server-side filtering). The D1 table `leaderboard_m2` SHALL declare `CHECK (hospital_tier BETWEEN 1 AND 4)` and `CHECK (total_correct >= 0)` as defence-in-depth so any divergence between Worker bound and schema is caught at the database layer. The `total_correct` field MAY be omitted from the payload by older clients; in that case it SHALL be treated as `0` for forward-compatibility during the rollout window.

#### Scenario: Older updated_at rejected

- **WHEN** an upsert arrives with `updated_at` older than the existing D1 row's `updated_at`
- **THEN** the Worker SHALL leave the existing row unchanged and respond `200 OK`（避免 client retry storm）

#### Scenario: Out-of-bounds hospital_tier rejected

- **WHEN** an upsert arrives with `hospital_tier = 5` or `hospital_tier = 0`
- **THEN** the Worker SHALL discard the upsert, log a structured warning with the offending user_id, and respond `200 OK` without writing to D1

#### Scenario: T4 (大廟) hospital_tier accepted

- **WHEN** an upsert arrives with `hospital_tier = 4` and all other fields are within bounds
- **THEN** the Worker SHALL accept the payload, upsert the D1 row with `hospital_tier = 4`, and the next KV snapshot refresh SHALL include this row sortable as a distinct tier above `hospital_tier = 3` rows in the composite filter

#### Scenario: Negative total_correct rejected

- **WHEN** an upsert arrives with `total_correct = -1` or `total_correct = NaN`
- **THEN** the Worker SHALL discard the upsert, log a structured warning `"[leaderboard] dropped upsert: correct oob"` with the offending user_id and value, and respond `200 OK` with `dropped: "correct_oob"` without writing to D1

#### Scenario: Missing total_correct in legacy client payload defaults to 0

- **WHEN** a client whose JS bundle predates this change pushes an upsert without the `total_correct` field
- **THEN** the Worker SHALL treat the missing field as `0` and persist the row with `total_correct = 0`, allowing the legacy client to keep syncing the four pre-existing numeric fields while the new field stays at the default until the client bundle refreshes

### Requirement: Opt-out hides row without deletion

The system SHALL provide a「公開到排行榜」toggle in the settings panel. When toggled off, the system SHALL POST to `/leaderboard/opt-out` which sets `is_public = 0` for the player's D1 row. Subsequent KV snapshots MUST exclude `is_public = 0` rows. The D1 row itself MUST be preserved so the player can re-enable opt-in without losing rank history.

#### Scenario: Toggling opt-out hides player from snapshots

- **WHEN** an opted-in player turns off the「公開到排行榜」toggle
- **THEN** the next hourly KV refresh SHALL exclude this player's row from all five filter snapshots, and the player's my-rank chip SHALL switch to「未加入排行」state

#### Scenario: Re-enabling opt-in restores ranking

- **WHEN** an opted-out player turns the toggle back on
- **THEN** the leaderboard adapter SHALL POST `is_public = 1` on next sync, and the player SHALL appear in the next hourly KV snapshot without re-entering nickname or re-consenting

### Requirement: Account deletion removes leaderboard row

The system SHALL extend the existing `delete_my_account()` flow so that when a player triggers account deletion, the D1 leaderboard row for that `user_id` SHALL also be deleted. The deletion MUST be irreversible from the player's perspective — re-creating an account starts fresh on the leaderboard.

#### Scenario: Account deletion triggers leaderboard row delete

- **WHEN** a player triggers `delete_my_account` from the settings panel
- **THEN** within the same atomic flow, the Worker SHALL `DELETE /leaderboard/me` to remove the D1 row, and the next KV snapshot MUST NOT contain the deleted user_id

### Requirement: Privacy and integrity disclosures

The leaderboard UI footer SHALL display, at all times when the leaderboard list is visible, two disclosure lines:

1.「資料為玩家本機記錄、自填無驗證」(integrity disclosure — anti-cheat policy)
2.「累積唸書計時自 V6（YYYY-MM-DD）起算；之前的時間不計」(V6 migration disclosure)

The opt-in modal MUST additionally surface a link to a「隱私說明」section explaining what is stored, who can see it, and how to opt out / delete.

#### Scenario: Footer integrity disclosure always visible

- **WHEN** the leaderboard list is rendered on any filter tab
- **THEN** both disclosure lines SHALL be visible at the bottom of the page, not requiring scroll past the list to surface

#### Scenario: Opt-in modal links to privacy section

- **WHEN** the opt-in modal is displayed
- **THEN** the modal SHALL include a「了解更多 — 隱私說明」link that expands an inline section (or opens a sub-modal) explaining the privacy model, opt-out, and deletion paths

### Requirement: Nickname uniqueness check endpoint

The Worker SHALL expose a `GET /leaderboard/nickname-check?n=<candidate>` endpoint that returns whether the proposed nickname is available (case-insensitively). The client SHALL debounce calls to this endpoint with a 400ms delay after the last keystroke. The endpoint MUST be authenticated (Supabase JWT in header) to prevent unauthenticated enumeration of nicknames.

#### Scenario: Available nickname returns ok

- **WHEN** the client GETs `/leaderboard/nickname-check?n=newname` and no existing row has `nickname_lower = 'newname'`
- **THEN** the Worker SHALL respond `{"available": true}` with `200 OK`

#### Scenario: Taken nickname returns conflict

- **WHEN** the client GETs `/leaderboard/nickname-check?n=WLK` and an existing row has `nickname_lower = 'wlk'`
- **THEN** the Worker SHALL respond `{"available": false}` with `200 OK`

#### Scenario: Unauthenticated request rejected

- **WHEN** the endpoint receives a request without a valid Supabase JWT in the Authorization header
- **THEN** the Worker SHALL respond `401 Unauthorized` without executing the D1 query

### Requirement: Cron dispatch handler matches wrangler trigger expression

The Worker's `scheduled(event, env, ctx)` dispatch logic (in `cloudflare/sync-worker/src/index.ts`) SHALL compare `event.cron` against the **exact cron expression strings declared in `cloudflare/sync-worker/wrangler.jsonc` `triggers.crons` array**. The implementation SHALL declare those expressions as named module-scope constants (`CRON_LEADERBOARD_30MIN`, `CRON_NEURONS_LEADERBOARD_30MIN`, `CRON_NOTE_IMAGE_SWEEP_DAILY`, etc.) so the dispatch switch references the canonical constant rather than re-typing the string literal at each case. Each case SHALL dispatch to exactly one job (see `sync-worker-cpu-budget`). Any unknown `event.cron` value SHALL be logged via `console.error` (not `console.warn`) with a structured payload `{ cron, knownCrons }` so dispatch mismatches surface in Workers Logs immediately.

#### Scenario: Dispatch switch matches wrangler config exactly

- **WHEN** Cloudflare invokes the scheduled handler with `event.cron` equal to any string declared in `wrangler.jsonc` `triggers.crons`
- **THEN** the switch SHALL match that string via a named constant case and dispatch to the corresponding cron-handler function (e.g., `runLeaderboardCron` / `runNeuronsLeaderboardCron`); the `default` branch SHALL NOT fire for any cron string that is actually in wrangler config

#### Scenario: Unknown cron trigger surfaces as error log

- **WHEN** Cloudflare invokes the scheduled handler with an `event.cron` value not matching any declared constant
- **THEN** the handler SHALL emit `console.error("[scheduled] unknown cron trigger ...", { cron, knownCrons })` so the mismatch is visible in Workers Logs error-level filters; the handler SHALL NOT silently succeed

#### Scenario: Declared constants and wrangler config are the same set

- **WHEN** the set of named cron constants in `src/index.ts` is compared with `wrangler.jsonc` `triggers.crons`
- **THEN** the two sets SHALL be equal — no constant without a trigger (a dead case) and no trigger without a constant (a `default`-branch error every run)

### Requirement: Homepage promo banner promotes leaderboard discovery

The hospital app HomePage SHALL render a dismissible promo banner at the top of the page that surfaces the leaderboard feature to all visitors (authed + anonymous). The banner SHALL include a headline, sub-line description, a call-to-action link to `/#/leaderboard`, and a single dismiss button (✕). Dismiss state SHALL be persisted in localStorage under a versioned key (e.g., `leaderboard-promo-banner-dismissed-v1`) so future major leaderboard changes can force the banner to re-appear by bumping the version suffix. The banner styling SHALL use the existing pixel `.frame` design tokens (2px `--frame-dark` border + 4px offset shadow + `--bg-paper` background + Cubic 11 font) so it visually integrates with the rest of the 二階 hospital shell.

#### Scenario: Banner visible on first homepage visit

- **WHEN** any player (authed or anonymous) opens the HomePage and the localStorage key `leaderboard-promo-banner-dismissed-v1` is absent or not equal to `"true"`
- **THEN** the banner SHALL render at the top of the page, above all other homepage cards / banners / hospital scene

#### Scenario: Banner hidden after dismiss

- **WHEN** the player clicks the dismiss button (✕) once
- **THEN** the banner SHALL hide immediately and localStorage SHALL be updated to `"leaderboard-promo-banner-dismissed-v1" = "true"`; subsequent HomePage visits SHALL NOT render the banner unless localStorage is cleared or the version suffix bumps

#### Scenario: CTA links to leaderboard

- **WHEN** the player clicks the call-to-action link
- **THEN** the app SHALL navigate to `/#/leaderboard` via the existing HashRouter (same route as the top-nav「排名」 link); banner SHALL remain rendered on the previous page (the navigation is by hash, leaderboard page is a separate route render)

#### Scenario: Anonymous user clicks CTA

- **WHEN** an anonymous (not signed in) player clicks the CTA and lands on the leaderboard page
- **THEN** the existing「未登入 — 登入後可查看自己的排名」 chip SHALL render in place of the my-rank chip (existing behavior, unchanged); the player MAY sign in via the existing Sign-in button to participate

#### Scenario: localStorage unavailable degrades gracefully

- **WHEN** localStorage read / write throws (e.g., private mode, quota exceeded, disabled by browser policy)
- **THEN** the banner SHALL treat the error as「not dismissed」 and render the banner; the dismiss ✕ button SHALL still hide the banner for the current page lifetime via React state, but the dismiss SHALL NOT persist across page loads

### Requirement: Leaderboard endpoints accept requests from new domain via `api.med-study-rpg.com`

The leaderboard endpoints (`/leaderboard/upsert`, `/leaderboard/:filter`, `/leaderboard/nickname-check`, `/leaderboard/opt-out`, `/leaderboard/me`) are hosted by the same Worker as the R2 sync API. Per the `cloud-sync` capability's new `Worker Custom Domain` requirement, those endpoints SHALL also be reachable under `https://api.med-study-rpg.com/leaderboard/...` once the Custom Domain binding is in place.

Browser clients on `https://med-study-rpg.com/2nd/` SHALL issue leaderboard requests to `https://api.med-study-rpg.com/leaderboard/...` (constructed by concatenating `VITE_SYNC_WORKER_URL` + `/leaderboard/...`).

The Worker's CORS allowed origins SHALL include `https://med-study-rpg.com` per the `cloud-sync` modification. No leaderboard-specific CORS configuration is required beyond what `cloud-sync` already covers — the Worker uses a single allowed-origins list for all routes.

#### Scenario: 二階 client on new domain reads leaderboard

- **GIVEN** a user on `https://med-study-rpg.com/2nd/` opens the leaderboard page
- **WHEN** the leaderboard hook fetches `/leaderboard/composite`
- **THEN** the network request SHALL be a GET to `https://api.med-study-rpg.com/leaderboard/composite`
- **AND** the Worker SHALL return the same KV-cached top-100 snapshot as the workers.dev URL returns
- **AND** the response SHALL include `Access-Control-Allow-Origin: https://med-study-rpg.com`

#### Scenario: 二階 client on new domain pushes leaderboard row after successful sync

- **GIVEN** an opted-in user on `https://med-study-rpg.com/2nd/` completes a sync push with `firstError === null && !anyOffline`
- **WHEN** the `onPushComplete` callback fires
- **THEN** the leaderboard upsert SHALL POST to `https://api.med-study-rpg.com/leaderboard/upsert`
- **AND** the Worker SHALL verify the JWT, apply sanity bounds, and UPSERT into D1 (existing leaderboard write logic unchanged)
- **AND** subsequent KV cron refresh SHALL pick up the new row in the snapshot

#### Scenario: Nickname uniqueness check works on new domain

- **GIVEN** a user on `https://med-study-rpg.com/2nd/` is choosing a nickname during opt-in
- **WHEN** the nickname field debounces and calls `/leaderboard/nickname-check?n=<candidate>`
- **THEN** the request SHALL go to `https://api.med-study-rpg.com/leaderboard/nickname-check?n=<candidate>`
- **AND** the Worker SHALL respond with the same availability verdict as the workers.dev URL would

#### Scenario: Account reset hard-deletes leaderboard row from new domain

- **GIVEN** an opted-in user on `https://med-study-rpg.com/2nd/` triggers in-place account reset
- **WHEN** `safeResetAccountData` calls `deleteLeaderboardMe`
- **THEN** the request SHALL be a DELETE to `https://api.med-study-rpg.com/leaderboard/me` with a valid JWT
- **AND** the Worker SHALL hard-delete the user's row from D1 (existing logic unchanged)
- **AND** subsequent reads SHALL no longer surface that user in the leaderboard


<!-- Added by add-achievement-system (synced 2026-05-24) -->


### Requirement: Leaderboard row carries badges_csv and subject_mastery_count

The `leaderboard_m2` D1 table SHALL gain two new columns via migration `cloudflare/sync-worker/migrations/0002_add_badges.sql`:

- `badges_csv TEXT DEFAULT ''` — format: comma-separated `category:tier` pairs (max 6 entries, max 60 chars total). Example: `"study:P1,quiz:P2,recruit:P2,hospital:P3,fortune:P4,hidden:P1"`. Each pair represents the highest tier the player has unlocked in that category.
- `subject_mastery_count INTEGER DEFAULT 0` — integer in range [0, 14] representing how many of the 14 subject mastery achievements the player has unlocked.

The migration SHALL be applied manually via `wrangler d1 migrations apply study-rpg-leaderboard --remote` by the owner (sustaining the manual-apply discipline established by migration 0001).

#### Scenario: Migration adds columns with safe defaults

- **WHEN** the owner applies migration 0002_add_badges.sql to a D1 database that contains existing leaderboard_m2 rows
- **THEN** every existing row SHALL receive `badges_csv = ''` and `subject_mastery_count = 0` automatically (no row-level update needed)

#### Scenario: Old Worker reads new columns gracefully

- **WHEN** an unpatched Worker (from before the deploy of new endpoints) queries the leaderboard_m2 table after migration apply
- **THEN** the query SHALL succeed (columns are nullable with defaults); the Worker's SELECT statement does not need to be updated

### Requirement: Worker upsert endpoint accepts badges_csv and subject_mastery_count

The Worker endpoint `POST /leaderboard/upsert` SHALL extend its accepted JWT-authenticated request body to include two optional fields: `badges_csv: string` and `subject_mastery_count: number`. Validation:

- `badges_csv` MUST match regex `^([a-z]+:P[1-4])(,[a-z]+:P[1-4]){0,5}$` (1–6 entries, lowercase category, P1-P4 tier) OR be empty string
- `subject_mastery_count` MUST be an integer in [0, 14]

Invalid values SHALL be rejected with `400 Bad Request`. Valid values SHALL be written to the D1 row via UPSERT with LWW on `updated_at`.

#### Scenario: Valid badges_csv accepted

- **WHEN** a client POSTs `{ "badges_csv": "study:P2,quiz:P1", "subject_mastery_count": 5, ... }` with a valid JWT
- **THEN** the Worker SHALL upsert the row with these values and return 200

#### Scenario: Out-of-range subject_mastery_count rejected

- **WHEN** a client POSTs `{ "subject_mastery_count": 99, ... }`
- **THEN** the Worker SHALL return 400 with an error message indicating the field is out of range

#### Scenario: Malformed badges_csv rejected

- **WHEN** a client POSTs `{ "badges_csv": "study:PURPLE,invalid-format" }`
- **THEN** the Worker SHALL return 400

### Requirement: KV snapshot includes badges_csv and subject_mastery_count

The hourly leaderboard cron handler SHALL include both new fields when writing the Top 100 snapshots to KV (keys `leaderboard:m2:top100:<filter>`). Public read endpoints (`GET /leaderboard/:filter`) SHALL return these fields in the response JSON.

#### Scenario: KV snapshot row carries badges

- **WHEN** the hourly cron runs and a player is in the Top 100
- **THEN** that player's entry in the KV snapshot SHALL include `badges_csv` and `subject_mastery_count` fields (alongside existing fields like nickname, hospital_tier, etc.)

#### Scenario: Read endpoint exposes badges to client

- **WHEN** any client makes `GET /leaderboard/composite`
- **THEN** the response JSON SHALL include `badges_csv` and `subject_mastery_count` for each row

### Requirement: LeaderboardPage renders 6 category badges + subject mastery chip

The 二階 `LeaderboardPage.tsx` SHALL render each leaderboard row's nickname column with two additional visual elements (placed after nickname, before stat columns):

1. **6 category badges** inline (fixed display order: study / quiz / recruit / hospital / fortune / hidden). For each category present in the player's `badges_csv`, render a `<BadgeSprite category={cat} tier={tier} size={24} />` (mobile) or `size={32}` (desktop). Missing categories render nothing for that slot (no placeholder).
2. **Subject mastery chip** in the form `🩺 X/14` immediately after the 6 category badges. Render only when `subject_mastery_count > 0`; otherwise omit.

Hovering / long-pressing a category badge SHALL show a tooltip with text `<TIER> 級<CATEGORY>成就`. Hovering the subject chip SHALL NOT show a tooltip in MVP (the full 14-subject grid lives in personal `/achievements` page).

#### Scenario: Full badge profile renders

- **WHEN** a leaderboard_m2 row has `badges_csv = "study:P1,quiz:P2,recruit:P2,hospital:P3,fortune:P4,hidden:P1"` and `subject_mastery_count = 5`
- **THEN** the row displays 6 inline BadgeSprite components plus a chip `🩺 5/14`

#### Scenario: Partial badge profile renders

- **WHEN** a row has `badges_csv = "study:P3,quiz:P4"` and `subject_mastery_count = 0`
- **THEN** the row displays 2 BadgeSprite components (study P3, quiz P4) and no chip

#### Scenario: Row width does not break on max badges

- **WHEN** a row has all 6 categories present and `subject_mastery_count = 14`
- **THEN** the total badge + chip width on mobile (24px × 6 + chip ≈ 200px) MUST fit within the row without wrapping or horizontal overflow

### Requirement: Client push includes derived badges_csv and subject_mastery_count

The 二階 sync engine's `onPushComplete` callback in `apps/medexam2-hospital-tw/src/lib/sync/leaderboard.ts` SHALL derive `badges_csv` and `subject_mastery_count` from the local `achievements` Dexie table and include them in the upsert payload to the Worker. Derivation:

- `badges_csv`: for each of 6 main categories, find the highest tier among unlocked achievements (tier order: P4 < P3 < P2 < P1). Skip categories with zero unlocks. Format as `cat:tier` and join with commas.
- `subject_mastery_count`: count of unlocked achievements whose `id` matches pattern `subject-master-*` (NOT counting the `all-subjects-mastered` capstone).

#### Scenario: Empty achievements yields empty badges

- **WHEN** the player has not unlocked any achievements
- **THEN** the client SHALL push `{ "badges_csv": "", "subject_mastery_count": 0 }`

#### Scenario: One unlock per category produces expected CSV

- **WHEN** the player has unlocked one P3 study achievement and one P4 hospital achievement
- **THEN** the client SHALL push `{ "badges_csv": "study:P3,hospital:P4", "subject_mastery_count": 0 }`

#### Scenario: 5 subject masteries push count=5

- **WHEN** the player has unlocked `subject-master-內科` / `subject-master-外科` / `subject-master-小兒科` / `subject-master-皮膚科` / `subject-master-神經內科`
- **THEN** the client SHALL push `subject_mastery_count: 5`

### Requirement: total_correct column persists in D1

The D1 `leaderboard_m2` table SHALL include a `total_correct INTEGER NOT NULL DEFAULT 0` column constrained by `CHECK (total_correct >= 0)`. A partial index `WHERE is_public = 1` SHALL exist on `total_correct DESC` to back the cron's `correct` filter query without a table scan. Existing rows at migration time SHALL receive `total_correct = 0` from the column default; no retroactive backfill from quiz history is required because each opted-in client's next sync push will overwrite the row with the real value.

#### Scenario: Migration adds column without rewriting rows

- **WHEN** the D1 migration `0005_add_total_correct.sql` is applied via `wrangler d1 migrations apply study-rpg-leaderboard --remote`
- **THEN** all existing `leaderboard_m2` rows SHALL gain a `total_correct = 0` column value via SQLite's constant-default fast-path, and the new partial index `idx_leaderboard_m2_total_correct` SHALL be created with the same `WHERE is_public = 1` clause as the other indexes

#### Scenario: Existing rows surface as zero on the correct tab until next push

- **WHEN** a player who opted in before the migration opens the leaderboard within the first 30-min cron window after migration apply
- **THEN** their row SHALL appear in the「答對總題數排名」tab with `total_correct = 0`; the value SHALL update to the real aggregate after their next `onPushComplete` upsert
