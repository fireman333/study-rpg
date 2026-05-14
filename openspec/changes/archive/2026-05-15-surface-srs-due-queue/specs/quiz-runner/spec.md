## ADDED Requirements

### Requirement: QuizModal supports reading-mode and review-mode

The QuizModal SHALL accept a `mode` prop with values `'reading'` (default) or `'review'`. The mode SHALL control question selection logic and visual presentation, but SHALL NOT alter the reveal / reward batching / SRS write behavior.

In `'reading'` mode (default and backward-compatible), the modal SHALL behave per the existing `Quiz modal presents N random questions` requirement (due-biased + fresh filler).

In `'review'` mode, the modal SHALL pick questions exclusively from the due-card pool. The selection SHALL be:

1. Filter `dueQuestionIds` to questions present in the active pool (and optional subject)
2. Shuffle the filtered due list
3. Take the first `min(filteredDue.length, REVIEW_BATCH_SIZE)` questions
4. If `filteredDue` is empty, the modal SHALL render the empty-state UI per the existing `題庫空了` requirement

`REVIEW_BATCH_SIZE` SHALL be a host-app constant set to `20` for this MVP; future content packs MAY override.

#### Scenario: reading-mode default behavior unchanged

- **WHEN** QuizModal is rendered without a `mode` prop (or `mode === 'reading'`)
- **THEN** selection SHALL follow the existing due-biased + fresh-filler logic
- **AND** any caller already using QuizModal SHALL not observe behavioral changes (backward compatible)

#### Scenario: review-mode pulls only due cards

- **WHEN** QuizModal is rendered with `mode='review'` and `dueQuestionIds.length === 7`
- **THEN** the modal SHALL present exactly 7 questions, all from the due pool, in shuffled order
- **AND** NO fresh (never-seen) questions SHALL be included
- **AND** the modal header SHALL indicate this is a review session

#### Scenario: review-mode caps at REVIEW_BATCH_SIZE

- **WHEN** QuizModal is rendered with `mode='review'` and `dueQuestionIds.length === 35`
- **THEN** the modal SHALL present exactly 20 questions (the first 20 of the shuffled due pool)
- **AND** the remaining 15 cards SHALL stay due (untouched in `db.srs`) for a subsequent review session

### Requirement: Review-mode banner indicates session type

When `mode === 'review'`, the QuizModal SHALL render a visually distinct banner above the question stem (visible on every question in the session) communicating that this is a review session of previously-seen questions.

The banner palette SHALL be visually distinguishable from the image-placeholder banner (which uses an amber / warning palette) — e.g., a cool blue / purple tone.

The banner SHALL display either the total review batch size (`共 N 題`) or the position (`第 X / N 題`); both are acceptable so long as the player can tell where they are in the review session.

#### Scenario: Banner visible in review-mode

- **WHEN** the QuizModal renders any question with `mode='review'`
- **THEN** a review-mode banner SHALL appear above the question stem
- **AND** the banner SHALL persist through answering and reveal states for every question in the session

#### Scenario: Banner hidden in reading-mode

- **WHEN** the QuizModal renders any question with `mode='reading'` (or default)
- **THEN** the review-mode banner SHALL NOT appear
- **AND** the existing image-placeholder banner (on hasImage questions) SHALL still render per its own requirement

### Requirement: Review-mode preserves SRS write and reward batching

Review-mode SHALL NOT alter the SRS write or reward batching logic:

- Each answered question still triggers `reviewCard(quality=4 if correct, 2 if wrong)` upsert to `db.srs`
- Reward calculation uses existing `REWARD.quizCorrect` / `REWARD.quizWrong` values
- Loot rolls fire per correct answer (same as reading-mode)
- The hasImage-skip behavior is **disabled** in review-mode: review sessions force the player to attempt each card (skip would undermine retention). Banner on hasImage questions still appears for context, but no skip button is rendered.

This isolation lets future changes tune review-specific XP/loot without touching reading-mode.

#### Scenario: Correct review answer extends SRS interval

- **WHEN** the player answers a due card correctly in review-mode
- **THEN** `reviewCard(card, 4)` SHALL be invoked
- **AND** `db.srs.get(qid).interval` SHALL increase per SM-2 (typically multiplied by ease factor)
- **AND** XP and loot SHALL fire per existing `REWARD.quizCorrect`

#### Scenario: Wrong review answer resets interval

- **WHEN** the player answers a due card wrong in review-mode
- **THEN** `reviewCard(card, 2)` SHALL be invoked
- **AND** `db.srs.get(qid).lapses` SHALL increment by 1
- **AND** `db.srs.get(qid).interval` SHALL reset to 1 day per SM-2 lapse handling

#### Scenario: Skip button disabled in review-mode

- **WHEN** QuizModal renders a hasImage question with `mode='review'`
- **THEN** the image-placeholder banner SHALL appear (per existing requirement)
- **AND** the "跳過此題" skip button SHALL NOT appear (even though hasImage is true)
- **AND** the player MUST answer the question to advance
