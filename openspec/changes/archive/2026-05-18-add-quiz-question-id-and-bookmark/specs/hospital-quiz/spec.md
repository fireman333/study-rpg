## MODIFIED Requirements

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
