# neurons-cloud-sync — Delta Spec (fix-neurons-account-switch-guard)

## ADDED Requirements

### Requirement: Local data ownership marker

neurons-tw SHALL persist a device-local ownership marker `neurons:lastSyncedUserId` in `localStorage`, recording the `user.id` of the last account that passed the account gate and mounted the sync engine. The marker SHALL NOT be stored in any synced Dexie table and SHALL NOT participate in cloud sync. Anonymous (signed-out) play SHALL NOT write the marker. Sign-out SHALL preserve both the marker and local data (existing auth-spec behavior unchanged).

#### Scenario: First sign-in writes the marker

- **WHEN** a user signs in on a device with no ownership marker present
- **THEN** the gate writes `neurons:lastSyncedUserId = user.id` and mounts the sync engine normally (the anonymous-progress upload-merge path is unchanged)

#### Scenario: Marker survives sign-out

- **WHEN** a signed-in user signs out
- **THEN** the marker and all local Dexie data remain intact, and signing back in with the same account mounts the engine with no prompt and no wipe

#### Scenario: Missing marker fails open

- **WHEN** the browser has cleared `localStorage` but local Dexie data exists and a user signs in
- **THEN** the gate treats the device as unmarked (first sign-in path) — behavior is no worse than the pre-guard status quo

### Requirement: Account-switch gate blocks cross-account merge

WHEN a user signs in and the ownership marker exists with a value different from `user.id`, neurons-tw SHALL NOT mount the sync engine (no Dexie hooks attached, no pull, no push) until the conflict is resolved through a confirmation dialog. The dialog SHALL state, in Traditional Chinese, that (a) local data belongs to another account, (b) confirming will CLEAR local data and use the signing-in account's cloud save, and (c) cancelling will sign the user out. On confirm, the app SHALL clear local synced data, write the marker to the new `user.id`, and only then mount the sync engine (initial force pull). On cancel, the app SHALL sign out and leave local data and the marker untouched.

#### Scenario: Different account confirms the switch

- **WHEN** account B signs in on a device whose marker records account A, and the user confirms the dialog
- **THEN** local synced data is cleared first, the marker becomes B's `user.id`, and the sync engine mounts with a force pull of B's cloud bundle — no row of A's data is ever merged or pushed into B's bundle

#### Scenario: Different account cancels the switch

- **WHEN** account B signs in on a device whose marker records account A, and the user cancels the dialog
- **THEN** the app signs out, the sync engine never mounts, and A's local data and marker remain exactly as before

#### Scenario: Wipe failure does not pollute

- **WHEN** the confirm-path wipe throws (Dexie error mid-clear)
- **THEN** the marker is NOT updated, the sync engine is NOT mounted, and the dialog surfaces an error inviting retry — the engine never runs against partially-cleared foreign data

### Requirement: Account-switch wipe covers all synced surfaces plus local drafts

The account-switch wipe helper SHALL clear (a) every Dexie table registered in `NEURONS_ADAPTERS` (the table list SHALL be derived from the adapter registry, not hand-maintained), (b) within the `meta` table, exactly the keys in `SYNCED_META_KEYS` (device-local meta keys such as onboarding flags are preserved), and (c) the local-only `mockExamDrafts` table, because drafts contain the previous account's answer content. The wipe SHALL NOT create any cloud-side effect (no push, no delete request).

#### Scenario: Wipe clears adapter tables and synced meta only

- **WHEN** the wipe helper runs on a device with data in all 21 Dexie tables
- **THEN** the 20 adapter-registered tables and `mockExamDrafts` are empty, synced meta keys are deleted, and device-local meta keys (e.g. onboarding flags) remain

#### Scenario: Wipe stays in lockstep with future adapters

- **WHEN** a future change registers a new TableAdapter in `NEURONS_ADAPTERS`
- **THEN** the wipe helper covers the new table with no further code change, and a Vitest lock fails if any adapter name has no corresponding Dexie table

### Requirement: Push-trigger hook coverage derives from the adapter registry

The set of Dexie tables whose writes schedule a debounced push SHALL be derived from `NEURONS_ADAPTERS` (every adapter-registered table triggers `schedulePush` on create / update / delete). The hook list SHALL NOT be a hand-maintained literal that can drift from the adapter registry.

#### Scenario: Bookmark-only session syncs

- **WHEN** a signed-in user bookmarks a question (a write to `questionBookmarks` only) and performs no other action
- **THEN** a debounced push is scheduled and the bookmark reaches the cloud bundle without riding another table's write

#### Scenario: Registry growth auto-covers triggers

- **WHEN** a future change adds a new TableAdapter to `NEURONS_ADAPTERS`
- **THEN** writes to that table schedule pushes with no edit to the hook list, and a Vitest lock asserts hook coverage == adapter registry
