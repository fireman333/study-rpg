## ADDED Requirements

### Requirement: R2 pushBundle SHALL recover from a corrupt existing blob via overwrite

When the sync engine attempts a first-time push of a bundle (no local ETag cache) to R2 and the bucket already contains an object at the target key whose body cannot be decompressed as a valid gzip stream (e.g., a leftover smoke-test byte, truncated upload, manually-injected garbage), the engine SHALL NOT abort with an exhausted-retry error. Instead, the engine SHALL extract the R2-supplied `ETag` from the corrupt blob's response headers, treat the existing blob as opaque-but-replaceable, and on the next retry iteration SHALL issue a `PUT` request with `If-Match: <etag>` header, thereby overwriting the corrupt blob with the locally-built valid snapshot.

The recovery path SHALL NOT attempt to apply or merge the corrupt blob's contents to the local Dexie database. The local snapshot SHALL be the sole source of truth for the overwrite. After successful overwrite, the engine SHALL set the new ETag from R2's 200 OK response and treat subsequent operations as normal LWW pushes.

The engine SHALL log a distinct console message when this recovery path triggers (e.g., `[sync:pushR2:<bundle>] recovered from corrupt blob via overwrite (old etag <X> → new etag <Y>)`), separate from the existing per-bundle error log channel, so that operators can grep for this specific condition in field reports.

If the overwrite itself fails (e.g., the corrupt blob's ETag is stale because a real concurrent writer landed between the pull and the retry), the engine SHALL surface a distinct error code `r2_blob_concurrent_writer_exhausted` (after exhausting the configured retry budget) rather than the legacy generic `r2_push_exhausted: Failed to fetch` message.

#### Scenario: First push to a bucket containing a 1-byte garbage blob succeeds via overwrite

- **GIVEN** an authed session with empty local ETag cache for bundle `m1`
- **AND** the R2 bucket contains `users/<uid>/m1-snapshot.json.gz` with a 1-byte body (e.g., `0x74` left over from a smoke test) and ETag `E1`
- **AND** local Dexie has valid M1 data
- **WHEN** the engine calls `pushBundle(...)` for `m1`
- **THEN** the first PUT with `If-None-Match: *` SHALL return HTTP 412 PreconditionFailed
- **AND** the engine SHALL fetch the existing blob via GET, observe that gunzip fails, AND still extract ETag `E1` from the GET response headers
- **AND** the engine SHALL retry PUT with `If-Match: E1` carrying the locally-built valid snapshot body
- **AND** R2 SHALL respond 200 OK with a new ETag `E2`
- **AND** the engine SHALL update its local ETag cache to `E2` and return `{ etag: E2, bytes: <gz size>, attempts: 2 }`
- **AND** the engine SHALL emit `console.info('[sync:pushR2:m1] recovered from corrupt blob via overwrite ...')`

#### Scenario: Recovery does not apply corrupt blob contents to local Dexie

- **GIVEN** the corrupt-blob recovery scenario above
- **WHEN** the engine handles the 412 → corrupt-gunzip case
- **THEN** the engine SHALL NOT call `applyBundleSnapshot` or any equivalent local-write path with the corrupt blob's body
- **AND** the local Dexie state SHALL be identical before and after the recovery (no rows added, modified, or deleted)

#### Scenario: Concurrent writer after corrupt-blob recovery surfaces a distinct error

- **GIVEN** an authed session attempting recovery from a corrupt blob (as in scenarios above)
- **AND** between the engine's GET (which extracted ETag `E1`) and the engine's PUT retry, a real second client successfully wrote to the same key, updating its ETag to `E2`
- **WHEN** the engine's `If-Match: E1` PUT executes
- **THEN** R2 SHALL respond HTTP 412 again (different cause: concurrent write, not corrupt blob)
- **AND** the engine SHALL re-enter the pull-merge-retry loop normally; the now-valid pulled blob SHALL be applied to local Dexie per the standard LWW path
- **AND** if the configured retry budget exhausts before success, the engine SHALL throw `r2_blob_concurrent_writer_exhausted` (not `r2_push_exhausted: Failed to fetch`)

#### Scenario: Real network failure preserves its underlying error message

- **GIVEN** an authed session attempting a push with no corrupt-blob involvement
- **WHEN** the underlying `fetch` call throws a real network error (e.g., CORS preflight rejected, DNS failure, offline)
- **THEN** the engine SHALL preserve the underlying error message in the thrown exception, formatted as `r2_push_exhausted: <original error>` (so CORS misconfigurations remain identifiable in logs)
- **AND** the engine SHALL NOT mask the network error with the corrupt-blob recovery messages
