# cloud-sync Specification

## Purpose

Defines opt-in cross-device sync of gameplay state to Supabase Postgres. IndexedDB stays the authoritative source of truth on every device; the cloud is an additive mirror keyed on `auth.uid()` with Row-Level Security enforcing per-user isolation. Conflicts resolve by last-write-wins on `updated_at`, with explicit user-facing modals for the two ambiguous cases — first-sign-in migration and both-sides-have-data conflicts — so no row is silently overwritten in either direction. Cloud failures NEVER corrupt local data: pulls fail safely (local untouched), pushes queue and retry, and gameplay UI stays responsive throughout.
## Requirements
### Requirement: Cloud schema mirrors IndexedDB tables 1:1 with row ownership and timestamp

The app SHALL define a Supabase Postgres schema that mirrors the gameplay-relevant Dexie tables (player, items, mastery, cosmetic_unlocks, srs_cards, streak, **question_bookmarks**, **hospital_monotonic_counters**; exact set finalized in design.md). Every row SHALL include `user_id UUID NOT NULL` and `updated_at TIMESTAMPTZ NOT NULL DEFAULT now()`. Row-Level Security (RLS) SHALL enforce `auth.uid() = user_id` for SELECT / INSERT / UPDATE / DELETE.

The `question_bookmarks` table SHALL use composite primary key `(user_id, question_id)` where `question_id TEXT` matches the corpus question identifier (e.g., `106-2-醫學三-內科-Q10`). The table SHALL additionally carry `added_at TIMESTAMPTZ NOT NULL` (immutable display sort key, distinct from `updated_at`) and `app_version TEXT`. The `upsert_lww` RPC whitelist SHALL accept `'question_bookmarks'` as a valid table name and SHALL dispatch inserts using a dedicated `ELSIF` branch that maps `question_id`, `added_at`, `updated_at`, and `app_version` from the JSONB payload.

The `hospital_monotonic_counters` table SHALL be a per-user singleton with primary key `user_id`, opaque `data JSONB NOT NULL DEFAULT '{}'` payload, `updated_at TIMESTAMPTZ NOT NULL`, and optional `app_version TEXT`. The client-side fields stored in `data` (currently `totalStudyMinutes`, `fateCardBadLuckPity`, `freshCorrectSinceLastTicket`; shape may evolve with gameplay additions) SHALL be opaque to the cloud — the server SHALL NOT interpret or validate the JSONB structure. The `upsert_lww` RPC whitelist SHALL accept `'hospital_monotonic_counters'` as a valid table name and SHALL dispatch using the standard singleton `INSERT ... ON CONFLICT (user_id) DO UPDATE` branch identical to `hospital_state` and `mentor_backlog`.

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

#### Scenario: hospital_monotonic_counters RLS isolates per-user rows

- **GIVEN** user A's `hospital_monotonic_counters` row holds `{totalStudyMinutes: 12.5}` and user B's holds `{totalStudyMinutes: 3.1}`
- **WHEN** user A queries `hospital_monotonic_counters` via the authenticated REST client
- **THEN** the response SHALL contain exactly user A's row with `{totalStudyMinutes: 12.5}`
- **AND** user B's row SHALL NOT appear

#### Scenario: upsert_lww accepts hospital_monotonic_counters table name

- **GIVEN** an authenticated client batch with `table_name = 'hospital_monotonic_counters'` and one row payload `{user_id: <auth.uid>, data: {...}, updated_at: T1, app_version: 'v0.x'}`
- **WHEN** the RPC executes
- **THEN** rows whose payload `updated_at` is strictly newer than the existing cloud row SHALL be upserted via singleton ON CONFLICT
- **AND** rows whose payload `updated_at` is equal to or older than the existing cloud row SHALL be skipped (LWW deterministic tie-break, same as every other singleton)
- **AND** the RPC SHALL NOT raise `unknown table` for `'hospital_monotonic_counters'`

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

