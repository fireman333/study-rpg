## ADDED Requirements

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

The QuizModal SHALL pick N questions (default 5) uniformly at random from the available content pack pool, optionally filtered by subject, and present them one at a time.

#### Scenario: Opens with 5 random questions

- **WHEN** the player clicks "開始答題"
- **THEN** the QuizModal SHALL render
- **AND** it SHALL select 5 questions from `content.questions` filtered to the default subject (`藥理學`)
- **AND** the first question's stem + 4 options SHALL be visible

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
