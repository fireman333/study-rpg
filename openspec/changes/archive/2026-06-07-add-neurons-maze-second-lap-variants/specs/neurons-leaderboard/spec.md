## MODIFIED Requirements

### Requirement: Worker upsert endpoint SHALL accept all neurons leaderboard fields with sanity bounds and LWW

The Worker `POST /leaderboard/neurons/upsert` endpoint SHALL enforce last-write-wins semantics using `updated_at` (millisecond epoch) and SHALL reject payloads whose values fall outside known sanity bounds:

- `variant_count ∈ [0, NEURON_VARIANT_TOTAL]` (the current catalog total; raised from the prior 110 bound to the second-lap-expanded total by this change — second-lap location variants are distinct collectibles that count toward `variant_count`)
- `total_AP ≥ 0`
- `synapse_strong ≥ 0`
- `total_study_min ≥ 0`
- `total_settles ≥ 0` (finite integer)
- `nickname` length 2-12 codepoints, matches stored regex (basic anti-injection: no control chars, no leading/trailing whitespace)
- `badges_csv` (when present) matches `^([a-z]+:P[1-4])(,[a-z]+:P[1-4]){0,5}$` (mirror 二階 pattern, ≤ 6 entries, ≤ 60 chars)

The `family_complete` field SHALL NO LONGER be validated, sorted, or required; if present in a legacy payload it SHALL be ignored (not written). The endpoint SHALL touch only the neurons code path (`/leaderboard/neurons/*`, `leaderboard_neurons` table, `leaderboard:neurons:top100:*` KV); the 二階 `leaderboard_m2` path SHALL be unchanged. Rejected payloads SHALL log a structured warning but MUST NOT surface a UI error to the player (silent server-side filtering, mirror 二階 pattern). The D1 table SHALL declare `CHECK` constraints matching every numeric sanity bound as defence-in-depth (including `variant_count BETWEEN 0 AND <NEURON_VARIANT_TOTAL>` and `total_settles >= 0`); raising the `variant_count` CHECK SHALL be applied via the Cloudflare dashboard / per-statement `--command` and recorded in `d1_migrations` (wrangler 4.x rejects the multi-statement table-recreate). The Worker bound SHALL be redeployed before any client can send `variant_count` above the prior 110 bound.

The request MUST be authenticated (Supabase JWT in `Authorization: Bearer <token>` header). The Worker SHALL verify the JWT via the existing JWKS endpoint reused from `leaderboard.ts`. The `user_id` SHALL be derived from the JWT `sub` claim, NOT from the request body.

#### Scenario: Older updated_at rejected

- **WHEN** an upsert arrives with `updated_at` older than the existing D1 row's `updated_at`
- **THEN** the Worker SHALL leave the existing row unchanged and respond `200 OK` (avoid client retry storm)

#### Scenario: variant_count up to the expanded catalog total is accepted

- **WHEN** an upsert arrives with `variant_count = NEURON_VARIANT_TOTAL` (a fully-collected player on the expanded catalog)
- **THEN** the Worker SHALL accept it (within the `[0, NEURON_VARIANT_TOTAL]` bound) and the D1 `CHECK` SHALL NOT reject it

#### Scenario: Out-of-bounds variant_count rejected at the expanded bound

- **WHEN** an upsert arrives with `variant_count = NEURON_VARIANT_TOTAL + 1` or `variant_count = -1`
- **THEN** the Worker SHALL discard the upsert, log a structured warning with the offending user_id, and respond `200 OK` with `dropped: "variant_count_oob"` without writing to D1

#### Scenario: Negative total_settles rejected

- **WHEN** an upsert arrives with `total_settles = -1` or a non-finite value
- **THEN** the Worker SHALL discard the upsert, log a structured warning, and respond `200 OK` with `dropped: "total_settles_oob"` without writing to D1

#### Scenario: Legacy family_complete field is ignored

- **WHEN** an upsert arrives carrying a `family_complete` value (from an old client)
- **THEN** the Worker SHALL NOT validate or persist it as a ranking signal and SHALL still accept the rest of the payload (no rejection on its account)

#### Scenario: Missing JWT rejected with 401

- **WHEN** the endpoint receives a request without a valid Supabase JWT in the Authorization header
- **THEN** the Worker SHALL respond `401 Unauthorized` without executing any D1 query

#### Scenario: user_id derived from JWT, not body

- **GIVEN** a request body containing `user_id: "evil-attacker-uuid"` but a valid JWT for `sub: "real-player-uuid"`
- **WHEN** the upsert endpoint processes the request
- **THEN** the D1 row SHALL be written with `user_id = "real-player-uuid"` (from JWT)
- **AND** the `user_id` value in the request body SHALL be ignored
