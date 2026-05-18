# hospital-quiz Specification

## Purpose
TBD - created by archiving change wire-hospital-quiz-ui. Update Purpose after archive.
## Requirements
### Requirement: Quiz modal SHALL launch from per-subject banner 「📚 學習」 button

The HomePage `RecruitmentBanner` component SHALL render a「📚 學習」 button alongside the existing「🎫 招募」 roll button. Clicking the 「📚 學習」 button SHALL open a `QuizModal` overlay covering the HomePage without unmounting it. The 「📚 學習」 button SHALL be enabled regardless of `affinity[subjectId]` value (i.e., locked banners still allow study entry); the「🎫 招募」 button's existing locked/unlocked behavior SHALL be unchanged by this change.

#### Scenario: Click 學習 button on unlocked banner opens quiz modal

- **GIVEN** the HomePage is rendered with 14 banners
- **AND** `affinity[外科] ≥ threshold[外科]`
- **WHEN** the player clicks the 「📚 學習」 button on the 外科 banner
- **THEN** a `QuizModal` SHALL render as an overlay
- **AND** the modal's subject dropdown SHALL be pre-selected to `外科`
- **AND** the HomePage SHALL remain mounted underneath the modal

#### Scenario: Click 學習 button on locked banner still opens quiz modal

- **GIVEN** `affinity[眼科] = 4` and `threshold[眼科] = 10`
- **AND** the 眼科 banner is in locked state
- **WHEN** the player clicks the 「📚 學習」 button on the 眼科 banner
- **THEN** the `QuizModal` SHALL open
- **AND** the modal SHALL accept question answering (this is how the player accumulates affinity to unlock)

#### Scenario: 招募 button behavior unchanged

- **GIVEN** the player clicks the 「🎫 招募」 button on a banner
- **WHEN** the banner is unlocked and `tickets.available ≥ 1`
- **THEN** the existing recruitment roll flow SHALL execute per `recruitment-gacha` spec
- **AND** no `QuizModal` SHALL open

### Requirement: Quiz modal SHALL display question stem, options, doctor partner, and close affordance

The `QuizModal` SHALL render the following elements at all times during a quiz session:

- Modal header containing the current quiz subject (e.g., `📚 外科`) and a close button (X)
- Doctor partner section showing the bound doctor's sprite + name (purely cosmetic, does not affect scoring)
- Subject dropdown allowing switching to any of 14 subjects mid-session
- **A question-meta row directly above the stem containing the raw `question.id` string (e.g., `106-2-醫學三-內科-Q10`) and a bookmark toggle button**
- Question stem (text from `corpus.stem`, supports CJK and line breaks)
- 4 option buttons labeled A / B / C / D rendering `corpus.options.A` through `corpus.options.D`
- A status / result region below the options (initially empty; reveals explanation after answer)
- A 「下一題」 button (initially disabled; enabled after answering)

The close button SHALL close the modal immediately without confirmation. The 「下一題」 button SHALL load a fresh random question from the current subject's corpus pool.

The question-meta row SHALL display `question.id` verbatim (no reformatting, no localization). The bookmark toggle SHALL be a single icon-only button with `role=switch` and `aria-pressed` reflecting current bookmark state; clicking SHALL toggle the bookmark for the currently-displayed question via the `question-bookmarks` capability. The bookmark toggle SHALL function independently of answer state — players MAY bookmark before, during, or after answering, on either correct or incorrect responses.

#### Scenario: Modal initial render shows question + 4 options

- **GIVEN** the player opens `QuizModal` from the 外科 banner
- **AND** the 外科 corpus contains at least 1 question
- **WHEN** the modal first renders
- **THEN** the modal SHALL display the doctor partner sprite + name
- **AND** the modal SHALL display the question stem text
- **AND** the modal SHALL display 4 option buttons (A / B / C / D) with text from `corpus.options`
- **AND** the result region SHALL be empty
- **AND** the 「下一題」 button SHALL be disabled

#### Scenario: Close button immediately dismisses modal

- **GIVEN** the player is mid-question in `QuizModal`
- **WHEN** the player clicks the close (X) button
- **THEN** the modal SHALL unmount without confirmation
- **AND** the HomePage SHALL be visible underneath
- **AND** any in-progress question state SHALL be discarded (no auto-save of partial answer)

#### Scenario: Question identifier displayed verbatim above stem

