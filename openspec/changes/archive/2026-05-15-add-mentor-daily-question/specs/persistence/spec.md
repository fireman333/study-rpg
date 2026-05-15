## ADDED Requirements

### Requirement: Mentor backlog singleton persists across reload

The Dexie schema SHALL include a `mentorBacklog` object store with primary key `key` (string, single-row singleton with literal `'mentorBacklog'`). The record SHALL persist the queue of pending mentor question IDs and the last-assigned date so that backlog accumulation survives reloads, browser restarts, and missed days.

Record shape:

| Field | Type | Required | Semantics |
|---|---|---|---|
| `key` | `'mentorBacklog'` | yes | Primary key; literal singleton |
| `questionIds` | `string[]` | yes | FIFO queue of pending `Question.id` values; max length 5 |
| `lastAssignedDate` | `string` | yes | ISO `YYYY-MM-DD` in UTC+8 (Asia/Taipei); last date on which the algorithm assigned a question |

#### Scenario: First-mount creates singleton with one question

- **WHEN** the app mounts AND `db.mentorBacklog.get('mentorBacklog')` returns `undefined`
- **THEN** the system SHALL invoke the mentor question selection algorithm exactly once
- **AND** SHALL write a new singleton with `questionIds: [<selectedId>]` and `lastAssignedDate: today (UTC+8)`
- **AND** the write SHALL complete within 500 ms (per existing persistence write-debounce SLA)

#### Scenario: Reload preserves existing backlog

- **WHEN** the app is reloaded after the singleton has been written
- **THEN** `db.mentorBacklog.get('mentorBacklog')` SHALL return the persisted record
- **AND** no automatic question selection SHALL run if `lastAssignedDate === today (UTC+8)`

#### Scenario: Schema v3 bump preserves existing player state

- **WHEN** an existing player (with v2 Dexie state including `mockAttempts`) opens the app after upgrade
- **THEN** the Dexie version bump to v3 SHALL add the `mentorBacklog` store without altering any v1 or v2 store
- **AND** the player's existing player state, SRS cards, mock attempts, and other prior data SHALL remain intact
- **AND** no migration of existing rows SHALL be required

#### Scenario: Backlog mutations are write-through

- **WHEN** a mentor question is answered OR skipped
- **THEN** the singleton SHALL be updated immediately (no debounce) via `db.mentorBacklog.put({ key: 'mentorBacklog', ...newState })`
- **AND** the in-memory React state SHALL only reflect the new state after the write resolves
