## ADDED Requirements

### Requirement: Cloudflare Worker presigns R2 URLs after verifying Supabase JWT

The app SHALL deploy a Cloudflare Worker (named `study-rpg-sync-worker`) exposing a `POST /presign` endpoint. Clients SHALL call this endpoint with a `Bearer <supabase-jwt>` Authorization header and a JSON body `{ bundle: 'm1' | 'm2' | 'bookmarks', op: 'put' | 'get' }`. The Worker SHALL verify the JWT against Supabase's JWKS endpoint (with in-memory key caching, 1-hour TTL), extract the `sub` claim as `user_id`, and return a presigned R2 URL scoped to key `users/<user_id>/<bundle>.json.gz` with a 5-minute TTL. URLs SHALL NEVER be issued for paths whose `user_id` segment does not match the verified JWT's `sub`.

#### Scenario: Valid JWT issues scoped presigned URL

- **GIVEN** a client holds a valid unexpired Supabase JWT with `sub = abc-123`
- **WHEN** the client `POST /presign` with body `{ bundle: 'm1', op: 'put' }`
- **THEN** the Worker SHALL return a 200 response with `{ url, expiresAt }` where the presigned URL targets key `users/abc-123/m1-snapshot.json.gz`
- **AND** `expiresAt` SHALL be 5 minutes from now (±10s tolerance)

#### Scenario: Invalid or expired JWT is rejected

- **WHEN** a client posts to `/presign` with a missing, malformed, or expired Authorization header
- **THEN** the Worker SHALL return a 401 response
- **AND** no R2 URL SHALL be generated

#### Scenario: Forged user_id in body is ignored

- **GIVEN** a client holds a valid JWT with `sub = abc-123`
- **WHEN** the client posts `{ bundle: 'm1', op: 'put', user_id: 'def-456' }` attempting to override the scope
- **THEN** the Worker SHALL ignore any `user_id` field in the body and use only the JWT's `sub` claim
- **AND** the returned URL SHALL target `users/abc-123/m1-snapshot.json.gz`

#### Scenario: Unknown bundle name is rejected

- **WHEN** a client posts `{ bundle: 'random-name', op: 'put' }`
- **THEN** the Worker SHALL return a 400 response
- **AND** SHALL accept ONLY the values `'m1'`, `'m2'`, `'bookmarks'`

### Requirement: R2 blob layout — three bundles per user

Cloud-sync data SHALL be partitioned into exactly three gzipped JSON blobs per user in the R2 bucket `study-rpg-saves`:

- `users/<user_id>/m1-snapshot.json.gz` — 一階 (`player_state`, `srs_cards`, `item_instances`, `mentor_backlog`)
- `users/<user_id>/m2-snapshot.json.gz` — 二階 (`hospital_state`, `hospital_doctors`, `hospital_mastery`, `hospital_question_history`)
- `users/<user_id>/bookmarks.json.gz` — cross-app `/bookmarks` page (`question_bookmarks`)

Each blob's decompressed JSON SHALL contain a top-level `meta` object with fields `{ schema_version: number, updated_at: string (ISO 8601), client_id: string }` plus a `data` object whose shape is the per-table snapshot for that bundle. No other top-level keys SHALL exist.

#### Scenario: M1 blob contains only 一階 tables

- **WHEN** the client builds the M1 snapshot
- **THEN** the resulting JSON's `data` field SHALL include keys for exactly `player_state`, `srs_cards`, `item_instances`, `mentor_backlog`
- **AND** SHALL NOT include any 二階 table

#### Scenario: Meta block is required

- **WHEN** the client uploads a blob
- **THEN** the blob's JSON SHALL include `meta.schema_version` (integer ≥ 1), `meta.updated_at` (ISO 8601 string), and `meta.client_id` (UUID identifying the device that produced this snapshot)
- **AND** a blob missing any meta field SHALL be rejected by the client on pull (treated as corrupt, falls back to migration prompt)

### Requirement: ETag-based optimistic concurrency on blob push

Every push to R2 SHALL include an `If-Match: <last-known-etag>` header when the client believes a prior version of the blob exists. The client SHALL track each bundle's last-fetched ETag in memory. On R2 returning `412 Precondition Failed`, the client SHALL pull the bundle, merge cloud state with local pending changes via per-row `updated_at` LWW (in-blob), and retry the push with the new ETag. The retry SHALL cap at 3 attempts with exponential backoff (250ms / 1s / 4s).

