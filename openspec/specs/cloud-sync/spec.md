# cloud-sync Specification

## Purpose

Defines opt-in cross-device sync of gameplay state to Supabase Postgres. IndexedDB stays the authoritative source of truth on every device; the cloud is an additive mirror keyed on `auth.uid()` with Row-Level Security enforcing per-user isolation. Conflicts resolve by last-write-wins on `updated_at`, with explicit user-facing modals for the two ambiguous cases — first-sign-in migration and both-sides-have-data conflicts — so no row is silently overwritten in either direction. Cloud failures NEVER corrupt local data: pulls fail safely (local untouched), pushes queue and retry, and gameplay UI stays responsive throughout.
## Requirements
### Requirement: Cloud schema mirrors IndexedDB tables 1:1 with row ownership and timestamp

The app SHALL define a Supabase Postgres schema that mirrors the gameplay-relevant Dexie tables (player, items, mastery, cosmetic_unlocks, srs_cards, streak, **question_bookmarks**; exact set finalized in design.md). Every row SHALL include `user_id UUID NOT NULL` and `updated_at TIMESTAMPTZ NOT NULL DEFAULT now()`. Row-Level Security (RLS) SHALL enforce `auth.uid() = user_id` for SELECT / INSERT / UPDATE / DELETE.

The `question_bookmarks` table SHALL use composite primary key `(user_id, question_id)` where `question_id TEXT` matches the corpus question identifier (e.g., `106-2-醫學三-內科-Q10`). The table SHALL additionally carry `added_at TIMESTAMPTZ NOT NULL` (immutable display sort key, distinct from `updated_at`) and `app_version TEXT`. The `upsert_lww` RPC whitelist SHALL accept `'question_bookmarks'` as a valid table name and SHALL dispatch inserts using a dedicated `ELSIF` branch that maps `question_id`, `added_at`, `updated_at`, and `app_version` from the JSONB payload.

#### Scenario: User cannot read another user's row
- **WHEN** authed user A queries any cloud-sync table directly (e.g., via Supabase REST) for rows belonging to user B
- **THEN** the response SHALL contain zero rows
- **AND** no error SHALL leak schema or row-existence information

#### Scenario: Insert without user_id is rejected
- **WHEN** any client attempts to INSERT a row without `user_id = auth.uid()`
- **THEN** Postgres SHALL reject the write via RLS policy

#### Scenario: question_bookmarks RLS isolates per-user rows

- **GIVEN** user A has bookmarked question `106-2-醫學三-內科-Q10`
- **AND** user B has bookmarked question `108-1-醫學四-外科-Q23`
- **WHEN** user A queries `question_bookmarks` via the authenticated REST client
- **THEN** the response SHALL contain exactly user A's row
- **AND** user B's row SHALL NOT appear in the response

#### Scenario: upsert_lww accepts question_bookmarks table name

- **GIVEN** an authenticated client batch with `table_name = 'question_bookmarks'`
- **AND** every row's `user_id` matches `auth.uid()`
- **WHEN** the RPC executes
- **THEN** rows whose payload `updated_at` is strictly newer than the existing cloud row SHALL be upserted
- **AND** rows whose payload `updated_at` is equal to or older than the existing cloud row SHALL be skipped (LWW deterministic tie-break)
- **AND** the RPC SHALL NOT raise `unknown table` for `'question_bookmarks'`

### Requirement: Last-write-wins conflict resolution by row timestamp

For every cloud-sync table row, the system SHALL resolve push and pull conflicts by comparing `updated_at`: the newer timestamp wins. Equal timestamps SHALL preserve cloud's value (deterministic tie-break).

#### Scenario: Local newer than cloud — push wins
- **WHEN** client local has row R with `updated_at = T1` and cloud has same row R with `updated_at = T0` where T1 > T0
- **THEN** the next push SHALL overwrite cloud row with local values

