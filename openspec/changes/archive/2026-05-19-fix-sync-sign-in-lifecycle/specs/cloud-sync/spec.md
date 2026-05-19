## MODIFIED Requirements

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

## ADDED Requirements

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
