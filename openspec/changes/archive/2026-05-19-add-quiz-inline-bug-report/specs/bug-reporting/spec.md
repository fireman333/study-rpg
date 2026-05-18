## MODIFIED Requirements

### Requirement: In-app submission modal

The system SHALL provide a `BugReportModal` component in each app that allows an authenticated player to file a structured bug report or feature request without leaving the app. The modal SHALL collect a category (14 options), severity (4 options), three required textareas (`what_doing`, `what_happened`, `what_expected`), an optional reproducibility choice, an optional contact field, and an optional opt-in for follow-up contact. The 14 category values SHALL include the original 11 plus `question-error`, `image-broken`, and `explanation-error` added for inline quiz reports.

#### Scenario: 一階 player opens modal from Settings

- **WHEN** an authenticated 一階 player clicks 「💬 回報問題 / 建議」 inside `SettingsPanel.tsx`
- **THEN** `BugReportModal` opens
- **AND** the player sees a category radio group (14 options), a severity radio group (4 options), the three required textareas, and the optional fields

#### Scenario: 二階 player opens modal from HelpMenu

- **WHEN** an authenticated 二階 player expands the 「💬 回報問題 / 建議」 accordion section inside `HelpMenu.tsx` and clicks its open-modal button
- **THEN** `BugReportModal` opens
- **AND** the player sees the same set of fields as 一階

#### Scenario: Unauthenticated player opens modal

- **WHEN** any player triggers the modal while `supabase.auth.getUser()` returns null
- **THEN** the modal SHALL show "請先登入再提交（這樣我才能跟你 follow-up）" with an inline sign-in button instead of the form
- **AND** no submission UI is reachable until the player signs in

#### Scenario: Category enum includes inline quiz categories

- **WHEN** the player views the category radio group inside `BugReportModal`
- **THEN** the 14 options SHALL include `question-error`、`image-broken`、`explanation-error` labels in addition to the original 11
- **AND** selecting any of the new 3 values SHALL be accepted by the Postgres `bug_reports_category_check` constraint

## ADDED Requirements

### Requirement: Inline quick-report flow from QuizModal

The system SHALL provide a `QuizBugReportSheet` component in each app, rendered inside `QuizModal`, that allows an authenticated player to submit a contextual bug report about the currently-displayed question without leaving the quiz flow. The sheet SHALL collect exactly one target choice (4 options) and a single-line text description (max 200 characters), and SHALL submit a row to `public.bug_reports` with `category` derived from the target choice plus auto-attached question context.

#### Scenario: Player opens inline sheet from QuizModal

- **WHEN** an authenticated player clicks the 🐞 icon button in the top-right corner of `QuizModal`
- **THEN** `QuizBugReportSheet` SHALL open as a modal overlay over the quiz UI
- **AND** the sheet SHALL show 4 radio options:「題目本身有錯」(target=`question`)、「題目圖片有問題」(target=`image`)、「詳解有錯」(target=`explanation`)、「簡答（其他意見）」(target=`other`)
- **AND** the sheet SHALL show a single-line `<textarea maxLength={200}>` input
- **AND** the sheet SHALL show a「送出」button (disabled until both a target is selected AND the textarea has at least 1 character)
- **AND** the sheet SHALL show a「展開完整表單」escape-hatch button

#### Scenario: Target choice maps to category

- **WHEN** the player selects a target and submits the sheet
- **THEN** the inserted row's `category` field SHALL be set as follows:
  - target=`question` → `category='question-error'`
  - target=`image` → `category='image-broken'`
  - target=`explanation` → `category='explanation-error'`
  - target=`other` → `category='other'`

#### Scenario: Single-line description persists to what_happened

- **WHEN** the player submits the sheet with text "答案標 B 但詳解推 C"
- **THEN** the inserted row's `what_happened` column SHALL contain "答案標 B 但詳解推 C"
- **AND** `what_doing` SHALL be auto-filled with a system-generated string of the form `"答題中（subject=<X>, year=<Y>, questionId=<Z>）"`
- **AND** `what_expected` SHALL be NULL

#### Scenario: Severity defaults to 'minor'

- **WHEN** the player submits the sheet (which has no severity radio)
- **THEN** the inserted row's `severity` SHALL be `'minor'` (the smallest impact tier in the existing 4-value enum — appropriate default since inline reports are most often small content issues; players can promote severity via the escape-hatch full modal)

#### Scenario: Escape hatch opens full modal

- **WHEN** the player clicks 「展開完整表單」
- **THEN** the sheet SHALL close
- **AND** the existing `BugReportModal` SHALL open with `category` pre-filled based on the player's current target selection (if any) and `what_happened` pre-filled with the player's current sheet text (if any)
- **AND** the full modal's per-field opt-out checkboxes SHALL apply (player regains opt-out capability)

