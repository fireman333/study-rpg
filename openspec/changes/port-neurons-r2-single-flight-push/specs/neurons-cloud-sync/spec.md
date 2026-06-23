# neurons-cloud-sync (delta)

## ADDED Requirements

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
