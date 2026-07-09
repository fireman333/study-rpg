## MODIFIED Requirements

### Requirement: Synced meta set SHALL admit a prefix-matched key family for dynamic keepsakes

The synced-meta membership test SHALL admit, in addition to the enumerated `SYNCED_META_KEYS` allowlist, keys matching a small set of explicit **registered key-family matchers** — prefix (or prefix + date-window) tests introduced for dynamic key families that cannot be enumerated: the NG-0717 lineage imprints (`prescription:v1:ng0717:imprint:`, subject × date), the prescription daily-quest families (`prescription:v1:{plan,wrong,breadth,completed,reward,cramRescue,wire,tierClaim}:…`, date-keyed, per the `neurons-daily-prescription` daily-state sync requirement), and the rescue family (**per-family plans `rescue:v1:plan:{familyId}`** plus the run-scoped `rescue:v1:{conf,ovr}:{planCreatedAt}:{familyId}:…` keys within a trailing run-sync window, per the `neurons-single-subject-rescue` rescue key-family requirement). Both the `metaAdapter` snapshot (which rows enter the bundle) and its apply (which incoming rows are accepted) SHALL use the SAME membership test (allowlist OR registered matcher), so the two directions never diverge. A matcher SHALL be specific enough to match ONLY its intended key family and SHALL NOT capture sibling keys under a shared ancestor namespace (e.g. the prescription daily-state matcher SHALL NOT match `prescription:v1:lightsOut:` or `prescription:v1:localSeed`, which stay local-only; the imprint prefix SHALL NOT match the daily-state families; the rescue matcher SHALL NOT match any `rescue:v1:*` key other than per-family `plan:{familyId}` and in-window `conf:`/`ovr:` keys — rescue telemetry stays device-local).

A registered key family SHALL satisfy ONE of two merge contracts:

- **(a) Write-once presence keys**, merged by the metaAdapter's existing first-write-wins rule — where first-write-wins equals a UNION (e.g. imprints; the prescription `wrong` / `breadth` / `completed` / `reward` / `cramRescue` / `wire` / `tierClaim` families); or
- **(b) A family with a registered backfill post-pass that defines its merge**, run on pull completion — e.g. the prescription `plan:{date}` family, whose earliest-createdAt-wins MIN-LWW is enforced by `backfill/prescription-plan.ts`, and the rescue family, whose **per-family** latest-action-wins envelope LWW (each `rescue:v1:plan:{familyId}`, explicit-null clears) and per-key LWW (`conf:` on `at`, `ovr:` on `setAt`) are enforced by `backfill/rescue.ts` (iterating every incoming `rescue:v1:plan:*` key); for such a family the metaAdapter's first-write-wins is only a transport default that the post-pass deterministically reconciles.

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

#### Scenario: The rescue post-pass family converges deterministically per family in any pull order
- **WHEN** two devices hold divergent `rescue:v1:plan:{familyId}` envelopes for the same family (or divergent `conf:`/`ovr:` records for the same key) and pulls happen in either order
- **THEN** the `backfill/rescue.ts` post-pass SHALL converge both devices — for each family the envelope with the greater `updatedAt` wins (explicit-null envelopes included; ties broken by a deterministic total order over the serialized value), and each `conf:`/`ovr:` key resolves to the record with the greater `at`/`setAt` — never leaving the transport's first-write-wins as the final state for that family
- **AND** two devices each holding an active plan for a DIFFERENT family SHALL converge to holding BOTH plans (distinct keys, no mutual overwrite)

## ADDED Requirements

### Requirement: A schema-downgrade push rejection SHALL surface a one-time reload prompt

WHEN a bundle push is refused by the Worker's schema-version downgrade guard (the presign returns 409 because the client's `schema_version` is lower than the cloud blob's — i.e. a stale tab running a pre-bump build after a newer-schema bundle has landed), the client SHALL surface a **one-time "有新版本，請重新整理" prompt** rather than silently retrying. This is required because rescue mode writes on every confidence tap, so a stale tab that keeps 409-ing generates a heavy presign/409 stream; the prompt cuts the loop at its source (a reload loads the new build, whose push carries the current schema version). The prompt SHALL fire at most once per stale session (it SHALL NOT re-fire on every dirty cycle), and the sync status light SHALL still reflect the unresolved state (🔴) until the reload.

#### Scenario: Stale tab against a newer schema gets a reload prompt, not a silent loop
- **GIVEN** a tab running a pre-bump build whose pushes are 409-refused because a newer-schema bundle is in the cloud
- **WHEN** the client's push is rejected with the schema-downgrade error
- **THEN** it SHALL surface a one-time "有新版本，請重新整理" prompt and SHALL NOT re-fire it on every subsequent dirty cycle
- **AND** the header sync light SHALL remain 🔴 until the app is reloaded
