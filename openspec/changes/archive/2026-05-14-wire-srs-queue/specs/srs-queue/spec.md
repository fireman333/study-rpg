## ADDED Requirements

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
