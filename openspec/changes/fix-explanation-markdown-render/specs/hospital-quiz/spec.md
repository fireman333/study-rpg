## MODIFIED Requirements

### Requirement: Wrong answer SHALL reveal explanation, update mastery and history, with no penalty

When the player selects an incorrect option (not matching `corpus.answer`), the system SHALL:

1. NOT modify `affinity[currentSubjectId]` (per `recruitment-gacha` spec "never decrement")
2. NOT modify `reputation` (no reputation penalty)
3. Increment `mastery[currentSubjectId].total` by 1 (correct counter unchanged)
4. Upsert `questionHistory[questionId]`: increment `attempts`, leave `correctCount` unchanged, set `lastAnsweredAt = Date.now()`, set `lastResult = 'wrong'`
5. Reveal explanation in the modal result region by rendering `corpus.explanation` through the `ExplanationMarkdown` component, which parses the string as CommonMark and emits a constrained React node tree. The component SHALL recognize `### 選項詳解` headings, `**A. ...**` bold, and `  - ✗ 錯誤 [P_N XXX] 詳解：...` bullet list patterns produced by the corpus build. Raw markdown control characters (`###`, `**`, `-`) SHALL NOT appear as literal text in the rendered output.
6. Enable the 「下一題」 button
7. Disable the option buttons to prevent re-answer
8. Visually highlight the correct option (e.g., green border) and the incorrectly selected option (e.g., red border)

If `corpus.explanation` is empty, null, undefined, or whitespace-only, the result region SHALL display the placeholder text `「（解析待補）」` instead of erroring. The `ExplanationMarkdown` component SHALL short-circuit to the placeholder render path in these cases without invoking the markdown parser.

The `ExplanationMarkdown` component SHALL enforce a strict whitelist of allowed HTML elements: `p`, `h1`, `h2`, `h3`, `h4`, `strong`, `em`, `ul`, `ol`, `li`, `code`, `br`. All other markdown-derived elements (`a`, `img`, `table`, `pre`, `blockquote`, `hr`, etc.) SHALL be unwrapped or omitted. The component SHALL set `skipHtml: true` (or equivalent) on the underlying markdown renderer so that any raw HTML embedded in `corpus.explanation` (intentional or LLM-hallucinated) SHALL NOT be rendered as live HTML.

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
