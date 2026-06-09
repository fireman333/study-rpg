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

### Requirement: QuizModal tracks per-question elapsed time

The QuizModal SHALL record a `startedAt` timestamp every time it advances to a new question (including the initial question on modal open). When the player selects an MCQ option, the modal SHALL compute `elapsedMs = Date.now() - startedAt` and include it in the `onAnswer` callback payload so the host (App.tsx) can dispatch fast-answer rewards.

The `elapsedMs` value SHALL refer to the time between question-render and option-click — re-clicking another option after reveal MUST NOT reset or extend the elapsed time, since the question is already "answered" at the first click.

#### Scenario: Elapsed time captured on first click

- **WHEN** a new question is rendered in QuizModal at time T0
- **AND** the player clicks an MCQ option at time T1
- **THEN** the `onAnswer` callback SHALL receive `elapsedMs ≈ (T1 - T0)`
- **AND** the value SHALL be a non-negative integer in milliseconds

#### Scenario: Switching modes resets the per-question timer

- **WHEN** QuizModal advances to the next question (via "下一題")
- **THEN** the per-question `startedAt` SHALL be reset to the new question's render time
- **AND** the previous question's elapsed time SHALL NOT bleed into the new question's measurement

#### Scenario: Skip path emits no elapsed time

- **WHEN** the player presses "跳過此題" on a hasImage question (per existing skip requirement)
- **THEN** no `elapsedMs` SHALL be reported (skip is not an answer event)
- **AND** the per-question `startedAt` SHALL still reset for the next question rendered after skip


### Requirement: 一階 quiz pool SHALL exclude `hasOptionImages` questions

The 一階 host app SHALL filter out questions with `hasOptionImages === true` from the `content.questions` pool before passing it as the `pool` prop to `QuizModal`, `BossModal`, or `MentorDialog`. The filter SHALL be applied once at content-load time so all downstream pickers (subject-filtered random, boss subset, mentor backlog) consume a consistent playable pool.

The 一階 corpus currently contains zero `hasOptionImages: true` questions, so this requirement is forward-compatibility insurance: if a future upstream PDF-extractor regression causes 一階 questions to acquire option-image markers, the filter prevents them from reaching the quiz UI without further code change.

The 一階 build script SHALL also emit `hasOptionImages` on every `Question` (defaulting to `false` when no option contains the `_(圖片或缺失)_` marker), matching the schema field's role in `content-pack-contract` and the parallel 二階 build behavior in `medexam2-corpus-ingestion`.

#### Scenario: Filter runs at content load even when zero questions match

- **WHEN** `getContentPack('/study-rpg/content/medexam-tw')` resolves
- **THEN** the resolved pack's `questions` array SHALL be filtered to exclude `hasOptionImages === true`
- **AND** with the current corpus the filtered length SHALL equal the source length (no questions dropped)
- **AND** the filter SHALL run unconditionally — not gated on a feature flag — so a future regression cannot bypass it

#### Scenario: Filtered pool propagates to all pickers

- **WHEN** the filtered pool is threaded into `QuizModal pool={...}` / `BossModal pool={...}` / `MentorDialog` candidate selection
- **THEN** none of those components SHALL receive a question with `hasOptionImages === true`
- **AND** no per-component re-filter SHALL be required (single choke point at App.tsx)

#### Scenario: Build emits hasOptionImages field on every question

- **WHEN** `pnpm --filter @study-rpg/content-medexam-tw build` completes
- **THEN** every `Question` object in `dist/questions.json` SHALL include a `hasOptionImages` boolean field
- **AND** with the current corpus snapshot every value SHALL be `false`
- **AND** the `imported / skipped / total` counter SHALL remain unchanged from the prior-baseline (`3291 / 309 / 3600`)

### Requirement: QuizModal action bar SHALL surface 「太簡單」 and 「我亂猜的」 opt-in buttons in correct-answer state

When the player has answered a question correctly in `apps/medexam-tw`'s QuizModal and the reveal panel is shown, the action bar SHALL render two opt-in buttons alongside the existing 下一題 affordance:

- **「太簡單」** — visual label with a「✨」 (or equivalent visual cue). On click, invokes the Easy modifier path on the corresponding `SrsCard` (per `srs-queue` capability).
- **「我亂猜的」** — visual label with a 「🤔」 (or equivalent visual cue). On click, invokes the Guessed modifier path on the corresponding `SrsCard` (per `srs-queue` capability).

The 🐞 bug-report affordance MAY live in the action bar (二階 / `hospital-quiz` capability) OR in the modal header (一階 / current `quiz-runner` capability) — both arrangements are acceptable. Cross-track visual parity of the bug-report placement is out of scope for this change.