#### Scenario: Unauthenticated player opens 🐞

- **WHEN** an unauthenticated player clicks the 🐞 icon
- **THEN** the sheet SHALL show "請先登入再提交（這樣我才能跟你 follow-up）" with an inline sign-in button instead of the form
- **AND** no `INSERT` request hits Supabase's REST endpoint

#### Scenario: Success toast after submission

- **WHEN** the player successfully submits the sheet
- **THEN** the sheet SHALL close immediately
- **AND** a transient toast SHALL appear: "✓ 已送出回報，感謝你！"
- **AND** the toast SHALL auto-dismiss within a few seconds (target 3–4s; exact value depends on each app's toast helper)
- **AND** the quiz UI underneath SHALL be in the exact state it was before the sheet opened (no state mutation to current question, timer, or progress)

#### Scenario: Re-clicking 🐞 after submission opens a fresh sheet

- **WHEN** the player clicks 🐞 again after submitting
- **THEN** `QuizBugReportSheet` SHALL open with empty target selection and empty textarea
- **AND** a second submission SHALL insert a new row (no deduplication at submission time)

### Requirement: Question context auto-attach (non-opt-out for inline flow)

The system SHALL auto-attach question-related metadata to every row submitted via `QuizBugReportSheet`, and the player SHALL NOT have UI to opt out of these fields within the sheet itself. To opt out, the player must use the 「展開完整表單」 escape hatch which opens `BugReportModal` (where existing per-field opt-out applies).

#### Scenario: question_id column populated

- **WHEN** the player submits the sheet for a question with id `med4-pediatrics-22717s2`
- **THEN** the inserted row's `question_id` column SHALL equal `"med4-pediatrics-22717s2"`
- **AND** the `question_id` column SHALL NOT be NULL

#### Scenario: game_state JSONB contains question context

- **WHEN** the player submits the sheet
- **THEN** the inserted row's `game_state` JSONB column SHALL be an object containing at minimum: `subject`, `year`, `questionId`, `selectedOption`, `correctAnswer`, `disputed`, `hasImage`, `inMockExam`
- **AND** the values SHALL reflect the state of the question at the moment 🐞 was clicked (snapshotted, not re-read on submit)

#### Scenario: Mock exam flag attached

- **WHEN** the player submits the sheet from a quiz context that sets `inMockExam=true` (一階 MockRunnerRoute — future integration; QuizModal entry sets `false` today)
- **THEN** `game_state.inMockExam` SHALL match the value the caller passed to `buildQuestionSnapshot`
- **AND** the mock exam stopwatch (when applicable) SHALL NOT be paused by the sheet opening or submission
- **AND** the sheet SHALL display an inline notice "模擬考進行中，送出後可繼續答題" whenever `snapshot.inMockExam` is `true`

#### Scenario: General auto-context attached without opt-out UI

- **WHEN** the player submits the sheet
- **THEN** the inserted row SHALL include `app_version`, `commit_sha`, `route`, `user_agent`, `viewport`, `recent_console_errors` (default-on, same as `BugReportModal`)
- **AND** the sheet SHALL NOT show checkboxes to opt out of these fields
- **AND** to opt out, the player must use the 「展開完整表單」 escape hatch

### Requirement: Question ID column for cross-report aggregation

The Postgres `public.bug_reports` table SHALL include a `question_id text NULL` column with a B-tree index `bug_reports_question_id_idx`, allowing the owner to query "which questions have ≥N reports" via standard SQL aggregation.

#### Scenario: Schema includes question_id column

- **WHEN** the owner runs `\d+ public.bug_reports` in the Supabase dashboard SQL editor after migration 0007 is applied
- **THEN** the output SHALL include a `question_id` column of type `text` with `NULL` allowed
- **AND** the column default SHALL be `NULL` (not auto-populated for legacy rows)

#### Scenario: Index supports GROUP BY

- **WHEN** the owner runs `SELECT indexname FROM pg_indexes WHERE tablename = 'bug_reports'`
- **THEN** the result SHALL include `bug_reports_question_id_idx`

#### Scenario: Legacy rows have NULL question_id

- **WHEN** the owner queries `SELECT count(*) FROM public.bug_reports WHERE question_id IS NULL` immediately after migration
- **THEN** the count SHALL equal the row count before migration (no rows had question_id populated retroactively)

#### Scenario: Inline submissions populate question_id

- **WHEN** the player submits via `QuizBugReportSheet` and the owner queries `SELECT question_id, count(*) FROM public.bug_reports WHERE question_id IS NOT NULL GROUP BY question_id`
- **THEN** every row submitted via the inline flow SHALL contribute to the count for its question
- **AND** rows submitted via `BugReportModal` (settings / help-menu entries) SHALL have `question_id IS NULL`
