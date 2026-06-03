## MODIFIED Requirements

### Requirement: neurons-tw cloud sync SHALL use an isolated R2 bundle, separate from m1 / m2 / bookmarks

The neurons-tw sync engine SHALL push and pull its state to the R2 bucket `study-rpg-state` using bundle key `users/<user_id>/neurons-snapshot.json.gz`. This key MUST NOT overlap with the existing bundles `m1-snapshot.json.gz`, `m2-snapshot.json.gz`, or `bookmarks-snapshot.json.gz`.

The bundle's internal JSON schema SHALL include `schema_version` (starting at 1, current = 2) and a serialized snapshot of every neurons-tw Dexie table that participates in cross-device sync.

The bundle reader SHALL be tolerant of `schema_version` values higher than the current client's `SCHEMA_VERSION`: when a client receives a bundle with `schema_version > SCHEMA_VERSION`, it SHALL log an informational message (`[sync] bundle schema_version newer than client; unknown fields will be dropped`) and continue parsing — the parser MUST NOT throw on this case. Unknown top-level fields in the bundle SHALL be silently dropped. Bundles with `schema_version < 1` SHALL still be rejected (defends against corrupt or truncated bundles).

The sync engine SHALL NOT read from or write to any non-neurons bundle (m1 / m2 / bookmarks). Cross-app data flow is explicitly disallowed per `neurons-mode` Req 4.

The sync engine SHALL go directly to R2-only mode (no Supabase dual-write transitional phase), since neurons-tw has no legacy users to migrate.

#### Scenario: Push writes to neurons bundle only

- **GIVEN** a signed-in player makes a Dexie write that participates in sync (e.g., a quiz correct answer that updates `connectome` and `meta` tables)
- **WHEN** the sync engine debounce window elapses and push fires
- **THEN** the resulting R2 PUT SHALL target key `users/<user_id>/neurons-snapshot.json.gz`
- **AND** the same push event SHALL NOT issue PUT requests against any `m1-snapshot.json.gz`, `m2-snapshot.json.gz`, or `bookmarks-snapshot.json.gz` key

#### Scenario: Pull reads neurons bundle only

- **GIVEN** a signed-in player opens neurons-tw on a second device
- **WHEN** the sync engine initial pull runs
- **THEN** the resulting R2 GET SHALL target key `users/<user_id>/neurons-snapshot.json.gz`
- **AND** the engine SHALL NOT pull `m1-snapshot.json.gz` / `m2-snapshot.json.gz` / `bookmarks-snapshot.json.gz` even if those rows exist for the same user

#### Scenario: New player has no stale bundle on first sign-in

- **GIVEN** a player who has existing rows in m1 / m2 / bookmarks bundles but has never used neurons-tw
- **WHEN** the player signs into neurons-tw for the first time
- **THEN** the sync engine initial pull SHALL receive a 404 for `users/<user_id>/neurons-snapshot.json.gz`
- **AND** the engine SHALL initialize as fresh-start, NOT migrate from m1 / m2 / bookmarks
- **AND** no MigrationBanner / MigrationUploadPrompt / ConflictChooserModal SHALL be displayed (none of these components exist in neurons-tw)

#### Scenario: Bundle schema_version is set on first push (current = 2)

- **GIVEN** a fresh-start player makes their first sync push
- **WHEN** the bundle is serialized to R2
- **THEN** the bundle JSON SHALL contain `"schema_version": 2` at the top level

#### Scenario: v1 client reads v2 bundle without throwing

- **GIVEN** a client running an older build with `SCHEMA_VERSION = 1`
- **WHEN** the client pulls a bundle with `schema_version = 2` (which includes new optional `dmn-*` fields)
- **THEN** the bundle reader SHALL NOT throw
- **AND** the reader SHALL log an informational message indicating unknown fields will be dropped
- **AND** the reader SHALL successfully parse and apply the v1-compatible subset of the bundle (e.g., `connectome`, `neuronVariants`, `achievements`, `leaderboardProfile`)
- **AND** the `dmn-*` fields SHALL be silently dropped — not surfaced to the v1 client's app state, not written to the v1 client's Dexie

#### Scenario: v2 client reads v1 bundle and uses defaults for missing dmn-* fields

- **GIVEN** a client running the new build with `SCHEMA_VERSION = 2`
- **WHEN** the client pulls a bundle with `schema_version = 1` (no `dmn-*` fields present)
- **THEN** the bundle reader SHALL NOT throw
- **AND** the reader SHALL apply the v1 fields normally
- **AND** missing `dmn-*` fields SHALL be treated as preserve-on-omission: local Dexie `dmnCards` / `dmnEventLog` / `dmnActiveBuffs` SHALL retain their existing values (or remain empty if none) — they SHALL NOT be overwritten with empty arrays

#### Scenario: Bundle with schema_version < 1 is still rejected

- **GIVEN** a corrupted or hand-crafted bundle with `schema_version = 0`
- **WHEN** the bundle reader attempts to parse it
- **THEN** the reader SHALL throw `Error('invalid_schema_version')`
- **AND** the sync engine SHALL surface the error rather than silently parsing garbage
