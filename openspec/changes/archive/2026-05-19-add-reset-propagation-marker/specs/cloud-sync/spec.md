## MODIFIED Requirements

### Requirement: Account deletion removes all cloud data

The app SHALL provide an account-deletion action that, when confirmed by the user, deletes all rows owned by `auth.uid()` across all cloud-sync tables, then signs the user out. The underlying `delete_my_data()` RPC SHALL ALSO bump `account_metadata.last_reset_at = now()` for the same user (creating the row on first use via `INSERT ... ON CONFLICT DO UPDATE`) so that other devices signed into the same account can detect the wipe on their next pull-gate evaluation and propagate it locally.

#### Scenario: Account deletion clears cloud rows

- **WHEN** the user confirms account deletion while signed in with cloud sync enabled
- **THEN** `delete_my_data()` SHALL remove every row owned by `auth.uid()` across all cloud-sync tables
- **AND** the auth user record SHALL be deleted (or marked for deletion per Supabase Auth API)
- **AND** `account_metadata.last_reset_at` for the user SHALL be `now()` (row inserted or updated)
- **AND** the user SHALL be signed out
- **AND** local IndexedDB SHALL retain a `local_backup` snapshot tagged with the deletion reason

### Requirement: Status chip surfaces sync health passively

The app SHALL render a SyncStatusChip in a fixed corner of the layout reflecting the current sync engine status. The chip SHALL update reactively as engine status transitions. Tapping the chip SHALL open a detail popover with sync timestamps and manual sync actions. The 「⬇ 立即同步下載」 button SHALL invoke `useSync.forcePull()`, which itself first runs `applyResetPropagationIfNeeded(supabase, userId, db)` so a press from the device that received an out-of-band reset still triggers the auto-mirror, even when the cold-start gate has already been ack'd in this browser session.

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

## ADDED Requirements

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