#### Scenario: First push uses If-None-Match: *

- **GIVEN** the client has never pulled this bundle (no last-known ETag)
- **WHEN** the client pushes the bundle
- **THEN** the request SHALL include `If-None-Match: *` (refuse if any version exists)
- **AND** SHALL succeed only if R2 does not currently have this blob

#### Scenario: Push with current ETag succeeds

- **GIVEN** the client last pulled this bundle and stored ETag `etag-A`
- **AND** no other device has pushed since
- **WHEN** the client pushes with `If-Match: etag-A`
- **THEN** R2 SHALL accept the write and return a new ETag
- **AND** the client SHALL update its in-memory tracked ETag

#### Scenario: Stale ETag triggers pull-merge-retry

- **GIVEN** the client holds ETag `etag-A` but another device pushed (cloud ETag is now `etag-B`)
- **WHEN** the client pushes with `If-Match: etag-A`
- **THEN** R2 SHALL return 412
- **AND** the client SHALL pull the bundle (acquiring `etag-B`)
- **AND** SHALL merge the pulled state with its local pending changes (per-row `updated_at` LWW within the bundle's `data` object)
- **AND** SHALL retry the push with `If-Match: etag-B`

#### Scenario: Retry budget exhausted surfaces error

- **WHEN** three consecutive push attempts all return 412
- **THEN** the client SHALL stop retrying for this bundle
- **AND** SHALL emit a `sync:error` event so the standard error-toast pipeline can surface the conflict
- **AND** local IndexedDB state SHALL remain intact (dirty markers preserved for next push opportunity)

### Requirement: Banner-prompted client-side migration for existing M4-era users

For users who hold Supabase row data from the M4 era and do not yet have a complete set of R2 blobs, the app SHALL render a one-time migration banner offering an explicit 「立即遷移」 action. The migration SHALL be entirely client-driven (the Worker SHALL NOT hold a Supabase service-role key, SHALL NOT read user data on behalf of the user, and SHALL NOT expose any `/bootstrap` endpoint). The client SHALL read its own RLS-scoped Supabase rows, build the 3 blob bundles in-browser, and PUT them via the existing `/presign` flow.

The banner SHALL render when ALL of the following are true:

- `authStatus === 'authed'` AND
- At least one Supabase sync table has ≥ 1 row for the current `auth.uid()` AND
- R2 has fewer than 3 blobs under `users/<auth.uid()>/`

The banner SHALL offer two actions: 「立即遷移」 (triggers migration) and 「稍後再說」 (hides the banner for 24 hours; banner returns on next sign-in or 24h elapsed). The banner SHALL NEVER block gameplay — it renders in a non-modal location (top of viewport, dismissible).

After 7 days of repeated dismissals, the banner copy SHALL escalate to communicate urgency without being threatening: 「您的雲端存檔還在舊系統中，請點此遷移以確保跨裝置同步繼續運作」.

#### Scenario: Banner appears for M4-era user on first new-version sign-in

- **GIVEN** user `abc-123` previously signed in during the M4 era and has Supabase rows in `player_state` and `hospital_state`
- **AND** R2 has 0 blobs under `users/abc-123/`
- **WHEN** the user signs in on a client running the new R2 code
- **THEN** within 2 seconds of the engine starting, the `MigrationBanner` SHALL render
- **AND** the banner SHALL display 「立即遷移」 and 「稍後再說」 actions

#### Scenario: 「立即遷移」 click performs client-side migration

- **WHEN** the user clicks 「立即遷移」
- **THEN** the client SHALL use its existing Supabase JS client to SELECT all rows from each sync table where `user_id = auth.uid()`
- **AND** Supabase pagination SHALL be honored (loop SELECT until all rows fetched)
- **AND** the client SHALL build 3 blob bundles (M1, M2, bookmarks) by partitioning the rows
- **AND** the client SHALL request a presigned URL for each bundle via `POST /presign`
- **AND** the client SHALL PUT each bundle to R2 with `If-None-Match: *`
- **AND** on success, the banner SHALL dismiss and the engine SHALL resume normal sync

#### Scenario: 「稍後再說」 hides banner for 24 hours

- **WHEN** the user clicks 「稍後再說」
- **THEN** the banner SHALL dismiss
- **AND** a local timestamp SHALL be persisted (`migration-banner-snoozed-until`)
- **AND** the banner SHALL NOT re-render until 24 hours have elapsed OR the user signs out and back in

#### Scenario: Banner copy escalates after repeated dismissals

- **GIVEN** the user has dismissed the migration banner ≥ 3 times across ≥ 7 days
- **WHEN** the banner re-renders
- **THEN** the banner copy SHALL switch to the escalated message about cross-device sync continuity
- **AND** the banner SHALL still NOT block gameplay (non-modal)

#### Scenario: No service-role key required in Worker

- **WHEN** the Worker is deployed
- **THEN** the Worker's secret bindings SHALL NOT include any Supabase service-role key
- **AND** the Worker SHALL NOT expose any endpoint that reads user data from Supabase on behalf of a user

#### Scenario: Partial migration is resumable

- **GIVEN** the user clicked 「立即遷移」 but closed the tab after only the M1 blob succeeded (M2 and bookmarks blobs not yet PUT)
- **WHEN** the user signs in again
- **THEN** the detection logic SHALL find R2 has 1 of 3 blobs
- **AND** the banner SHALL re-render
- **AND** a subsequent 「立即遷移」 click SHALL skip M1 (already in R2) and complete M2 + bookmarks

#### Scenario: Migration during active gameplay does not lose writes

- **GIVEN** the user clicks 「立即遷移」 while a debounced quiz-answer push is pending
- **WHEN** migration runs
- **THEN** the in-flight push SHALL complete via the dual-write path first (Supabase + R2 M1)
- **AND** the migration SHALL then SELECT the now-current Supabase state (including the just-pushed values)
- **AND** no quiz-answer writes SHALL be lost

#### Scenario: JWT expires mid-migration

- **GIVEN** the user clicks 「立即遷移」 and the Supabase JWT expires before all 3 blobs are uploaded
- **WHEN** the next presign request returns 401
- **THEN** the client SHALL attempt a session refresh via Supabase Auth
- **AND** on successful refresh, SHALL resume migration from the next pending bundle
- **AND** on refresh failure, SHALL surface a toast 「請重新登入以完成遷移」 and SHALL retain partial-migration state for resume on next sign-in

### Requirement: Daily R2-to-R2 backup via Worker cron

The Worker SHALL register a daily cron trigger (00:00 UTC) that copies every blob under `study-rpg-saves/users/*` to a second bucket `study-rpg-saves-backup` with date-prefixed keys (`backup/<YYYY-MM-DD>/users/<user_id>/<bundle>.json.gz`). Backups older than 30 days SHALL be pruned in the same cron run. All copy operations occur internally to Cloudflare (zero egress, free).

#### Scenario: Daily backup creates dated mirror

- **WHEN** the cron fires at 00:00 UTC
- **THEN** for every blob `users/<u>/<b>.json.gz` in the primary bucket
- **THEN** a copy SHALL exist at `backup/<today>/users/<u>/<b>.json.gz` in the backup bucket

#### Scenario: Old backups pruned

- **GIVEN** backups for dates ≥ 31 days ago exist in the backup bucket
- **WHEN** the cron runs
- **THEN** the `backup/<YYYY-MM-DD>/` prefixes older than 30 days SHALL be deleted
- **AND** the 30 most recent daily snapshots SHALL be retained

#### Scenario: Restore from backup is manual

- **WHEN** a recovery scenario requires restoring a user's blob from backup
- **THEN** the restore path SHALL be a manual Worker invocation (not exposed to clients)
- **AND** SHALL copy the chosen backup blob back to the primary bucket

### Requirement: Feature flag controls sync backend during phased migration

The app SHALL read environment variables `VITE_CLOUD_SYNC_BACKEND` (values: `supabase` | `r2` | `dual`) and `VITE_CLOUD_SYNC_READ_BACKEND` (values: `supabase` | `r2`) to select sync behavior:

| `BACKEND` | `READ_BACKEND` | Behavior |
|---|---|---|
| `supabase` | (ignored) | Legacy: writes + reads via Supabase only |
| `dual` | `supabase` | Phase 1–2: writes to both, reads from Supabase |
| `dual` | `r2` | Phase 3: writes to both, reads from R2 |
| `r2` | (ignored) | Phase 4+: writes + reads via R2 only |

The client SHALL validate the flag combination at startup and SHALL throw a clear error for invalid combinations (e.g., `BACKEND=supabase` with `READ_BACKEND=r2`).

#### Scenario: Dual-write phase 2 mirrors writes to both backends

- **GIVEN** `VITE_CLOUD_SYNC_BACKEND=dual` and `VITE_CLOUD_SYNC_READ_BACKEND=supabase`
- **WHEN** the client pushes after a debounced batch
- **THEN** the push SHALL first upsert Supabase rows (legacy path)
- **AND** AFTER Supabase succeeds, SHALL upload the affected R2 bundles
- **AND** SHALL log a daily reconciliation diff between Supabase rows and R2 blob contents

#### Scenario: R2-only phase 4 stops Supabase writes

- **GIVEN** `VITE_CLOUD_SYNC_BACKEND=r2`
- **WHEN** the client pushes
- **THEN** SHALL upload only to R2
- **AND** SHALL NOT touch Supabase sync tables (Auth + bug_reports calls remain)

#### Scenario: Invalid combination fails fast

- **WHEN** environment is `BACKEND=supabase` and `READ_BACKEND=r2`
- **THEN** the client SHALL throw on engine start with a clear error message
- **AND** SHALL refuse to begin sync (gameplay still works from IndexedDB)

## MODIFIED Requirements

### Requirement: Cloud schema mirrors IndexedDB tables 1:1 with row ownership and timestamp

The app SHALL persist cloud-sync data as gzipped JSON blobs in Cloudflare R2 under the path `users/<user_id>/<bundle>.json.gz`, where `<bundle>` is one of `m1-snapshot`, `m2-snapshot`, or `bookmarks`. Each blob's decompressed `data` object SHALL contain the snapshots of the IndexedDB tables belonging to that bundle (M1: `player_state` / `srs_cards` / `item_instances` / `mentor_backlog`; M2: `hospital_state` / `hospital_doctors` / `hospital_mastery` / `hospital_question_history`; Bookmarks: `question_bookmarks`). Per-row data SHALL retain `user_id` and `updated_at` fields within the snapshot for intra-blob conflict resolution during pull-merge-retry. Tenancy SHALL be enforced by the Cloudflare Worker at URL-signing time (Worker NEVER signs URLs whose path `<user_id>` segment does not match the JWT's verified `sub` claim) — replacing Postgres RLS.

