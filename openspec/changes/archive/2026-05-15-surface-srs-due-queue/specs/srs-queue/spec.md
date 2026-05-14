## ADDED Requirements

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