The app SHALL provide an account-deletion action that, when confirmed by the user, deletes all rows owned by `auth.uid()` across all cloud-sync tables, then signs the user out. The underlying `delete_my_data()` RPC SHALL ALSO bump `account_metadata.last_reset_at = now()` for the same user (creating the row on first use via `INSERT ... ON CONFLICT DO UPDATE`) so that other devices signed into the same account can detect the wipe on their next pull-gate evaluation and propagate it locally. The DELETE list SHALL include `hospital_monotonic_counters` so that reset clears the singleton on cloud, and the cross-device propagation marker then drives the local wipe + force-pull on every other device.

#### Scenario: Deletion clears cloud rows
- **WHEN** the user opens settings, picks "Delete account data", and confirms
- **THEN** every row in every cloud-sync table where `user_id = auth.uid()` SHALL be deleted (including `hospital_monotonic_counters`)
- **AND** the Supabase auth user record SHALL be deleted (or marked for deletion per Supabase Auth API)
- **AND** `account_metadata.last_reset_at` for the user SHALL be `now()` (row inserted or updated)
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

The chip's "已同步" (synced) state SHALL ONLY display when at least one successful push OR pull has completed in the current engine session (`lastPushAt > 0 OR lastPullAt > 0`). An engine that has started but not yet pushed or pulled anything SHALL display "待同步" (pending sync) — NOT "已同步" — so the user is not misled into believing their data is safe before any cloud round-trip has occurred.

The 「⬇ 立即同步下載」 button SHALL invoke `useSync.forcePull()`, which itself first runs `applyResetPropagationIfNeeded(supabase, userId, db)` so a press from the device that received an out-of-band reset still triggers the auto-mirror, even when the cold-start gate has already been ack'd in this browser session.

#### Scenario: Chip hidden when unauthed

- **WHEN** `authStatus !== 'authed'`
- **THEN** `SyncStatusChip` SHALL NOT render
- **AND** the header layout SHALL not reserve space for it

#### Scenario: Chip reflects engine status

- **WHEN** the user is authed
- **THEN** the chip SHALL show ONE of these icons based on engine state (refreshed at ≥ 1Hz):
  - 🟢 已同步 — status='idle' AND (`lastPushAt > 0 OR lastPullAt > 0`)
  - ⚪ 待同步 — status='idle' AND `lastPushAt === null AND lastPullAt === null` (engine started but no completed sync yet)
  - 🟡 同步中 — push or pull currently in flight
  - 🔴 同步失敗 — most recent attempt errored AND retry pending
  - ⚪ 離線 — `navigator.onLine === false`
  - ⏸ 已暫停 — `gateState ∈ {'paused', 'keep-separate'}`

#### Scenario: Just-after-sign-in chip is ⚪ 待同步 until first pull completes

- **GIVEN** the user just signed in AND `engine.start()` has fired AND the force-pull is in flight
- **THEN** the chip SHALL show 🟡 同步中 during the in-flight pull
- **WHEN** the force-pull completes successfully
- **THEN** the chip SHALL transition to 🟢 已同步 (because `lastPullAt > 0` now)
- **AND** SHALL NOT have shown 🟢 已同步 at any point before the pull completed

#### Scenario: Tap opens detail popover

- **WHEN** the user taps the chip
- **THEN** a popover SHALL render showing:
  - Last-synced timestamp (relative time, e.g., 「3 分鐘前」)
  - 「立即同步上傳」 button (calls `engine.pushAllNow()`)
  - 「立即同步下載」 button (calls `useSync.forcePull()`)
- **AND** the popover SHALL dismiss on outside click or chip re-tap

#### Scenario: 立即同步下載 gates on reset marker before pulling

- **GIVEN** another device has run `delete_my_data` for the same user, bumping `account_metadata.last_reset_at` to T1
- **AND** this device's `localStorage['study-rpg.sync.lastAckResetAt:<uid>']` is older than T1 (or unset)
- **WHEN** the user taps 「⬇ 立即同步下載」
- **THEN** `useSync.forcePull` SHALL invoke `applyResetPropagationIfNeeded` first
- **AND** the helper SHALL fetch `account_metadata.last_reset_at`, observe T1 > local ack, and run snapshot → wipe → ack as a single sequence
- **AND** the subsequent `engine.pullAllNow({force:true})` SHALL apply zero rows (cloud is empty)
- **AND** local Dexie sync tables SHALL be empty, matching cloud state

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

