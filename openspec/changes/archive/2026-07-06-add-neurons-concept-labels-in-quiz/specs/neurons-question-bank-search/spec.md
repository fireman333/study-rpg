## ADDED Requirements

### Requirement: Interactive answering flows SHALL display post-reveal concept labels that open the bank in a new tab

The interactive answering surfaces — `QuizModal` (首頁單題), `MazeExpedition` (錯題出征), and `MockExamRunner` (模考) — SHALL display the current question's tested concept(s) as labels, but ONLY after the answer for that question is revealed. Before reveal the labels MUST be hidden (showing the concept before answering would spoil what the question tests). In `MockExamRunner`, whose flow answers the whole set without per-question reveal, labels SHALL appear only in the post-submission review, never during answering. In these interactive flows the concept label SHALL be rendered as a real anchor (`<a href target="_blank" rel="noopener">`) pointing at `/bank` with that concept pre-filled into the search box (honoring the Vite base URL), so activating it opens the bank in a SEPARATE browser tab and the in-progress answering / expedition / mock session is preserved in the original tab — deliberately different from the standalone 題庫 / 收藏 cards, which navigate in-app. Whether the new tab opens in the foreground or background is left to the browser/user (a plain click follows the browser default; a modifier / middle click opens it in the background per OS convention); the app MUST NOT attempt to force background focus via `window.open` + blur/focus (modern browsers block this). When a question has no concept tags, or the concept-tag sidecar fails to load, no label row SHALL render and the answering flow MUST continue unaffected.

#### Scenario: Labels hidden before reveal in single-question quiz
- **WHEN** the user is answering a question in `QuizModal` and has not yet revealed the answer
- **THEN** no concept label SHALL be shown

#### Scenario: Labels appear after reveal in single-question quiz
- **WHEN** the answer is revealed in `QuizModal` for a question that has concept tags
- **THEN** the question's concept label(s) SHALL be shown near the reveal / 詳解 area

#### Scenario: Expedition shows labels only after each question reveals
- **WHEN** a question is revealed during a `MazeExpedition` run
- **THEN** that question's concept label(s) SHALL be shown, and MUST NOT appear before its reveal

#### Scenario: Mock exam shows labels only in post-submission review
- **WHEN** the user is answering questions in `MockExamRunner` (no per-question reveal)
- **THEN** no concept label SHALL be shown during answering; labels SHALL appear only in the post-submission review

#### Scenario: Activating a label in an interactive flow opens the bank in a separate tab without losing the session
- **WHEN** the user activates a concept label (rendered as a `target="_blank"` anchor) inside `QuizModal` / `MazeExpedition` / `MockExamRunner`
- **THEN** the bank SHALL open at `/bank` (honoring the Vite base URL) with that concept pre-filled into the search box in a separate tab, AND the current answering / expedition / mock session SHALL remain intact in the original tab

#### Scenario: Modifier / middle click opens the bank in the background
- **WHEN** the user modifier-clicks (Cmd/Ctrl) or middle-clicks a concept label in an interactive flow
- **THEN** the bank tab SHALL open in the background per the browser/OS convention, leaving focus on the original answering tab (the app relies on the native anchor behavior and does not script tab focus)

#### Scenario: Missing tags or load failure never blocks answering
- **WHEN** the current question has no concept tags, or the concept-tag sidecar failed to load
- **THEN** no label row SHALL render and the answering flow SHALL proceed normally
