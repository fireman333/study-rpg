## MODIFIED Requirements

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

### Requirement: Sync status chip in app header

The app SHALL render a `SyncStatusChip` component in the header (both 一階 and 二階), adjacent to the existing `AuthButton`, when the user is authenticated. The chip SHALL reflect the engine's current state via icon + accessible label, and SHALL open a detail popover on tap that exposes Force Push and Force Pull controls.

The chip's "已同步" (synced) state SHALL ONLY display when at least one successful push OR pull has completed in the current engine session (`lastPushAt > 0 OR lastPullAt > 0`). An engine that has started but not yet pushed or pulled anything SHALL display "待同步" (pending sync) — NOT "已同步" — so the user is not misled into believing their data is safe before any cloud round-trip has occurred.

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
  - 「立即同步下載」 button (calls `engine.pullAllNow()`)
- **AND** the popover SHALL dismiss on outside click or chip re-tap

## ADDED Requirements

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