The `question_bookmarks` snapshot within the bookmarks bundle SHALL retain composite identity `(user_id, question_id)` where `question_id TEXT` matches the corpus question identifier (e.g., `106-2-醫學三-內科-Q10`), plus `added_at TIMESTAMPTZ` (immutable display sort key, distinct from `updated_at`) and `app_version TEXT`.

#### Scenario: User cannot read another user's blob

- **WHEN** authed user A obtains a presigned URL from the Worker
- **THEN** the URL's R2 key SHALL contain user A's id, never user B's
- **AND** a direct request to `users/<B>/*` without a valid Worker-signed URL SHALL return 401 (bucket has no public read)

#### Scenario: Forged URL cannot escape tenancy

- **WHEN** user A intercepts user B's presigned URL (via shared device, packet capture, etc.)
- **THEN** the URL SHALL expire within 5 minutes
- **AND** even within the TTL window, the URL targets ONLY user B's blob — user A cannot use it to write A's data anywhere

#### Scenario: question_bookmarks within bookmarks blob preserves composite identity

- **GIVEN** user A has bookmarked `106-2-醫學三-內科-Q10` and `108-1-醫學四-外科-Q23`
- **WHEN** the client pulls user A's bookmarks bundle
- **THEN** the decompressed `data.question_bookmarks` array SHALL contain exactly 2 entries
- **AND** each entry SHALL include `question_id`, `user_id = A`, `added_at`, `updated_at`, `app_version`

