## ADDED Requirements

### Requirement: Mock exam picker surfaces year × session × paper grid

The mock exam picker screen SHALL display all available historical papers as a grid grouped by year (descending) × session (1 then 2) × paper kind (`medexam-1` / `medexam-2`). Each grid cell SHALL show the year, session, paper kind, total question count, and (if any) the timestamp + score of the most recent attempt on that paper.

#### Scenario: Picker shows all extracted papers

- **WHEN** the user navigates to the `/mock` route after content pack hydration completes
- **THEN** the picker SHALL show every distinct `(year, session, paper)` triple present in `questions.json` (typically 36 cells for medexam-tw: 9 years × 2 sessions × 2 papers)
- **AND** cells SHALL sort year descending (latest year first), session ascending (1 before 2), and `medexam-1` rendered before `medexam-2` within the same year + session
- **AND** each cell SHALL display total question count for that paper (typically ≈100 for 一階, source-dependent)

#### Scenario: Previously attempted paper shows last attempt

- **WHEN** the picker renders a paper that has ≥ 1 record in Dexie `mockAttempts` for the current player
- **THEN** the cell SHALL display the most recent attempt's `finishedAt` and `totalScore`
- **AND** a "重做" button SHALL be shown (default action label for re-attempts)

#### Scenario: Empty content pack handled gracefully

- **WHEN** `questions.json` has zero questions matching the `year` + `paper` filter (degenerate case)
- **THEN** the picker SHALL show a placeholder "尚無歷年原卷可挑選" message
- **AND** SHALL NOT crash or show empty grid

### Requirement: Mock runner presents all questions in the paper (≈100, source-dependent for 一階國考) in original paper order

The mock runner screen SHALL load the selected paper's questions in their original order (as emitted by the build script — typically question index 1 through ~100) and present them one at a time without immediate per-question feedback.

#### Scenario: Question order matches source paper

