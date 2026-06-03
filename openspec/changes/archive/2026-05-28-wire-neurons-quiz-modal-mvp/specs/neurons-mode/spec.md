## ADDED Requirements

### Requirement: neurons-tw SHALL surface a user-facing quiz UI that presents content-pack questions and routes answers through recordCorrectAnswer / recordIncorrectAnswer

The `neurons-mode` umbrella SHALL ensure that the neurons-tw application includes a user-facing quiz UI that:

1. Presents one question at a time from the loaded `ContentPack.questions` pool
2. Shows the question stem + all options as clickable / tappable selections
3. On user selection (reveal): records the result via the existing `recordCorrectAnswer(subjectId)` or `recordIncorrectAnswer(subjectId)` services so that downstream effects fire (synapse formation, variant gacha rolls, DMN behavior-axis triggers, achievement progress, mastery tier updates, streak counter)
4. Provides a way to advance to the next question and a way to exit the quiz at any time
5. Has an entry point reachable from the application's main routes (overview page at minimum)

The quiz UI MAY be feature-light for v1 (no SRS due-bias, no quality modifiers, no bookmarks, no bug reports inline) — these are deferred to follow-up changes. What MUST be true is that exam questions actually appear in front of users AND that selecting an option triggers the answer-recording chain.

Questions with `hasOptionImages === true` MAY be filtered out of the v1 quiz pool until image-option rendering ships.

Questions with `disputed === true` (送分題) SHALL be treated as auto-correct on any selection.

This requirement supersedes the prior implicit state where `ConnectomeDebugPanel`'s dev-flavored buttons were the only interaction surface.

#### Scenario: Quiz UI is reachable from the overview page

- **GIVEN** a user signs into neurons-tw and lands on the overview page (`/`)
- **WHEN** the page renders
- **THEN** an obvious entry button SHALL be visible to start a quiz (e.g., 「🎯 開始答題」 or similar Chinese CTA copy)
- **AND** clicking the button SHALL open the quiz UI

#### Scenario: Selecting an option records the result and advances the engine state

- **GIVEN** the quiz UI is open showing a question with `subject: '藥理學'` and `answer: 'B'`
- **WHEN** the user clicks option `B`
- **THEN** the quiz UI SHALL show that the answer is correct (visual cue + explanation)
- **AND** the service `recordCorrectAnswer('藥理學')` SHALL be invoked
- **AND** downstream effects SHALL fire (familyAccrual increment, possible synapse formation if today's other-family threshold met, possible variant slot unlock, possible DMN behavior-axis +1 draw, possible achievement unlock, mastery counter update)

#### Scenario: Selecting a wrong option records incorrect and resets streak

- **GIVEN** the quiz UI is open showing a question with `subject: '免疫學'` and `answer: 'C'`
- **WHEN** the user clicks option `A`
- **THEN** the quiz UI SHALL show that the answer is wrong + reveal the correct option `C` + show the explanation
- **AND** the service `recordIncorrectAnswer('免疫學')` SHALL be invoked
- **AND** the existing streak-break logic SHALL fire (resetting `currentQuizCorrectStreak` to 0)

#### Scenario: Disputed question (送分題) accepts any selection as correct

- **GIVEN** the quiz UI is open showing a question with `disputed: true`
- **WHEN** the user clicks any option
- **THEN** the quiz UI SHALL treat the selection as correct
- **AND** invoke `recordCorrectAnswer(question.subject)`
- **AND** display a notice (e.g., 「⚠️ 此題為送分題，任何選項皆計為答對」) before the explanation

#### Scenario: User can exit mid-quiz without committing all answers

- **GIVEN** the quiz UI is open and the user has answered 2 questions
- **WHEN** the user clicks 「結束」 or the close button BEFORE clicking 下一題
- **THEN** the modal SHALL close
- **AND** the 2 already-recorded answers SHALL remain persisted (no rollback)
- **AND** no error or warning SHALL block the close

#### Scenario: Image-option questions are filtered from the v1 quiz pool

- **GIVEN** the `pack.questions` corpus contains some questions with `hasOptionImages === true`
- **WHEN** the quiz UI initializes its in-session question pool
- **THEN** questions with `hasOptionImages === true` SHALL be excluded
- **AND** this is acceptable until image-option rendering ships (separate future change)