### Requirement: Last-write-wins conflict resolution by row timestamp

The system SHALL resolve push and pull conflicts at TWO levels: (1) blob-level via R2 ETag matching, and (2) intra-blob row-level via per-row `updated_at` LWW when a stale-ETag retry triggers a merge.

For blob-level conflicts (concurrent pushes from two devices), the LATER push wins via the ETag retry protocol (see "ETag-based optimistic concurrency on blob push"): the second pusher fetches the first pusher's new state, merges, and re-pushes. For intra-blob conflicts during pull (cloud blob is newer than local), per-row `updated_at` comparison SHALL apply: row with newer `updated_at` wins; equal timestamps preserve cloud's value (deterministic tie-break).

Top-level `meta.updated_at` on each blob SHALL reflect the maximum `updated_at` across rows in that blob's `data`. This top-level timestamp SHALL be used for "should I overwrite local with cloud?" decisions during full pull.

#### Scenario: Local newer than cloud — push wins (single-device path)

- **WHEN** client local has a row with `updated_at = T1` in bundle B and cloud blob B's row has `updated_at = T0` where T1 > T0
- **THEN** the next push of bundle B SHALL upload the local row's values
- **AND** the new cloud blob's `meta.updated_at` SHALL reflect T1

#### Scenario: Cloud newer than local — pull wins

