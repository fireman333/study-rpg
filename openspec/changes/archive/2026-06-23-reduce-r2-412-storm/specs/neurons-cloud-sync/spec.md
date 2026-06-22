# neurons-cloud-sync (delta)

## ADDED Requirements

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