#### Scenario: Cloud newer than local — pull wins
- **WHEN** client local has row R with `updated_at = T0` and cloud has same row R with `updated_at = T1` where T1 > T0
- **THEN** the next pull SHALL overwrite local row with cloud values
- **AND** in-memory React state SHALL re-hydrate from updated IndexedDB

### Requirement: Debounced auto-push on local writes

Every IndexedDB mutation to a synced table SHALL enqueue a debounced cloud push. Debounce window SHALL be between 3000ms and 5000ms (configurable). Multiple writes within the window SHALL collapse into a single batch push.

#### Scenario: Single write triggers push after debounce
- **WHEN** an authed user answers one quiz question, mutating `mastery` and `player.xp`
- **AND** waits without further input
- **THEN** within 3-5 seconds the client SHALL push the mutated rows to cloud in a single batch

#### Scenario: Burst writes collapse into one batch
- **WHEN** an authed user answers 5 questions in rapid succession (< 3s between each)
- **THEN** only one push SHALL fire after the last write + debounce window
- **AND** the push payload SHALL contain the latest values of all touched rows

### Requirement: Pull on tab focus

When the browser tab transitions to visible (visibilitychange → "visible"), the app SHALL trigger a pull from cloud to detect cross-device changes.

#### Scenario: Cross-device update visible after focus
- **WHEN** device A pushes new mastery values, then user switches to device B (already authed) and brings tab to foreground
- **THEN** within 2 seconds of tab visible, device B SHALL pull and apply newer rows from cloud
- **AND** updated values SHALL be reflected in UI without page reload

### Requirement: Offline queue defers pushes without blocking gameplay

When the network is unavailable or Supabase requests fail, the app SHALL continue writing to IndexedDB and queue pending pushes locally. On reconnect, the client SHALL flush the queue in original write order.

#### Scenario: Offline writes queue and flush
- **WHEN** an authed user goes offline, answers 10 questions, then comes back online
- **THEN** during offline period IndexedDB SHALL accept all writes without error
- **AND** within 10 seconds of reconnection the client SHALL push all queued writes
- **AND** after flush, cloud row state SHALL match local row state per LWW

#### Scenario: Cloud failure does not block UI
- **WHEN** a cloud push returns 5xx error
- **THEN** the failed batch SHALL remain in the queue for retry with exponential backoff
- **AND** gameplay UI SHALL remain fully responsive

### Requirement: Migration prompt on first sign-in with local save

When a user signs in for the first time and the client detects local IndexedDB has non-default gameplay state AND cloud has no row for this user, the client SHALL show a modal asking how to proceed.

#### Scenario: Modal offers three options
- **WHEN** the migration condition is met
- **THEN** the modal SHALL offer at least: "Upload local progress to this account", "Keep local separate (don't sync)", "Decide later"
- **AND** "Decide later" SHALL re-trigger the prompt on next sign-in until user picks Upload or Keep separate
- **AND** the choice SHALL be persisted (locally) so the prompt does not nag after a definitive answer

#### Scenario: Upload writes local to cloud
- **WHEN** the user picks "Upload local progress"
- **THEN** every synced IndexedDB row SHALL be pushed to cloud with `user_id = current auth.uid()` and current `updated_at`
- **AND** subsequent sync SHALL operate normally (debounced push / focus pull)

#### Scenario: Cloud non-empty defers to conflict chooser
- **WHEN** a user signs in and BOTH local has data AND cloud has data
- **THEN** the migration upload modal SHALL NOT appear
- **AND** the conflict chooser (see next requirement) SHALL handle resolution

### Requirement: Conflict chooser when sign-in detects data on both ends

When a user signs in and the client detects BOTH local IndexedDB has non-default gameplay state AND cloud has at least one row owned by `auth.uid()`, the client SHALL pause automatic sync and show a conflict-resolution modal before any per-row LWW resolution runs.

