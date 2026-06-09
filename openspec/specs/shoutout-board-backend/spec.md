# shoutout-board-backend Specification

## Purpose
TBD - created by syncing change add-neurons-shoutout-board. Update Purpose after archive.

## Requirements

### Requirement: Isolated shoutout endpoint namespace
The shared sync Worker SHALL serve shoutout traffic under a `/shoutouts/*` namespace whose routing, rate-limiting, and authorization logic are isolated from the existing sync/leaderboard/presign handlers. Adding these endpoints SHALL NOT alter existing endpoint behavior.

#### Scenario: Existing endpoints unaffected
- **WHEN** the shoutout module is deployed to the shared Worker
- **THEN** existing leaderboard, cloud-sync, and presign endpoints respond exactly as before

#### Scenario: App-scoped routing
- **WHEN** a request hits `/shoutouts/:app` with `app` = `neurons`
- **THEN** it reads/writes only the neurons shoutout table, never another app's table

### Requirement: Per-app one-message-per-user storage
The backend SHALL store shoutouts in a per-app D1 table keyed so each user has at most one (active) message per app, with separate audit, reports, and bans tables. The schema migration SHALL be reversible and SHALL NOT drop or alter existing tables.

#### Scenario: Second post overwrites
- **WHEN** a user who already has a message posts again
- **THEN** the existing row is updated in place (one row per user), not duplicated

#### Scenario: Migration is additive
- **WHEN** the migration is applied
- **THEN** only new shoutout tables/indexes are created and existing leaderboard/sync tables are untouched

### Requirement: Read path served from edge cache
`GET /shoutouts/:app` SHALL return the latest 40 non-deleted, non-hidden messages ordered by `created_at` descending, served via an edge cache (`Cache-Control: max-age=30, stale-while-revalidate=60`) rather than querying D1 on every request, and SHALL NOT use a KV write per board read.

#### Scenario: Cached list
- **WHEN** the board list is requested repeatedly within the cache window
- **THEN** responses are served from the edge cache without a D1 query per request

#### Scenario: Ordering and exclusions
- **WHEN** the list is assembled
- **THEN** it contains at most 40 entries ordered by `created_at` desc, excluding deleted and hidden messages

### Requirement: Write path moderation pipeline
`PUT /shoutouts/:app` SHALL process a write through this ordered pipeline before persisting: authenticate; reject banned users; require an existing leaderboard nickname; require an established account (age threshold or ≥1 prior successful game sync); enforce a per-user token bucket; enforce a 5-minute edit cooldown; short-circuit unchanged content via a content hash (no D1 write); normalize text (NFKC, strip zero-width characters, collapse whitespace, strip bidi-override characters); enforce ≤ 40 grapheme clusters and ≤ 2 lines; reject keyword-blocklist and PII matches; then UPSERT and append an audit row.

#### Scenario: Unauthenticated write
- **WHEN** a `PUT` arrives without a valid auth token
- **THEN** the Worker rejects it with 401 and writes nothing

#### Scenario: Missing nickname
- **WHEN** an authenticated user without a leaderboard nickname posts
- **THEN** the Worker rejects with a nickname-required status and writes nothing

#### Scenario: New-account gate
- **WHEN** a freshly created account that has never completed a normal game sync posts
- **THEN** the Worker rejects the post until the account is established

#### Scenario: Cooldown enforced server-side
- **WHEN** a user edits again within 300 seconds of their last accepted write
- **THEN** the Worker rejects with a cooldown status (client-side debounce alone is insufficient)

#### Scenario: Unchanged content is a no-op
- **WHEN** a `PUT` carries content whose hash equals the stored content hash
- **THEN** the Worker returns a no-op success without writing to D1

#### Scenario: Normalization defeats obfuscation
- **WHEN** a message uses full-width, zero-width, or whitespace-padded variants of blocked terms
- **THEN** normalization is applied before blocklist matching so the obfuscated term is caught

#### Scenario: Blocklist or PII match rejected
- **WHEN** normalized text matches the keyword blocklist or a PII pattern (phone / email / national id)
- **THEN** the write is rejected with a friendly message and nothing is persisted

#### Scenario: created_at preserved on edit
- **WHEN** an existing message is edited
- **THEN** its `created_at` is preserved and only `updated_at` is bumped (so board ordering does not change)

### Requirement: Server-sourced identity and rank join
The backend SHALL derive each message's display name and top-N flag server-side — the nickname from the app's leaderboard profile (joined by author key) and the top-N flag from the existing Top-100 cache — and SHALL NOT accept a client-supplied display name.

#### Scenario: Name not client-supplied
- **WHEN** a write includes any client-provided name field
- **THEN** the Worker ignores it and the listed nickname comes only from the leaderboard join

#### Scenario: Rename propagates
- **WHEN** a user changes their leaderboard nickname
- **THEN** subsequent board reads show the new nickname without the user re-posting

#### Scenario: Top-N flag from cache
- **WHEN** the list is assembled
- **THEN** authors present in the existing Top-100 cache within the top-N cutoff are flagged for the special halo

### Requirement: Soft-delete and audit log
Deletions, overwrites, hides, and admin actions SHALL be soft (the public list excludes them) and SHALL be recorded in an append-only audit log capturing original text, normalized text, avatar, actor/reporter, reason, and timestamps. Records SHALL NOT be hard-erased.

#### Scenario: Delete hides but retains
- **WHEN** a user deletes their message
- **THEN** it stops appearing publicly but the prior content is retained in the audit log

#### Scenario: Edit logs the prior version
- **WHEN** a message is edited
- **THEN** an audit row records the change with timestamps

### Requirement: Report to soft-hide
`POST /shoutouts/:app/report` SHALL be rate-limited, record the reporter, prevent a single reporter from inflating reports against one target, and soft-hide a message once a threshold of distinct reporters is reached, pending owner review. A report SHALL NOT immediately hard-delete content.

#### Scenario: Duplicate report ignored
- **WHEN** the same reporter reports the same target more than once
- **THEN** only one report is counted toward the threshold

#### Scenario: Threshold reached
- **WHEN** distinct reporters for a message reach the hide threshold
- **THEN** the message is soft-hidden and queued for owner review (not deleted)

### Requirement: Owner moderation back-office
The backend SHALL provide owner-authenticated tooling to list messages including hidden ones and their normalized text, search by user, hard-remove content, ban/mute a user, and un-hide a message. This tooling is required for launch.

#### Scenario: Owner reviews hidden content
- **WHEN** the owner opens the back-office
- **THEN** they can see hidden messages with normalized text and act (delete / unhide / ban)

#### Scenario: Banned user cannot post
- **WHEN** a banned user attempts to post
- **THEN** the write is rejected while the ban is active

### Requirement: Structured avatar payload validation
The backend SHALL accept the avatar only as a structured payload `{ avatarType, assetId, cosmeticId? }`, validate `avatarType` against a fixed enum and the id fields against a bounded charset/length, and reject anything else. Strict ownership verification of the referenced sprite is OPTIONAL and MAY be deferred.

#### Scenario: Malformed payload rejected
- **WHEN** an avatar payload contains a field outside the allowed shape/charset (e.g. a URL, markup, or oversized string)
- **THEN** the Worker rejects the write and persists nothing

#### Scenario: Well-formed payload accepted
- **WHEN** an avatar payload matches the structured shape and charset bounds
- **THEN** it is stored and later returned for the client to resolve to a sprite by lookup
