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

The modal SHALL resolve the initial `boundDoctor` on each open using the following precedence:

1. If a persisted companion-doctor ID exists (per-device, stored in the `meta` table under key `quiz.companionDoctorId`) AND that doctor is still present in the `doctors` table, `boundDoctor` SHALL be that doctor.
2. Otherwise, `boundDoctor` SHALL be the doctor with the highest `obtainedAt` value (most recently obtained); the modal SHALL also persist that doctor's ID under the same `meta` key so the choice sticks across subsequent opens.

The player MAY change `boundDoctor` mid-session via an in-modal doctor picker. Changing `boundDoctor` SHALL immediately persist the new ID to the `meta` key. Changing `boundDoctor` SHALL NOT reset the current question or session state. Recruiting a new doctor while `QuizModal` is closed SHALL NOT change the persisted companion-doctor ID, so the player's previously chosen partner remains active on the next open.

The persisted ID SHALL be treated as a per-device UI preference (no cloud sync).

#### Scenario: No doctor bound disables answer buttons

- **GIVEN** the `doctors` table contains 0 roster doctors (impossible after onboarding, but defensive)
- **WHEN** the `QuizModal` opens
- **THEN** the option buttons (A/B/C/D) SHALL be disabled
- **AND** a message SHALL display: `「請先招募醫師才能學習」`

#### Scenario: First-ever open with no persisted ID defaults to most recent

- **GIVEN** the `doctors` table contains 5 doctors with various `obtainedAt` timestamps
- **AND** `meta['quiz.companionDoctorId']` does not exist (e.g. fresh player or first open after upgrade)
- **WHEN** the `QuizModal` opens
- **THEN** `boundDoctor` SHALL be the doctor with the highest `obtainedAt` value
- **AND** the modal header SHALL display that doctor's name and sprite
- **AND** the modal SHALL write that doctor's ID to `meta['quiz.companionDoctorId']`

#### Scenario: Recruiting new doctor does not displace persisted companion

- **GIVEN** `meta['quiz.companionDoctorId']` is set to doctor A's ID
- **AND** doctor A is present in the `doctors` table
- **WHEN** the player recruits doctor B (now the most recently obtained)
- **AND** the player closes and reopens the `QuizModal`
- **THEN** `boundDoctor` SHALL be doctor A (NOT doctor B)
- **AND** `meta['quiz.companionDoctorId']` SHALL still be doctor A's ID

#### Scenario: Persisted companion no longer in roster falls back to most recent

- **GIVEN** `meta['quiz.companionDoctorId']` is set to doctor A's ID
- **AND** doctor A has been retired and is no longer in the `doctors` table
- **AND** the `doctors` table contains doctors B, C, D with various `obtainedAt` timestamps
- **WHEN** the `QuizModal` opens
- **THEN** `boundDoctor` SHALL be the doctor with the highest `obtainedAt` value among the remaining roster
- **AND** the modal SHALL overwrite `meta['quiz.companionDoctorId']` to that new doctor's ID

#### Scenario: Changing doctor mid-session does not reset question and persists choice

- **GIVEN** the player is viewing question Q1 in `QuizModal` and has not yet answered
- **AND** `meta['quiz.companionDoctorId']` is doctor A's ID
- **WHEN** the player changes `boundDoctor` from doctor A to doctor B via the in-modal picker
- **THEN** the modal SHALL update the displayed doctor sprite + name to doctor B
- **AND** the question stem and option buttons SHALL remain Q1's content
- **AND** `meta['quiz.companionDoctorId']` SHALL be updated to doctor B's ID

#### Scenario: boundDoctor.subjectId does not affect affinity gain

- **GIVEN** `boundDoctor.subjectId = 內科` and the current quiz subject is `外科`
- **WHEN** the player answers an 外科 question correctly
- **THEN** `affinity[外科]` SHALL increment by exactly 1 (per `recruitment-gacha` spec)
- **AND** `affinity[內科]` SHALL be unchanged
- **AND** no multiplier or bonus SHALL apply based on doctor-subject mismatch

