## MODIFIED Requirements

### Requirement: Export downloads a portable JSON save file

A user-facing button (`💾 Export 存檔`) SHALL serialize the current state to JSON and trigger a browser download.

The exported file SHALL contain at minimum these top-level keys:

```json
{
  "schemaVersion": 2,
  "exportedAt": <unix-ms>,
  "player": <Player object>,
  "instances": <ItemInstance[] array>
}
```

The embedded `player` object SHALL include the three streak fields (`lastCheckInDate`, `currentStreak`, `longestStreak`) introduced in `engine-rewards`.

#### Scenario: Export produces downloadable file

- **WHEN** the player clicks the export button
- **THEN** a download SHALL trigger with filename pattern `study-rpg-save-<YYYY-MM-DDTHH-mm-ss>.json`
- **AND** the file contents SHALL parse as JSON with the four required top-level keys
- **AND** `parsed.schemaVersion` SHALL equal `2`
- **AND** `parsed.player.id` SHALL equal `'p1'`
- **AND** `parsed.player` SHALL contain `currentStreak` and `longestStreak` as numbers (≥ 0)
- **AND** `parsed.instances` SHALL be an array (may be empty if no items obtained)

### Requirement: Import replaces current state after user confirmation

A user-facing button (`📂 Import 存檔`) SHALL open a file picker. Selecting a valid JSON save file SHALL prompt the user for confirmation; on confirm, current state is replaced.

If the imported file has `schemaVersion: 1`, import SHALL migrate the file in memory before applying state:

- Set `player.currentStreak = 0`
- Set `player.longestStreak = 0`
- Leave `player.lastCheckInDate = undefined`

The migrated player SHALL be applied via the same `setPlayer` path as a v2 import. The on-disk file SHALL NOT be modified; only the in-memory state is migrated.

#### Scenario: Import with valid v2 file

- **WHEN** the player picks a file whose JSON has `schemaVersion: 2` and valid `player` + `instances` shapes
- **THEN** a confirmation prompt SHALL display (e.g. `這會覆蓋現有存檔，確定？`)
- **AND** on user confirm, `setPlayer(parsed.player)` and `setInstances(parsed.instances)` SHALL be called
- **AND** the persistence effects SHALL write the imported state to IndexedDB within 500ms
- **AND** the player's streak fields SHALL come back exactly as in the imported file

#### Scenario: Import with v1 file migrates to v2 in memory

- **WHEN** the player picks a file whose JSON has `schemaVersion: 1` and otherwise valid shape
- **THEN** the confirmation prompt SHALL still display
- **AND** on user confirm, `setPlayer` SHALL be called with a player that has `currentStreak: 0`, `longestStreak: 0`, `lastCheckInDate: undefined`
- **AND** all other player fields SHALL come through from the v1 file unchanged
- **AND** no error or warning SHALL be surfaced to the user (this is a silent forward migration)

#### Scenario: Import rejects malformed file

- **WHEN** the player picks a file that fails to parse as JSON, or whose top-level shape is wrong (missing `player`, missing `instances`, or `schemaVersion` is neither `1` nor `2`)
- **THEN** the import SHALL NOT modify state
- **AND** an error SHALL be surfaced to the user via `alert` (MVP) or toast (M2)
- **AND** the existing state SHALL remain intact

### Requirement: Schema version is recorded for future migrations

Every exported save file SHALL include a `schemaVersion: 2` field. Import SHALL accept `schemaVersion === 2` natively and `schemaVersion === 1` via the migration rule defined in the Import requirement. Any other value SHALL be rejected with a clear error message naming the unsupported version.

#### Scenario: Future schema bumps require migration code

- **WHEN** an import file has `schemaVersion` outside `{1, 2}`
- **THEN** import SHALL refuse with message `不支援的存檔版本 v<n> (current: v2)`
- **AND** a future change MAY add migration logic that upgrades older versions in place; that change SHALL update this requirement to list the new supported versions

#### Scenario: v1 file is accepted by current version

- **WHEN** an import file has `schemaVersion: 1`
- **THEN** import SHALL NOT reject on the version check
- **AND** the v1 migration path defined under "Import replaces current state after user confirmation" SHALL apply
