## ADDED Requirements

### Requirement: Multi-table singleton blob apply SHALL use the max contributing-table timestamp for LWW

When applying a pulled multi-table singleton blob under the non-force LWW path, the system SHALL compare the cloud blob's `updated_at` against the **maximum** local `_updatedAt` across **all** contributing Dexie tables — NOT against a single designated table's `_updatedAt`.

This applies to any `TableAdapter` whose snapshot collapses multiple Dexie tables into one cloud blob. For 二階's `HOSPITAL_STATE` adapter the contributing tables are `gameCounters`, `gachaStats`, `tickets`, `rooms`, and `affinity`; the local comparison baseline SHALL be `max(_updatedAt)` over the `gameCounters` / `gachaStats` / `tickets` singleton rows and over every `rooms` / `affinity` row (treating absent rows as having no timestamp). The comparison SHALL match the push-side blob timestamp, which is `max(rows.updated_at)` across the same tables.

Consequently, a local write to any passenger table (`tickets`, `gachaStats`, `rooms`, `affinity`) that does NOT also write the canonical `gameCounters` table SHALL raise the blob's local comparison baseline, and SHALL NOT be reverted by a pulled cloud blob whose `updated_at` merely exceeds the canonical table's last-write timestamp.

The force-apply path (account-switch after local wipe, or explicit "use cloud" migration choice) SHALL remain unaffected: it continues to overwrite local unconditionally regardless of any local `_updatedAt`.

#### Scenario: tickets-only local write survives a stale cloud blob pull

- **GIVEN** an authed 二階 session where local `gameCounters._updatedAt = T0`
- **AND** a passenger-only write set local `tickets._updatedAt = T2` with `T2 > T0` (e.g. daily refresh or banner-unlock bonus, neither of which writes `gameCounters`)
- **AND** the pulled cloud `hospital_state` blob has `updated_at = T1` where `T0 < T1 < T2`
- **WHEN** the engine applies the cloud blob via the non-force LWW path
- **THEN** the local comparison baseline SHALL be `max(_updatedAt) = T2` (from `tickets`), not `T0`
- **AND** `cloudIsNewer(T1, T2)` SHALL be false → the cloud blob SHALL be skipped
- **AND** the local `tickets` row SHALL retain its newer value

#### Scenario: Genuinely newer cloud blob still wins

- **GIVEN** the local blob's `max(_updatedAt)` across all five contributing tables = T2
- **AND** the pulled cloud `hospital_state` blob has `updated_at = T3` with `T3 > T2`
- **WHEN** the engine applies the cloud blob via the non-force LWW path
- **THEN** `cloudIsNewer(T3, T2)` SHALL be true → the cloud blob SHALL overwrite local

#### Scenario: Force apply still overwrites unconditionally after local wipe

- **GIVEN** account switch has run `clearLocalSyncTables`, leaving all contributing tables empty (no local `_updatedAt`)
- **WHEN** the cold-start `pullAllNow({ force: true })` applies the new account's cloud blob with `force: true`
- **THEN** the LWW comparison SHALL be skipped entirely
- **AND** the cloud blob SHALL be written to local unconditionally