### Requirement: QuizModal partner section SHALL be responsive to viewport width

The doctor partner section (`.quiz-modal__partner`) rendered by `QuizModal` SHALL display correctly at all viewport widths from 320px (narrowest mobile) up to desktop sizes. On mobile widths (≤ 520px CSS pixels) the partner card's child elements (sprite, info, bonus badge, picker dropdown) SHALL NOT visually overlap, SHALL NOT truncate the doctor name text, and SHALL NOT cause horizontal overflow of the modal container.

The detailed responsive layout behavior — including the two-row stacking, indentation, and combinatorial scenarios for bonus/picker presence — SHALL be defined by the `quiz-partner-card-rwd` capability spec.

#### Scenario: Mobile partner card renders without overlap on iPhone-class viewport

- **GIVEN** viewport width = 375px (iPhone 14 mini)
- **AND** `boundDoctor` is a same-subject roster doctor with specialty multiplier > 1.0
- **AND** `doctors.length > 1` (picker visible)
- **WHEN** the player opens `QuizModal`
- **THEN** the partner section SHALL render per the `quiz-partner-card-rwd` two-row layout
- **AND** the doctor name SHALL be fully visible (no truncation)
- **AND** the bonus badge (`✨ 1.1×`) SHALL NOT overlap the doctor name or meta text
- **AND** the picker dropdown SHALL be fully visible and operable within the modal's horizontal bounds

#### Scenario: Desktop partner card layout unchanged by responsive rules

- **GIVEN** viewport width ≥ 521px (tablet portrait, desktop)
- **WHEN** the player opens `QuizModal`
- **THEN** the partner section SHALL render in the existing single-row layout
- **AND** the visual appearance SHALL match the pre-change desktop baseline
- **AND** no regression in spacing, alignment, or element visibility SHALL be introduced by the responsive CSS rules

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
4. Upsert `questionHistory[questionId]`: increment `attempts`, leave `correctCount` unchanged, set `lastAnsweredAt = Date.now()`, set `lastResult = 'wrong'` (this `lastResult` write is the sole driver of the 「錯題」 derived list per `wrong-answer-list` capability — no separate trigger needed)
5. Reveal explanation in the modal result region by rendering `corpus.explanation` through the `ExplanationMarkdown` component, which parses the string as CommonMark and emits a constrained React node tree. The component SHALL recognize `### 選項詳解` headings, `**A. ...**` bold, and `  - ✗ 錯誤 [P_N XXX] 詳解：...` bullet list patterns produced by the corpus build. Raw markdown control characters (`###`, `**`, `-`) SHALL NOT appear as literal text in the rendered output.
6. Reveal the inline ★ promote affordance in the answer-feedback region (per `QuizModal answer-feedback region SHALL surface an inline ★ promote-to-manual-bookmark affordance` requirement below)
7. Enable the 「下一題」 button
8. Disable the option buttons to prevent re-answer
9. Visually highlight the correct option (e.g., green border) and the incorrectly selected option (e.g., red border)

If `corpus.explanation` is empty, null, undefined, or whitespace-only, the result region SHALL display the placeholder text `「（解析待補）」` instead of erroring. The `ExplanationMarkdown` component SHALL short-circuit to the placeholder render path in these cases without invoking the markdown parser.

The `ExplanationMarkdown` component SHALL enforce a strict whitelist of allowed HTML elements: `p`, `h1`, `h2`, `h3`, `h4`, `strong`, `em`, `ul`, `ol`, `li`, `code`, `br`. All other markdown-derived elements (`a`, `img`, `table`, `pre`, `blockquote`, `hr`, etc.) SHALL be unwrapped or omitted. The component SHALL set `skipHtml: true` (or equivalent) on the underlying markdown renderer so that any raw HTML embedded in `corpus.explanation` (intentional or LLM-hallucinated) SHALL NOT be rendered as live HTML.

#### Scenario: Wrong answer increments only mastery.total and history.attempts