#### Scenario: Modal offers explicit conflict resolution
- **WHEN** sign-in detects local non-empty AND cloud non-empty
- **THEN** the modal SHALL offer at least three options: "Use cloud (overwrite local)", "Use local (overwrite cloud)", "Decide later (pause sync)"
- **AND** the modal SHALL display each side's last-modified timestamp (max `updated_at` across local rows vs across cloud rows) so the user can tell which side is newer

#### Scenario: Use cloud overwrites local
- **WHEN** the user picks "Use cloud (overwrite local)"
- **THEN** the client SHALL snapshot current local rows into a `local_backup` Dexie table (one-time, for safety)
- **AND** local rows SHALL be replaced by a full pull from cloud
- **AND** sync engine SHALL resume normal operation after the replace completes

#### Scenario: Use local overwrites cloud
- **WHEN** the user picks "Use local (overwrite cloud)"
- **THEN** the client SHALL push every local synced row to cloud with `updated_at = now()` so LWW guarantees local values win over existing cloud rows
- **AND** sync engine SHALL resume normal operation after the push completes

#### Scenario: Decide later pauses sync
- **WHEN** the user picks "Decide later"
- **THEN** sync engine SHALL pause both automatic push and automatic pull
- **AND** local IndexedDB writes SHALL continue uninterrupted during the pause
- **AND** no cloud data SHALL be modified during the pause
- **AND** the user SHALL be able to re-open the conflict modal from a settings entry to make a decision later

#### Scenario: No silent LWW when both non-empty
- **WHEN** the conflict condition is detected at sign-in
- **THEN** no per-row LWW resolution SHALL run until the user picks one of the three options
- **AND** no row SHALL be silently overwritten on either side

### Requirement: IndexedDB remains source of truth; cloud failures never corrupt local

The app SHALL treat IndexedDB as authoritative for read paths. Cloud sync SHALL be additive (mirror) and SHALL NEVER cause local data loss due to network or Supabase errors.

#### Scenario: Pull failure leaves local intact
- **WHEN** a pull request to cloud fails (network / 5xx / parse error)
- **THEN** local IndexedDB SHALL remain unchanged
- **AND** the failure SHALL be logged to `console.warn` only (no user-facing error toast unless repeated > N times — exact threshold in design.md)

### Requirement: Account deletion removes all cloud data

The app SHALL provide an account-deletion action that, when confirmed by the user, deletes all rows owned by `auth.uid()` across all cloud-sync tables, then signs the user out.

#### Scenario: Deletion clears cloud rows
- **WHEN** the user opens settings, picks "Delete account data", and confirms
- **THEN** every row in every cloud-sync table where `user_id = auth.uid()` SHALL be deleted
- **AND** the Supabase auth user record SHALL be deleted (or marked for deletion per Supabase Auth API)
- **AND** the user SHALL be signed out
- **AND** local IndexedDB SHALL remain intact (user can keep playing offline if they want)

### Requirement: Account export downloads all cloud data as JSON

The app SHALL provide an export action that bundles every row owned by `auth.uid()` across cloud-sync tables into a single JSON file and triggers a browser download.

#### Scenario: Export bundles all cloud rows
- **WHEN** the user opens settings and clicks "Export cloud data"
- **THEN** the browser SHALL download a JSON file containing all owned cloud rows grouped by table
- **AND** the file SHALL include a top-level `schema_version` field reflecting the cloud schema at export time

### Requirement: Paused-banner reopen entry visually anchored to sibling top-bar controls

WHEN the paused banner displays AND another top-bar control (e.g., AuthButton chip, SyncStatusChip) is concurrently visible, THEN the paused-banner reopen entry SHALL render at a vertical position whose center is aligned with the sibling control's center (≤ 2px tolerance) at viewport widths ≥ 640px so the two controls read as a single visual row.

At viewport widths < 640px (mobile), the paused banner SHALL reflow to a vertical stack: status text on its own row at full container width, action button on the row below. The status text container SHALL have `min-width: 200px` (or full container width, whichever is greater) AND `white-space: normal` so Chinese characters wrap on word boundaries — NEVER one character per line. Concurrently-visible sibling controls (AuthButton, SyncStatusChip) SHALL stack above the banner in the header row rather than competing with banner text for the same horizontal space.

