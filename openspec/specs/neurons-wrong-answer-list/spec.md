# neurons-wrong-answer-list Specification

## Purpose

Per-question answer-result tracking for neurons-tw, surfaced as a 「錯題」 review experience on the `/bookmarks` page alongside 「手動收藏」. A `questionHistory` Dexie store (one row per answered question, written on every `QuizModal` answer) backs two live derived views — 「目前未答對」 (`lastResult === 'wrong'`) and 「歷史曾錯」 (`everWrong === true`, never leaves). `everWrong` is a monotonic-OR flag both locally and across devices (R2 sync), so a permanent wrong-question library accrues from feature launch onward. A single shared filter bar (科目 family + 年份 year + ✨/🤔 標記) applies across all three tabs. Created by archiving change `add-neurons-wrong-questions-subtab`.

## Requirements

### Requirement: Per-question results SHALL be recorded to a `questionHistory` Dexie store on every QuizModal answer

The system SHALL persist a per-question result row to a new `questionHistory` Dexie store (added in schema version 9) every time the player answers a question in `QuizModal`. The row shape SHALL be `{ questionId, family, lastResult, everWrong, lastAnsweredAt, updatedAt }` where `questionId = question.id`, `family = question.subject`, `lastResult ∈ {'correct','wrong'}`, `everWrong: boolean`, and `lastAnsweredAt`/`updatedAt` are write-time epoch milliseconds. Recording SHALL occur in the existing answer handler immediately after `recordCorrectAnswer` / `recordIncorrectAnswer`, wrapped so a recording failure logs to the `[question-history]` channel and never interrupts the answer flow. Recording SHALL work regardless of authentication state (IndexedDB-first).

#### Scenario: Wrong answer creates a row marked wrong

- **GIVEN** the player has no `questionHistory` row for `106-1-醫學一-解剖學-Q1`
- **WHEN** the player selects an incorrect option for that question in `QuizModal`
- **THEN** a `questionHistory` row SHALL exist with `questionId = "106-1-醫學一-解剖學-Q1"`, `family = "解剖學"`, `lastResult = "wrong"`, and `everWrong = true`
- **AND** `lastAnsweredAt` SHALL equal the click instant (within test tolerance)

#### Scenario: Correct answer creates a row marked correct

- **GIVEN** the player has no `questionHistory` row for `106-1-醫學一-解剖學-Q1`
- **WHEN** the player selects the correct option for that question
- **THEN** a `questionHistory` row SHALL exist with `lastResult = "correct"` and `everWrong = false`

#### Scenario: Recording is best-effort and never breaks gameplay

- **GIVEN** the `questionHistory` write throws (e.g. transient IndexedDB error)
- **WHEN** the player answers a question
- **THEN** the family-level effects (AP / synapse / mastery / streak from `recordCorrectAnswer`) SHALL still have committed
- **AND** the error SHALL be logged to the `[question-history]` channel without surfacing a crash to the player

### Requirement: The `everWrong` flag SHALL be monotonic — once true it never reverts, locally or via sync

The system SHALL treat `everWrong` as a monotonic-OR signal. Locally, answering a previously-wrong question correctly SHALL set `lastResult = 'correct'` but SHALL leave `everWrong = true`. During R2 sync apply, the `questionHistory` adapter SHALL resolve `everWrong = (local.everWrong ?? false) || incoming.everWrong`, while resolving `lastResult` / `lastAnsweredAt` / `family` by last-writer-wins on the greater `lastAnsweredAt`, and `updatedAt = max(local, incoming)`. The adapter SHALL NOT use plain LWW for `everWrong`.

#### Scenario: Local correct answer preserves everWrong

- **GIVEN** `questionHistory["106-1-醫學一-解剖學-Q1"] = { lastResult: 'wrong', everWrong: true }`
- **WHEN** the player later answers that question correctly
- **THEN** the row SHALL become `lastResult = 'correct'`
- **AND** `everWrong` SHALL remain `true`

#### Scenario: Sync never clears everWrong via a stale correct row

