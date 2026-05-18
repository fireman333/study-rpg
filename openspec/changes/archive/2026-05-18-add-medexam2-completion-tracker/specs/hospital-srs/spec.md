## MODIFIED Requirements

### Requirement: Due-first picker in quiz modal

The system SHALL prefer due cards over random new questions when the user opens the quiz modal for a subject. The due queue MUST be consumed first; only when the due queue is empty does the picker fall back to the existing `pickRandomQuestion` random new-question flow.

**The QuizModal SHALL expose a player-facing `skipSrs` toggle (per the `hospital-quiz` capability). When `skipSrs` is `true`, the picker SHALL bypass the due-queue walk entirely and SHALL call `pickRandomQuestion` directly for every「下一題」request. The `skipSrs` toggle SHALL NOT alter the underlying SRS scheduler state — due cards that are not surfaced while `skipSrs` is on SHALL remain in the due queue and SHALL be available again when `skipSrs` is toggled off (or when a fresh modal is opened with default `skipSrs = false`).**

**Answering a question while `skipSrs = true` SHALL still update `questionHistory` SRS fields (`interval`, `easeFactor`, `nextDueAt`) per the binary-input SM-2 review requirement — `skipSrs` only affects which question is surfaced next, not how the answer is recorded.**

#### Scenario: Subject has due card, modal opens with due card

- **GIVEN** `skipSrs = false` (the default)
- **WHEN** a user clicks a subject banner with N ≥ 1 due cards and opens the quiz modal
- **THEN** the modal MUST display the first due card (sorted by overdue days descending), looked up by `questionHistory.questionId` from the content pack

#### Scenario: Due queue depleted, fall back to new question

- **GIVEN** `skipSrs = false`
- **WHEN** the user has consumed all due cards in the current session for a subject
- **THEN** the picker MUST call `pickRandomQuestion(subject, seenIds)` to fetch a new random question (existing behavior)

#### Scenario: Due card is not added to seenIds set

- **WHEN** a due card is surfaced and the user answers it
- **THEN** the system MUST NOT add the due card's questionId to the in-session `seenIds` set (allowing the card to re-appear immediately if it becomes due again)

#### Scenario: skipSrs toggle bypasses due queue entirely

- **GIVEN** the 內科 subject has 5 due cards in the queue
- **AND** the player has the QuizModal open with subject = 內科 and `skipSrs = true`
- **WHEN** the player clicks 「下一題」
- **THEN** the picker MUST NOT call `getNextDueCardForSubject`
- **AND** the picker MUST call `pickRandomQuestion(內科, seenIds)` directly
- **AND** the 5 due cards SHALL remain in the queue (not consumed)

#### Scenario: Answer while skipSrs=true still writes SRS state

- **GIVEN** `skipSrs = true` and the player answers question Q correctly
- **WHEN** the answer side effects run
- **THEN** `questionHistory[Q.id]` SHALL still receive an SM-2 review update (`interval`, `easeFactor`, `nextDueAt` advance per binary-input SM-2 rules)
- **AND** future modal sessions with `skipSrs = false` SHALL be able to surface Q again when its `nextDueAt` falls due

#### Scenario: Toggling skipSrs off mid-session resumes due-first

- **GIVEN** the player has been answering with `skipSrs = true` for several questions
- **AND** the 內科 due queue still contains 3 unconsumed cards
- **WHEN** the player toggles `skipSrs` off and clicks 「下一題」
- **THEN** the picker MUST resume the due-first walk and surface the first remaining due card
