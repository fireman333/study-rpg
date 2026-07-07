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

The account-switch wipe helper SHALL clear (a) every Dexie table registered in `NEURONS_ADAPTERS` (the table list SHALL be derived from the adapter registry, not hand-maintained), (b) within the `meta` table, the keys in `SYNCED_META_KEYS` **plus every key under the entire daily-prescription namespace prefix `prescription:v1:`** — which spans the **synced daily-quest table** (`plan` / `wrong` / `breadth` / `completed` / `reward` / `cramRescue` / `wire` / `tierClaim`, per the `neurons-daily-prescription` daily-state sync requirement), the device-local ritual keys (`lightsOut` / `localSeed`), AND the synced NG-0717 lineage-imprint keepsake sub-prefix `prescription:v1:ng0717:imprint:` — because that state is account-OWNED rather than device-local: the `completed:<date>` keys drive the account's NG-0717 maturation stage, the tier claims and progress keys are its daily-quest state, and the imprint keys are its keepsake, so leaving them would bleed the outgoing account's NG-0717 stage / keepsake / today's progress / claimed tiers into the next account. (The wipe's SCOPE is unchanged by the daily-state sync — the whole `prescription:v1:` prefix was already cleared; only its description changes, from mostly-local-only to mostly-synced.) Device-local meta keys OUTSIDE the `prescription:v1:` prefix (e.g. onboarding flags, `prescription:homeCollapsed`) SHALL be preserved. The helper SHALL also clear (c) the local-only `mockExamDrafts` table, because drafts contain the previous account's answer content. The wipe SHALL NOT create any cloud-side effect (no push, no delete request).

#### Scenario: Wipe clears adapter tables and synced meta only

- **WHEN** the wipe helper runs on a device with data in all 21 Dexie tables
- **THEN** the 20 adapter-registered tables and `mockExamDrafts` are empty, synced meta keys are deleted, and device-local meta keys (e.g. onboarding flags) remain

#### Scenario: Wipe clears the account-owned prescription state and NG-0717 keepsake

- **WHEN** the wipe helper runs on a device carrying the previous account's daily-prescription state — the completion keys (`prescription:v1:completed:<date>`) that drive its NG-0717 maturation stage, the plan / wrong / breadth / reward / cramRescue / wire / tierClaim keys, the local ritual keys (lightsOut / localSeed), and the NG-0717 lineage-imprint keys under `prescription:v1:ng0717:imprint:`
- **THEN** every key under the `prescription:v1:` prefix SHALL be deleted — so the next account inherits neither the previous account's NG-0717 maturation stage, nor its keepsake buds, nor today's prescription progress or claimed tiers (no "混血 NG-0717") — while device-local meta keys outside that prefix (e.g. `prescription:homeCollapsed`, onboarding flags) remain

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

neurons-tw SHALL provide a signed-in-gated 「♻ 重置此帳號進度」 entry in the HelpMenu. After a Traditional-Chinese confirmation dialog that enumerates what is destroyed (cloud save, local progress, leaderboard row + nickname release) and what is preserved (device preferences, onboarding records) and states the action is irreversible, the reset SHALL execute in this order: (1) best-effort leaderboard row deletion (a Worker failure logs a warning and does NOT abort), (2) push a reset bundle — empty `data` plus envelope `meta.reset_at` timestamp — which MUST succeed or the whole reset aborts with local data untouched, (3) clear local synced data via the account-guard wipe helper, (4) write the local reset acknowledgement. The acknowledgement SHALL be written only AFTER the local wipe succeeds, so that if the wipe throws no acknowledgement is persisted and the device's next pull re-runs the idempotent (already-empty) wipe gate rather than treating the reset as complete against un-wiped data (which would let the next push resurrect the account). This mirrors the pull-side propagation gate, which likewise clears local data before writing the acknowledgement. Steps (2)–(4) SHALL run inside a single hold of the per-user push lock. The user SHALL remain signed in and the ownership marker SHALL be unchanged.

#### Scenario: Successful reset

- **WHEN** a signed-in player confirms the reset dialog
- **THEN** the cloud bundle is overwritten with an empty snapshot carrying `reset_at`, local synced tables and synced meta keys and `mockExamDrafts` are cleared, device-local meta keys survive, the acknowledgement is written after the local wipe succeeds, the leaderboard row is deleted (nickname freed), and the player stays signed in with an empty fresh state

#### Scenario: Reset-push failure aborts before local damage

- **WHEN** the reset-bundle push fails (network / presign error)
- **THEN** the reset aborts with an error message, no local data has been cleared, no acknowledgement written, and the player can retry

#### Scenario: Local-wipe failure leaves no acknowledgement

