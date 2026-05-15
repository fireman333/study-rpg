# mentor-daily Specification

## Purpose
TBD - created by archiving change add-mentor-daily-question. Update Purpose after archive.

## Requirements

### Requirement: Daily mentor question is auto-selected by Hybrid algorithm

The system SHALL assign at most one new "mentor daily question" per UTC+8 calendar day. The selection SHALL follow a 3-layer Hybrid algorithm:

1. **SRS due**: If `db.srs` has cards with `dueAt <= now`, select the card with the **oldest** `dueAt`. Use its `questionId`.
2. **Weak subject fallback**: If no SRS due cards exist, find the subject in `player.subjectLevels` with the lowest `mastery` value. From `content.questions` filtered by that subject, randomly select 1 question (excluding any question whose ID appears in `db.attempts` within the last 30 days).
3. **Random fallback**: If all subjects have `mastery >= 1.0` OR all questions have been attempted within the last 30 days, randomly select 1 from the full pool. The MentorDialog SHALL display an additional message "你已通透 — 隨機複習".

#### Scenario: SRS due cards exist — oldest one wins

- **WHEN** the daily question selector runs AND `db.srs.where('dueAt').belowOrEqual(now)` returns ≥ 1 card
- **THEN** the selected `questionId` SHALL be the card with the smallest `dueAt`
- **AND** if multiple cards tie on `dueAt`, the tie-break SHALL be stable (e.g. by `questionId` ascending)

#### Scenario: No SRS due — weak subject random pick

- **WHEN** the selector runs AND no SRS card has `dueAt <= now` AND at least one subject has `mastery < 1.0`
- **THEN** the selector SHALL identify the subject with the smallest `mastery` value (tie-break by subject ID ascending)
- **AND** SHALL pick a random question from that subject, excluding any `questionId` present in `db.attempts.where('ts').above(now - 30 * 24 * 3600 * 1000).toArray()`
- **AND** if the filtered pool is empty after exclusion, SHALL fall through to the random fallback layer

#### Scenario: Random fallback — all mastered

- **WHEN** all subjects have `mastery >= 1.0` AND no SRS due
- **THEN** the selector SHALL pick a random question from the full `content.questions` pool
- **AND** MentorDialog SHALL display the message "你已通透 — 隨機複習" along with the question

### Requirement: Mentor backlog accumulates missed days, capped at 5

The Dexie `mentorBacklog` singleton SHALL queue pending question IDs across UTC+8 days. New questions SHALL be added to the queue on app mount when the previous `lastAssignedDate` is earlier than today (UTC+8). The queue SHALL be hard-capped at 5 entries.

#### Scenario: First-ever app mount — immediate first question

- **WHEN** the app mounts AND the `mentorBacklog` singleton does NOT exist (first-ever player)
- **THEN** the singleton SHALL be created with one freshly-selected `questionId` and `lastAssignedDate = today (UTC+8)`

#### Scenario: New day — add one question

- **WHEN** the app mounts AND `mentorBacklog.lastAssignedDate < today (UTC+8)` AND `questionIds.length < 5`
- **THEN** the selector SHALL run once for each missed UTC+8 day (between `lastAssignedDate` exclusive and today inclusive), appending one new `questionId` per day to the queue
- **AND** the queue SHALL be truncated to 5 entries if the accumulation exceeds the cap
- **AND** `lastAssignedDate` SHALL be set to today

#### Scenario: Same day — no duplicate question added

- **WHEN** the app mounts AND `mentorBacklog.lastAssignedDate === today (UTC+8)`
- **THEN** no new question SHALL be added
- **AND** the existing queue SHALL be preserved as-is

#### Scenario: Cap enforcement at 5

- **WHEN** the queue would grow beyond 5 entries after a missed-day accumulation
- **THEN** the queue SHALL be truncated to exactly 5 entries (oldest entries preserved, newest beyond cap discarded)

### Requirement: MentorDialog UI shows NPC portrait + question + dialogue

The mentor daily question SHALL be presented via a `MentorDialog` modal component, distinct from `QuizModal`. The dialog SHALL display:
- An NPC sprite portrait (≥ 120×120 px) using a sprite key from `['mentor-male', 'mentor-female']` randomly selected at dialog open
- A title "今日導師題"
- A dialogue bubble with the NPC's opening line (randomly selected from 5 hard-coded greeting variants)
- An embedded question card (stem, options, subject tag) sourced from `content.questions[backlog.questionIds[0]]`
- A "跳過" button that triggers the skip path
- A backlog counter "尚有 N 題待答" if `questionIds.length > 1`

After the user answers:
- Correct answer → NPC dialogue changes to a randomly-selected praise variant; show "+X XP" toast; auto-close after 2 seconds
- Wrong answer → NPC dialogue changes to a randomly-selected teach variant; reveal the correct answer + explanation (sourced from `question.explanation`, with the same placeholder fallback as mock-exam for missing explanations); show "下一題" button if backlog ≥ 1, else "關閉"

#### Scenario: Dialog open displays NPC portrait and opening dialogue

- **WHEN** the user clicks the "今日導師題" entry button on home
- **THEN** the MentorDialog SHALL render
- **AND** the NPC portrait SHALL be one of `theme.sprites['mentor-male']` or `theme.sprites['mentor-female']`, chosen randomly
- **AND** the dialogue text SHALL be one of 5 hard-coded greeting variants

