# cloud-sync (delta)

## ADDED Requirements

### Requirement: PUT presigns SHALL be server-side rate-limited per user and bundle

The presigner Worker SHALL bound the rate at which it mints PUT presigned URLs for a given `(user, bundle)` pair, so that account-wide R2 `PutObject` cost is capped regardless of client bundle version or client-side push behaviour. When the rate exceeds the configured cap (default 10 per 60 seconds), the Worker SHALL refuse the presign with HTTP 429 and SHALL NOT mint a URL, so no R2 `PutObject` results from a throttled request. The rate-limit check SHALL run before any R2 operation (e.g. the schema-version HEAD) so a throttled request incurs no R2 cost. The limiter SHALL fail open: if the rate-limit binding errors, the Worker SHALL log and allow the presign rather than block a legitimate write. This requirement is mechanism-agnostic with respect to the underlying limiter implementation.

#### Scenario: A storming client is capped server-side

- **GIVEN** a client that requests PUT presigns for one `(user, bundle)` far above the configured cap
- **WHEN** its request rate exceeds the cap
- **THEN** the Worker SHALL return 429 and mint no presigned URL
- **AND** no R2 `PutObject` SHALL result from the throttled requests
- **AND** the sustained R2 `PutObject` rate for that `(user, bundle)` SHALL not exceed the configured cap

#### Scenario: Legitimate sync is unaffected

- **GIVEN** a normally active client pushing within the cap (e.g. ~6 PUT/min/bundle on the debounce cadence)
- **WHEN** it requests PUT presigns
- **THEN** the Worker SHALL mint URLs normally (no 429)
- **AND** IndexedDB-source-of-truth state SHALL still mirror to the cloud

#### Scenario: Limiter fault does not block writes

- **GIVEN** the rate-limit binding raises an error on a PUT presign request
- **WHEN** the Worker handles that error
- **THEN** it SHALL log the fault and still mint the presigned URL (fail open)

### Requirement: PUT presign TTL SHALL be short enough to force a fresh presign per write

The Worker SHALL issue PUT presigned URLs with a TTL shorter than the client's presigned-URL cache reuse margin (currently 60 seconds), so that the client re-requests a presign on every PUT and each PUT is therefore subject to the server-side rate limit. GET presigns are exempt and MAY keep a longer TTL, since read URLs are cheap and benefit from client caching. The PUT TTL SHALL remain long enough to complete a single PUT round-trip for a normal bundle payload.

#### Scenario: Cached PUT URL cannot bypass the rate limit

- **GIVEN** a client that caches a presigned URL while `expiresAt - 60_000 > now`
- **WHEN** the Worker issues PUT presigns with a TTL below that 60-second margin
- **THEN** the client's cache check SHALL fail on the next PUT
- **AND** the client SHALL re-request a presign, routing every PUT through the server-side rate limit
