# dexie-schema-guards Specification — Delta

## ADDED Requirements

### Requirement: Worker /presign endpoint validates schema_version against R2 customMetadata

When a client sends `op: "put"` with a `schema_version` field (positive integer) in the `/presign` request body, the Worker SHALL HEAD the corresponding R2 blob via `env.R2_PRIMARY.head(key)`, extract the existing blob's `customMetadata['schema-version']` (falling back to `customMetadata['schema_version']` for compatibility), parse it to an integer, and compare against the client-declared `schema_version`. If the client value is strictly less than the existing value, the Worker SHALL refuse to mint a presigned URL and SHALL return HTTP 409 with body `{ error: "r2_schema_downgrade_refused", cloud: <existing>, incoming: <client>, bundle: <bundle>, key: <key> }`.

Pre-existing blobs with no `customMetadata` SHALL be treated as `existing schema_version = 0` so that the first PUT after this change ships succeeds for every user without manual backfill.

When `schema_version` is absent from the request body (Phase 1 backward-compatible opt-in), the Worker SHALL skip the validation entirely and mint a presigned URL with no metadata header (preserving pre-change behaviour for in-flight legacy clients). The Worker SHALL reject only malformed `schema_version` values (non-integer, non-positive, NaN, infinity) with HTTP 400 `{ error: "invalid_schema_version" }`.

#### Scenario: PUT with schema_version higher than existing R2 metadata is accepted

- **GIVEN** the R2 blob at `users/<user>/m2-snapshot.json.gz` exists with `customMetadata['schema-version'] = "4"`
- **WHEN** the client POSTs to `/presign` with body `{ bundle: "m2", op: "put", schema_version: 5 }`
- **THEN** the Worker SHALL return HTTP 200 with a signed PUT URL
- **AND** the response body SHALL include `requiredHeaders: { "x-amz-meta-schema-version": "5" }`

#### Scenario: PUT with schema_version equal to existing R2 metadata is accepted

- **GIVEN** the R2 blob at `users/<user>/m2-snapshot.json.gz` exists with `customMetadata['schema-version'] = "4"`
- **WHEN** the client POSTs to `/presign` with body `{ bundle: "m2", op: "put", schema_version: 4 }`
- **THEN** the Worker SHALL return HTTP 200 with a signed PUT URL
- **AND** the response body SHALL include `requiredHeaders: { "x-amz-meta-schema-version": "4" }`

#### Scenario: PUT with schema_version lower than existing R2 metadata is refused

- **GIVEN** the R2 blob at `users/<user>/m2-snapshot.json.gz` exists with `customMetadata['schema-version'] = "4"`
- **WHEN** the client POSTs to `/presign` with body `{ bundle: "m2", op: "put", schema_version: 3 }`
- **THEN** the Worker SHALL return HTTP 409
- **AND** the response body SHALL include `{ error: "r2_schema_downgrade_refused", cloud: 4, incoming: 3, bundle: "m2", key: "users/<user>/m2-snapshot.json.gz" }`

#### Scenario: PUT for a brand-new bundle blob (no existing R2 object) is accepted at any positive SV

- **GIVEN** the R2 blob at `users/<user>/neurons-snapshot.json.gz` does not yet exist
- **WHEN** the client POSTs to `/presign` with body `{ bundle: "neurons", op: "put", schema_version: 1 }`
- **THEN** the Worker SHALL treat existing SV as 0
- **AND** the Worker SHALL return HTTP 200 with a signed PUT URL
- **AND** the response body SHALL include `requiredHeaders: { "x-amz-meta-schema-version": "1" }`

#### Scenario: PUT for a pre-change blob without metadata is accepted (backward compat)

- **GIVEN** the R2 blob at `users/<user>/m1-snapshot.json.gz` exists from before this change (no `customMetadata['schema-version']`)
- **WHEN** the client POSTs to `/presign` with body `{ bundle: "m1", op: "put", schema_version: 1 }`
- **THEN** the Worker SHALL treat existing SV as 0
- **AND** the Worker SHALL return HTTP 200 with a signed PUT URL

#### Scenario: PUT presign body omitting schema_version is accepted with no metadata header (Phase 1 opt-in)

- **GIVEN** a legacy client that does not include `schema_version` in the presign body
- **WHEN** the client POSTs to `/presign` with body `{ bundle: "m2", op: "put" }`
- **THEN** the Worker SHALL skip the SV validation entirely
- **AND** the Worker SHALL return HTTP 200 with a signed PUT URL
- **AND** the response body SHALL NOT include any `requiredHeaders` field (or SHALL include an empty `requiredHeaders: {}`)