When the sync engine's `start(userId)` runs, the engine SHALL ALWAYS trigger `pullAllNow({force:true})` instead of the incremental `pullNow()` that filters by `updated_at > sinceIso`. The incremental cursor (`localStorage['study-rpg.sync.lastPullAt']`) SHALL ONLY be used by the visibility-change handler for in-session refresh.

**Rationale**: the cursor reference is only valid within a single live engine session. Across sessions (page reload, sign-out + sign-in, browser restart, PWA wake-up), the cursor may be newer than legitimate cloud rows for the same user — `WHERE updated_at > cursor` then silently filters those rows out. The 1-hour cold-start threshold (introduced as M3b in `fix-sync-sign-in-lifecycle`) did not cover sub-hour gaps like account-switch round-trips and caused user-visible "phantom data loss" (2026-05-19 ~04:35 report). Always force-pull on cold start sacrifices ~10-30 KB of redundant bandwidth per sign-in for correctness.

#### Scenario: Cold start ALWAYS force-pulls regardless of last pull time

- **WHEN** `engine.start(userId)` fires AND `paused === false`
- **THEN** the engine SHALL invoke `pullAllNow({force:true})` UNCONDITIONALLY
- **AND** the call SHALL fetch every row owned by `auth.uid()` in all cloud-sync tables (no `updated_at` filter)
- **AND** local Dexie state SHALL be reconciled with the pulled rows via the standard LWW apply path

#### Scenario: Same-user sign-out + sign-in restores all cloud data

- **GIVEN** user A signed in, played, pushed rows to cloud
- **AND** signed out (preserving local per existing spec)
- **AND** later signs in as the same user A again (any device, any time gap)
- **WHEN** `engine.start(A.id)` fires
- **THEN** `pullAllNow({force:true})` SHALL fetch ALL of A's cloud rows
- **AND** local SHALL reflect the cloud state without depending on the incremental cursor

#### Scenario: Visibility-change still uses incremental cursor

- **GIVEN** the engine is running AND has been started for ≥ 5 seconds
- **WHEN** the tab transitions from background to foreground (visibilitychange → 'visible')
- **THEN** the engine SHALL invoke the incremental `pullNow()` (NOT force-pull)
- **AND** only rows with `updated_at > sinceIso` SHALL be fetched
- **AND** this is the ONLY place where the incremental cursor is used

#### Scenario: First-ever engine start force-pulls

- **GIVEN** the user has never pulled before (`_lastPullAt === null`)
- **WHEN** `engine.start(userId)` fires
- **THEN** the engine SHALL invoke `pullAllNow({force:true})` (same as any other cold start)

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

### Requirement: Sign-out flushes pending writes before signing out

When the user invokes sign-out via the UI (SettingsPanel 「登出」 in 一階; AuthButton menu 「登出」 in 二階), the app SHALL first await any in-flight or pending `pushAllNow()` to drain the engine's dirty markers BEFORE calling `supabase.auth.signOut()`. The flush is best-effort — if push fails (network error, RLS rejection, etc.), the sign-out SHALL still proceed and the error SHALL be logged to the engine's `recentErrors` ring buffer for later diagnosis.

**Rationale**: previously, sign-out triggered an immediate auth state change which caused `engine.stop()` to cancel the pending debounced push timer. Any writes within the 3-5 second debounce window before sign-out were silently lost. The flush ensures the cloud row state matches local state before the engine teardown.

#### Scenario: Sign-out with no pending writes is unchanged

- **GIVEN** the engine has no dirty markers (all writes already pushed)
- **WHEN** the user clicks 「登出」
- **THEN** the flush completes immediately (no-op) AND `supabase.auth.signOut()` is called
- **AND** the user is signed out within the same expected latency as before this change

#### Scenario: Sign-out with pending dirty awaits push first

- **GIVEN** the user wrote to Dexie within the last 3 seconds AND the debounced push timer has NOT yet fired
- **WHEN** the user clicks 「登出」
- **THEN** the engine SHALL invoke `pushAllNow()` immediately (bypassing the debounce window)
- **AND** SHALL await its resolution (success OR failure)
- **AND** ONLY then invoke `supabase.auth.signOut()`
- **AND** the dirty writes SHALL be on cloud BEFORE the engine is torn down