#### Scenario: Paused banner and authed AuthButton co-present (desktop)

- **WHEN** `sync.gateState === 'paused'`
- **AND** the user is signed in (AuthButton renders as the authed chip variant)
- **AND** viewport width ≥ 1024px
- **THEN** the vertical center of `.sync-paused-banner__btn` and the vertical center of `.auth-button` SHALL differ by no more than 2px

#### Scenario: Paused banner on mobile reflows vertically without per-character wrap

- **GIVEN** viewport width is 320px (iPhone SE) OR 414px (iPhone 14)
- **AND** `sync.gateState === 'paused'` AND user is signed in
- **WHEN** the banner renders
- **THEN** the `.sync-paused-banner` SHALL apply `flex-direction: column`
- **AND** `.sync-paused-banner__text` SHALL have computed `width >= 200px` AND `white-space: normal`
- **AND** the visible rendered text SHALL show Chinese characters wrapping on natural word boundaries
- **AND** NO single Chinese character SHALL be rendered on its own line by itself
- **AND** the AuthButton SHALL collapse its email pill to a `☁️` icon-only representation (full email visible via tap → SettingsPanel)

#### Scenario: Paused banner standalone (user unauthed or AuthButton hidden)

- **WHEN** `sync.gateState === 'paused'` AND AuthButton is not visible
- **THEN** the reopen entry's position SHALL remain stable (no layout jitter) and SHALL NOT shift when the user signs in/out

#### Scenario: Tap collapsed email opens settings

- **GIVEN** the email pill is collapsed to `☁️` icon (mobile reflow)
- **WHEN** the user taps the icon
- **THEN** the `SettingsPanel` SHALL open
- **AND** the panel SHALL display the full email address in its account section

### Requirement: Race-resistant gate computation on slow device hydration

The sync gate computation (`computeGateState`) SHALL await Dexie hydration before reading local state for classification, AND SHALL install a post-decision re-evaluation watcher when the decision could be invalidated by a pending hydration write.

Specifically, before evaluating `hasNonDefaultLocalState()`, the function SHALL `await db.players.get('p1')` (or the per-app canonical row equivalent — `db.hospital_state.get('h1')` for 二階) followed by a 100ms settle delay. If the resulting gate state is `'fresh-start'` or `'silent-pull'` (states which assume local is empty/default), the engine SHALL subscribe to writes on the canonical-row table for 5 seconds; if a write occurs within that window, the gate SHALL re-compute once.

In DEV mode, the engine SHALL emit `[sync.gate]` console logs at each lifecycle phase (compute-start, settle-end, decision, re-eval-fired, cancelled).

#### Scenario: Slow Dexie hydration does not misclassify gate

- **GIVEN** the user signs in on a mobile device where Dexie hydration completes 300ms after `useSync` effect fires
- **AND** local state contains a non-default player object that materializes during hydration
- **WHEN** `computeGateState` runs
- **THEN** the function SHALL await Dexie hydration before classifying
- **AND** the resulting gate state SHALL correctly reflect the eventual non-default local state (NOT `'fresh-start'` or `'silent-pull'`)

#### Scenario: Post-decision write triggers re-evaluation

- **GIVEN** `computeGateState` initially decides `'silent-pull'` because the canonical row was not yet present
- **WHEN** a write to the canonical row occurs within 5 seconds of the decision
- **THEN** the gate SHALL re-compute exactly once
- **AND** if the new state warrants a modal (e.g., `'conflict-chooser'`), the modal SHALL render
- **AND** if no relevant write occurs within the 5s window, no re-computation SHALL fire

#### Scenario: Re-evaluation debounced when multiple writes fire

- **WHEN** more than one canonical-row write fires within the 5s post-decision window
- **THEN** the gate SHALL re-compute exactly once (debounced), not once per write