#### Scenario: PUT with malformed schema_version is rejected with 400

- **WHEN** the client POSTs to `/presign` with body `{ bundle: "m2", op: "put", schema_version: -1 }` or `{ ..., schema_version: "four" }` or `{ ..., schema_version: 0 }`
- **THEN** the Worker SHALL return HTTP 400
- **AND** the response body SHALL include `{ error: "invalid_schema_version" }`

#### Scenario: GET op ignores schema_version field

- **WHEN** the client POSTs to `/presign` with body `{ bundle: "m2", op: "get", schema_version: 99 }`
- **THEN** the Worker SHALL NOT validate `schema_version` (read path unaffected)
- **AND** the Worker SHALL return HTTP 200 with a signed GET URL with no metadata header constraint

### Requirement: Presigned PUT URL binds x-amz-meta-schema-version into signature scope

When the Worker mints a presigned PUT URL for a request that supplied a valid `schema_version`, the URL signature SHALL include `x-amz-meta-schema-version` in the `X-Amz-SignedHeaders` query parameter, with the value set to the client-declared `schema_version` (stringified). The R2 SigV4 verification SHALL reject any client PUT that omits the header, sends it with a different value, or sends additional unsigned headers that conflict with the signed envelope.

#### Scenario: Client honouring signed header lands the PUT

- **GIVEN** the Worker has minted a presigned PUT URL with `x-amz-meta-schema-version: "5"` in signed headers
- **WHEN** the client PUTs the bundle body to the URL with HTTP header `x-amz-meta-schema-version: 5`
- **THEN** R2 SHALL accept the upload (HTTP 200)
- **AND** the resulting R2 blob SHALL have `customMetadata['schema-version'] = "5"`

#### Scenario: Client omitting the signed header gets SigV4 rejection from R2

- **GIVEN** the Worker has minted a presigned PUT URL with `x-amz-meta-schema-version: "5"` in signed headers
- **WHEN** the client PUTs the bundle body to the URL without the `x-amz-meta-schema-version` header
- **THEN** R2 SHALL reject the upload with HTTP 403 SignatureDoesNotMatch (or equivalent)

#### Scenario: Client sending divergent header value gets SigV4 rejection

- **GIVEN** the Worker has minted a presigned PUT URL with `x-amz-meta-schema-version: "5"` in signed headers
- **WHEN** the client PUTs the bundle body to the URL with HTTP header `x-amz-meta-schema-version: 3` (tampered)
- **THEN** R2 SHALL reject the upload with HTTP 403 SignatureDoesNotMatch

### Requirement: Client write path sends schema_version in /presign body and PUT header

The R2 client adapter in each app (`apps/medexam-tw/src/lib/sync/r2/`, `apps/medexam2-hospital-tw/src/lib/sync/r2/`, `apps/neurons-tw/src/lib/sync/r2/`) SHALL include `schema_version: snapshot.meta.schema_version` in the `/presign` request body when the requested op is `put`. When the Worker returns a `requiredHeaders` object in the response, the client SHALL merge those headers into the subsequent fetch PUT to R2. On HTTP 409 response from the Worker, the client SHALL throw an error with code `r2_schema_downgrade_refused_by_server` (named distinctly from the existing client-side `r2_schema_downgrade_refused` so logs and telemetry can distinguish the two enforcement layers).

#### Scenario: Honest client push round-trip succeeds with signed metadata header

- **WHEN** the m2 sync engine calls `pushBundle('m2', snapshot)` with `snapshot.meta.schema_version === 4`
- **THEN** the client SHALL POST `/presign` with `{ bundle: "m2", op: "put", schema_version: 4 }`
- **AND** the resulting PUT request to R2 SHALL include header `x-amz-meta-schema-version: 4`
- **AND** the resulting R2 blob SHALL have `customMetadata['schema-version'] = "4"`

#### Scenario: Client receiving 409 from Worker throws downgrade-refused-by-server

- **GIVEN** the m2 sync engine attempts to push a snapshot with `schema_version === 3`
- **AND** the user's existing R2 m2 blob has `customMetadata['schema-version'] = "4"`
- **WHEN** the client POSTs to `/presign`
- **THEN** the client SHALL receive HTTP 409 with the Worker's error body
- **AND** the client SHALL throw an error containing the substring `r2_schema_downgrade_refused_by_server`
- **AND** the client SHALL NOT attempt the PUT to R2 (no signed URL was issued)