Both buttons SHALL be hidden when the player answered incorrectly. The action bar in the wrong-state SHALL contain only 下一題 (plus 🐞 if 🐞 is in the action bar for that app — unchanged from prior behavior).

Both buttons SHALL be debounced (single click = single application) and SHALL provide visual confirmation feedback after click (e.g., button briefly dims or shows a check mark) so the player knows the click registered.

Both buttons SHALL be optional — clicking 下一題 without engaging either modifier proceeds with the default quality-4 SM-2 update.

The buttons SHALL NOT alter the reward dispatch path (XP, fate-card draws, mastery, achievements, etc.) — they only modify SRS state.

These buttons SHALL be visually distinguished from the inline ★ promote-to-manual-bookmark affordance (per `question-bookmarks` capability), which lives in the explanation region (not the action bar) and writes a different Dexie table (`bookmarks`, not `srs`).

#### Scenario: Correct answer reveal shows both opt-in buttons

- **GIVEN** the player answers a question correctly in QuizModal
- **WHEN** the reveal panel renders
- **THEN** the action bar SHALL display ✨ 「太簡單」 and 🤔 「我亂猜的」 between any existing affordances and 下一題
- **AND** the 🐞 bug-report affordance SHALL remain accessible somewhere in the QuizModal (action bar OR modal header — implementation discretion per app)
- **AND** all visible action-bar affordances SHALL be enabled

#### Scenario: Wrong answer reveal hides opt-in buttons

- **GIVEN** the player answers a question incorrectly in QuizModal
- **WHEN** the reveal panel renders
- **THEN** the action bar SHALL display ONLY 下一題 (plus 🐞 if 🐞 lives in the action bar for this app)
- **AND** 「太簡單」 SHALL NOT be visible
- **AND** 「我亂猜的」 SHALL NOT be visible

#### Scenario: Click 「太簡單」 then 下一題 advances to next question with Easy modifier applied

- **GIVEN** the reveal panel is open after a correct answer
- **WHEN** the player clicks 「太簡單」 then clicks 下一題
- **THEN** the corresponding `SrsCard` SHALL be updated per the Easy modifier path (per `srs-queue` capability)
- **AND** the modal SHALL advance to the next question

#### Scenario: Click neither button proceeds with default quality-4 mapping

- **GIVEN** the reveal panel is open after a correct answer
- **WHEN** the player clicks 下一題 without touching 「太簡單」 or 「我亂猜的」
- **THEN** the corresponding `SrsCard` SHALL be updated per the default quality-4 mapping
- **AND** the modal SHALL advance to the next question

#### Scenario: Click 「我亂猜的」 does not penalize rewards

- **GIVEN** a correct answer would grant N reading-buff XP + 1 fate-card slot per the default path
- **WHEN** the player clicks 「我亂猜的」
- **THEN** the same N XP + 1 fate-card slot SHALL be dispatched
- **AND** the SRS row SHALL receive `interval = 1` (per Guessed modifier path)

#### Scenario: Buttons are debounced

- **GIVEN** the reveal panel is open after a correct answer
- **WHEN** the player rapidly double-clicks 「太簡單」 within 500 ms
- **THEN** exactly one Easy modifier application SHALL be queued
- **AND** the second click SHALL be discarded

### Requirement: Session question pool is fixed at session start

The QuizModal SHALL derive its session question pool exactly once, when the session begins, and SHALL NOT re-derive or re-shuffle it for the lifetime of that session — even when the upstream pool input changes reference (e.g. the caller rebuilds it because `questionHistory` updated after an answer). A new session (a fresh modal mount) re-derives the pool from current state; within a session the question order is immutable. This holds for both shuffled modes (新題 / 隨機 / 出征) and the order-preserving 錯題 review mode.

#### Scenario: Answering does not reorder the session

- **WHEN** the player answers a question (which writes `questionHistory` and may mint a variant, updating the live query the caller's pool is derived from)
- **THEN** the currently displayed question and the remaining session order SHALL stay unchanged (the question does not "jump")

#### Scenario: Advancing serves the next question in the fixed order

- **WHEN** the player clicks 下一題 after answering
- **THEN** the modal SHALL advance to the next question in the session's fixed order, not a freshly re-shuffled one

#### Scenario: A new session re-derives the pool

- **WHEN** the player closes the modal and starts a new quiz session
- **THEN** the new session SHALL derive its pool from current `questionHistory` (a fresh shuffle, or the current oldest-due-first order for review mode)