- **WHEN** client local bundle B's `meta.updated_at = T0` and cloud blob B's `meta.updated_at = T1` where T1 > T0
- **THEN** the next pull of B SHALL overwrite local IndexedDB rows in B's scope with cloud's row values
- **AND** in-memory React state SHALL re-hydrate from updated IndexedDB

#### Scenario: Concurrent push from two devices — second pusher merges

- **GIVEN** devices D1 and D2 both have the same ETag `etag-A`
- **WHEN** D1 pushes first and obtains new `etag-B`
- **AND** D2 then pushes with `If-Match: etag-A`
- **THEN** R2 SHALL return 412 to D2
- **AND** D2 SHALL pull (acquiring etag-B and D1's blob state)
- **AND** SHALL merge D1's rows with its own pending writes via per-row `updated_at` LWW
- **AND** SHALL retry the push with `If-Match: etag-B`

### Requirement: Debounced auto-push on local writes

Every IndexedDB mutation to a synced table SHALL enqueue a debounced cloud push of the affected bundle. Debounce window SHALL be between 3000ms and 5000ms (configurable). Multiple writes within the window SHALL collapse into a single batch push per affected bundle. Writes affecting two bundles (e.g., 一階 quiz answering + bookmark toggle) SHALL produce up to two parallel pushes, one per bundle.

#### Scenario: Single write triggers push of one bundle

- **WHEN** an authed user answers one 一階 quiz question, mutating `mastery` (in M1 bundle) and `player.xp` (in M1 bundle)
- **AND** waits without further input
- **THEN** within 3-5 seconds the client SHALL push exactly the M1 bundle (whole blob) once
- **AND** SHALL NOT push M2 or bookmarks bundles

#### Scenario: Burst writes across bundles produce parallel bundle pushes

- **WHEN** an authed user answers 一階 questions AND toggles a bookmark within the debounce window
- **THEN** ONE M1 push AND ONE bookmarks push SHALL fire (no fewer, no more)
- **AND** the two pushes MAY occur in parallel

### Requirement: Pull on tab focus

When the browser tab transitions to visible (visibilitychange → "visible"), the app SHALL trigger a pull from cloud to detect cross-device changes. For R2 backends, the pull SHALL be implemented as conditional GET with `If-None-Match: <last-known-etag>` per bundle. R2 returning 304 Not Modified SHALL skip the body transfer (zero bytes, still counted as Class B operation).

#### Scenario: Cross-device update visible after focus

- **WHEN** device A pushes new mastery values, then user switches to device B (already authed) and brings tab to foreground
- **THEN** within 2 seconds of tab visible, device B SHALL pull bundles whose ETag differs from device B's last-known
- **AND** updated values SHALL be reflected in UI without page reload

#### Scenario: Unchanged bundle returns 304

- **GIVEN** device B last pulled bundle M2 with ETag `etag-X`
- **AND** no other device has pushed M2 since
- **WHEN** device B's tab transitions to visible
- **THEN** the conditional GET SHALL receive 304 Not Modified
- **AND** local IndexedDB M2 state SHALL NOT be re-applied (no-op)

### Requirement: Account deletion removes all cloud data

The app SHALL provide an account-deletion action that, when confirmed by the user, deletes all R2 blobs under `users/<auth.uid()>/` via the Worker, deletes any remaining Supabase rows (during dual-write phases), then signs the user out. The Worker SHALL expose a `POST /delete-account` endpoint that performs these deletions atomically (best-effort) and SHALL also tombstone the user in `auth.users` via Supabase service-role.

#### Scenario: Deletion clears R2 + Supabase

- **WHEN** the user opens settings, picks "Delete account data", and confirms
- **THEN** the client SHALL call `POST /delete-account` on the Worker
- **AND** the Worker SHALL list and delete every R2 object under `users/<auth.uid()>/`
- **AND** the Worker SHALL invoke Supabase `delete_my_data()` RPC (idempotent — succeeds even when sync tables already empty)
- **AND** the Worker SHALL delete the Supabase auth user record (or mark for deletion per Auth API)
- **AND** the client SHALL sign out
- **AND** local IndexedDB SHALL remain intact (user can keep playing offline if they want)

#### Scenario: Partial failure preserves intent

- **WHEN** R2 deletion succeeds but Supabase deletion fails (or vice versa)
- **THEN** the Worker SHALL respond with a partial-success payload `{ r2: 'ok', supabase: 'error', detail: ... }`
- **AND** the client SHALL still sign out (the user requested deletion; remaining server-side rows are non-functional after sign-out)
- **AND** the partial-failure SHALL be logged for owner manual cleanup

### Requirement: Account export downloads all cloud data as JSON

The app SHALL provide an export action that pulls every R2 blob owned by `auth.uid()`, decompresses the bundles, and emits a single combined JSON file via browser download. The output file SHALL be schema-versioned and SHALL be re-importable by a future `import` flow (out of scope for this change).

#### Scenario: Export bundles all R2 blobs into one JSON

- **WHEN** the user opens settings and clicks "Export cloud data"
- **THEN** the client SHALL pull M1, M2, and bookmarks blobs in parallel
- **AND** SHALL decompress each blob's JSON
- **AND** SHALL produce a download file with top-level shape `{ schema_version, exported_at, bundles: { m1: {...}, m2: {...}, bookmarks: {...} } }`
- **AND** the file SHALL be named `study-rpg-export-<YYYYMMDD>.json`

### Requirement: Cold-start force-pull bypasses incremental cursor

When the sync engine's `start(userId)` runs, the engine SHALL ALWAYS pull every bundle unconditionally (without `If-None-Match`) instead of relying on cached ETags. The ETag tracking SHALL ONLY be used by the visibility-change handler for in-session refresh (304-optimized pulls).

**Rationale**: ETag references are only valid within a single live engine session. Across sessions (page reload, sign-out + sign-in, browser restart, PWA wake-up), the cached ETag may not match cloud state for legitimate reasons — `If-None-Match: <stale-etag>` would not directly cause incorrect data, but the cleaner contract is "cold-start = unconditional pull, in-session = conditional pull." This sacrifices ~50-500 KB of redundant bandwidth per sign-in for correctness and operational clarity.

#### Scenario: Cold start ALWAYS unconditionally pulls all bundles

- **WHEN** `engine.start(userId)` fires AND `paused === false`
- **THEN** the engine SHALL invoke unconditional GET on each bundle's presigned URL
- **AND** the response SHALL fetch the full blob bodies
- **AND** local Dexie state SHALL be reconciled with the pulled blobs via the standard LWW apply path

#### Scenario: Same-user sign-out + sign-in restores all cloud data

- **GIVEN** user A signed in, played, pushed bundles to R2
- **AND** signed out (preserving local per existing spec)
- **AND** later signs in as the same user A again (any device, any time gap)
- **WHEN** `engine.start(A.id)` fires
- **THEN** the engine SHALL unconditionally GET all 3 bundles
- **AND** local SHALL reflect the cloud state without depending on any ETag cache

#### Scenario: Visibility-change uses conditional GET

- **GIVEN** the engine is running AND has been started for ≥ 5 seconds
- **WHEN** the tab transitions from background to foreground (visibilitychange → 'visible')
- **THEN** the engine SHALL invoke conditional GETs with `If-None-Match: <last-known-etag>` per bundle
- **AND** unchanged bundles SHALL return 304 and be skipped
- **AND** this is the ONLY place where conditional GET is used

#### Scenario: First-ever engine start unconditionally pulls

- **GIVEN** the user has never pulled before (no cached ETags)
- **WHEN** `engine.start(userId)` fires
- **THEN** the engine SHALL invoke unconditional GET on each bundle (same as any other cold start)

### Requirement: In-place account reset wipes cloud + local while preserving signed-in identity

The app SHALL provide an in-place reset action that, when the user clears a two-layer confirmation gate, snapshots local IndexedDB to `local_backup`, deletes all R2 blobs under `users/<auth.uid()>/` via the Worker `POST /reset` endpoint, deletes any residual Supabase sync rows (during dual-write phases), wipes local sync tables, and restarts the sync engine — without signing the user out of Google and without altering the Supabase auth user record. The action SHALL be exposed in the existing account-management surface of each app (一階 `SettingsPanel` 資料管理 section; 二階 `HelpMenu` 帳號 accordion).

The action SHALL execute its four steps in this order — snapshot → cloud-delete → local-wipe → engine-restart — and SHALL abort if any earlier step throws so that no partial destructive state is reached. The cloud-delete step SHALL be idempotent: re-invoking `/reset` after a partial failure SHALL succeed without error.

#### Scenario: Successful in-place reset

- **WHEN** the user activates the reset entry, accepts Layer 1's `window.confirm`, and types `RESET` exactly at Layer 2's prompt while signed in with cloud sync enabled
- **THEN** the app SHALL append a new row to the `local_backup` Dexie table tagged with reason `reset-account-data` and the current user id
- **AND** the app SHALL invoke `POST /reset` on the Worker and only proceed on success
- **AND** every R2 object under `users/<auth.uid()>/` SHALL be deleted
- **AND** every row in every Supabase sync table where `user_id = auth.uid()` SHALL be deleted (during dual-write phases) or no-op (phase 5+)
- **AND** local sync tables SHALL be cleared via `clearLocalSyncTables`, leaving `local_backup` untouched
- **AND** the sync engine SHALL re-evaluate its sign-in gate via the `setResolveTick` pattern and land in `fresh-start` state
- **AND** the Supabase auth user record SHALL remain intact and the user SHALL remain signed in

#### Scenario: Cloud-delete failure leaves local intact

- **WHEN** the user clears both confirmation layers but `POST /reset` returns an error (Worker error, network failure, 5xx)
- **THEN** the app SHALL throw the error to the caller and stop the flow
- **AND** local IndexedDB sync tables SHALL remain unchanged
- **AND** the user SHALL remain signed in
- **AND** the `local_backup` snapshot appended in step 1 SHALL be retained so the user can retry the reset without losing the safety net

#### Scenario: User cancels at Layer 1

- **WHEN** the user activates the reset entry and clicks Cancel (or dismisses) on Layer 1's `window.confirm`
- **THEN** no snapshot SHALL be written
- **AND** no Worker endpoint SHALL be invoked
- **AND** no local data SHALL change

#### Scenario: User mistypes the Layer 2 confirmation string

- **WHEN** the user activates the reset entry, accepts Layer 1, and Layer 2's prompt receives a value that is not exactly `RESET` (case-sensitive)
- **THEN** the app SHALL abort the flow before any snapshot, Worker call, or wipe
- **AND** the user SHALL receive a passive notification (toast, status text, or equivalent) explaining that the typed value did not match and no change was made

#### Scenario: Reset gated to signed-in users with cloud sync enabled

- **WHEN** the user attempts to activate the reset entry while not signed in OR while `VITE_CLOUD_SYNC_ENABLED` is `false`
- **THEN** the entry SHALL be hidden or disabled
- **AND** if somehow invoked, the hook method SHALL throw before any destructive step

## REMOVED Requirements

<!-- No requirements are removed. Several requirements are MODIFIED (above) to reflect the R2 backend; their user-visible behavior is preserved. The Supabase Postgres backend is retained throughout dual-write phases and only dropped in a separate follow-up change after this one archives. -->
