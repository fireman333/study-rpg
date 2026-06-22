# neurons-cloud-sync Specification

## Purpose

Defines the account-integrity and trigger-coverage rules of the neurons-tw sync engine (R2-only single bundle, `users/<sub>/neurons-snapshot.json.gz`). neurons merge rules are predominantly monotonic (MAX / UNION / first-write-wins), which makes two failure shapes irreversible once they reach the cloud: cross-account merges (two accounts' data fused on a shared device) and post-reset resurrection (a stale device pushing wiped data back). This capability pins the device-local ownership marker, the account-switch gate, the wipe helper's scope, the adapter-registry derivation of push triggers, and (per `add-neurons-account-reset`) the in-place reset flow with its cloud-marker propagation.

## Requirements

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

### Requirement: In-place account reset wipes cloud, local, and leaderboard while preserving the signed-in identity

neurons-tw SHALL provide a signed-in-gated 「♻ 重置此帳號進度」 entry in the HelpMenu. After a Traditional-Chinese confirmation dialog that enumerates what is destroyed (cloud save, local progress, leaderboard row + nickname release) and what is preserved (device preferences, onboarding records) and states the action is irreversible, the reset SHALL execute in this order: (1) best-effort leaderboard row deletion (a Worker failure logs a warning and does NOT abort), (2) push a reset bundle — empty `data` plus envelope `meta.reset_at` timestamp — which MUST succeed or the whole reset aborts with local data untouched, (3) write the local reset acknowledgement, (4) clear local synced data via the account-guard wipe helper. The user SHALL remain signed in and the ownership marker SHALL be unchanged.

#### Scenario: Successful reset

- **WHEN** a signed-in player confirms the reset dialog
- **THEN** the cloud bundle is overwritten with an empty snapshot carrying `reset_at`, local synced tables and synced meta keys and `mockExamDrafts` are cleared, device-local meta keys survive, the leaderboard row is deleted (nickname freed), and the player stays signed in with an empty fresh state

#### Scenario: Reset-push failure aborts before local damage

- **WHEN** the reset-bundle push fails (network / presign error)
- **THEN** the reset aborts with an error message, no local data has been cleared, no acknowledgement written, and the player can retry

#### Scenario: Leaderboard failure does not block the reset

- **WHEN** the leaderboard deletion call fails but the reset-bundle push succeeds
- **THEN** the reset completes (cloud + local cleared) and the leaderboard残留 is surfaced as retry-able, not as a reset failure

### Requirement: Cross-device reset propagation via bundle reset marker

The bundle envelope SHALL support an optional `meta.reset_at` (epoch ms). WHEN a pull decodes a bundle whose `reset_at` is greater than the device's local acknowledgement for the signed-in user (localStorage `neurons:lastAckResetAt:<userId>`), the client SHALL clear local synced data and write the acknowledgement BEFORE applying the bundle's adapter rows. A bundle without `reset_at`, or with `reset_at` ≤ the local acknowledgement, SHALL apply normally with no wipe.

#### Scenario: Stale device converges on next pull

- **WHEN** device B holds pre-reset local data and pulls after device A performed a reset
- **THEN** device B wipes its local synced data before applying the (empty) bundle, acknowledges `reset_at`, and does not resurrect pre-reset data on its subsequent pushes

#### Scenario: Acknowledged device does not re-wipe

- **WHEN** a device whose acknowledgement already equals the bundle's `reset_at` pulls again
- **THEN** the bundle applies normally with no additional wipe (including the resetting device's own first post-reset pull)

### Requirement: Reset marker carry-forward and schema-version fence

Every bundle push SHALL carry forward the device's acknowledged `reset_at` (when non-zero) in the envelope, so post-reset gameplay pushes never erase the propagation marker. The bundle `SCHEMA_VERSION` SHALL be bumped to 22 alongside the `reset_at` introduction, so the existing Worker schema-version guard (409 on lower-version push presign) fences pre-reset clients: a stale client that has not loaded the new code can still pull (forward tolerance) but cannot push data that would resurrect the account or strip the marker.

#### Scenario: Post-reset gameplay keeps the marker

- **WHEN** the resetting device answers new questions after the reset and a debounced push fires
- **THEN** the pushed bundle contains the new gameplay rows AND the same `reset_at`, so later-syncing devices still receive the reset signal

#### Scenario: Stale-version client cannot resurrect

- **WHEN** a client running the previous bundle schema version attempts a push after any v22 bundle has landed
- **THEN** the push presign is refused by the existing Worker guard and no pre-reset data reaches the cloud; the client recovers by reloading the app

### Requirement: Sync status light with one-click manual sync

WHEN a user is signed in and the sync engine is mounted, the header auth pill SHALL display a three-state sync light: 🟢 synced (idle, no error — tooltip shows last successful push time, or 「尚未同步」 when never pushed), 🟡 syncing (a push or pull in flight — clicks are no-ops), 🔴 sync failed (tooltip carries the error message and invites retry). Clicking the light SHALL trigger a manual sync (force pull, then push). The light SHALL NOT render when signed out, when auth is disabled, or while the account-switch gate is pending. The light SHALL add no more than a single emoji's width to the pill (RWD constraint — no second pill, no header overflow at 375px).

#### Scenario: Push failure becomes visible

- **WHEN** a debounced push fails (network error / Worker outage) while the player keeps playing
- **THEN** the header light turns 🔴 with the error in its tooltip, instead of the failure being visible only in the developer console

#### Scenario: Manual sync round-trip

- **WHEN** the player clicks the 🟢/🔴 light
- **THEN** the client force-pulls the cloud bundle and then pushes local state, the light shows 🟡 while in flight, and returns to 🟢 on success

#### Scenario: Hidden when not applicable

- **WHEN** the user is signed out, auth is disabled, or the account-switch confirmation dialog is pending
- **THEN** no sync light renders in the header

### Requirement: R2 push ETag SHALL persist across reloads, user-scoped, published only after apply

neurons-tw SHALL persist the R2 bundle ETag in `localStorage` under a **user-scoped** key (e.g. `neurons-rpg.sync.etag.<userId>`) so that a warm-cache push after a page reload uses `If-Match: <etag>` rather than `If-None-Match: *`. Because neurons is single-bundle, the key SHALL carry no bundle segment. The persisted ETag SHALL be scoped to the authenticated `userId` so that one account's ETag is never used for another account's push (a global, non-user-scoped key would make account B's first push reuse account A's ETag and 412). An in-memory cache MAY layer over `localStorage` for speed. When `localStorage` is unavailable (private mode / quota), the engine SHALL degrade to in-memory only and SHALL NOT throw.

On the **pull** path, the engine SHALL persist the server ETag ONLY AFTER `applyBundleSnapshot` has successfully merged the snapshot into local Dexie — never before. (Persisting a pulled ETag before the snapshot is applied would let a concurrent tab PUT with that ETag while its local state is still un-merged, bypassing whole-bundle conflict detection and overwriting newer cloud state.) When the body fails to decode, the engine MAY retain the ETag for corrupt-blob `If-Match` overwrite recovery but SHALL NOT have merged any snapshot.

On the **push** path, the engine SHALL persist the ETag from a `200 OK` response immediately (the just-uploaded snapshot is local truth).

When a `412`/`409` precondition failure is followed by a pull that reports the blob is missing (`404`/`blobMissing`) — on either the HEAD or the GET path — the engine SHALL clear the persisted ETag so the retry falls back to `If-None-Match: *` rather than looping on a stale `If-Match`.

Cold-start force-pull SHALL continue to bypass the cached/persisted ETag and issue an unconditional GET (existing invariant, unchanged). The first-ever push (no persisted ETag) SHALL continue to send `If-None-Match: *`.

#### Scenario: Warm-cache push after reload uses If-Match

- **GIVEN** a returning user whose neurons bundle already exists in R2
- **AND** a persisted ETag under the user's key
- **WHEN** the engine performs its first push after a page reload
- **THEN** the PUT SHALL carry `If-Match: <persisted etag>`
- **AND** the PUT SHALL NOT carry `If-None-Match: *`
- **AND** when the ETag is current the PUT SHALL succeed without a 412

#### Scenario: ETag is user-scoped across accounts

- **GIVEN** account A has a persisted ETag on a shared device
- **WHEN** account B reads the ETag for its own push
- **THEN** B SHALL NOT receive A's ETag, and B's first push SHALL send `If-None-Match: *` (or B's own persisted ETag), never A's `If-Match`

#### Scenario: Pulled ETag is not persisted before apply

- **GIVEN** a pull whose body decodes and `applyBundleSnapshot` is about to run
- **WHEN** the pull completes
- **THEN** the engine SHALL have persisted the new ETag only after `applyBundleSnapshot` returned successfully

#### Scenario: Missing blob clears the persisted ETag

- **GIVEN** a persisted ETag for a bundle whose R2 blob was deleted server-side
- **WHEN** a push 412s and the follow-up pull reports the blob missing (HEAD or GET 404)
- **THEN** the engine SHALL clear the persisted ETag
- **AND** the retry PUT SHALL carry `If-None-Match: *`

### Requirement: Account switch and local wipe SHALL clear persisted R2 ETag and presign cache

The neurons account-switch / local-wipe helper (`clearLocalSyncedData`) SHALL remove every persisted R2 ETag for the outgoing user AND invalidate the presigned-URL cache, in addition to the existing Dexie-table and synced-meta clear. After the clear, no `neurons-rpg.sync.etag.*` key SHALL remain, and no cached presigned URL from the previous user SHALL be reused. Because the in-place account-reset flow invokes the same wipe helper, this clearing SHALL apply to the reset path as well.

#### Scenario: Account switch leaves no ETag or presign bleed

- **GIVEN** user A is signed in with a persisted ETag and a cached presign URL
- **WHEN** the app switches to user B and the account-switch wipe runs
- **THEN** no persisted ETag SHALL remain
- **AND** user B's first push SHALL NOT reuse user A's presigned URL or ETag

#### Scenario: In-place reset also clears the ETag and presign cache

- **WHEN** the signed-in account-reset flow runs its local wipe
- **THEN** the persisted ETag(s) and the presign cache SHALL be cleared alongside the Dexie tables and synced meta, so the post-reset state carries no stale ETag or presigned URL
