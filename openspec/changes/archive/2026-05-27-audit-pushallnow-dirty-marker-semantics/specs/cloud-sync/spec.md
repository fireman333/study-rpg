# cloud-sync Specification — Delta

## ADDED Requirements

### Requirement: pushAllNow clears dirty markers conditionally per adapter outcome

The `pushAllNow` engine function SHALL track success/failure on a per-adapter (Supabase) and per-bundle (R2) basis. After all push attempts have completed, the engine SHALL clear a Dexie table's `dirty.perTable[tableName]` set ONLY IF every active write backend's push for that table succeeded:

- If `backendConfig.writeSupabase` is true AND the Supabase per-adapter `pushBatch` for that table's adapter threw an error, the dirty marker SHALL NOT be cleared
- If `backendConfig.writeR2` is true AND the per-bundle `pushBundle` for any R2 bundle containing that table's adapter threw an error, the dirty marker SHALL NOT be cleared
- Only when BOTH active backends' push succeeded (or the backend is disabled by config) SHALL the engine clear the marker

This requirement does NOT apply to `pushNow` (single-table fast path), which already implements conditional clearing via an `if (allBundlesOk)` gate at the equivalent code path.

This requirement does NOT apply to `apps/neurons-tw` whose sync engine uses a different `pending: boolean` architecture without per-table dirty markers.

#### Scenario: Single adapter fails — only its dirty marker persists, others clear

- **GIVEN** an authed user with two dirty Dexie tables `gameCounters` (rows pending push) and `hospitalDoctors` (rows pending push), both wired to Supabase write
- **WHEN** `pushAllNow` is invoked AND the `pushBatch('game_counters', ...)` RPC throws (e.g. network error)
- **AND** the `pushBatch('hospital_doctors', ...)` RPC succeeds
- **THEN** after `pushAllNow` returns, `dirty.perTable.get('gameCounters')` SHALL retain its row PKs
- **AND** `dirty.perTable.get('hospitalDoctors')` SHALL be cleared (empty Set)

#### Scenario: Retry on next push succeeds — previously-failed table clears

- **GIVEN** the state at end of the previous scenario (only `gameCounters` retains dirty marker)
- **WHEN** the next `pushAllNow` invocation runs AND this time `pushBatch('game_counters', ...)` succeeds
- **THEN** after that `pushAllNow` returns, `dirty.perTable.get('gameCounters')` SHALL be cleared (empty Set)
- **AND** the engine SHALL NOT have lost any data — the rows were successfully pushed to cloud on the retry

#### Scenario: R2 bundle failure propagates to all adapters in that bundle

- **GIVEN** an authed user in R2-write mode with two R2 bundles `m2` (containing N adapters covering tables T1, T2, T3) and `bookmarks` (containing M adapters covering table T4), all with dirty rows
- **WHEN** `pushAllNow` is invoked AND `pushBundle(..., 'm2')` throws
- **AND** `pushBundle(..., 'bookmarks')` succeeds
- **THEN** after `pushAllNow` returns, `dirty.perTable.get('T1')`, `dirty.perTable.get('T2')`, `dirty.perTable.get('T3')` SHALL all retain their row PKs
- **AND** `dirty.perTable.get('T4')` SHALL be cleared (empty Set)

#### Scenario: Dual-write mode requires BOTH backends to succeed before clearing

- **GIVEN** an authed user in dual-write mode (`backendConfig.writeSupabase === true && backendConfig.writeR2 === true`) with one dirty table T that is mapped to both a Supabase adapter AND an R2 bundle adapter
- **WHEN** `pushAllNow` runs AND the Supabase `pushBatch` for T succeeds
- **AND** the R2 `pushBundle` containing T's adapter throws
- **THEN** after `pushAllNow` returns, `dirty.perTable.get('T')` SHALL retain its row PKs
- **AND** the next `pushAllNow` SHALL attempt to push T to both backends again (Supabase push being a redundant LWW write is acceptable per idempotent upsert semantics)

#### Scenario: Happy-path zero-failure behaviour unchanged

- **GIVEN** an authed user with N dirty Dexie tables (any combination, single or dual write)
- **WHEN** `pushAllNow` is invoked AND every per-adapter Supabase `pushBatch` succeeds (when writeSupabase enabled)
- **AND** every per-bundle R2 `pushBundle` succeeds (when writeR2 enabled)
- **THEN** after `pushAllNow` returns, every entry in `dirty.perTable` SHALL be a cleared Set (empty)
- **AND** the sync status SHALL transition to `idle` and the chip SHALL show 🟢「已同步」 per the existing "Sync status chip in app header" requirement
