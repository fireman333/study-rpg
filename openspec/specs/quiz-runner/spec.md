# quiz-runner Specification

## Purpose
TBD - created by archiving change add-real-quiz-flow. Update Purpose after archive.
## Requirements
### Requirement: Content pack loads at app mount

The app SHALL fetch the bound content pack's `questions.json`, `subjects.json`, and `meta.json` on mount, store the resolved `ContentPack` in component state, and gate quiz UI on a non-null content.

#### Scenario: Quiz button disabled while loading

- **WHEN** the app has just mounted and `content === null`
- **THEN** the "開始答題" button SHALL be disabled
- **AND** the hint text SHALL read `載入題庫中...`
- **AND** no fetch-error SHALL leak to user-visible UI without explicit error handling

#### Scenario: Content available enables quiz

- **WHEN** the content pack fetch completes successfully
- **THEN** the "開始答題" button SHALL be enabled
- **AND** the hint SHALL display the number of available questions (e.g. `共 418 題`)

### Requirement: Quiz modal presents N random questions

The QuizModal SHALL pick N questions (default 5) from the available content pack pool, optionally filtered by subject, presenting them one at a time.

Selection SHALL be **due-card-biased** per the `srs-queue` capability:
1. Compute `dueInPool` = questions whose `questionId` is in `dueQuestionIds` (an SRS-filtered list passed in as a prop)
2. Compute `freshInPool` = remaining pool questions
3. Pick all due questions first (shuffled), then fill remainder from shuffled fresh
4. If both pools exhausted, render however many questions are available (may be fewer than N)

#### Scenario: Opens with N due-biased questions

- **WHEN** the player clicks "開始答題"
- **AND** the SRS queue contains 3 due questions for the active subject
- **THEN** the QuizModal SHALL render with 5 questions: 3 due + 2 fresh
- **AND** the first question SHALL be one of the 3 due (shuffled, not deterministic which)

#### Scenario: Empty SRS queue falls back to pure random

- **WHEN** the player clicks "開始答題" and no SRS cards are due
- **THEN** the QuizModal SHALL render 5 random questions from the fresh pool (legacy MVP behavior)

### Requirement: Click option reveals correctness + explanation

When the player clicks an MCQ option, the modal SHALL immediately reveal whether it's correct, show the right answer, and display the question's `explanation` field.

#### Scenario: Correct answer feedback

- **WHEN** the player clicks the option matching `question.answer`
- **THEN** that option's tile SHALL gain a green outline / ✓ marker
- **AND** the `explanation` field SHALL render below the options with `white-space: pre-wrap` to preserve line breaks
- **AND** a "下一題" button SHALL appear

#### Scenario: Wrong answer feedback

- **WHEN** the player clicks an option NOT matching `question.answer`
- **THEN** the clicked option SHALL gain a red outline / ✗ marker
- **AND** the correct option SHALL gain a green outline / ✓ marker so the player sees the right answer
- **AND** the `explanation` SHALL render the same way as the correct case

### Requirement: Cycle through N questions, summary at end

After clicking "下一題" the modal SHALL advance to the next question; after the last question, it SHALL show a session summary.

#### Scenario: Advancing mid-session

- **WHEN** the player clicks "下一題" while not on the final question
- **THEN** the modal SHALL show the next question in answering state
- **AND** the previous question's reveal state SHALL be discarded (not re-shown if the player clicks back)

#### Scenario: Summary on completion

- **WHEN** the player answers the last (5th) question and clicks "下一題"
- **THEN** the modal SHALL display a summary panel: `「答對 X / 5」`
- **AND** a "完成" button SHALL close the modal and trigger reward calculation

### Requirement: Reward batched after modal close

The reward integration SHALL batch all 5 question outcomes into a single `setPlayer` update, plus one loot roll per correct answer (sequentially-spaced for visual readability).

#### Scenario: 5 correct answers grant 5 rolls + 50 XP

- **WHEN** the modal closes after 5 correct answers
- **THEN** `Player.xp` SHALL increase by exactly `5 × REWARD.quizCorrect.xp`
- **AND** `Player.stats.knowledge` SHALL increase by exactly `5 × REWARD.quizCorrect.stat.delta`
- **AND** 5 separate loot rolls SHALL fire, each ~150ms apart
- **AND** `Player.lootStats.totalRolls` SHALL increase by exactly 5

#### Scenario: Mixed answers