- **GIVEN** a question with `id = "106-2-醫學三-內科-Q10"` is loaded into `QuizModal`
- **WHEN** the modal renders
- **THEN** the question-meta row SHALL display the literal string `106-2-醫學三-內科-Q10`
- **AND** the string SHALL appear directly above the question stem
- **AND** no formatting transformation (e.g., to "106 年第 2 次 醫學三 內科 第 10 題") SHALL be applied

#### Scenario: Bookmark toggle visible and operable regardless of answer state

- **GIVEN** `QuizModal` is rendered with a fresh unanswered question
- **WHEN** the player clicks the bookmark toggle button before answering
- **THEN** the toggle SHALL switch from outline to filled glyph
- **AND** the underlying question SHALL be persisted as a bookmark per `question-bookmarks` capability
- **AND** the question stem and option buttons SHALL remain unchanged

#### Scenario: Bookmark toggle reflects current question state on every render

- **GIVEN** the player bookmarks question Q1 in `QuizModal`
- **WHEN** the player clicks 「下一題」 and Q2 (not bookmarked) loads
- **THEN** the bookmark toggle SHALL display the outline glyph for Q2
- **AND** the toggle's `aria-pressed` SHALL be `false`
- **WHEN** the same session randomly draws Q1 again
- **THEN** the bookmark toggle SHALL display the filled glyph and `aria-pressed=true` reflecting Q1's bookmark status from IndexedDB

### Requirement: Quiz session SHALL require a roster doctor selected as narrative partner

The `QuizModal` SHALL require the player to have selected a roster doctor before answer buttons become interactive. The selected doctor SHALL be referenced as `boundDoctor`. The `boundDoctor.subjectId` SHALL NOT affect any reward calculation — it is purely a visual / narrative element. If no doctor is bound, the option buttons SHALL be disabled and a doctor picker SHALL be displayed prominently.

The modal SHALL default `boundDoctor` to the most recently obtained roster doctor at modal open time. The player MAY change `boundDoctor` mid-session via an in-modal doctor picker. Changing `boundDoctor` SHALL NOT reset the current question or session state.

#### Scenario: No doctor bound disables answer buttons

- **GIVEN** the `doctors` table contains 0 roster doctors (impossible after onboarding, but defensive)
- **WHEN** the `QuizModal` opens
- **THEN** the option buttons (A/B/C/D) SHALL be disabled
- **AND** a message SHALL display: `「請先招募醫師才能學習」`

#### Scenario: Default bound doctor is most recent

- **GIVEN** the `doctors` table contains 5 doctors with various `obtainedAt` timestamps
- **WHEN** the `QuizModal` opens for the first time in the session
- **THEN** `boundDoctor` SHALL be the doctor with the highest `obtainedAt` value
- **AND** the modal header SHALL display that doctor's name and sprite

#### Scenario: Changing doctor mid-session does not reset question

- **GIVEN** the player is viewing question Q1 in `QuizModal` and has not yet answered
- **WHEN** the player changes `boundDoctor` from doctor A to doctor B
- **THEN** the modal SHALL update the displayed doctor sprite + name to doctor B
- **AND** the question stem and option buttons SHALL remain Q1's content

#### Scenario: boundDoctor.subjectId does not affect affinity gain

- **GIVEN** `boundDoctor.subjectId = 內科` and the current quiz subject is `外科`
- **WHEN** the player answers an 外科 question correctly
- **THEN** `affinity[外科]` SHALL increment by exactly 1 (per `recruitment-gacha` spec)
- **AND** `affinity[內科]` SHALL be unchanged
- **AND** no multiplier or bonus SHALL apply based on doctor-subject mismatch

### Requirement: Subject dropdown SHALL default to banner subject and allow free switching

The `QuizModal` SHALL include a subject dropdown selector populated with all 14 二階國考 subjects. When the modal is opened from a banner, the dropdown SHALL be pre-selected to that banner's `subjectId`. The player MAY switch to any other subject at any time during the session. Switching subjects SHALL:

- Discard the currently displayed question
- Reset the session's `seenQuestionIds` set
- Load a fresh random question from the new subject's pool
- NOT reset `boundDoctor`
- NOT clear or modify any mastery / affinity counters

#### Scenario: Dropdown defaults to banner subject

- **GIVEN** the player clicks the 「📚 學習」 button on the 婦產科 banner
- **WHEN** the `QuizModal` opens
- **THEN** the subject dropdown SHALL show `婦產科` as the selected value

#### Scenario: Switch subject loads new question

- **GIVEN** the player is viewing an 外科 question Q1 in `QuizModal`
- **WHEN** the player changes the subject dropdown to `內科`
- **THEN** Q1 SHALL be discarded
- **AND** a new random 內科 question SHALL be loaded
- **AND** `boundDoctor` SHALL be unchanged
- **AND** `seenQuestionIds` SHALL be reset to a new empty set