- **GIVEN** `affinity[內科] = 45`, `mastery[內科] = {correct: 10, total: 20}`, `questionHistory[Q_Y] = {attempts: 1, correctCount: 1, lastResult: 'correct', ...}`
- **WHEN** the player selects an incorrect option for Q_Y (an 內科 question)
- **THEN** `affinity[內科]` SHALL remain `45`
- **AND** `reputation` SHALL be unchanged (apart from any existing `createPerQReputationListener` no-op behavior on wrong)
- **AND** `mastery[內科]` SHALL equal `{correct: 10, total: 21}`
- **AND** `questionHistory[Q_Y]` SHALL equal `{attempts: 2, correctCount: 1, lastResult: 'wrong', lastAnsweredAt: <new ms>, ...}`
- **AND** the derived wrong-answer list (filtered view of `questionHistory.lastResult = 'wrong'`) SHALL contain Q_Y

#### Scenario: Explanation rendered from corpus

- **GIVEN** the player selects an incorrect option
- **AND** `corpus.explanation` for the question contains `### 選項詳解\n\n**A. ...**\n  - ✗ 錯誤 [P1 夯]\n  - 詳解：...`
- **WHEN** the modal result region renders
- **THEN** the explanation SHALL display the full text with markdown rendering (headings, bold, bullet points)
- **AND** the rendered DOM SHALL contain at least one `<h3>` element with text content `選項詳解` (rendered from the `### 選項詳解` source line)
- **AND** the rendered DOM SHALL contain `<strong>` elements wrapping the `A. ...` option labels
- **AND** the rendered DOM SHALL contain a `<ul>` element with `<li>` children for the ✗ / ✓ bullets
- **AND** the literal characters `###`, `**`, and `  - ` (leading dash-space) SHALL NOT appear as visible text in the rendered output
- **AND** the correct option button SHALL receive a "correct" visual treatment
- **AND** the selected wrong option SHALL receive a "wrong" visual treatment

#### Scenario: Missing explanation falls back to placeholder

- **GIVEN** a question has `corpus.explanation = ""` (empty string), missing field, or whitespace-only content
- **WHEN** the player answers and the result region renders
- **THEN** the result region SHALL display the placeholder text `「（解析待補）」`
- **AND** no markdown parsing SHALL be invoked (short-circuit path)
- **AND** no error SHALL be thrown
- **AND** the flow SHALL proceed (「下一題」 enabled normally)

#### Scenario: Explanation containing raw HTML is sanitized

- **GIVEN** a hypothetical `corpus.explanation` containing the string `<script>alert(1)</script>` or `<img src=x onerror=...>`
- **WHEN** the modal result region renders
- **THEN** no `<script>` element SHALL appear in the rendered DOM
- **AND** no `<img>` element SHALL appear in the rendered DOM
- **AND** the page SHALL NOT execute any embedded JavaScript
- **AND** the offending text MAY appear as escaped literal text but SHALL NOT be interpreted as HTML

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

### Requirement: Correct answer SHALL grant revenue and reputation rewards

The `QuizModal`'s correct-answer side-effect chain SHALL grant `revenue` and `reputation` deltas to `gameCounters.singleton` via the `applyQuizReward` service (`apps/medexam2-hospital-tw/src/services/quiz-rewards.ts`). The grant SHALL fire on every correct answer, including questions where `question.disputed === true` (送分題, which the existing `recordCorrectAnswer` logic treats as correct regardless of option chosen). Incorrect answers SHALL NOT grant any revenue or reputation.

The base per-correct reward constants SHALL be locked literals exported from `packages/content-medexam2-tw/src/recruitment.ts`:

- `QUIZ_REVENUE_PER_CORRECT_BASE = 80`
- `QUIZ_REPUTATION_PER_CORRECT_BASE = 80`

**The tier-scaled multiplier `QUIZ_TIER_MULTIPLIER: Record<HospitalTier, number>` SHALL be exported from the same module with locked literal values (`// TUNED 2026-05-19 — first dogfood pass; revisit after 1-2 weeks of telemetry`):**

