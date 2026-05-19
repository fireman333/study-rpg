## MODIFIED Requirements

### Requirement: Wrong answer SHALL reveal explanation, update mastery and history, with no penalty

When the player selects an incorrect option (not matching `corpus.answer`), the system SHALL:

1. NOT modify `affinity[currentSubjectId]` (per `recruitment-gacha` spec "never decrement")
2. NOT modify `reputation` (no reputation penalty)
3. Increment `mastery[currentSubjectId].total` by 1 (correct counter unchanged)
4. Upsert `questionHistory[questionId]`: increment `attempts`, leave `correctCount` unchanged, set `lastAnsweredAt = Date.now()`, set `lastResult = 'wrong'` (this `lastResult` write is the sole driver of the 「錯題」 derived list per `wrong-answer-list` capability — no separate trigger needed)
5. Reveal explanation in the modal result region by rendering `corpus.explanation` through the `ExplanationMarkdown` component, which parses the string as CommonMark and emits a constrained React node tree. The component SHALL recognize `### 選項詳解` headings, `**A. ...**` bold, and `  - ✗ 錯誤 [P_N XXX] 詳解：...` bullet list patterns produced by the corpus build. Raw markdown control characters (`###`, `**`, `-`) SHALL NOT appear as literal text in the rendered output.
6. Reveal the inline ★ promote affordance in the answer-feedback region (per new requirement below)
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

## ADDED Requirements

### Requirement: QuizModal answer-feedback region SHALL surface an inline ★ promote-to-manual-bookmark affordance

When the player has submitted an answer (regardless of correct or wrong) and the answer-feedback region is visible (explanation + 「下一題」 enabled), `QuizModal` SHALL render an inline ★ toggle button within or immediately adjacent to the answer-feedback region. The toggle SHALL reflect the current `bookmarks` Dexie store membership for `currentQuestion.id`: filled ★ if a bookmark row exists, outline ☆ otherwise. Clicking the toggle SHALL invoke the same add/remove logic defined in `question-bookmarks` spec (synchronous Dexie write + debounced cloud push when authenticated). The toggle SHALL be additive to any pre-existing top-of-modal bookmark toggle (if present); both SHALL share the same underlying state. The toggle SHALL include a short label such as 「加入收藏」 / 「已收藏」 in Traditional Chinese to make its purpose clear, distinguishing it visually from the corner / icon-only top toggle.

The inline ★ affordance SHALL be visually prominent on wrong answers (the primary use case is "I answered wrong → want to remember to revisit even after I get it right next time") but SHALL ALSO render on correct answers (player may still want to bookmark for future reference).

The inline ★ SHALL NOT interact with the `wrongAnswers` Dexie store — that store is auto-managed by the correct/wrong answer requirements above. The inline ★ is purely a manual-bookmark control.

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
- **AND** the `wrongAnswers` row for Q_Y (also created by the wrong-answer flow) SHALL remain unchanged
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
