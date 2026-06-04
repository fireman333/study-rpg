## ADDED Requirements

### Requirement: In-app submission modal (HelpMenu)

The neurons-tw HelpMenu「回報問題」section SHALL present a structured `BugReportModal` form (replacing the GitHub-Issues placeholder) that captures: a single **category** (from the neurons category set), a single **severity** (`blocker` / `annoying` / `minor` / `suggestion`), required free-text「在做什麼」 and「發生什麼」, optional「預期什麼」, optional **reproducibility** (`always` / `sometimes` / `once` / `unsure`), and optional contact info with an explicit follow-up consent flag.

#### Scenario: Open form from HelpMenu
- **WHEN** a signed-in player opens HelpMenu and expands「回報問題」
- **THEN** the structured form renders with the neurons category list, the 4 severities, and the free-text fields — not the GitHub-Issues placeholder

#### Scenario: Required fields enforced
- **WHEN** the player submits with「在做什麼」or「發生什麼」empty
- **THEN** the form blocks submission and indicates the missing required field, and no row is inserted

#### Scenario: Successful submission
- **WHEN** a signed-in player fills the required fields, picks a category + severity, and submits
- **THEN** exactly one row is inserted into `bug_reports` with `app = 'neurons-tw'`, the chosen `category` + `severity`, and a success acknowledgement is shown

### Requirement: Authenticated submission only

The modal SHALL gate submission behind sign-in: when `useAuth().user` is null it SHALL render a sign-in call-to-action in place of the form, with no anonymous submission path.

#### Scenario: Signed-out player sees sign-in CTA
- **WHEN** a signed-out player opens the bug-report entry (HelpMenu or inline)
- **THEN** a sign-in CTA is shown instead of the form, and no insert is possible until the player signs in

#### Scenario: Insert tied to authenticated user
- **WHEN** a signed-in player submits a report
- **THEN** the inserted row's `user_id` equals the player's `auth.uid()`

### Requirement: Auto-attached context with per-field opt-out

The system SHALL auto-attach a context snapshot to each submission and SHALL render a per-field opt-out checkbox (default checked) for each captured field. Captured fields: app version (`VITE_APP_VERSION`), commit SHA (`VITE_COMMIT_SHA`), current route (`location.hash`), a neurons `game_state` snapshot built from the neurons Dexie database, user agent, viewport size, recent console errors, and sync diagnostics (`sync_metadata`).

#### Scenario: All context attached by default
- **WHEN** a player submits without changing any opt-out checkbox
- **THEN** the inserted row carries app version, commit SHA, route, `game_state`, user agent, viewport, recent console errors, and `sync_metadata`

#### Scenario: Opted-out field omitted
- **WHEN** a player unchecks the「遊戲狀態」(game_state) opt-out before submitting
- **THEN** the inserted row's `game_state` is null and all other checked fields are still attached

#### Scenario: game_state stays PII-free
- **WHEN** the `game_state` snapshot is built
- **THEN** it contains only numeric counters and enum/state values (no free-text or personally identifying content)

### Requirement: Console error capture

The app SHALL maintain a size-5 ring buffer of the most recent `window.error` and `unhandledrejection` events (message + stack), installed at app startup, and SHALL attach it as `recent_console_errors` unless the player opts out.

#### Scenario: Recent errors captured in order
- **WHEN** more than 5 console error events have fired and the player submits a report with the console-error field checked
- **THEN** `recent_console_errors` contains the 5 most recent events, newest-inclusive

#### Scenario: Buffer empty is harmless
- **WHEN** no console error has fired and the player submits
- **THEN** `recent_console_errors` is an empty list (or null) and submission still succeeds

### Requirement: Inline quick-report flow from QuizModal

`QuizModal` SHALL expose an inline 🐞 entry that opens a compact report sheet scoped to the question currently displayed, offering a small target picker that maps to a neurons category and a single free-text field, gated by the same sign-in requirement.

#### Scenario: Inline entry from a question
- **WHEN** a signed-in player taps the 🐞 entry inside QuizModal while viewing a question
- **THEN** a compact report sheet opens with target choices and a single description field

#### Scenario: Inline target maps to category
- **WHEN** the player picks an inline target and submits
- **THEN** the inserted row's `category` is the mapped neurons category for that target and `app = 'neurons-tw'`

### Requirement: Question context auto-attach for inline flow

Inline submissions SHALL stamp the displayed question's identifier into the `question_id` column (reusing the existing column from migration `0007`); this linkage is intrinsic to the inline flow and is not individually opt-out.

#### Scenario: question_id stamped on inline submit
- **WHEN** a player submits an inline report about a specific question
- **THEN** the inserted row's `question_id` equals that question's id

#### Scenario: HelpMenu submissions carry no question_id
- **WHEN** a player submits from the HelpMenu form (not inline)
- **THEN** the inserted row's `question_id` is null

### Requirement: Server-side storage with RLS

Reports SHALL be stored in the shared Supabase `bug_reports` table with `app = 'neurons-tw'`, be immutable after insert (INSERT + SELECT only), and be protected by the existing RLS policy `auth.uid() = user_id`; the owner reads all rows via `service_role`.

#### Scenario: Player reads only own rows
- **WHEN** a signed-in player queries `bug_reports`
- **THEN** only rows where `user_id = auth.uid()` are returned

#### Scenario: Rows are immutable
- **WHEN** any client attempts to UPDATE or DELETE a `bug_reports` row
- **THEN** the operation is denied (no UPDATE/DELETE policy exists)

### Requirement: Canonical neurons category set across UI, types, and DB

The neurons category set SHALL be a single canonical kebab-case list (`app-stability`, `maze-exploration`, `variant-collection`, `synapse`, `dmn-fate-cards`, `study-session`, `numbers-wrong`, `visual-glitch`, `cloud-sync`, `corpus`, `feature-request`, `other`) used identically by the form UI, the `@study-rpg/core` types, and the Supabase `category` CHECK constraint, so a UI value can never be silently rejected by the database.

#### Scenario: UI value accepted by DB
- **WHEN** the player submits any category offered by the neurons form
- **THEN** the value satisfies the `category` CHECK and the insert succeeds (no constraint violation)

#### Scenario: Single source of truth
- **WHEN** the category list is read from `@study-rpg/core` and compared to the migration `0017` `category` CHECK list (the union superset across all apps)
- **THEN** every neurons category is present in the CHECK list, so no neurons-form value can be rejected by the constraint

### Requirement: Additive Supabase schema extension

Migration `0017` SHALL extend the `bug_reports.app` CHECK to include `'neurons-tw'` and extend the `category` CHECK to the union of the existing medexam categories and the neurons categories, additively (no data migration, existing rows and medexam behavior unaffected). RLS, indexes, and the `sync_metadata` column SHALL remain unchanged.

#### Scenario: neurons app value accepted post-migration
- **WHEN** migration `0017` has been applied and a neurons row is inserted with `app = 'neurons-tw'`
- **THEN** the insert satisfies the `app` CHECK and succeeds

#### Scenario: medexam rows unaffected
- **WHEN** migration `0017` is applied
- **THEN** existing medexam rows and the medexam `app` / `category` values remain valid with no data migration