#### Scenario: Push failure during flush does not block sign-out

- **GIVEN** the user has pending dirty writes AND the network is offline
- **WHEN** the user clicks 「登出」 AND `pushAllNow()` fails
- **THEN** the engine SHALL record the error in `recentErrors`
- **AND** `supabase.auth.signOut()` SHALL still be called (user can sign out even when offline)
- **AND** the user SHALL be signed out within ~5 seconds (push timeout + signOut)
- **AND** the dirty rows remain in local IndexedDB (engine.stop() does not clear them); next sign-in's cold-start force-pull will reconcile with cloud state

### Requirement: Account-switch snapshots local before any wipe

When any account-switch action wipes local sync tables (AccountSwitchPrompt 「清空本地」 path OR 「切換帳號」 menu button), the app SHALL invoke `snapshotLocalToBackup(db, previousUserId, reason)` BEFORE `clearLocalSyncTables(db)`. The snapshot SHALL be written to the `localBackup` Dexie table with a unique `key` (`snapshot-<ISO timestamp>`) and append-only semantics — existing snapshots SHALL NOT be overwritten.

**Rationale**: previously, the account-switch wipe path had no safety net — if the user picked 「清空本地」 with un-pushed dirty writes (or with writes whose cloud counterparts were RLS-isolated under a different user_id), those writes were permanently lost. The existing conflict-chooser「use-cloud」path already snapshots before wipe; extending the same protection to account-switch closes a parallel gap.

#### Scenario: AccountSwitchPrompt 「清空本地」 takes a snapshot

- **GIVEN** account-switch detection fired AND user picked 「清空本地、改用此帳號的雲端進度」
- **WHEN** the resolver runs
- **THEN** BEFORE `clearLocalSyncTables(db)`, the resolver SHALL call `snapshotLocalToBackup(db, accountSwitch.previousUserId, 'account-switch-clear-local')`
- **AND** the new snapshot row SHALL be persisted in `db.localBackup`
- **AND** the snapshot SHALL contain all cloud-synced tables' current state for the previous user

#### Scenario: 「切換帳號」 menu button takes a snapshot

- **GIVEN** an authed user clicks 「切換帳號」 menu button AND confirms the warning dialog
- **WHEN** the safeAccountSwitch flow runs
- **THEN** the sequence SHALL be:
  1. `await pushAllNow()` (flush pending dirty writes)
  2. `await snapshotLocalToBackup(db, currentUser.id, 'switch-account-menu')`
  3. `await clearLocalSyncTables(db)`
  4. `await supabase.auth.signOut()`
  5. `signInWithGoogle()` (open OAuth modal)
- **AND** ALL five steps SHALL execute in order even if any single step throws (errors are logged, flow continues to the wipe)

#### Scenario: Snapshot survives the wipe

- **WHEN** any account-switch wipe completes
- **THEN** `db.localBackup` SHALL contain a new row representing the pre-wipe state
- **AND** subsequent operations (sign-in as different user, force-pull from cloud) SHALL NOT delete or modify the snapshot
- **AND** the snapshot remains accessible for forensic / recovery purposes (no UI yet — out of scope this round)

### Requirement: Cross-device account reset propagates via cloud-side marker

The app SHALL maintain a `public.account_metadata` Postgres table with `user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE`, `last_reset_at timestamptz NOT NULL`, `schema_version text NOT NULL DEFAULT '1'`, and `updated_at timestamptz NOT NULL`. RLS SHALL enforce `auth.uid() = user_id` for all CRUD. The `delete_my_data()` RPC SHALL bump `last_reset_at = now()` (insert-or-update) immediately after wiping the user's sync rows.

The client SHALL expose `applyResetPropagationIfNeeded(supabase, userId, db)` in `lib/sync/reset-propagation.ts` that:

1. Fetches `account_metadata.last_reset_at` for the current user.
2. Compares against `localStorage['study-rpg.sync.lastAckResetAt:' + userId]` (defaulting to 0 if unset).
3. If cloud > ack: snapshots local cloud-synced Dexie tables to `localBackup` with reason `auto-mirror-on-reset`, wipes those tables via `wipeLocalSyncedTables(db)`, then writes the cloud value to the local ack key.
4. If cloud ≤ ack OR cloud is null: returns without side effect.
5. On any fetch / snapshot / wipe error, MUST NOT block sync engine start — log + skip is the prescribed failure mode.

