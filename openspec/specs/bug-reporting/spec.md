# bug-reporting Specification

## Purpose

Provides an in-app bug / suggestion submission flow for both apps (一階 `medexam-tw` and 二階 `medexam2-hospital-tw`). Players file structured reports without leaving the app; submissions persist to Supabase `public.bug_reports` with auto-attached game-state context (per-field opt-out), RLS-enforced so each user can only read their own rows. Owner reads everyone's reports via `service_role` (today via the dashboard SQL editor; future `/bug-reports` skill). MVP backs M4.5; screenshot upload and owner-side automation are explicit follow-up changes.

## Requirements

### Requirement: In-app submission modal

The system SHALL provide a `BugReportModal` component in each app that allows an authenticated player to file a structured bug report or feature request without leaving the app. The modal SHALL collect a category (11 options), severity (4 options), three required textareas (`what_doing`, `what_happened`, `what_expected`), an optional reproducibility choice, an optional contact field, and an optional opt-in for follow-up contact.

#### Scenario: 一階 player opens modal from Settings

- **WHEN** an authenticated 一階 player clicks 「💬 回報問題 / 建議」 inside `SettingsPanel.tsx`
- **THEN** `BugReportModal` opens
- **AND** the player sees a category radio group (11 options), a severity radio group (4 options), the three required textareas, and the optional fields

#### Scenario: 二階 player opens modal from HelpMenu

- **WHEN** an authenticated 二階 player expands the 「💬 回報問題 / 建議」 accordion section inside `HelpMenu.tsx` and clicks its open-modal button
- **THEN** `BugReportModal` opens
- **AND** the player sees the same set of fields as 一階

#### Scenario: Unauthenticated player opens modal

- **WHEN** any player triggers the modal while `supabase.auth.getUser()` returns null
- **THEN** the modal SHALL show "請先登入再提交（這樣我才能跟你 follow-up）" with an inline sign-in button instead of the form
- **AND** no submission UI is reachable until the player signs in

### Requirement: Auto-attached context with per-field opt-out

The system SHALL display an expandable "系統自動附帶" section inside the modal listing every piece of auto-captured context, with one checkbox per field defaulting to checked. Each unchecked field SHALL be omitted from the INSERT payload (server stores NULL for that column).

#### Scenario: Default-on auto-context fields

- **WHEN** the modal opens for an authenticated player
- **THEN** a `<details open>` block titled "系統自動附帶" is rendered
- **AND** it lists checkboxes (default checked) for `app_version`, `commit_sha`, `route`, `game_state`, `user_agent`, `viewport`, `recent_console_errors`
- **AND** the `app` value (literal `'medexam-tw'` or `'medexam2-hospital-tw'`) is always attached and not user-controllable

#### Scenario: Opt out of `game_state`

- **WHEN** the player unchecks the `game_state` checkbox before clicking submit
- **THEN** the submit payload SHALL NOT include a `game_state` field
- **AND** the inserted row SHALL have `game_state IS NULL`

#### Scenario: Opt out of every optional field

- **WHEN** the player unchecks every optional auto-context checkbox before submit
- **THEN** only `app`, `user_id`, `category`, `severity`, `what_doing`, `what_happened`, plus the user-filled optional textareas they entered, are persisted

### Requirement: Authenticated submission only

The system SHALL refuse to submit reports when the player is not signed in, and SHALL NOT make any network call to Supabase from the unauthenticated UI path.

#### Scenario: Submit blocked when not signed in

- **WHEN** an unauthenticated player triggers the modal and would attempt to submit
- **THEN** the submit UI is not rendered (login gate is shown)
- **AND** no `INSERT` request hits Supabase's REST endpoint
- **AND** the DevTools network panel shows zero outbound `supabase.co` traffic from this flow

#### Scenario: Sign-in mid-flow

- **WHEN** the player signs in from the login gate inside the modal
- **THEN** the modal SHALL transition to showing the report form
- **AND** any previously typed text in fields is preserved if the React component instance is preserved (best-effort; full reload is acceptable)

### Requirement: Server-side storage with RLS

The system SHALL persist each submitted report as a row in the `public.bug_reports` Postgres table, with `user_id = auth.uid()` enforced by Row-Level Security so that one player cannot read or write another player's reports.

#### Scenario: Authenticated INSERT succeeds for own row

- **WHEN** an authenticated player submits a valid report
- **THEN** Postgres SHALL persist a new row with the given `category`, `severity`, `what_doing`, `what_happened`, `app`, `user_id = auth.uid()`, `submitted_at = now()`, and the opted-in auto-context fields
- **AND** the `bug_reports_insert_own` RLS policy permits the INSERT

#### Scenario: INSERT attempting to impersonate another user is rejected

- **WHEN** an authenticated player crafts an INSERT with `user_id` set to a different user's UUID
- **THEN** Postgres SHALL reject the INSERT due to the `bug_reports_insert_own` policy's `WITH CHECK (auth.uid() = user_id)` clause

#### Scenario: SELECT only returns own rows

- **WHEN** an authenticated player issues `SELECT * FROM public.bug_reports`
- **THEN** Postgres SHALL return only rows where `user_id = auth.uid()`
- **AND** rows belonging to other players are not visible

#### Scenario: Anonymous SELECT returns nothing

- **WHEN** an unauthenticated client issues `SELECT * FROM public.bug_reports` (e.g., via the anon key)
- **THEN** Postgres SHALL return zero rows
- **AND** no error is raised (RLS-filtered, not access-denied)

### Requirement: Console error capture

The system SHALL capture the last five runtime errors fired on `window.error` or `window.unhandledrejection` into a per-app ring buffer, and SHALL include them in `recent_console_errors` of submitted reports unless the player opts out via the auto-context checkbox.

#### Scenario: window.error captured

- **WHEN** a runtime error fires `window.addEventListener('error', …)` during a session
- **THEN** the buffer SHALL push `{ message, source, line, timestamp }` and evict the oldest entry if size exceeds 5

#### Scenario: Unhandled rejection captured

- **WHEN** a promise rejection bubbles to `window.addEventListener('unhandledrejection', …)`
- **THEN** the buffer SHALL push `{ message: 'Unhandled rejection: <reason>', timestamp }`

#### Scenario: Report includes captured errors

- **WHEN** the player submits a report with the `recent_console_errors` checkbox checked
- **THEN** the inserted row's `recent_console_errors` JSONB column SHALL equal the current buffer contents (an array, possibly empty)

#### Scenario: Player opts out of console errors

- **WHEN** the player unchecks the `recent_console_errors` checkbox before submit
- **THEN** the inserted row SHALL have `recent_console_errors IS NULL`