| Tier | Multiplier |
|---|---|
| 診所 | 1.0 |
| 區域醫院 | 1.3 |
| 醫學中心 | 1.6 |
| 國家級教學醫院 | 2.0 |

The final granted amounts SHALL be computed by the formula:

```
revenuePerCorrect = ROUND(
  QUIZ_REVENUE_PER_CORRECT_BASE
  × getSpecialtyMultiplier(boundDoctor.subjectId, boundDoctor.rarity, currentSubjectId)
  × QUIZ_TIER_MULTIPLIER[gameCounters.tier]
)

reputationPerCorrect = ROUND(
  QUIZ_REPUTATION_PER_CORRECT_BASE
  × getSpecialtyMultiplier(boundDoctor.subjectId, boundDoctor.rarity, currentSubjectId)
  × QUIZ_TIER_MULTIPLIER[gameCounters.tier]
)
```

**`READING_SESSION_BUFF_MULTIPLIER` SHALL NOT appear in this formula** — the reading-session buff is now applied to the tick-loop idle income (see `hospital-tycoon-engine` capability), not to quiz reward. `applyQuizReward` SHALL NOT read `gameCounters.currentSessionStartedAt` — quiz reward is independent of session state.

The `gameCounters.tier` SHALL be read inside the same Dexie transaction as the mastery write — both reads happen on the same gameCounters singleton row, so consistency is guaranteed without separate locks.

The `getSpecialtyMultiplier` function SHALL remain the same single source of truth used by mastery accrual (see `hospital-specialty-bonus` capability, modified scope). The grant SHALL happen in the same Dexie transaction as the mastery / affinity / questionHistory writes performed by `recordCorrectAnswer`, to maintain atomicity across all correct-answer side effects.

The HomePage revenue / reputation chips SHALL reflect the new value within one render cycle (existing `useLiveQuery` reactivity).

**The HomePage 「淨收 / 分鐘」 cell sublabel SHALL apply `READING_IDLE_RATE_REDUCTION` to the displayed throughput value when no session is active, OR `READING_SESSION_BUFF_MULTIPLIER` when a session is active (matching the tick-loop math). The sublabel SHALL render as `毛 {ROUND(throughput × multiplier)} − 薪 {ROUND(salary)}` where `multiplier = currentSessionStartedAt !== null ? READING_SESSION_BUFF_MULTIPLIER : READING_IDLE_RATE_REDUCTION`. The net cell value SHALL likewise compute `(throughput × multiplier) − salary` so the displayed integer matches the tick-loop accrual.**

#### Scenario: Correct answer at 診所 tier with no doctor partner grants base reward (×1.0 tier multiplier)

- **GIVEN** `gameCounters.tier === '診所'`, no doctor is bound (boundDoctor = null)
- **WHEN** the player answers the current question correctly
- **THEN** `revenue` SHALL increase by exactly `80` (= `80 × 1.0 × 1.0`)
- **AND** `reputation` SHALL increase by exactly `80`

#### Scenario: Correct answer at 區域醫院 tier with no doctor partner applies 1.3× tier multiplier

- **GIVEN** `gameCounters.tier === '區域醫院'`, no doctor partner
- **WHEN** the player answers correctly
- **THEN** `revenue` SHALL increase by exactly `ROUND(80 × 1.0 × 1.3) = 104`
- **AND** `reputation` SHALL increase by exactly `104`

#### Scenario: Correct answer at 醫學中心 tier with same-subject P1 partner applies all (specialty + tier) multipliers

- **GIVEN** `gameCounters.tier === '醫學中心'`, doctor partner = same-subject P1 (specialty multiplier = 1.5)
- **WHEN** the player answers correctly
- **THEN** `revenue` SHALL increase by exactly `ROUND(80 × 1.5 × 1.6) = 192`
- **AND** `reputation` SHALL increase by exactly `192`

#### Scenario: Correct answer at 國家級教學醫院 tier with same-subject P1 partner gives max stacked reward (NO session buff applied)