- **GIVEN** device A has `questionHistory["Q"] = { lastResult: 'wrong', everWrong: true, lastAnsweredAt: 200 }`
- **AND** device B pushes an older row `{ lastResult: 'correct', everWrong: false, lastAnsweredAt: 100 }`
- **WHEN** device A applies device B's bundle
- **THEN** the merged row SHALL keep `everWrong = true`
- **AND** the merged `lastResult` SHALL remain `'wrong'` (A's `lastAnsweredAt` is greater)

#### Scenario: Sync adopts a newer correct result but keeps everWrong

- **GIVEN** device A has `{ lastResult: 'wrong', everWrong: true, lastAnsweredAt: 100 }`
- **AND** device B pushes a newer row `{ lastResult: 'correct', everWrong: false, lastAnsweredAt: 300 }`
- **WHEN** device A applies device B's bundle
- **THEN** the merged row SHALL be `lastResult = 'correct'` (B newer)
- **AND** `everWrong` SHALL still be `true` (monotonic-OR)

### Requirement: `/bookmarks` SHALL present three tabs — 手動收藏 / 目前未答對 / 歷史曾錯

The `/bookmarks` route SHALL render a tabbed container with three sub-tabs: 「手動收藏」 (the existing ⭐ bookmark list, default tab), 「目前未答對」 (live derived view of `questionHistory` filtered `lastResult === 'wrong'`), and 「歷史曾錯」 (live derived view filtered `everWrong === true`). The two wrong-answer lists SHALL be derived at read time from `questionHistory` — no separate store. Rows in the two wrong-answer lists SHALL be display-only (family badge + parsed exam year + truncated stem + relative `lastAnsweredAt`) with NO inline action buttons. The 「手動收藏」 tab SHALL retain its existing per-row actions (重新作答 / 取消收藏).

#### Scenario: Wrong answer appears in 目前未答對 and 歷史曾錯 immediately

- **GIVEN** the player has no `questionHistory` row for `106-1-醫學一-解剖學-Q1`
- **WHEN** the player answers it incorrectly
- **THEN** the 「目前未答對」 list SHALL contain that question
- **AND** the 「歷史曾錯」 list SHALL also contain that question
- **AND** both lists SHALL update reactively without a manual reload

#### Scenario: Correct answer leaves 目前未答對 but stays in 歷史曾錯

- **GIVEN** `questionHistory["106-1-醫學一-解剖學-Q1"] = { lastResult: 'wrong', everWrong: true }`
- **WHEN** the player answers that question correctly
- **THEN** the 「目前未答對」 list SHALL no longer contain that question
- **AND** the 「歷史曾錯」 list SHALL still contain that question

#### Scenario: Default tab is 手動收藏

- **WHEN** the player navigates to `/bookmarks`
- **THEN** the 「手動收藏」 tab SHALL be active by default

#### Scenario: Wrong-answer rows have no action buttons

- **GIVEN** the 「歷史曾錯」 tab is active with at least one row
- **THEN** each row SHALL show family badge + exam year + stem + relative time only
- **AND** SHALL NOT render a 重新作答 or 收藏 button

### Requirement: The three tabs SHALL share one filter bar — family + year + exam-year chips

The `/bookmarks` page SHALL render a single shared filter bar above the tab strip that applies to all three sub-tabs: the existing family (科目) chips, the existing 標記 chips (✨ 太簡單 / 🤔 我亂猜的), and a NEW exam-year chip set. Exam year SHALL be derived from the question id prefix (e.g. `106-1-醫學一-解剖學-Q1` → `106`); a non-numeric prefix SHALL fall into an `unknown` bucket. The year chip set SHALL list the distinct years present in the currently-relevant rows.

#### Scenario: Year is parsed from the question id prefix

- **WHEN** the system derives the exam year for `108-2-醫學二-生理學-Q14`
- **THEN** it SHALL be `108`

#### Scenario: Filter applies across all three tabs

- **GIVEN** the player excludes family `解剖學` and selects only year `106` in the shared filter bar
- **WHEN** the player switches between 手動收藏 / 目前未答對 / 歷史曾錯
- **THEN** every visible list SHALL exclude `解剖學` rows and show only `106` rows

### Requirement: questionHistory SHALL sync via the R2 neurons bundle with a schema_version bump and backward tolerance

The system SHALL register a `questionHistory` TableAdapter in `NEURONS_ADAPTERS` and bump the bundle `SCHEMA_VERSION` from 4 to 5. The bump SHALL be additive: a client at schema 9 reading an older bundle without the `questionHistory` key SHALL preserve its local `questionHistory` untouched; a client without the `questionHistory` adapter reading a schema-5 bundle SHALL silently drop the unknown key (existing forward-compat tolerance). The Worker SHALL require no change (bundle-opaque transport).

#### Scenario: New client reading an old bundle preserves local history

- **GIVEN** a schema-9 client with non-empty local `questionHistory`
- **WHEN** it applies a bundle whose `data` has no `questionHistory` key
- **THEN** the adapter SHALL receive `[]` and make no changes
- **AND** the local `questionHistory` rows SHALL remain intact

#### Scenario: Old client tolerates a new bundle

- **GIVEN** a client whose `NEURONS_ADAPTERS` does not include `questionHistory`
- **WHEN** it pulls a bundle with `schema_version = 5` containing a `questionHistory` key
- **THEN** it SHALL apply the bundle without error
- **AND** the `questionHistory` key SHALL be ignored

### Requirement: Existing players SHALL NOT be backfilled and the v8→v9 upgrade SHALL be additive

The Dexie v8 → v9 upgrade SHALL only add the `questionHistory` store with no row backfill, leaving it empty for existing players; the wrong-answer lists accrue from the upgrade onward. No primary key on any existing store SHALL change. No explanatory banner SHALL be shown. A v8→v9 upgrade fixture test SHALL accompany the schema bump per the project Dexie upgrade-fixture rule.

#### Scenario: Upgrade leaves history empty and DB opens cleanly

- **GIVEN** an existing player on Dexie v8 with bookmarks and flags
- **WHEN** the app opens at Dexie v9
- **THEN** the DB SHALL open without a `DatabaseClosedError`
- **AND** `questionHistory` SHALL be empty
- **AND** the existing bookmarks and flags SHALL be intact

#### Scenario: First answer after upgrade seeds the first row

- **GIVEN** a freshly-upgraded v9 player with empty `questionHistory`
- **WHEN** the player answers any question
- **THEN** exactly one `questionHistory` row SHALL be created for that question