#### Scenario: DEV-mode logs trace gate lifecycle

- **GIVEN** `import.meta.env.DEV === true`
- **WHEN** `computeGateState` runs through its lifecycle
- **THEN** `console.log('[sync.gate]', { phase: 'compute-start', ... })` SHALL fire
- **AND** subsequent `[sync.gate]` entries SHALL fire at `settle-end`, `decision`, and (when applicable) `re-eval-fired` or `cancelled`

#### Scenario: Production builds omit DEV gate logs

- **GIVEN** `import.meta.env.DEV === false` (production build)
- **WHEN** `computeGateState` runs
- **THEN** no `[sync.gate]` console output SHALL appear

### Requirement: Sync status chip in app header

The app SHALL render a `SyncStatusChip` component in the header (both 一階 and 二階), adjacent to the existing `AuthButton`, when the user is authenticated. The chip SHALL reflect the engine's current state via icon + accessible label, and SHALL open a detail popover on tap that exposes Force Push and Force Pull controls.

#### Scenario: Chip hidden when unauthed

- **WHEN** `authStatus !== 'authed'`
- **THEN** `SyncStatusChip` SHALL NOT render
- **AND** the header layout SHALL not reserve space for it

#### Scenario: Chip reflects engine status

- **WHEN** the user is authed
- **THEN** the chip SHALL show ONE of these icons based on engine state (refreshed at ≥ 1Hz):
  - 🟢 已同步 — last push AND last pull completed within 60s without error
  - 🟡 同步中 — push or pull currently in flight
  - 🔴 同步失敗 — most recent attempt errored AND retry pending
  - ⚪ 離線 — `navigator.onLine === false`
  - ⏸ 已暫停 — `gateState ∈ {'paused', 'keep-separate'}`

#### Scenario: Tap opens detail popover

- **WHEN** the user taps the chip
- **THEN** a popover SHALL render showing:
  - Last-synced timestamp (relative time, e.g., 「3 分鐘前」)
  - 「立即同步上傳」 button (calls `engine.pushAllNow()`)
  - 「立即同步下載」 button (calls `engine.pullAllNow()`)
- **AND** the popover SHALL dismiss on outside click or chip re-tap

### Requirement: Sync error toast on consecutive failures

The sync engine SHALL emit a `sync:error` custom event after the SECOND consecutive failure of a push or pull operation (single transient failures SHALL remain `console.warn`-only per existing spec). The app SHALL render a non-blocking toast in response, allowing the user to manually retry.

#### Scenario: Single failure does not toast

- **WHEN** a push or pull fails ONCE (transient network blip)
- **THEN** the engine SHALL emit `console.warn` only
- **AND** no `sync:error` event SHALL fire
- **AND** no user-facing toast SHALL appear

#### Scenario: Second consecutive failure triggers toast

- **WHEN** a push or pull fails for the SECOND consecutive time (same operation type)
- **THEN** the engine SHALL emit `sync:error` event with `{ op, table, message }` payload
- **AND** a toast SHALL render with text `「同步失敗：[reason]。資料安全保留在本機。點此重試」`
- **AND** the toast SHALL be tappable to trigger `engine.pushAllNow() + engine.pullAllNow()` retry
- **AND** the toast SHALL auto-dismiss after 10 seconds
- **AND** the same error message SHALL NOT re-toast within 60 seconds (debounced)

#### Scenario: Successful retry clears error state

- **WHEN** a retry following a `sync:error` toast succeeds
- **THEN** the consecutive failure counter SHALL reset to zero
- **AND** the status chip SHALL transition from 🔴 to 🟢

### Requirement: Cold-start force-pull bypasses incremental cursor

When the sync engine's `start(userId)` runs AND the persisted `_lastPullAt` cursor is null OR older than 1 hour, the engine SHALL trigger `pullAllNow({force:true})` instead of the incremental `pullNow()` that filters by `updated_at > sinceIso`. This catches cross-device resume scenarios (phone overnight, PWA wake-up, browser long-idle) where the incremental query has been observed to silently miss rows pushed by other devices.

