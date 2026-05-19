## MODIFIED Requirements

### Requirement: Auto-attached context with per-field opt-out

The system SHALL display an expandable "系統自動附帶" section inside the modal listing every piece of auto-captured context, with one checkbox per field defaulting to checked. Each unchecked field SHALL be omitted from the INSERT payload (server stores NULL for that column).

The captured-fields set SHALL include `app_version`, `commit_sha`, `route`, `game_state`, `user_agent`, `viewport`, `recent_console_errors`, **AND `sync_metadata`** (added in `fix-sync-sign-in-lifecycle`). The `app` value (literal `'medexam-tw'` or `'medexam2-hospital-tw'`) is always attached and not user-controllable.

`sync_metadata` SHALL be populated by calling the sync engine's `getDiagnosticSnapshot()` method (defined in the `cloud-sync` capability) at the moment the user clicks submit. The resulting `SyncDiagnostic` object SHALL be serialized as JSONB into the `bug_reports.sync_metadata` column.

#### Scenario: Default-on auto-context fields

- **WHEN** the modal opens for an authenticated player
- **THEN** a `<details open>` block titled "系統自動附帶" is rendered
- **AND** it lists checkboxes (default checked) for `app_version`, `commit_sha`, `route`, `game_state`, `user_agent`, `viewport`, `recent_console_errors`, AND `sync_metadata`
- **AND** the `app` value (literal `'medexam-tw'` or `'medexam2-hospital-tw'`) is always attached and not user-controllable

#### Scenario: Opt out of `game_state`

- **WHEN** the player unchecks the `game_state` checkbox before clicking submit
- **THEN** the submit payload SHALL NOT include a `game_state` field
- **AND** the inserted row SHALL have `game_state IS NULL`

#### Scenario: Opt out of `sync_metadata`

- **WHEN** the player unchecks the `sync_metadata` checkbox before clicking submit
- **THEN** the submit payload SHALL NOT include a `sync_metadata` field
- **AND** the inserted row SHALL have `sync_metadata IS NULL`

#### Scenario: sync_metadata captured at submit time

- **GIVEN** the player has the `sync_metadata` checkbox checked
- **WHEN** the player clicks the submit button
- **THEN** the modal SHALL call `engine.getDiagnosticSnapshot()` immediately before constructing the payload
- **AND** the resulting object SHALL be serialized as JSONB into the payload's `sync_metadata` field
- **AND** the inserted row SHALL contain the snapshot reflecting the engine state at submit time (NOT modal-open time)

#### Scenario: sync_metadata unavailable when unauthed

- **GIVEN** the player is unauthenticated (auth gate already blocks submission)
- **THEN** no payload is built and `sync_metadata` capture is moot
- **AND** the `sync_metadata` checkbox SHALL NOT render in the unauthenticated login-gate view

#### Scenario: Opt out of every optional field

- **WHEN** the player unchecks every optional auto-context checkbox before submit
- **THEN** only `app`, `user_id`, `category`, `severity`, `what_doing`, `what_happened`, plus the user-filled optional textareas they entered, are persisted