- **GIVEN** `gameCounters.tier === '國家級教學醫院'`, doctor partner = same-subject P1 (specialty multiplier = 1.5), **session is active**
- **WHEN** the player answers correctly
- **THEN** `revenue` SHALL increase by exactly `ROUND(80 × 1.5 × 2.0) = 240` (NOT 360 — session state is irrelevant to quiz reward)
- **AND** `reputation` SHALL increase by exactly `240`

#### Scenario: Session state is irrelevant to quiz reward

- **GIVEN** `gameCounters.tier === '區域醫院'`, no doctor partner
- **WHEN** the player answers correctly with `currentSessionStartedAt !== null` (session active)
- **THEN** `revenue` SHALL increase by exactly `ROUND(80 × 1.0 × 1.3) = 104`
- **AND** the same answer with `currentSessionStartedAt === null` (session inactive) SHALL produce the same `104` delta
- **AND** the `applyQuizReward` Dexie transaction SHALL NOT read `currentSessionStartedAt`

#### Scenario: Correct answer with same-subject P5 partner at 醫學中心 — specialty + tier only

- **GIVEN** `gameCounters.tier === '醫學中心'`, doctor partner = same-subject P5 (specialty multiplier = 1.05)
- **WHEN** the player answers correctly
- **THEN** `revenue` SHALL increase by exactly `ROUND(80 × 1.05 × 1.6) = 134`
- **AND** `reputation` SHALL increase by exactly `134`

#### Scenario: Wrong answer grants zero quiz reward regardless of tier

- **GIVEN** `gameCounters.tier === '醫學中心'`, same-subject P3 partner
- **WHEN** the player selects an incorrect option
- **THEN** `revenue` SHALL remain unchanged by quiz-reward path
- **AND** `reputation` SHALL remain unchanged by quiz-reward path
- **AND** mastery / questionHistory side effects (per existing `hospital-quiz` requirements) SHALL still fire

#### Scenario: Disputed (送分題) question grants tier-scaled reward regardless of option chosen

- **GIVEN** `question.disputed === true`, `gameCounters.tier === '區域醫院'`, no partner
- **WHEN** the player selects any option
- **THEN** `revenue` SHALL increase by exactly `ROUND(80 × 1.0 × 1.3) = 104`
- **AND** the existing `recordCorrectAnswer` mastery side effect SHALL fire

#### Scenario: Tier upgrade mid-modal applies new multiplier on next answer

- **GIVEN** the player is in QuizModal at 區域醫院 tier
- **AND** a tier upgrade fires from background tick (`gameCounters.tier` changes to `醫學中心`)
- **WHEN** the player answers the next question correctly (cross-subject partner)
- **THEN** `revenue` SHALL increase by `ROUND(80 × 1.0 × 1.6) = 128` (using new 醫學中心 multiplier)
- **AND** the previous question's revenue grant (if any) SHALL NOT be retroactively adjusted

#### Scenario: HomePage 「淨收 / 分鐘」 sublabel reflects session-aware throughput at 醫學中心

- **GIVEN** `gameCounters.tier === '醫學中心'`, total room throughput from `computeThroughput` summed across rooms = 210, total salary drain from `computeSalaryDrain` = 132
- **WHEN** HomePage renders with `currentSessionStartedAt === null` (session inactive)
- **THEN** the 「淨收 / 分鐘」 sublabel SHALL show `毛 63 − 薪 132` (= `ROUND(210 × 0.3) = 63`)
- **AND** the cell value SHALL show `-69` (= `63 - 132`)
- **AND** when `currentSessionStartedAt !== null` (session active) the sublabel SHALL show `毛 315 − 薪 132` (= `ROUND(210 × 1.5) = 315`) and the cell value SHALL show `183`

#### Scenario: HomePage 「淨收 / 分鐘」 display at 診所 with empty rooms

- **GIVEN** `gameCounters.tier === '診所'`, no doctors assigned to rooms (throughput = 0), salary = 0
- **WHEN** HomePage renders
- **THEN** the 「淨收 / 分鐘」 cell SHALL show `0`
- **AND** the sublabel SHALL show `毛 0 − 薪 0` (or be hidden per existing conditional rendering for salary === 0)