- **WHEN** the reset-bundle push succeeds but the subsequent local wipe throws (Dexie / IndexedDB storage error)
- **THEN** no acknowledgement is written, the error surfaces to the caller, and because `reset_at` still exceeds the device's acknowledgement the next pull re-runs the account-guard wipe gate — clearing the still-present local data before any push — so the reset account is NOT resurrected to the cloud

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

### Requirement: R2 pushes SHALL be serialized per user across tabs (single-flight)

The neurons sync engine SHALL ensure that, for a given authenticated `userId`, at most one R2 push runs at a time — across overlapping triggers within one tab (debounced push, `beforeunload` flush, manual status-light sync) AND across concurrent tabs of the same origin. **Every R2 PUT path SHALL acquire the lock**, including both the engine's debounced/manual push and the in-place account-reset bundle push (which writes an empty `reset_at` snapshot directly via the bundle pusher rather than through the engine). For the account-reset path, the cloud reset PUT, the local reset acknowledgement, and the local data wipe SHALL execute within a **single hold of the lock**, so that no concurrently-queued push can observe the post-PUT / pre-wipe window and resurrect the reset account. The engine SHALL acquire an origin-wide lock keyed by the user around each R2 write path, using a **neurons-specific lock name** (e.g. `navigator.locks.request('neurons-rpg.r2-push.<userId>', …)`) so that the lock does NOT couple with the 二階 app, which shares the `med-study-rpg.com` origin. The lock SHALL be released automatically when the push settles or the holding tab is closed.

Upon acquiring the lock and before issuing the PUT, the engine SHALL refresh the bundle ETag from `localStorage` (localStorage-authoritative) rather than relying on a possibly-stale in-memory copy, so that a second serialized writer pushes with `If-Match: <the first writer's persisted ETag>`. Because neurons is single-bundle and rebuilds a full snapshot on every push (no per-row dirty markers), the lock callback SHALL NOT perform a dirty-marker re-check or marker clear.

When the Web Locks API is unavailable, the engine SHALL fall back to a same-tab serialization mechanism keyed per `userId` (distinct users SHALL NOT serialize against each other; a failed push SHALL NOT poison subsequent pushes). It MAY leave concurrent cross-tab pushes unserialized, which is no worse than the unserialized baseline. Serialization SHALL NOT place the pull path or gameplay writes under the lock.

#### Scenario: Overlapping pushes in one tab run serially

- **GIVEN** an authed user whose debounced push is in flight (holding the push lock)
- **WHEN** a `beforeunload` flush or a manual status-light sync triggers another push before the first completes
- **THEN** the second push SHALL wait for the first to release the lock
- **AND** no two R2 PUTs for the user's bundle SHALL be in flight at the same time

#### Scenario: Second serialized writer uses the first's fresh ETag

