## ADDED Requirements

### Requirement: Multi-table singleton adapters SHALL install Dexie hooks on every contributing table

A `TableAdapter` whose `snapshotDirty()` / `snapshotAll()` reads from more than one Dexie table (i.e. its snapshot aggregates rows from multiple local tables into a single cloud blob) SHALL declare every additional contributing table in an optional `extraDexieTables: readonly string[]` field. The sync engine SHALL install identical `creating` / `updating` / `deleting` hooks on **every** table in `[adapter.dexieTable, ...adapter.extraDexieTables ?? []]`. Every hooked table SHALL call `markDirty` under the canonical `adapter.dexieTable` key (not the actual mutated table name), so the dirty marker stays singular per adapter and the existing `snapshotDirty` / `clear()` paths require no modification.

The engine SHALL detect overlap at construction time: if any Dexie table name appears in `[adapter.dexieTable, ...adapter.extraDexieTables ?? []]` for two or more adapters within the same engine instance, engine construction SHALL throw a descriptive error in DEV builds. Prod builds MAY choose to log a warning and continue, since accidental overlap stacks hooks redundantly but does not corrupt data.

Adapters with a single contributing Dexie table SHALL leave `extraDexieTables` unset (or empty); the engine SHALL treat the field as defaulting to an empty array.

The `applyingFromCloud` echo-prevention gate inside each hook callback SHALL be unchanged. Hook callbacks for extra tables SHALL exercise the same gate: when `applyingFromCloud === true` (i.e. a pull is writing back the canonical singleton blob via `writeHospitalStateBlob` or equivalent), no dirty marker SHALL be emitted and no `_updatedAt` SHALL be stamped.

#### Scenario: HOSPITAL_STATE write to a passenger table fires push within debounce window

- **GIVEN** an authed 二階 session with `globalThis.__sync.getStatus() === 'idle'`
- **AND** `HOSPITAL_STATE.extraDexieTables` contains `'rooms'`
- **WHEN** `services/facility.ts` calls `db.rooms.put({ ...room, facilityLevel: nextLevel, roomFacility: newMultiplier })`
- **AND** no other table is touched in the same debounce window
- **THEN** within `debounceMs` (default 3000) the engine SHALL call `pushNow()` once
- **AND** the upserted `hospital_state` cloud row's `data.rooms[<roomId>].facilityLevel` SHALL equal `nextLevel`

#### Scenario: Burst writes across multiple passenger tables coalesce into one push

- **GIVEN** the same authed session
- **WHEN** within 100 ms the app writes to `rooms` (facility upgrade), `tickets` (gacha spend), and `gachaStats` (pity update)
- **THEN** the engine SHALL schedule exactly one debounced push
- **AND** the push SHALL upsert a single `hospital_state` row whose `data` blob reflects all three writes

#### Scenario: Echo-prevention prevents pull-applied passenger writes from re-pushing

- **GIVEN** an in-flight `pullNow` has set `applyingFromCloud = true`
- **WHEN** `writeHospitalStateBlob` calls `db.rooms.bulkPut(...)`, `db.tickets.put(...)`, `db.gachaStats.put(...)`, `db.affinity.bulkPut(...)` inside the apply transaction
- **THEN** no dirty marker SHALL be added for the `HOSPITAL_STATE` adapter
- **AND** no debounced push SHALL be scheduled as a side effect of the apply

#### Scenario: Engine rejects adapter list with duplicate Dexie tables

- **GIVEN** two adapters A and B in the same `adapters` array
- **AND** A has `dexieTable: 'rooms'`
- **AND** B has `extraDexieTables: ['rooms']`
- **WHEN** `createSyncEngine({ adapters: [A, B], ... })` runs in DEV
- **THEN** the call SHALL throw an error naming `'rooms'` as the conflicting table
- **AND** the error message SHALL identify both A's `postgresTable` and B's `postgresTable`

### Requirement: Tab-close / network drop SHALL NOT lose unpushed singleton-passenger writes any more than other synced writes

For any write to a Dexie table contributing to a singleton adapter's snapshot (whether the canonical `dexieTable` or any entry in `extraDexieTables`), the dirty-marker timing relative to tab close, network drop, and visibility-pull SHALL be identical to a write against a single-table adapter. The push SHALL be enqueued at write time (not at next tick / next cron / next user action), so the existing offline-queue requirement applies symmetrically.

This requirement strengthens the existing **Debounced auto-push on local writes** requirement: every IndexedDB mutation to a synced table — including passenger tables of multi-table singleton adapters — SHALL enqueue a debounced cloud push at the time of the write.

#### Scenario: Facility upgrade survives tab close after debounce flush

- **GIVEN** an authed 二階 session, no active study session
- **WHEN** the user clicks "升級設施" on `outpatient-1`, raising its `facilityLevel` from L0 to L0+1
- **AND** the debounce window (default 3000 ms) elapses without further writes, allowing the engine to flush the push
- **AND** after the flush completes, the user closes the browser tab
- **AND** the user later reopens the tab (same browser session or cold-start re-auth)
- **THEN** `db.rooms.get('outpatient-1').facilityLevel` SHALL equal L0+1
- **AND** the cloud `hospital_state.data.rooms` row for `outpatient-1` SHALL also reflect L0+1

Sub-debounce tab close (close < 3000 ms after click, before flush fires) falls under the same pre-existing failure mode as any unpushed Dexie write under cold-start force-pull (handled by the local-backup safety net in `services/snapshot.ts`); the contract here is parity with other synced tables, not stronger guarantees.

#### Scenario: Cross-device pull preserves uncommitted facility upgrade

- **GIVEN** device A and device B both signed into the same account
- **AND** device B last pushed `hospital_state` 10 minutes ago with `rooms.outpatient-1.facilityLevel = L0`
- **WHEN** device A upgrades `outpatient-1` to L0+1
- **AND** within 500 ms of the upgrade, device B's tab returns to focus and triggers a visibility-pull
- **THEN** the debounced push from device A SHALL fire before device B's pull resolves OR after; in either order, **device A's `db.rooms.get('outpatient-1').facilityLevel` SHALL remain L0+1**
- **AND** within one push/pull cycle, both devices SHALL converge on L0+1
