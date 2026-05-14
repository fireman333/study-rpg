# srs-queue Specification

## Purpose
TBD - created by archiving change wire-srs-queue. Update Purpose after archive.
## Requirements
### Requirement: Quiz answer creates or updates an SrsCard

After every question answered in QuizModal, the engine SHALL upsert a corresponding `SrsCard` to `db.srs` keyed by `questionId`. If no card exists, `newCard(questionId)` SHALL create one; then `reviewCard(card, quality)` SHALL update it.

The quality value mapping SHALL be:

| Answer outcome | Quality (0–5) | Effect |
|---|---|---|
| Correct | `4` | "Good" — interval grows by ease factor (SM-2 standard) |
| Wrong | `2` | "Lapse" — interval resets to 1 day, lapses counter bumps |

#### Scenario: First-time correct answer creates a card with non-zero interval

- **WHEN** a question with no prior `SrsCard` record is answered correctly in QuizModal
- **THEN** `db.srs.get(questionId)` SHALL return a card with `interval > 0` (first correct review → `interval = 1` day per SM-2)
- **AND** `dueAt` SHALL be approximately `now + 1 day`
- **AND** `lapses` SHALL be `0`

#### Scenario: First-time wrong answer creates a lapse card

- **WHEN** a question with no prior `SrsCard` is answered wrong
- **THEN** `db.srs.get(questionId)` SHALL return a card with `interval === 1`, `lapses === 1`
- **AND** `dueAt` SHALL be approximately `now + 1 day` (lapse next-day review)

### Requirement: Next quiz prefers due cards

When opening a new QuizModal session, the engine SHALL identify all `SrsCard` with `dueAt <= now` (filtered to the current quiz subject), and present those questions FIRST. If the due pool has fewer than the requested N (default 5) questions, the remainder SHALL be drawn at random from the fresh (never-seen) pool.

#### Scenario: 3 due cards + 2 fresh fill the quiz

- **WHEN** the SRS queue has 3 due cards for the current subject and N=5 questions are requested
- **THEN** the QuizModal SHALL render those 3 due questions in random order
- **AND** the remaining 2 slots SHALL come from random fresh (never-seen) questions
- **AND** if no fresh questions exist either, the quiz MAY proceed with fewer than 5 questions

#### Scenario: 0 due cards falls back to fresh

- **WHEN** no due cards exist (all reviewed questions have `dueAt > now`)
- **THEN** the quiz SHALL pick 5 random questions from the fresh pool (current behavior)

### Requirement: SrsCard state persists across reload

The `db.srs` table SHALL survive page reload via IndexedDB persistence (per `persistence` capability).

#### Scenario: Wrong-answered question reappears after reload

- **WHEN** a player answers question Q1 wrong, closes the quiz, reloads the page, and opens a new quiz
- **THEN** Q1 SHALL be in the due pool (its `dueAt` was set to `~now + 1 day` but the freshly opened quiz still counts cards whose `dueAt` falls within the next few minutes if testing manually)
- **AND** the SRS-prefer behavior SHALL include Q1 in the 5 questions presented
- **AND** Q1's `SrsCard.lapses` SHALL still equal `1`

NOTE: in real player time, "due tomorrow" means Q1 reappears the next day, not immediately. For test purposes, examining `db.srs.get(qid)` directly verifies the lapse state.

### Requirement: Card schema is immutable across versions until SrsCard delta

The `SrsCard` interface fields SHALL remain `{ questionId, ease, interval, dueAt, lapses }`. Changing field shape requires a delta proposal modifying both this capability and the engine SrsCard type.

#### Scenario: Existing saved cards survive code reload

- **WHEN** the page reloads with existing `db.srs` records from a previous session
- **THEN** each saved record SHALL deserialize as a valid `SrsCard` without runtime errors
- **AND** `reviewCard` SHALL operate on it without needing migration

### Requirement: Quality scale is hidden from MVP user

In MVP, the user SHALL NOT see or pick a quality rating; the system SHALL infer quality from correct/wrong as defined above. This may change in M3+ (self-rated quality, FSRS) — that change requires modifying this requirement.

#### Scenario: No quality picker visible

- **WHEN** the player is viewing the reveal/explanation panel after answering
- **THEN** the UI SHALL display only correct/wrong feedback + `下一題` button (no `Again / Hard / Good / Easy` buttons)
- **AND** quality is determined by the binary correct/wrong outcome, not user input

### Requirement: Due-count is surfaced on the main app screen

The main app screen SHALL render a player-visible action labelled `📋 複習到期（N 題）`（or equivalent localized phrasing）where `N` is `dueQuestionIds.length` at render time.

The action SHALL update reactively when `dueQuestionIds` changes (e.g., after a quiz session writes new SRS cards and `refreshDueQueue` runs).

#### Scenario: Due count visible after hydration

- **WHEN** the app finishes mount and hydration with `dueQuestionIds.length === 3`
- **THEN** the main screen SHALL display a button labelled `📋 複習到期（3 題）` (or similar localized form)
- **AND** the button SHALL be enabled (clickable)

#### Scenario: Due count refreshes after quiz

- **WHEN** the player completes a reading-mode quiz that creates 2 new lapse cards (wrong answers), bumping due count from 0 to 2
- **THEN** after the quiz modal closes and `refreshDueQueue` completes, the main screen due-count action SHALL re-render to show `2`
- **AND** the action SHALL become enabled (was disabled at 0)

### Requirement: Due-count action is disabled at N=0

When `dueQuestionIds.length === 0`, the due-count action SHALL be disabled (not clickable) and SHALL display a hint (e.g., `目前沒有到期複習，繼續累積中`) so the player understands why no action is available.

#### Scenario: Empty queue disables review action

- **WHEN** `dueQuestionIds.length === 0` after hydration (fresh player, no quiz history)
- **THEN** the `📋 複習到期` action SHALL be disabled
- **AND** the hint text SHALL communicate that there are currently no due reviews

### Requirement: Clicking the action opens review-mode quiz

When the player clicks the enabled due-count action, the app SHALL open a `QuizModal` with `mode='review'` and pass the current `dueQuestionIds` as a prop. The modal's selection logic (per the `quiz-runner` capability) SHALL pull only due cards (no fresh filler) and cap at `REVIEW_BATCH_SIZE`.

#### Scenario: Click opens review modal with due cards only

- **WHEN** the player clicks the `📋 複習到期（7 題）` action
- **THEN** a QuizModal SHALL open with `mode='review'`
- **AND** the modal SHALL render exactly 7 questions, all from the due pool
- **AND** the review-mode banner SHALL be visible

#### Scenario: Large backlog caps at batch size

- **WHEN** the player clicks the action with `dueQuestionIds.length === 35`
- **THEN** the QuizModal SHALL render exactly 20 questions
- **AND** after completing the session, the remaining 15 cards SHALL still be due in `db.srs`
- **AND** the main screen action SHALL refresh and now show `📋 複習到期（15 題）` (per the existing reactive update requirement)

