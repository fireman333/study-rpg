## ADDED Requirements

### Requirement: QuizModal SHALL expose a Skip-SRS toggle bypassing the due-first picker

The `QuizModal` SHALL render a player-facing toggle labelled `跳過 SRS（純隨機新題）` within the modal header or controls region. The toggle SHALL be a checkbox or equivalent binary control with `role=switch` and `aria-checked` reflecting state. The toggle SHALL default to `false` (off) on every modal mount and SHALL NOT be persisted across modal open / close cycles.

When the toggle is `true`, the QuizModal's `loadNextQuestion` flow SHALL skip the `getNextDueCardForSubject` walk entirely and SHALL call `pickRandomQuestion(subjectId, seenIds)` directly. When the toggle is `false`, the existing due-first picker flow SHALL execute per the `hospital-srs` capability.

A short helper line below the toggle SHALL communicate that the toggle does not affect SRS scheduling itself: `（不影響 SRS 排程，到期題仍會記）` or equivalent wording.

#### Scenario: Toggle defaults to off on modal open

- **GIVEN** the player opens the QuizModal for any subject
- **WHEN** the modal first renders
- **THEN** the `跳過 SRS` toggle SHALL be unchecked
- **AND** the initial question load SHALL follow the existing due-first picker flow

#### Scenario: Toggle on forces random picker for next

- **GIVEN** the QuizModal is open with subject = 外科 and 2 due cards in the queue
- **WHEN** the player checks `跳過 SRS` and clicks 「下一題」
- **THEN** the next question SHALL be a random new question from the 外科 playable pool (not from the due queue)

#### Scenario: Toggle state does not persist across modal sessions

- **GIVEN** the player previously had `跳過 SRS = true` and closed the modal
- **WHEN** the player re-opens the QuizModal (any subject)
- **THEN** the `跳過 SRS` toggle SHALL render as unchecked

#### Scenario: Toggle is operable both before and after answering

- **GIVEN** the QuizModal is mid-session showing a revealed answer
- **WHEN** the player toggles `跳過 SRS` on
- **AND** subsequently clicks 「下一題」
- **THEN** the picker SHALL respect the new toggle state for the next question load

### Requirement: QuizModal SHALL emit a one-shot pool-exhausted toast per subject per session

When the random-pool picker (`pickRandomQuestion`) returns a question whose id is already in the in-session `seenIds` set AND `seenIds.size >= pool.length` for the current subject, the QuizModal SHALL emit exactly one toast message reading `本科獨立題已掃完，繼續會開始重練` (or visually equivalent wording).

The toast SHALL fire at most once per `(modal-session, subjectId)` tuple. Switching subjects mid-session SHALL allow a fresh exhaustion toast to fire when the new subject's pool is later exhausted. Closing and re-opening the modal SHALL reset the exhaustion-fired tracking (so the toast MAY fire again on the same subject in a subsequent session).

The toast SHALL NOT block further answering. It SHALL NOT alter SRS scheduling, mastery, affinity, history writes, or any other side effect. Questions SHALL continue to be served (now drawn from the same pool with repeats).

#### Scenario: First time pool exhausted fires toast

- **GIVEN** the QuizModal has subject = 麻醉科 with playable pool size 187
- **AND** the player has answered all 187 distinct questions in the current modal session (`seenIds.size === 187`)
- **WHEN** the player clicks 「下一題」 and `pickRandomQuestion` returns a question already in `seenIds`
- **THEN** the modal SHALL emit one toast `本科獨立題已掃完，繼續會開始重練`
- **AND** the question SHALL still render and be answerable

#### Scenario: Repeated exhaustion in same subject suppresses subsequent toasts

- **GIVEN** the exhaustion toast has already fired this session for 麻醉科
- **WHEN** the player clicks 「下一題」 again and again hits a repeat question
- **THEN** NO additional toast SHALL fire for 麻醉科 in this session

#### Scenario: Switching subject after exhaustion does not pre-fire toast for new subject

- **GIVEN** the exhaustion toast has fired for 麻醉科 in this session
- **WHEN** the player switches the subject dropdown to 復健科
- **THEN** the modal SHALL NOT immediately re-fire the exhaustion toast
- **AND** the toast SHALL only fire for 復健科 once 復健科's own pool is exhausted within this session

#### Scenario: Close and re-open modal resets exhaustion tracking

- **GIVEN** the exhaustion toast has fired for 麻醉科 in modal session A
- **WHEN** the player closes the modal and re-opens it (modal session B)
- **AND** session B subsequently exhausts the 麻醉科 pool again
- **THEN** the exhaustion toast SHALL fire once in session B
