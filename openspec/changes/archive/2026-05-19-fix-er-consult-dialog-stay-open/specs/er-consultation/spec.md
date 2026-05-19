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
- **Correct answer** → ER doctor dialogue changes to a randomly-selected gratitude variant (e.g., 「太強了！下次再求救」); show "+X XP" toast; auto-close after 2 seconds
- **Wrong answer** → ER doctor dialogue changes to a randomly-selected disappointed-but-supportive variant (e.g., 「沒事，學起來下次就會了」); reveal correct option + explanation (sourced from `question.explanation`, with mock-exam placeholder fallback for missing explanations); show 「關閉」 button

**Dialog lifecycle independence**: The dialog's visible-on-screen state SHALL NOT be tied directly to `gameCounters.erConsultActive`. Once the user has begun interacting with a consult (modal has rendered at least once), the dialog SHALL remain rendered until one of these explicit close triggers fires:

- Correct-answer auto-close timer elapses (2 seconds after answer)
- User clicks the 「關閉」 button (wrong-answer path)
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
- **AND** the dialog SHALL auto-close after 2 seconds

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

#### Scenario: Correct answer dialog auto-closes after 2 seconds

- **GIVEN** the user has selected the correct option AND `answerERConsult` has finished recording rewards AND the gratitude toast is shown
- **WHEN** 2 seconds elapse
- **THEN** the dialog SHALL unmount (without requiring user click)

#### Scenario: Skip path closes dialog immediately

- **WHEN** the user clicks 跳過 AND (for first skip) confirms via the second confirmation dialog
- **THEN** `skipERConsult` SHALL clear `erConsultActive` in DB
- **AND** the dialog SHALL unmount immediately (no auto-timer, no further user action)

#### Scenario: Browser refresh mid-explanation does not reopen dialog

- **GIVEN** the user has answered wrong AND is reading the explanation AND `answerERConsult` already cleared `erConsultActive` in DB AND the user closes / refreshes the browser before clicking 「關閉」
- **WHEN** the app reloads
- **THEN** the dialog SHALL NOT reopen (DB state already null)
- **AND** the previously-recorded mastery + reward + log SHALL persist (no data loss; no double-credit risk on reopen)

#### Scenario: Missing explanation uses placeholder

- **WHEN** the answer is wrong AND the question's `explanation` field is empty/missing
- **THEN** the dialog SHALL display the placeholder text `「📌 此題詳解暫無 — 可至[陽明國考考古題小組](https://sites.google.com/view/ymmedexam/ans)查詢」` (same wording as mock-exam and mentor-daily)

#### Scenario: Timeout auto-skips after 10 minutes

- **GIVEN** an `erConsultActive` row triggered 10 minutes ago AND the dialog has not been interacted with
- **WHEN** the next tick fires
- **THEN** the consult SHALL auto-resolve as `resolution: 'auto-skipped'`
- **AND** `erConsultActive` SHALL be cleared (set null)
- **AND** the dialog SHALL close if open