### Requirement: Quiz session SHALL be continuous single-question with no batch boundary

The `QuizModal` SHALL operate in continuous single-question mode. There SHALL be no concept of "round", "batch", "score screen", or "session timer". After each question is answered, the player MAY click 「下一題」 to load a fresh question or close the modal to end the session. Closing the modal SHALL be permitted at any time, including immediately after opening with no questions answered. The modal SHALL NOT display any progress counter (e.g., "3/10"), score total, or completion celebration.

Within a single modal-open session, the system SHALL maintain a `seenQuestionIds: Set<string>` to avoid immediate repetition. When loading a new question, the picker SHALL re-roll up to 3 times if the candidate `questionId` is in `seenQuestionIds`; on the 3rd repeat the candidate SHALL be accepted to prevent infinite loops on small subject pools.

#### Scenario: Continuous flow after correct answer

- **GIVEN** the player answered question Q1 correctly
- **WHEN** the player clicks 「下一題」
- **THEN** a new random question Q2 SHALL load
- **AND** Q2.questionId SHALL NOT equal Q1.questionId (if subject pool has > 1 question)
- **AND** no score screen or "round complete" UI SHALL display

#### Scenario: Close after one question

- **GIVEN** the player answered Q1 and is viewing the explanation
- **WHEN** the player clicks the close button
- **THEN** the modal SHALL dismiss immediately
- **AND** the HomePage SHALL be visible
- **AND** Q1's mastery / affinity / history side effects (from prior requirement) SHALL persist

#### Scenario: seenQuestionIds prevents short-term repetition

- **GIVEN** the player has answered Q1, Q2, Q3 in this session
- **WHEN** the player clicks 「下一題」 for Q4
- **THEN** the picker SHALL attempt to select a question whose id is not in {Q1.id, Q2.id, Q3.id}
- **AND** if the random pick is in the set, the picker SHALL re-roll
- **AND** the picker SHALL accept the candidate after the 3rd re-roll regardless of repetition

### Requirement: Correct answer SHALL increment affinity, update mastery, and write history

When the player selects the correct option (matching `corpus.answer`), the system SHALL perform the following side effects in order, all within a single Dexie transaction where possible:

1. Increment `affinity[currentSubjectId]` by exactly 1 (delegates to `recruitment-gacha` spec affinity counter)
2. Increment `mastery[currentSubjectId].correct` by 1 and `mastery[currentSubjectId].total` by 1
3. Upsert the `questionHistory[questionId]` row: increment `attempts`, increment `correctCount`, set `lastAnsweredAt = Date.now()`, set `lastResult = 'correct'`; leave `nextDueAt` / `interval` / `easeFactor` at existing values or defaults if first insert
4. Reveal explanation in the modal result region
5. Enable the 「下一題」 button
6. Disable the option buttons to prevent re-answer

The reputation `createPerQReputationListener` SHALL fire as currently wired (hospital-tycoon-engine behavior); this requirement does NOT modify that listener.

#### Scenario: Correct answer increments all three counters

- **GIVEN** `affinity[外科] = 12`, `mastery[外科] = {correct: 5, total: 8}`, no prior history for question Q_X
- **WHEN** the player selects the correct option for Q_X (an 外科 question)
- **THEN** `affinity[外科]` SHALL equal `13`
- **AND** `mastery[外科]` SHALL equal `{correct: 6, total: 9}`
- **AND** `questionHistory[Q_X.id]` SHALL exist with `attempts=1, correctCount=1, lastResult='correct'`
- **AND** `questionHistory[Q_X.id].nextDueAt` SHALL be `null` (default, SRS scheduler will set later)
- **AND** the modal result region SHALL display the explanation text

#### Scenario: Repeat correct answer updates history attempts/correct

- **GIVEN** `questionHistory[Q_X.id] = {attempts: 2, correctCount: 1, lastResult: 'wrong', ...}`
- **WHEN** the player answers Q_X correctly again
- **THEN** `questionHistory[Q_X.id]` SHALL become `{attempts: 3, correctCount: 2, lastResult: 'correct', lastAnsweredAt: <new ms>, ...}`
- **AND** `nextDueAt / interval / easeFactor` SHALL be unchanged by this requirement (SRS scheduler concern)

### Requirement: Wrong answer SHALL reveal explanation, update mastery and history, with no penalty

When the player selects an incorrect option (not matching `corpus.answer`), the system SHALL:

