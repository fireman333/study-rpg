# persistence Specification

## Purpose
TBD - created by archiving change wire-persistence-mvp. Update Purpose after archive.
## Requirements
### Requirement: Player state survives page reload

The current single-player state (`Player` snapshot keyed by `PLAYER_ID = 'p1'`) and the full `ItemInstance[]` inventory SHALL be persisted to IndexedDB via Dexie (`packages/core/src/lib/db.ts`) and restored on next page load.

#### Scenario: Reload preserves progression

- **WHEN** a player rolls loot, gains XP, and equips an item, then reloads the page
- **THEN** after the page finishes mounting, the rendered `Player.level`, `Player.xp`, `Player.stats`, `Player.equipment`, `Player.inventory`, and `Player.lootStats` SHALL match the values immediately before reload
- **AND** the rendered `ItemInstance[]` (inventory list) SHALL match the items obtained before reload

#### Scenario: First-ever load uses newPlayer

- **WHEN** the app is loaded on a fresh browser with no IndexedDB record for `PLAYER_ID = 'p1'`
- **THEN** the initial state SHALL come from `newPlayer('p1', '見習醫師', STAT_SCHEMA.order)`
- **AND** the first state mutation SHALL trigger an IndexedDB write so subsequent reloads find the saved record

### Requirement: Hydration completes before user interaction

The hydrate-on-mount effect SHALL read the saved `Player` (and `ItemInstance[]`) from IndexedDB and call `setPlayer` + `setInstances` before any user-visible state mutation can occur.

#### Scenario: Hydration race does not overwrite fresh state

- **WHEN** the app mounts and the hydrate effect is in flight
- **AND** the user clicks "🎲 手動測試一次抽卡" before hydration finishes
- **THEN** the hydration SHALL NOT overwrite the post-roll state with the pre-roll saved state
- **AND** this MAY be achieved by either (a) gating user actions on a `hydrated: boolean` flag, or (b) treating the hydration as a one-shot that no-ops if state has diverged from `newPlayer` defaults

### Requirement: State writes are persisted within 500ms of mutation

Every `setPlayer` and `setInstances` call SHALL trigger an asynchronous IndexedDB write within 500ms (in practice, the write is fire-and-forget inside a React `useEffect` that runs after commit).

#### Scenario: Write happens after every mutation

- **WHEN** the player picks any action that mutates state (read tick, quiz answer, loot roll, equip, name edit)
- **THEN** the corresponding IndexedDB record SHALL be updated within 500ms
- **AND** `db.players.get(PLAYER_ID)` queried 1 second later SHALL return the new state

#### Scenario: Write failures are logged but do not crash

- **WHEN** an IndexedDB write fails (quota exceeded, browser revoking storage permission, etc.)
- **THEN** the error SHALL be logged to `console.error`
- **AND** the in-memory state SHALL remain valid (the user can continue playing in-memory; only persistence is degraded)
- **AND** the next successful write SHALL recover persistence

### Requirement: Export downloads a portable JSON save file

A user-facing button (`💾 Export 存檔`) SHALL serialize the current state to JSON and trigger a browser download.

The exported file SHALL contain at minimum these top-level keys:

```json
{
  "schemaVersion": 1,
  "exportedAt": <unix-ms>,
  "player": <Player object>,
  "instances": <ItemInstance[] array>
}
```

#### Scenario: Export produces downloadable file

- **WHEN** the player clicks the export button
- **THEN** a download SHALL trigger with filename pattern `study-rpg-save-<YYYY-MM-DDTHH-mm-ss>.json`
- **AND** the file contents SHALL parse as JSON with the four required top-level keys
- **AND** `parsed.player.id` SHALL equal `'p1'`
- **AND** `parsed.instances` SHALL be an array (may be empty if no items obtained)

### Requirement: Import replaces current state after user confirmation

A user-facing button (`📂 Import 存檔`) SHALL open a file picker. Selecting a valid JSON save file SHALL prompt the user for confirmation; on confirm, current state is replaced.

#### Scenario: Import with valid file

- **WHEN** the player picks a file whose JSON has `schemaVersion: 1` and valid `player` + `instances` shapes
- **THEN** a confirmation prompt SHALL display (e.g. `這會覆蓋現有存檔，確定？`)
- **AND** on user confirm, `setPlayer(parsed.player)` and `setInstances(parsed.instances)` SHALL be called
- **AND** the persistence effects SHALL write the imported state to IndexedDB within 500ms

#### Scenario: Import rejects malformed file

- **WHEN** the player picks a file that fails to parse as JSON, or whose top-level shape is wrong (missing `player`, missing `instances`, mismatched `schemaVersion`)
- **THEN** the import SHALL NOT modify state
- **AND** an error SHALL be surfaced to the user via `alert` (MVP) or toast (M2)
- **AND** the existing state SHALL remain intact

### Requirement: Schema version is recorded for future migrations

Every exported save file SHALL include a `schemaVersion: 1` field. Import SHALL accept `schemaVersion === 1` and reject any other value with a clear error message.

#### Scenario: Future schema bumps require migration code

- **WHEN** an import file has `schemaVersion` other than the currently-supported value
- **THEN** import SHALL refuse with message `不支援的存檔版本 v<n> (current: v1)`
- **AND** a future change MAY add migration logic that upgrades older versions in place; that change SHALL update this requirement to list the new supported versions

