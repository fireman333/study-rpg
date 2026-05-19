## MODIFIED Requirements

### Requirement: ERConsultDialog UI SHALL show ER doctor sprite + consult-tone dialogue + embedded question

The ER consultation SHALL be presented via an `ERConsultDialog` modal component, distinct from `QuizModal` and `MentorDialog`. The dialog SHALL display:

- ER doctor sprite portrait (≥ 120×120 px) using sprite key `'er-doctor'` from the active theme pack
- Title `「急診照會」`
- A dialogue bubble with the ER doctor's opening line (randomly selected from 5 hard-coded greeting variants, all in consult-request tone — e.g., 「{subject} 這題我不太確定，幫我看一下！」)
- An embedded question card (stem, options, subject tag) sourced from `content.questions[erConsultActive.questionId]`
- A 「跳過」 button that triggers the skip path
- A countdown indicator showing "本次照會 N 分鐘內回應" (default 10 minutes; on timeout auto-skip)

After the user answers:
- **Correct answer** → ER doctor dialogue changes to a randomly-selected gratitude variant (e.g., 「太強了！下次再求救」); show "+X XP / +Y 聲望" toast; reveal correct option + explanation; show 「關閉」 button (user-dismissed, same as wrong-answer path)
- **Wrong answer** → ER doctor dialogue changes to a randomly-selected disappointed-but-supportive variant (e.g., 「沒事，學起來下次就會了」); reveal correct option + explanation (sourced from `question.explanation`, with mock-exam placeholder fallback for missing explanations); show 「關閉」 button

**Dialog lifecycle independence**: The dialog's visible-on-screen state SHALL NOT be tied directly to `gameCounters.erConsultActive`. Once the user has begun interacting with a consult (modal has rendered at least once), the dialog SHALL remain rendered until one of these explicit close triggers fires:

- User clicks the 「關閉」 button (both correct-answer and wrong-answer paths)
- User confirms 跳過 (skip path)

Service-layer functions (`answerERConsult`, `skipERConsult`, `disableERConsult`, tick auto-skip) MAY clear `erConsultActive` in DB at any point during the dialog's visible lifecycle without unmounting the dialog. The dialog component SHALL hold its own local copy of the active state to remain rendered after DB state is cleared.

#### Scenario: Dialog opens with sprite + greeting + question

- **WHEN** `erConsultActive` is set and `ERConsultDialog` mounts
- **THEN** the sprite SHALL be the active theme's `er-doctor` sprite
- **AND** the dialogue text SHALL be one of 5 hard-coded greeting variants
- **AND** the dialogue SHALL reference the selected subject by name (e.g., `「眼科 這題我...」`)
- **AND** the question card SHALL render the stem and options for `erConsultActive.questionId`

#### Scenario: Correct answer rewards 1.8× XP with streak multiplier

- **WHEN** the user selects the correct option on an ER consult question
- **THEN** the player SHALL gain `Math.floor(REWARD.quizCorrect.xp * 1.8 * streakMultiplier)` XP via `applyXp`
- **AND** the player SHALL gain `REWARD.quizCorrect.stat` (knowledge +1) via `addStat`
- **AND** `mastery[subjectId]` SHALL be updated to `{correct + 1, total + 1}` (same hospital-quiz answer path)
- **AND** the global `quizEvents.emit('correct-answer')` SHALL be invoked
- **AND** the ER doctor dialogue SHALL show a gratitude variant
- **AND** the dialog SHALL reveal the correct option + explanation + 「關閉」 button (user-dismissed)

#### Scenario: Wrong answer grants minimal XP and routes to SRS

- **WHEN** the user selects an incorrect option on an ER consult question
- **THEN** the player SHALL gain `REWARD.quizWrong.xp` XP (2 XP, no multiplier)
- **AND** `mastery[subjectId]` SHALL be updated to `{correct + 0, total + 1}`
- **AND** the question SHALL be enqueued to `db.srs` via the existing answer-creates-SrsCard pathway
- **AND** the dialog SHALL reveal correct option + explanation before allowing close

#### Scenario: Wrong answer dialog stays open until user clicks 關閉

- **GIVEN** the user has selected an incorrect option AND `answerERConsult` has finished recording mastery + reward + log AND `gameCounters.erConsultActive` is now `null` in DB
- **WHEN** the dialog continues to render
- **THEN** the dialog SHALL remain visible (NOT auto-unmount on the next `useLiveQuery` tick)
- **AND** the explanation block (rendered by `<ExplanationMarkdown>`) SHALL be visible
- **AND** a 「關閉」 button SHALL be visible alongside the explanation
- **WHEN** the user clicks 「關閉」
- **THEN** the dialog SHALL unmount

#### Scenario: Correct answer dialog stays open until user clicks 關閉

- **GIVEN** the user has selected the correct option AND `answerERConsult` has finished recording rewards AND the gratitude toast is shown
- **WHEN** the dialog continues to render
- **THEN** the dialog SHALL remain visible (NOT auto-unmount via a timer)
- **AND** the explanation block SHALL be visible (same as wrong-answer path, for learning continuity)
- **AND** a 「關閉」 button SHALL be visible
- **WHEN** the user clicks 「關閉」
- **THEN** the dialog SHALL unmount

#### Scenario: Skip path closes dialog immediately

- **WHEN** the user clicks 跳過 AND (for first skip) confirms via the second confirmation dialog
- **THEN** `skipERConsult` SHALL clear `erConsultActive` in DB
- **AND** the dialog SHALL unmount immediately (no auto-timer, no further user action)

#### Scenario: Browser refresh mid-explanation does not reopen dialog

- **GIVEN** the user has answered wrong AND is reading the explanation AND `answerERConsult` already cleared `erConsultActive` in DB AND the user closes / refreshes the browser before clicking 「關閉」
- **WHEN** the app reloads
- **THEN** the dialog SHALL NOT auto-reopen
- **AND** the reward / log entries from the answer SHALL remain persisted

## ADDED Requirements

### Requirement: Dialog SHALL hold sticky question until user closes

While the `ERConsultDialog` component is rendered with a non-null sticky question (`sticky !== null`), the dialog SHALL NOT replace `sticky` with a newly-arriving `gameCounters.erConsultActive` (i.e., a follow-up consult rolled by tick after the player answered or before the player closed). The dialog SHALL adopt a new `erConsultActive` only after `sticky` becomes `null` (user clicked 關閉 or 確認跳過).

This protects the player's reading session: if the player answers Q1 and is reading the explanation when tick rolls Q2, Q1 stays on screen until the player explicitly closes. Q2 sits in `gameCounters.erConsultActive` (DB layer) until the player closes Q1; then the dialog adopts Q2 (or if Q2 has expired in the interim, the auto-skip path applies).

#### Scenario: Q1 still on screen when Q2 rolls

- **GIVEN** the dialog is rendering Q1 with `sticky.questionId === 'Q1'` AND the user has answered Q1 AND `answerERConsult` cleared `erConsultActive` in DB AND the user has NOT clicked 「關閉」 yet
- **WHEN** tick fires a new consult and sets `erConsultActive = { questionId: 'Q2', ... }` in DB
- **THEN** the dialog SHALL continue to display Q1 (sticky unchanged)
- **AND** the explanation block for Q1 SHALL remain visible
- **WHEN** the user clicks 「關閉」 on Q1
- **THEN** `sticky` SHALL become `null` and the dialog SHALL unmount
- **AND** the next `useLiveQuery` tick SHALL adopt Q2 from `erConsultActive` and render the Q2 consult fresh