1. NOT modify `affinity[currentSubjectId]` (per `recruitment-gacha` spec "never decrement")
2. NOT modify `reputation` (no reputation penalty)
3. Increment `mastery[currentSubjectId].total` by 1 (correct counter unchanged)
4. Upsert `questionHistory[questionId]`: increment `attempts`, leave `correctCount` unchanged, set `lastAnsweredAt = Date.now()`, set `lastResult = 'wrong'`
5. Reveal explanation in the modal result region (rendered from `corpus.explanation`; supports markdown including `### 選項詳解` headings and `**A.** ... ✓ / ✗ [P_N XXX] 詳解...` patterns produced by the corpus build)
6. Enable the 「下一題」 button
7. Disable the option buttons to prevent re-answer
8. Visually highlight the correct option (e.g., green border) and the incorrectly selected option (e.g., red border)

If `corpus.explanation` is empty, null, or undefined, the result region SHALL display the placeholder text `「（解析待補）」` instead of erroring.

#### Scenario: Wrong answer increments only mastery.total and history.attempts

- **GIVEN** `affinity[內科] = 45`, `mastery[內科] = {correct: 10, total: 20}`, `questionHistory[Q_Y] = {attempts: 1, correctCount: 1, lastResult: 'correct', ...}`
- **WHEN** the player selects an incorrect option for Q_Y (an 內科 question)
- **THEN** `affinity[內科]` SHALL remain `45`
- **AND** `reputation` SHALL be unchanged (apart from any existing `createPerQReputationListener` no-op behavior on wrong)
- **AND** `mastery[內科]` SHALL equal `{correct: 10, total: 21}`
- **AND** `questionHistory[Q_Y]` SHALL equal `{attempts: 2, correctCount: 1, lastResult: 'wrong', lastAnsweredAt: <new ms>, ...}`

#### Scenario: Explanation rendered from corpus

- **GIVEN** the player selects an incorrect option
- **AND** `corpus.explanation` for the question contains `### 選項詳解\n\n**A. ...**\n  - ✗ 錯誤 [P1 夯]\n  - 詳解：...`
- **WHEN** the modal result region renders
- **THEN** the explanation SHALL display the full text with markdown rendering (headings, bold, bullet points)
- **AND** the correct option button SHALL receive a "correct" visual treatment
- **AND** the selected wrong option SHALL receive a "wrong" visual treatment

#### Scenario: Missing explanation falls back to placeholder

- **GIVEN** a question has `corpus.explanation = ""` (empty string) or missing field
- **WHEN** the player answers and the result region renders
- **THEN** the result region SHALL display the placeholder text `「（解析待補）」`
- **AND** no error SHALL be thrown
- **AND** the flow SHALL proceed (「下一題」 enabled normally)

### Requirement: QuizModal SHALL render question image when `imagePath` is present

When `question.imagePath` is a non-null, non-empty string, the `QuizModal` SHALL render an `<img>` element directly beneath the question stem and above the option buttons. The image SHALL:

- Use `${import.meta.env.BASE_URL}${question.imagePath}` as the `src` (base URL path safety: dev `/study-rpg/hospital/` and prod `/study-rpg/hospital/` share the same base, but using `BASE_URL` insulates against future base changes)
- Use the literal string `"題目附圖"` as the `alt` attribute
- Be wrapped in a styled container `<div className="quiz-modal__image">` to allow CSS sizing (max-width: 100%, max-height: 50vh, object-fit: contain for aspect-ratio preservation on small screens)
- Render between the stem `<p>` and the options `<ul>` in DOM order

The image SHALL re-render correctly when the player advances to a new question (React key on question id, or unconditional re-render on stem change).

#### Scenario: Question with imagePath renders img element

- **GIVEN** the player is shown question `108-2-醫學三-內科-Q45` in QuizModal
- **AND** `question.imagePath = "images/medexam2-tw/108-2-醫學三-內科-Q45.png"`
- **WHEN** the modal renders
- **THEN** an `<img>` element SHALL be present in the DOM, between the stem and the options
- **AND** the `src` attribute SHALL end with `"images/medexam2-tw/108-2-醫學三-內科-Q45.png"`
- **AND** the `alt` attribute SHALL equal `"題目附圖"`

#### Scenario: Switching to next question swaps image

- **GIVEN** the player is viewing a question with an image
- **WHEN** the player clicks 「下一題」 and the next question also has an image (different `imagePath`)
- **THEN** the rendered `<img>` SHALL update its `src` to the new question's `imagePath`
- **AND** no stale image from the previous question SHALL remain in the DOM

