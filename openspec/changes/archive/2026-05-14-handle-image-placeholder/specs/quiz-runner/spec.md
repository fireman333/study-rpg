## ADDED Requirements

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