#### Scenario: Reward writes are atomic with mastery / affinity writes (tier read included, no session read)

- **GIVEN** P3 same-subject partner, tier = 醫學中心
- **WHEN** the player answers correctly
- **THEN** within a single Dexie transaction the system SHALL read: `gameCounters.tier`; then update: `gameCounters.revenue / reputation`, `mastery[subjectId].correct / total`, `affinity[subjectId].correctCount`, `questionHistory[questionId]` (SRS fields)
- **AND** the transaction SHALL NOT read `gameCounters.currentSessionStartedAt`
- **AND** if any one write fails, all SHALL roll back
- **AND** the tier read SHALL be consistent with the tier value used for the multiplier (no torn read across the upgrade boundary)

### Requirement: QuizModal answer-feedback region SHALL surface an inline ★ promote-to-manual-bookmark affordance

When the player has submitted an answer (regardless of correct or wrong) and the answer-feedback region is visible (explanation + 「下一題」 enabled), `QuizModal` SHALL render an inline ★ toggle button within or immediately adjacent to the answer-feedback region. The toggle SHALL reflect the current `bookmarks` Dexie store membership for `currentQuestion.id`: filled ★ if a bookmark row exists, outline ☆ otherwise. Clicking the toggle SHALL invoke the same add/remove logic defined in `question-bookmarks` spec (synchronous Dexie write + debounced cloud push when authenticated). The toggle SHALL be additive to any pre-existing top-of-modal bookmark toggle (if present); both SHALL share the same underlying state. The toggle SHALL include a short label such as 「加入收藏」 / 「已收藏」 in Traditional Chinese to make its purpose clear, distinguishing it visually from the corner / icon-only top toggle.

The inline ★ affordance SHALL be visually prominent on wrong answers (the primary use case is "I answered wrong → want to remember to revisit even after I get it right next time") but SHALL ALSO render on correct answers (player may still want to bookmark for future reference).

The inline ★ SHALL NOT interact with the wrong-answer derived list — that list is auto-managed by the correct/wrong answer requirements above (driven by `questionHistory.lastResult`). The inline ★ is purely a manual-bookmark control.

#### Scenario: Inline ★ renders on wrong-answer feedback

- **GIVEN** the player answers question `Q_Y` incorrectly and the explanation is now revealed
- **WHEN** the answer-feedback region renders
- **THEN** an inline ★ toggle SHALL be visible in or adjacent to the feedback region
- **AND** the toggle SHALL show outline ☆ if no `bookmarks` row exists for Q_Y, or filled ★ if it exists
- **AND** the toggle SHALL include a Chinese label indicating its purpose (e.g., 「加入收藏」 or 「已收藏」)

#### Scenario: Inline ★ click adds bookmark synchronously

- **GIVEN** the player just answered `Q_Y` wrong and no `bookmarks` row exists for Q_Y
- **WHEN** the player clicks the inline ★ toggle
- **THEN** a new `bookmarks` row SHALL exist with `questionId = Q_Y.id` and `addedAt = Date.now()`
- **AND** the toggle SHALL re-render with filled ★
- **AND** the question SHALL now appear in both the 「手動收藏」 tab and the 「錯題」 tab of `/bookmarks`

#### Scenario: Inline ★ also renders on correct-answer feedback

- **GIVEN** the player answers question `Q_Z` correctly and the explanation is revealed
- **WHEN** the answer-feedback region renders
- **THEN** the inline ★ toggle SHALL still be visible (not only on wrong answers)
- **AND** clicking it SHALL toggle the `bookmarks` row identically

#### Scenario: Inline ★ and top-of-modal bookmark toggle share state

- **GIVEN** `QuizModal` displays question Q_Y with no bookmark
- **AND** both a top-of-modal bookmark toggle (existing) and an inline ★ (new, in feedback region) are rendered
- **WHEN** the player clicks either toggle
- **THEN** both toggles SHALL update to the new state (filled ★ if just bookmarked) on the next render
- **AND** exactly one `bookmarks` row SHALL exist for Q_Y (no duplicate write)
