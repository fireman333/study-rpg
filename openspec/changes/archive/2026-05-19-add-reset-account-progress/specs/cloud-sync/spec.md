## ADDED Requirements

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