The helper SHALL run at three points in each app's `useSync.ts`:

- **Before `computeGateState`** in the sign-in resolution effect — so post-reset sign-in lands in `fresh-start` / `silent-pull` instead of the migration-upload trap that would offer to resurrect stale local data.
- **At the start of `forcePull`** (the 「⬇ 立即同步下載」 button path) — covers the reproducer where a foreground tab presses the button manually.
- **Inside `safeResetAccountData`** after `delete_my_data` succeeds — fetch cloud's new `last_reset_at` back and write to local ack, so the resetting device's own cold-start gate doesn't re-fire.

#### Scenario: Sign-in cold-start propagates other-device reset

- **GIVEN** device A signed into account X ran `safeResetAccountData` successfully — cloud is empty, `account_metadata.last_reset_at = T1`
- **AND** device B signed into the same account X has stale local Dexie rows from before T1
- **WHEN** device B's sign-in resolution effect runs (page reload, sign-out + sign-in, browser restart, PWA wake-up)
- **THEN** `applyResetPropagationIfNeeded` SHALL be invoked BEFORE `computeGateState`
- **AND** the helper SHALL observe `cloud.last_reset_at = T1 > local.lastAckResetAt`
- **AND** a `local_backup` row SHALL be appended with reason `auto-mirror-on-reset` and user id X
- **AND** `wipeLocalSyncedTables(db)` SHALL clear all cloud-synced Dexie tables (preserving `meta` + `localBackup`)
- **AND** `localStorage['study-rpg.sync.lastAckResetAt:X']` SHALL be set to T1
- **AND** the subsequent `computeGateState` SHALL see local empty + cloud empty → state `fresh-start` (no migration modal)
- **AND** the engine SHALL start normally and the cold-start `pullAllNow({force:true})` SHALL apply zero rows

#### Scenario: Manual 立即同步下載 propagates same-tab when no sign-out happened

- **GIVEN** device B has been signed in continuously, kept the app foreground, and another device just ran reset
- **WHEN** the user on device B taps 「⬇ 立即同步下載」
- **THEN** `useSync.forcePull` SHALL invoke `applyResetPropagationIfNeeded` before the pull
- **AND** the helper SHALL detect the marker, snapshot to localBackup, wipe local, write ack
- **AND** the subsequent `engine.pullAllNow({force:true})` SHALL apply zero rows (cloud empty)

#### Scenario: Resetting device acks its own marker immediately

- **GIVEN** device A is running `safeResetAccountData`
- **WHEN** `supabase.rpc('delete_my_data')` returns successfully (cloud wiped, marker bumped to T1)
- **THEN** `safeResetAccountData` SHALL fetch the new `account_metadata.last_reset_at` back
- **AND** SHALL write that value to `localStorage['study-rpg.sync.lastAckResetAt:<uid>']`
- **AND** the engine restart that follows SHALL invoke `applyResetPropagationIfNeeded` and find `cloud == local ack` → no second wipe, no extra `local_backup` row

#### Scenario: Marker fetch failure does not block sign-in

- **WHEN** `fetchCloudResetTimestamp` throws (network failure, RLS misconfig, table-not-exists for a pre-migration client)
- **THEN** `applyResetPropagationIfNeeded` SHALL log a warning via `console.warn`
- **AND** SHALL return `{ propagated: false, cloudResetAt: null }` without throwing
- **AND** the sign-in flow SHALL proceed to `computeGateState` and engine start as if no marker existed
- **AND** the next successful gate fetch (next sign-in / next button press) SHALL re-attempt propagation

#### Scenario: Offline device with unpushed edits is wiped, edits preserved in localBackup