#### Scenario: Plain text question renders no image element

- **GIVEN** the player is shown a question where `question.imagePath` is `null` or absent
- **AND** `question.hasImage` is `false`
- **WHEN** the modal renders
- **THEN** no `<img>` element SHALL be present in the question body
- **AND** no `.quiz-modal__image` or `.quiz-modal__image-missing` container SHALL render

### Requirement: QuizModal SHALL render missing-image fallback when `hasImage` is true but `imagePath` is absent

When `question.hasImage === true` AND `question.imagePath` is null/absent, the `QuizModal` SHALL render a fallback notice in place of where the image would appear. The notice SHALL:

- Display Chinese copy: `「📷 此題含附圖但尚未補齊（{question.id}）」`
- Render in a styled container `<div className="quiz-modal__image-missing">` with muted appearance (e.g., gray border, italic text, smaller font) to signal degraded state without blocking interaction
- NOT prevent answering — option buttons SHALL remain interactive

This handles two known cases gracefully:
1. **False positives**: the tightened `hasImage` regex misses an edge case and flags a question that does not actually require an image (rare after regex tightening; still possible)
2. **Extraction failures**: the PyMuPDF extraction script failed to locate or extract the image for that question (logged to `extraction.log`; user can manually backfill later by dropping a PNG into `public/images/medexam2-tw/`)

The fallback SHALL persist until the next build re-runs and the missing PNG is now present.

#### Scenario: hasImage with no imagePath renders fallback notice

- **GIVEN** a question with `hasImage = true` and `imagePath = null`
- **AND** the question id is `109-1-醫學四-外科-Q12`
- **WHEN** the modal renders
- **THEN** the fallback container `.quiz-modal__image-missing` SHALL be present
- **AND** the text content SHALL contain `"📷 此題含附圖但尚未補齊（109-1-醫學四-外科-Q12）"`
- **AND** no `<img>` element SHALL be present

#### Scenario: Fallback does not disable answering

- **GIVEN** the modal renders the missing-image fallback
- **AND** a doctor is bound
- **WHEN** the player clicks an option button
- **THEN** the answer flow (correct/wrong handling, mastery / affinity / history updates per existing requirements) SHALL proceed normally
- **AND** the fallback notice SHALL remain visible alongside the revealed explanation


### Requirement: Random-pool picker SHALL exclude `hasOptionImages` questions

The 二階 random question picker (`pickRandomQuestion` and its callers) SHALL NOT return any question whose `hasOptionImages` is `true`. Filtering SHALL happen at content-pack load time so that:

1. `bySubject` per-subject counts reflect only playable (text-renderable) questions.
2. `pickRandomQuestion` cannot select a flagged question even with maximally-skewed re-rolls.
3. `byId` lookup SHALL retain the full pack so historical bookmark / SRS row hydration of flagged IDs still resolves to a `Question` object (downstream UI may then display a graceful fallback rather than crash on missing).

Existing scenarios for QuizModal rendering, doctor partner, mid-session subject switching, etc. SHALL continue to apply to the filtered pool — they are not behavior changes, only operate over a smaller pool of ~6056 instead of 6066 questions.

#### Scenario: Filtered pool excludes flagged questions

- **GIVEN** the 二階 content pack contains 10 questions with `hasOptionImages: true` (耳鼻喉科 Q27 of 109_第二次, etc.)
- **WHEN** `loadPack()` resolves
- **THEN** `bySubject.get('耳鼻喉科')` SHALL NOT include any flagged question
- **AND** `pickRandomQuestion('耳鼻喉科', new Set())` SHALL never return a question with `hasOptionImages === true` over any number of calls

#### Scenario: byId retains flagged questions for historical hydration

- **GIVEN** a user's `questionHistory` contains a row for `109-2-醫學六-耳鼻喉科-Q27` answered before this filter shipped
- **WHEN** `pickQuestionById('109-2-醫學六-耳鼻喉科-Q27')` is called
- **THEN** the call SHALL return the full `Question` object (not null)
- **AND** the calling UI MAY choose to display a graceful notice; the lookup itself SHALL NOT throw

#### Scenario: Subject counts after filter remain consistent with player perception

- **GIVEN** the 耳鼻喉科 pool of N total questions
- **WHEN** the filtered `bySubject.get('耳鼻喉科')` is sized
- **THEN** the size SHALL equal `N - (耳鼻喉科 questions with hasOptionImages === true)`
- **AND** UI elements that surface a "remaining unseen" count for the subject SHALL derive from this filtered size (no off-by-one between picker and counter)
