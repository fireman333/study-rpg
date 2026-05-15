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


### Requirement: Mock attempts persist across reload

The Dexie schema SHALL include a `mockAttempts` object store with primary key `id` (string, client-generated UUID v4) and a secondary index on `paperId`. Each record SHALL persist a single mock-exam submission with enough fidelity to render the result screen offline and to compute the progress curve.

Record shape:

| Field | Type | Required | Semantics |
|---|---|---|---|
| `id` | `string` (UUID v4) | yes | Primary key; generated at submit time |
| `paperId` | `string` | yes | `"<year>-<session>-<paper>"` (e.g. `"114-1-medexam-1"` for 民國 114 第 1 session 醫一); indexed |
| `startedAt` | `number` | yes | Epoch ms when "開始作答" was clicked |
| `finishedAt` | `number` | yes | Epoch ms when "交卷" was clicked |
| `elapsedSec` | `number` | yes | Net active seconds (excluding paused intervals) |
| `totalScore` | `number` | yes | Count of correctly-answered questions (0 ≤ score ≤ paper total Q count, typically ≈100) |
| `perQuestionAnswers` | `Array<{ questionId: string; userSelection: string \| null; isCorrect: boolean }>` | yes | Per-question record; `userSelection: null` for unanswered |

#### Scenario: Submit writes a complete mockAttempt record

- **WHEN** the user clicks "交卷" on a mock with all fields present
- **THEN** a single `mockAttempts.put()` SHALL be invoked with the record described above
- **AND** the write SHALL complete within 500 ms (per existing persistence write-debounce SLA)

#### Scenario: Reload rehydrates the picker's "last attempt" overlay

- **WHEN** the app is reloaded and the mock picker mounts
- **THEN** for each paper cell, the picker SHALL query `mockAttempts.where('paperId').equals(paperId)` and select the record with the latest `finishedAt`
- **AND** SHALL render the last attempt's score + timestamp in the picker cell overlay

#### Scenario: Schema bump preserves existing player state

- **WHEN** an existing player (with prior Dexie state from before this change) opens the app after upgrade
- **THEN** the Dexie version bump SHALL add the `mockAttempts` store without altering any existing store
- **AND** the player's existing player state, SRS cards, and prior data SHALL remain intact
- **AND** no migration of existing rows SHALL be required

### Requirement: In-progress mock state persists across reload

While a mock is in progress (between "開始作答" and "交卷"), the runner's volatile state SHALL be persisted to a Dexie singleton key so that a page reload mid-mock returns the user to the same question with state intact.

Singleton shape (key: `'mockInProgress'`):

| Field | Type | Required | Semantics |
|---|---|---|---|
| `paperId` | `string` | yes | The paper being attempted |
| `startedAt` | `number` | yes | Epoch ms when "開始作答" was clicked |
| `currentQuestionIndex` | `number` | yes | 0-based index of currently-viewed question (0..(N-1)) |
| `selections` | `Record<string, string>` | yes | `questionId → optionKey`; missing keys = unanswered |
| `elapsedSecAtPause` | `number` | yes | Net active seconds accumulated up to the last freeze point |
| `lastResumedAt` | `number \| null` | yes | Epoch ms of last resume; `null` if currently paused |

#### Scenario: Writes happen at least every 5 seconds while active

- **WHEN** a mock is in progress and the user is actively answering
- **THEN** the singleton SHALL be written at least every 5 seconds (debounced) so that a sudden crash loses ≤ 5 seconds of progress

#### Scenario: Reload reads the singleton and resumes

- **WHEN** the app mounts AND the `mockInProgress` singleton exists with a non-stale `paperId`
- **THEN** the app SHALL route the user to `/mock/run` with state restored exactly from the singleton
- **AND** the stopwatch SHALL resume from `elapsedSecAtPause` (plus any active interval since `lastResumedAt` if non-null)
- **AND** a one-time toast SHALL inform the user "已從上次中斷處恢復"

#### Scenario: Submit clears the singleton

- **WHEN** the user submits a mock
- **THEN** after the `mockAttempts.put()` succeeds, the `mockInProgress` singleton SHALL be deleted
- **AND** subsequent `/mock` visits SHALL return to the picker (no auto-resume)

#### Scenario: Abandoning mid-mock leaves the singleton for next session

- **WHEN** the user closes the app mid-mock without submitting
- **THEN** the singleton SHALL persist
- **AND** the next session SHALL offer to resume (per "Reload reads the singleton and resumes" scenario)
- **AND** the user SHALL have an option to "放棄這次 mock" which clears the singleton without writing to `mockAttempts`