- **WHEN** the user starts a mock for paper `(2024, medexam-1)`
- **THEN** questions SHALL appear in `id` ascending order (which encodes original paper sequence)
- **AND** the question counter SHALL display `1 / N`, `2 / N` (where N is the paper's total question count, ≈100 for 一階國考), etc.

#### Scenario: No reward delta during mock answering

- **WHEN** the user selects an answer for any question during mock
- **THEN** no `REWARD.quizCorrect` / `REWARD.quizWrong` SHALL be applied
- **AND** no XP, stat, or loot SHALL be granted until the mock is submitted
- **AND** the selected option SHALL be stored in volatile mock state for later batch scoring

#### Scenario: User can navigate freely between unanswered questions

- **WHEN** the user is on question N and clicks a "上一題" / "下一題" affordance OR a question-number jump
- **THEN** the runner SHALL navigate without locking previously answered questions
- **AND** answered questions SHALL display the user's previous selection (allowing change)

### Requirement: Mock runner uses stopwatch and auto-pauses on idle/visibility

The mock runner SHALL display an elapsed-time stopwatch (`mm:ss` format) that starts when the user clicks "開始作答" on the first question. The stopwatch SHALL pause automatically when:
- The page's `document.visibilityState` becomes `hidden` (user switches tab / minimizes window), OR
- No user input event (`pointerdown`, `keydown`, `scroll`) has fired in the last 180 seconds

The stopwatch SHALL resume automatically on the next visible + input event.

#### Scenario: Tab switch pauses stopwatch

- **WHEN** a mock is in progress and `document.visibilityState` transitions to `hidden`
- **THEN** the stopwatch's `elapsedSec` accumulation SHALL freeze
- **AND** when visibility returns to `visible`, accumulation SHALL resume from the frozen value

#### Scenario: 180-second idle triggers pause

- **WHEN** no `pointerdown` / `keydown` / `scroll` event has fired for 180 consecutive seconds during an active mock
- **THEN** the stopwatch SHALL pause
- **AND** the next user input event SHALL resume accumulation
- **AND** the UI SHALL display a small "已暫停（無互動）" hint while paused

#### Scenario: Stopwatch does not interfere with reading-loop timer

- **WHEN** a mock is in progress AND the reading-loop capability's timer would otherwise be running
- **THEN** the reading timer SHALL be paused for the duration of the mock
- **AND** SHALL NOT accumulate reading minutes during mock answering

### Requirement: Mock submit triggers full-paper scoring and persists attempt

When the user clicks "交卷" on the mock runner, the system SHALL:
1. Compute `totalScore` as the count of correctly-answered questions
2. Persist a `MockAttempt` record to Dexie via `persistence` capability
3. Apply the boss-tier reward burst via `engine-rewards.REWARD.mockExamPass`
4. Navigate to the result screen

#### Scenario: Submit persists complete attempt record

- **WHEN** the user clicks "交卷" with N questions answered (N ≤ paper total)
- **THEN** a `MockAttempt` record SHALL be written to Dexie with fields: `id` (UUID v4), `paperId` (= `"<year>-<session>-<paper>"`, e.g. `"114-1-medexam-1"`), `startedAt`, `finishedAt`, `elapsedSec`, `totalScore`, `perQuestionAnswers` (array of `{ questionId, userSelection, isCorrect }`)
- **AND** unanswered questions (if user submits early) SHALL be recorded with `userSelection: null` and `isCorrect: false`

#### Scenario: Submit applies mockExamPass reward burst

- **WHEN** the user submits a mock
- **THEN** `applyXp(player, REWARD.mockExamPass.xp)` SHALL be invoked exactly once
- **AND** subject XP SHALL be applied to the paper's primary subject group (`'medexam-1'` → `medexam-1` group, `'medexam-2'` → `medexam-2` group)
- **AND** the `mockExamPass.stat` boost SHALL be applied via `addStat`
- **AND** exactly 1 guaranteed SR-tier loot roll SHALL be triggered

### Requirement: Mock result screen displays full per-question breakdown

The mock result screen SHALL render, on a single scrollable page, the total score, a per-question card list (one per question, ≈100), and a progress-curve panel (when prior attempts exist for the same paper).

#### Scenario: Total score and elapsed time visible at top

- **WHEN** the result screen mounts after submit
- **THEN** the top region SHALL display total score as `N / total`, the elapsed time (mm:ss), and the paper identifier (year + medexam-1/2)

#### Scenario: Each question card shows answer comparison and explanation

- **WHEN** a per-question card is rendered for question Q
- **THEN** the card SHALL display Q's stem, all `options` keys with the user's selection highlighted, the correct answer highlighted in a different color, and the explanation text rendered (markdown allowed)
- **AND** if Q is unanswered (`userSelection: null`), the card SHALL show "未作答" instead of a selection chip

#### Scenario: Missing explanation shows placeholder

- **WHEN** a per-question card is rendered for a question whose `explanation` field is empty or missing
- **THEN** the card SHALL display the placeholder text "📌 此題詳解暫無 — 可至[陽明國考考古題小組](https://sites.google.com/view/ymmedexam/ans)查詢"
- **AND** SHALL NOT crash or leave the explanation region blank

#### Scenario: Progress curve shown for repeated paper

- **WHEN** the result screen mounts AND the current paper has ≥ 1 prior `MockAttempt` records
- **THEN** a progress-curve panel SHALL render showing a line chart of `totalScore` over `finishedAt` (chronological)
- **AND** the latest data point (this attempt) SHALL be visually distinct (e.g. larger marker)
- **AND** a delta label SHALL display "比上次 +X 分" or "比上次 -X 分" or "與上次相同"

#### Scenario: First attempt shows first-time message

- **WHEN** the result screen mounts AND no prior `MockAttempt` exists for the current paper
- **THEN** the progress-curve panel SHALL display "首次嘗試 — 之後可看進步曲線"
- **AND** SHALL NOT render an empty chart

### Requirement: Result screen offers one-click "add wrong answers to SRS"

The mock result screen SHALL display a single action button labeled "將 N 道錯題加入 SRS 排程" (where N = number of wrong answers). Clicking the button SHALL enqueue all wrong-answered questions into the SRS queue via the existing `srs-queue` answer-creates-SrsCard pathway.

#### Scenario: Click enqueues wrong answers

- **WHEN** the user clicks the button on a result page with 12 wrong answers
- **THEN** all 12 wrong-answered question IDs SHALL be passed to `srsQueue.enqueueMany(wrongQuestionIds)` (or equivalent batch entry point)
- **AND** a toast SHALL display "已加入 12 題到 SRS"
- **AND** the button SHALL change to disabled state with label "已加入"

#### Scenario: Zero wrong answers hides the button

- **WHEN** the user achieves perfect score (0 wrong answers)
- **THEN** the SRS enqueue button SHALL NOT render
- **AND** a congratulatory message SHALL display instead

#### Scenario: Enqueue is not automatic

- **WHEN** the result screen mounts with wrong answers present
- **THEN** wrong answers SHALL NOT be auto-enqueued to SRS
- **AND** the button click SHALL be the only path to enqueue

### Requirement: Mock attempts are routable and resumable across reloads

While a mock is in progress, the mock runner state (current question index, selected answers, elapsed time, started timestamp, paused state) SHALL persist to Dexie so that a page reload mid-mock returns the user to the same question with state intact.

#### Scenario: Reload mid-mock restores state

- **WHEN** the user is on question 47 of a mock with 30 answers given and 12 minutes elapsed AND the browser is reloaded
- **THEN** the app SHALL navigate to the mock runner on question 47 with all 30 prior selections preserved
- **AND** the stopwatch SHALL resume from 12 minutes elapsed (not zero)
- **AND** a one-time "已從上次中斷處恢復" toast SHALL display

#### Scenario: Submitting clears in-progress state

- **WHEN** the user submits a mock
- **THEN** the in-progress mock state SHALL be cleared from Dexie
- **AND** subsequent `/mock` visits SHALL return to the picker (not auto-resume)

### Requirement: Reward burst is treated as exception to per-minute rate caps

When `REWARD.mockExamPass` is applied at submit time, any global per-minute stat rate-limiting (currently a project-level discipline, not a hard spec requirement) SHALL be bypassed for this single event. This is the only reward in the engine that grants a large stat delta in one application.

#### Scenario: Mock pass burst is not throttled

- **WHEN** `REWARD.mockExamPass.stat` is applied via `addStat`
- **THEN** the full `delta` SHALL be applied in one tick
- **AND** no rate-limit guard SHALL clamp or defer the application
- **AND** this exception SHALL be documented in `engine-rewards` REWARD table notes
