# dexie-schema-guards Specification

## Purpose

Defines the cohesive cluster of guards that keep Dexie-driven sync paths safe as schemas evolve. The 2026-05-26 `add-doctor-retire-cloud-resurrection` prod incident (Dexie 4.x `.upgrade()` cannot change primary key — broke `med-study-rpg.com/2nd/` + `fireman333.github.io/study-rpg/hospital/` for every existing v18 user; required emergency revert) demonstrated that Vitest with `fake-indexeddb` and local Chrome MCP smoke both miss the upgrade path when tests start fresh at version N instead of seeding v(N-1) first. This capability mechanizes the rule documented in `~/.claude/imports/dexie_pk_change_pitfall.md` so the rule cannot be silently skipped: every `.version(N)` declaration that lands on `main` MUST be accompanied by a sibling `__tests__/upgrade-v<N>.test.ts` fixture that exercises the upgrade path from v(N-1), and CI fails the PR with an actionable error message if the fixture is missing.

Beyond the CI lint, this capability also owns the Worker-side R2 schema-version (SV) downgrade guard implemented in `cloudflare/sync-worker/src/presign.ts` and documented in `docs/DEXIE_UPGRADE_FIXTURE_RULE.md`. The CI lint catches missing upgrade fixtures at PR time; the Worker enforcement catches an older client (stale tab, unrefreshed PWA, post-rollback build) trying to PUT a lower-`schema_version` bundle over a newer cloud blob at runtime — refusing the write at the `/presign` mint step and binding `x-amz-meta-schema-version` into the SigV4 signed-header envelope so R2 itself rejects any tampered PUT. Together the two layers form a cohesive set of rules about how Dexie schemas evolve safely: design-time fixture coverage + runtime cloud-side downgrade refusal.

## Requirements

### Requirement: Schema version bumps require Vitest upgrade fixture

When a pull request or push to `main` introduces a new `.version(N)` declaration to any Dexie schema file in the monorepo (anywhere under `apps/**/*.ts` or `packages/**/*.ts` containing both `this.version(` and `.stores(`), the change SHALL be accompanied by a Vitest fixture in the schema's sibling `__tests__/` directory that opens an explicit `v(N-1)` Dexie instance with representative seed data, then reopens with the full schema chain and asserts `.open()` does not throw.

The CI workflow `dexie-fixture-lint` SHALL detect missing fixtures by comparing the schema file's `.version()` set in the head ref against the base ref, and SHALL fail with a clear error message naming the schema file, the new version, the expected test directory, and the path to the canonical pattern reference.

The lint check SHALL accept the bypass environment variable `SKIP_DEXIE_FIXTURE_LINT=1` for emergency overrides, but SHALL emit a prominent banner to stderr in such cases so that the bypass is visible in CI logs.

#### Scenario: Schema bump with matching fixture passes the lint

- **GIVEN** the head ref adds `this.version(21).stores({ retirementLog: '++id, retiredAt, doctorId, _updatedAt' })` to `apps/medexam2-hospital-tw/src/db/schema.ts`
- **AND** the head ref adds a file `apps/medexam2-hospital-tw/src/__tests__/upgrade-v21.test.ts` containing the literal text `dbV20.version(20).stores(`
- **WHEN** the lint script runs with `BASE_REF=origin/main HEAD_REF=HEAD`
- **THEN** the script SHALL exit 0
- **AND** stdout SHALL include the line `[lint:dexie] apps/medexam2-hospital-tw/src/db/schema.ts v20 → v21: fixture FOUND`

#### Scenario: Schema bump without matching fixture fails the lint

- **GIVEN** the head ref adds `this.version(21).stores({ ... })` to `apps/medexam2-hospital-tw/src/db/schema.ts`
- **AND** no test file under `apps/medexam2-hospital-tw/src/__tests__/` contains the literal text `.version(20).stores(`
- **WHEN** the lint script runs with `BASE_REF=origin/main HEAD_REF=HEAD`
- **THEN** the script SHALL exit 1
- **AND** stderr SHALL include a `::error::` annotation naming the schema file, the new version, and the expected test directory
- **AND** stderr SHALL include a link or reference to `docs/DEXIE_UPGRADE_FIXTURE_RULE.md`

#### Scenario: PR with no schema change passes the lint

- **GIVEN** a PR that edits TypeScript source files under `apps/**` or `packages/**` but does not modify any `this.version(` declaration
- **WHEN** the lint script runs with `BASE_REF=<pr.base.sha> HEAD_REF=<pr.head.sha>`
- **THEN** the script SHALL exit 0
- **AND** stdout SHALL include `[lint:dexie] OK`

#### Scenario: Bypass via environment variable produces visible banner

- **GIVEN** the head ref adds `this.version(99).stores({ ... })` without a fixture
- **WHEN** the lint script runs with `SKIP_DEXIE_FIXTURE_LINT=1`
- **THEN** the script SHALL exit 0
- **AND** stderr SHALL include a banner of at least 3 lines containing the phrase `BYPASS` or `SKIP` in uppercase
- **AND** the banner SHALL reference the follow-up obligation to either add the fixture or fix the lint regex

#### Scenario: Newly added schema file with v1 only does not require a v0 fixture

- **GIVEN** the head ref adds a brand-new schema file `apps/new-app/src/db/schema.ts` containing only `this.version(1).stores({ ... })`
- **WHEN** the lint script runs
- **THEN** the script SHALL exit 0 (v0 is not a real Dexie version; baseline schemas need no upgrade fixture)

### Requirement: Lint script is invokable locally via pnpm

The root `package.json` SHALL expose a script alias `lint:dexie-fixtures` that invokes `scripts/lint-dexie-fixtures.sh` with sensible defaults (`BASE_REF=origin/main HEAD_REF=HEAD`).

#### Scenario: Local invocation produces the same verdict as CI

- **GIVEN** the working tree is in the same state as a hypothetical PR head
- **WHEN** the developer runs `pnpm lint:dexie-fixtures`
- **THEN** the script SHALL produce the same exit code and message as the CI workflow would for the equivalent PR

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