- **GIVEN** two tabs of the same user each with a pending R2 push
- **WHEN** tab A's push completes (persisting a new ETag) and tab B then acquires the lock
- **THEN** tab B's push SHALL send `If-Match: <tab A's persisted ETag>`
- **AND** tab B's push SHALL succeed without a 412 when that ETag is current

#### Scenario: Fallback serializes same tab without coupling distinct users

- **GIVEN** an environment without the Web Locks API
- **WHEN** two pushes for the same user are triggered concurrently in one tab
- **THEN** they SHALL run one after the other
- **AND** a push for a different user SHALL NOT be blocked by the first user's in-flight push
- **AND** a thrown error from one push SHALL NOT prevent the next queued push from running

#### Scenario: Lock name does not couple neurons with 二階

- **GIVEN** the same user has both `/neurons/` and `/2nd/` open in the same browser origin
- **WHEN** both apps push their (different) R2 bundles
- **THEN** the neurons push SHALL acquire `neurons-rpg.r2-push.<userId>` and SHALL NOT be serialized against the 二階 push

#### Scenario: Account-reset bundle push is serialized too

- **GIVEN** an authed user whose debounced push is in flight (holding the push lock)
- **WHEN** the user triggers an in-place account reset, whose reset-bundle PUT runs concurrently
- **THEN** the reset-bundle push SHALL acquire the same per-user lock and wait for the in-flight push to release
- **AND** the reset-bundle push SHALL use the freshest persisted ETag (not a stale in-memory copy)

#### Scenario: A push queued behind a reset cannot resurrect the account

- **GIVEN** an in-place account reset holding the lock, having PUT the empty reset bundle but not yet wiped local data
- **AND** a debounced push waiting on the same lock
- **WHEN** the reset completes its acknowledgement and local data wipe and releases the lock
- **THEN** the queued push SHALL acquire the lock only after the local wipe
- **AND** it SHALL therefore push the empty post-reset state, never the pre-reset data

### Requirement: First R2 push after cold start SHALL await the startup force-pull

The neurons engine SHALL retain the cold-start `pullNow({ force: true })` promise kicked at mount, and the FIRST push after start SHALL await that promise (bounded by a finite timeout guard) before issuing its R2 PUT, so the first push uses a warm ETag rather than an empty cache. Subsequent pushes SHALL NOT wait. This SHALL NOT change the force-pull's own semantics — it still issues an unconditional GET that bypasses the cached ETag.

#### Scenario: First push waits for the warm-up pull

- **GIVEN** the engine has kicked the cold-start force-pull (still in flight)
- **WHEN** the first push is triggered before the force-pull resolves
- **THEN** the push SHALL await the force-pull (up to the timeout guard) before its PUT
- **AND** the PUT SHALL carry `If-Match: <etag warmed by the force-pull>`, not `If-None-Match: *`

#### Scenario: A hung warm-up pull does not block pushes forever

- **GIVEN** the cold-start force-pull does not resolve within the timeout guard
- **WHEN** the first push is awaiting it
- **THEN** the push SHALL proceed after the timeout rather than stall indefinitely

#### Scenario: Later pushes do not wait

- **GIVEN** the first post-start push has already completed
- **WHEN** a subsequent push fires
- **THEN** it SHALL NOT await the startup force-pull promise

### Requirement: Synced meta set SHALL admit a prefix-matched key family for dynamic keepsakes

The synced-meta membership test SHALL admit, in addition to the enumerated `SYNCED_META_KEYS` allowlist, keys matching a small set of explicit **registered key-family matchers** — prefix (or prefix + date-window) tests introduced for dynamic key families that cannot be enumerated: the NG-0717 lineage imprints (`prescription:v1:ng0717:imprint:`, subject × date) and the prescription daily-quest families (`prescription:v1:{plan,wrong,breadth,completed,reward,cramRescue,wire,tierClaim}:…`, date-keyed, per the `neurons-daily-prescription` daily-state sync requirement). Both the `metaAdapter` snapshot (which rows enter the bundle) and its apply (which incoming rows are accepted) SHALL use the SAME membership test (allowlist OR registered matcher), so the two directions never diverge. A matcher SHALL be specific enough to match ONLY its intended key family and SHALL NOT capture sibling keys under a shared ancestor namespace (e.g. the prescription daily-state matcher SHALL NOT match `prescription:v1:lightsOut:` or `prescription:v1:localSeed`, which stay local-only; the imprint prefix SHALL NOT match the daily-state families).

A registered key family SHALL satisfy ONE of two merge contracts:

- **(a) Write-once presence keys**, merged by the metaAdapter's existing first-write-wins rule — where first-write-wins equals a UNION (e.g. imprints; the prescription `wrong` / `breadth` / `completed` / `reward` / `cramRescue` / `wire` / `tierClaim` families); or
- **(b) A family with a registered backfill post-pass that defines its merge**, run on pull completion — e.g. the prescription `plan:{date}` family, whose earliest-createdAt-wins MIN-LWW is enforced by `backfill/prescription-plan.ts`; for such a family the metaAdapter's first-write-wins is only a transport default that the post-pass deterministically reconciles.

Registering a family whose values mutate or delete WITHOUT a registered post-pass defining a convergent merge would be incorrect and SHALL NOT be done. The matcher constants SHALL be single-sourced from the service that mints the keys (imported, not re-declared) so the sync filter and the key mint cannot drift.

#### Scenario: Snapshot and apply use the same allowlist-or-matcher membership test
- **WHEN** the metaAdapter snapshots meta rows and later applies incoming meta rows
- **THEN** both SHALL include a key iff it is in `SYNCED_META_KEYS` OR it matches a registered key-family matcher, so no key syncs in one direction but not the other

#### Scenario: A registered matcher matches only its intended family
- **WHEN** the registered prescription matchers are evaluated against `prescription:v1:lightsOut:2026-07-07` and `prescription:v1:localSeed`
- **THEN** neither key SHALL be treated as synced (the daily-state matcher and the imprint prefix are each exact to their intended families)

#### Scenario: Write-once families merge by first-write-wins UNION
- **WHEN** a write-once prefix-matched key (an imprint bud, a `wrong:{date}:{qid}` credit, a `tierClaim:{date}:{tier}` marker) is present on one device and absent on another
- **THEN** the merge SHALL add it where absent (first-write-wins) and SHALL never delete it, yielding a UNION across devices

#### Scenario: A post-pass family converges deterministically in any pull order
- **WHEN** two devices hold divergent `prescription:v1:plan:{date}` values for the same date and pulls happen in either order
- **THEN** the registered backfill post-pass SHALL converge both devices to the plan with the smaller `(createdAt, seed)` (earliest-createdAt wins), never leaving the transport's first-write-wins as the final state for that family