- **GIVEN** device B made offline local edits to gameplay tables (`hospital_question_history`, etc.) that have not yet pushed to cloud
- **AND** device A meanwhile ran a successful reset while B was offline
- **WHEN** B reconnects and the sign-in resolution effect runs (e.g., visibility change triggers a re-auth check that goes through the resolution path)
- **THEN** `applyResetPropagationIfNeeded` SHALL snapshot B's pre-reset local state (including the unpushed edits) into `local_backup` with reason `auto-mirror-on-reset`
- **AND** the wipe + ack + force-pull SHALL bring B in line with the post-reset empty cloud
- **AND** the user's unpushed edits SHALL be recoverable via the existing `local_backup` recovery surface (not auto-restored; manual gesture per existing spec)

#### Scenario: Concurrent reset on two devices is idempotent

- **GIVEN** devices A and B both call `delete_my_data` within seconds of each other
- **WHEN** both RPC calls complete
- **THEN** `account_metadata.last_reset_at` SHALL hold the timestamp of the later call (LWW via `ON CONFLICT DO UPDATE`)
- **AND** both devices SHALL ack the row they observe on their own post-reset read-back
- **AND** any third device signing in afterwards SHALL ack the same final timestamp
- **AND** no device SHALL end up with stale data resurrected to cloud

### Requirement: In-place account reset wipes cloud + local while preserving signed-in identity

The app SHALL provide an in-place reset action that, when the user clears a two-layer confirmation gate, snapshots local IndexedDB to `local_backup`, deletes all cloud rows owned by the current `auth.uid()`, wipes local sync tables, and restarts the sync engine — without signing the user out of Google and without altering the Supabase auth user record. The action SHALL be exposed in the existing account-management surface of each app (一階 `SettingsPanel` 資料管理 section; 二階 `HelpMenu` 帳號 accordion).

The action SHALL execute its four steps in this order — snapshot → cloud-delete → local-wipe → engine-restart — and SHALL abort if any earlier step throws so that no partial destructive state is reached.

#### Scenario: Successful in-place reset

- **WHEN** the user activates the reset entry, accepts Layer 1's `window.confirm`, and types `RESET` exactly at Layer 2's prompt while signed in with cloud sync enabled
- **THEN** the app SHALL append a new row to the `local_backup` Dexie table tagged with reason `reset-account-data` and the current user id
- **AND** the app SHALL invoke `supabase.rpc('delete_my_data')` and only proceed on success
- **AND** every row in every cloud-sync table where `user_id = auth.uid()` SHALL be deleted server-side
- **AND** local sync tables SHALL be cleared via `clearLocalSyncTables`, leaving `local_backup` untouched
- **AND** the sync engine SHALL re-evaluate its sign-in gate via the `setResolveTick` pattern and land in `fresh-start` state
- **AND** the Supabase auth user record SHALL remain intact and the user SHALL remain signed in

#### Scenario: Cloud-delete failure leaves local intact

- **WHEN** the user clears both confirmation layers but `supabase.rpc('delete_my_data')` returns an error (RLS denial, network failure, 5xx)
- **THEN** the app SHALL throw the error to the caller and stop the flow
- **AND** local IndexedDB sync tables SHALL remain unchanged
- **AND** the user SHALL remain signed in
- **AND** the `local_backup` snapshot appended in step 1 SHALL be retained so the user can retry the reset without losing the safety net

#### Scenario: User cancels at Layer 1

- **WHEN** the user activates the reset entry and clicks Cancel (or dismisses) on Layer 1's `window.confirm`
- **THEN** no snapshot SHALL be written
- **AND** no cloud RPC SHALL be invoked
- **AND** no local data SHALL change

#### Scenario: User mistypes the Layer 2 confirmation string

- **WHEN** the user activates the reset entry, accepts Layer 1, and Layer 2's prompt receives a value that is not exactly `RESET` (case-sensitive)
- **THEN** the app SHALL abort the flow before any snapshot, RPC, or wipe
- **AND** the user SHALL receive a passive notification (toast, status text, or equivalent) explaining that the typed value did not match and no change was made

#### Scenario: Reset gated to signed-in users with cloud sync enabled

- **WHEN** the user attempts to activate the reset entry while not signed in OR while `VITE_CLOUD_SYNC_ENABLED` is `false`
- **THEN** the entry SHALL be hidden or disabled
- **AND** if somehow invoked, the hook method SHALL throw before any destructive step