- **WHEN** the modal closes after 3 correct + 2 wrong
- **THEN** `Player.xp` SHALL increase by `3 × REWARD.quizCorrect.xp + 2 × REWARD.quizWrong.xp`
- **AND** exactly 3 loot rolls SHALL fire (one per correct)

### Requirement: Attribution displayed in quiz modal footer

Per the project rule `yangming-attribution`, the QuizModal footer SHALL display 陽明國考考古題小組 credit + source URL persistently across all 5 questions.

#### Scenario: Footer present on every question

- **WHEN** any question is shown in the modal
- **THEN** the modal footer SHALL include text `詳解 © 陽明國考考古題小組` linked to `https://sites.google.com/view/ymmedexam/ans`
- **AND** removing this footer SHALL be considered a breaking change requiring written approval

### Requirement: Image-placeholder banner on hasImage questions

When the active question's `hasImage === true` and no actual image asset is available, the QuizModal SHALL render a placeholder banner above the question stem to inform the player that the original question had an accompanying image which is not yet imported.

The banner SHALL be visually distinct (e.g. yellow/warning palette) and SHALL appear in both answering state and reveal state — it MUST NOT disappear after the player picks an option.

Future image support: when a future content-pack revision adds an `imageUrl` (or equivalent) field and the asset is reachable, the banner SHALL be replaced by the rendered image. The decision logic SHALL be encapsulated inside the component; this spec only mandates the placeholder-vs-image behavior at the boundary.

#### Scenario: hasImage true shows banner

- **WHEN** the QuizModal renders a question with `hasImage === true` and no available image asset
- **THEN** a visually distinct banner SHALL appear above the question stem
- **AND** the banner text SHALL clearly communicate that the question originally had an image which is not yet imported
- **AND** the banner SHALL persist through both answering and reveal states for that question

#### Scenario: hasImage false shows no banner

- **WHEN** the QuizModal renders a question with `hasImage === false` (or the field missing)
- **THEN** no placeholder banner SHALL appear
- **AND** the question stem SHALL render as before this change

### Requirement: Skip button allows bypassing hasImage questions in reading mode

In QuizModal (reading-mode quiz, non-boss), the placeholder banner SHALL include a "跳過此題" (skip) action. Clicking skip SHALL:

1. Advance to the next question without revealing the answer
2. NOT count the skipped question toward correct or wrong tallies
3. NOT write any SRS card for the skipped question
4. NOT fire a loot roll
5. Increment a session-local `skippedCount` for display in the final summary
6. If skip is pressed on the last question, jump directly to the summary state

The skip action SHALL be available only before the player has clicked an MCQ option for that question; once an answer is revealed, skip SHALL no longer be offered (player committed to answering).

#### Scenario: Skip advances past hasImage question

- **WHEN** the player is on a hasImage question in answering state and clicks "跳過此題"
- **THEN** the modal SHALL advance to the next question (or summary if last)
- **AND** the skipped question SHALL NOT count as correct or wrong
- **AND** no SRS card SHALL be created or updated for that question
- **AND** no loot roll SHALL fire for that question

#### Scenario: Skip not offered after reveal

- **WHEN** the player has already clicked an MCQ option on a hasImage question
- **THEN** the "跳過此題" button SHALL NOT appear (or SHALL be disabled)
- **AND** the player SHALL proceed via the existing "下一題" button

#### Scenario: Summary reflects skipped count

- **WHEN** the player completes a 5-question session having skipped 2 hasImage questions
- **THEN** the summary panel SHALL show both the answered tally (e.g. `答對 2 / 3`) and the skipped count (e.g. `跳過 2`)
- **AND** the reward calculation SHALL apply only to the 3 answered questions

### Requirement: Skip does not affect attribution footer or reward batching

The skip behavior SHALL NOT alter existing requirements:

- The Yangming attribution footer SHALL still render on every shown question (including hasImage placeholder questions before skip)
- The "Reward batched after modal close" requirement still applies, but the batched outcomes SHALL exclude skipped questions (since skipped questions have no `correct` outcome)
- `Player.lootStats.totalRolls` SHALL increase by the number of CORRECT answers, not by `N - skipped`

#### Scenario: Mixed session with skips

- **WHEN** the player session ends with 2 correct + 1 wrong + 2 skipped (out of N=5)
- **THEN** `Player.xp` SHALL increase by `2 × REWARD.quizCorrect.xp + 1 × REWARD.quizWrong.xp` (skipped questions contribute zero)
- **AND** exactly 2 loot rolls SHALL fire (one per correct)
- **AND** `Player.lootStats.totalRolls` SHALL increase by 2 (not 3, not 5)