#### Scenario: Correct answer rewards 1.5× quizCorrect XP with streak multiplier

- **WHEN** the user selects the correct option on a mentor question
- **THEN** the player SHALL gain `Math.floor(REWARD.quizCorrect.xp * 1.5 * streakMultiplier)` XP via `applyXp`
- **AND** the player SHALL gain `REWARD.quizCorrect.stat` (knowledge +1) via `addStat`
- **AND** if the answer time was < `FAST_ANSWER_THRESHOLD_MS`, the player SHALL additionally gain `REWARD.quizFastAnswer.stat` (reflex +1)
- **AND** the global `quizEvents.emit('correct-answer')` SHALL be invoked (cross-app contract with 二階)

#### Scenario: Wrong answer grants minimal XP and routes to SRS

- **WHEN** the user selects an incorrect option on a mentor question
- **THEN** the player SHALL gain `REWARD.quizWrong.xp` XP (2 XP, no multiplier)
- **AND** the question SHALL be enqueued to `db.srs` via the existing answer-creates-SrsCard pathway (same as QuizModal wrong-answer flow)
- **AND** the dialog SHALL display the correct option + explanation before closing

#### Scenario: Missing explanation shows placeholder

- **WHEN** the answer is wrong AND the question's `explanation` field is empty/missing
- **THEN** the dialog SHALL display the placeholder text "📌 此題詳解暫無 — 可至[陽明國考考古題小組](https://sites.google.com/view/ymmedexam/ans)查詢" (same wording as mock-exam)

### Requirement: Mentor completion counts as a quiz-answered event for streak

When a mentor question is answered (correctly or wrongly, but NOT when skipped), the system SHALL invoke `incrementQuestionsAnswered(player, today, 1)` and `applyCheckIn` exactly as a normal quiz answer would. This integrates mentor-daily into the existing streak check-in path without modifying the `engine-rewards` streak spec.

#### Scenario: Answered mentor question increments today's answered count

- **WHEN** the user answers a mentor question (either correctly or wrongly)
- **THEN** `player.todayProgress.questionsAnswered` SHALL be incremented by 1
- **AND** if `hasMetCheckInThreshold(player, today)` returns true after the increment, `applyCheckIn(player, today)` SHALL be invoked
- **AND** the daily streak SHALL update accordingly (idempotent same-day re-trigger preserved)

#### Scenario: Skipped question does NOT count toward streak

- **WHEN** the user clicks "跳過" on a mentor question
- **THEN** `player.todayProgress.questionsAnswered` SHALL NOT be incremented
- **AND** no streak check-in SHALL be triggered by the skip
- **AND** the question SHALL be removed from the backlog (popped)

### Requirement: Skip permanently removes the question without re-entry

The "跳過" button SHALL remove the current question from `mentorBacklog.questionIds` (FIFO pop) without enqueueing the question elsewhere. Skipped questions SHALL NOT reappear in future mentor selections (the algorithm naturally avoids them via the 30-day lookback in the weak-subject layer).

#### Scenario: Skip pops the question and updates backlog

- **WHEN** the user clicks "跳過" on a mentor question
- **THEN** `mentorBacklog.questionIds.shift()` SHALL be invoked
- **AND** the Dexie singleton SHALL be updated immediately
- **AND** the MentorDialog SHALL close
- **AND** the home view button SHALL re-evaluate: "今日導師題 (N)" with N = new queue length

#### Scenario: First-time skip shows confirmation

- **WHEN** the user clicks "跳過" for the first time in the current session
- **THEN** a confirmation prompt SHALL appear: "今天不接？skip 不算 streak check-in"
- **AND** only on confirm SHALL the skip be executed
- **AND** subsequent skips within the same session SHALL NOT re-prompt

### Requirement: Home view entry button reflects backlog state

The home view SHALL display a "今日導師題" entry button. The button label SHALL reflect the current `mentorBacklog.questionIds.length`:
- 0 pending → button hidden (or shown as completed state, optional)
- 1 pending → "🧑‍⚕️ 今日導師題"
- ≥ 2 pending → "🧑‍⚕️ 今日導師題（尚有 N 題）"

#### Scenario: Empty backlog hides the button

- **WHEN** `mentorBacklog.questionIds.length === 0`
- **THEN** the entry button SHALL be hidden from the home view OR disabled with a "今日已完成" label

#### Scenario: Multi-day backlog shows count

- **WHEN** the player missed 2 days AND `mentorBacklog.questionIds.length === 3` after mount
- **THEN** the button label SHALL include "（尚有 3 題）"

### Requirement: NPC dialogue uses hard-coded variant pools

The MentorDialog SHALL select dialogue text from three hard-coded variant pools (≥ 5 entries each):
- Greeting pool — shown when dialog opens
- Praise pool — shown after correct answer
- Teach pool — shown after wrong answer

Selection within each pool SHALL be random per-dialog-instance (not deterministic).

#### Scenario: Greeting pool has at least 5 entries

- **WHEN** the dialog code is inspected
- **THEN** the greeting variant array SHALL contain ≥ 5 distinct strings

#### Scenario: Random selection per dialog

- **WHEN** the dialog opens, then closes, then re-opens
- **THEN** the greeting variant chosen on each open SHALL be drawn fresh from the pool (may repeat but not deterministically)