For shorter gaps (≤ 1 hour), the engine SHALL continue using the incremental `pullNow()` to minimize bandwidth on tight tab-visibility refresh cycles.

#### Scenario: Phone resumes after overnight gap

- **GIVEN** a user pushed progress from device A (PC), then closes that session
- **AND** the same user opens the app on device B (phone) the next day
- **AND** device B's persisted `_lastPullAt` is more than 1 hour old
- **WHEN** `engine.start(userId)` fires
- **THEN** the engine SHALL invoke `pullAllNow({force:true})`
- **AND** all rows belonging to `auth.uid()` in cloud SHALL be applied locally (including those device A pushed)
- **AND** the `_lastPullAt` cursor SHALL be updated to the current time

#### Scenario: Same-session tab visibility uses incremental cursor

- **GIVEN** the engine started successfully AND has been running for 10 minutes
- **AND** `_lastPullAt` was updated within the last hour
- **WHEN** the tab transitions from background to foreground (visibilitychange → 'visible')
- **THEN** the engine SHALL invoke the incremental `pullNow()` (NOT force-pull)
- **AND** only rows with `updated_at > sinceIso` SHALL be fetched

#### Scenario: First-ever engine start force-pulls

- **GIVEN** the user has never pulled before (`_lastPullAt === null`)
- **WHEN** `engine.start(userId)` fires
- **THEN** the engine SHALL invoke `pullAllNow({force:true})`
- **AND** the full cloud row set SHALL be applied locally

### Requirement: Diagnostic snapshot for bug-report capture

The sync engine SHALL expose `getDiagnosticSnapshot()` as a public method returning a `SyncDiagnostic` object capturing the engine's current observable state. This method SHALL be available in BOTH development and production builds (no DEV-gating on the method itself), so the bug-report pipeline can attach a snapshot to each submission when the user opts in.

In DEV mode, `globalThis.__sync.diagnose = () => engine.getDiagnosticSnapshot()` SHALL provide one-call console access. In production, the method is only reachable via the bug-report code path.

#### Scenario: Snapshot shape

- **WHEN** `engine.getDiagnosticSnapshot()` is called
- **THEN** it SHALL return an object with these fields:
  - `gateState: GateState` (current sync gate state machine value)
  - `authStatus: 'unauthed' | 'authed' | 'pending'`
  - `currentUserId: string | null`
  - `lastSignedInUserId: string | null` (from `db.meta`)
  - `lastPushAt: number | null` (epoch ms)
  - `lastPullAt: number | null` (epoch ms)
  - `queueDepth: number` (pending operations)
  - `recentErrors: Array<{ at: number; op: 'push' | 'pull'; table: string; message: string }>` (ring buffer last 5)
  - `dbRowCounts: Record<string, number>` (per synced table)

#### Scenario: DEV global handle exposes method

- **GIVEN** `import.meta.env.DEV === true`
- **WHEN** developer types `__sync.diagnose()` in the DevTools console
- **THEN** it SHALL return the same snapshot shape as the direct method call
- **AND** the call SHALL NOT mutate engine state

#### Scenario: Production build hides DEV handle but keeps method

- **GIVEN** `import.meta.env.DEV === false` (production)
- **WHEN** `__sync` is accessed in console
- **THEN** it SHALL be undefined
- **AND** `engine.getDiagnosticSnapshot()` SHALL remain callable from within app code (e.g., bug-report submission)

#### Scenario: Recent-errors ring buffer eviction

- **GIVEN** the engine has experienced 7 errors in this session
- **WHEN** `getDiagnosticSnapshot()` returns `recentErrors`
- **THEN** the array SHALL contain exactly 5 entries (the most recent 5; oldest 2 evicted)
- **AND** entries SHALL be ordered with newest last

