# neurons-question-bank-search Specification

## Purpose
TBD - created by syncing change add-neurons-question-bank-search. Update Purpose after archive.

## Requirements

### Requirement: The 題庫 tab SHALL offer a keyword search that composes with the chip filters

The 題庫 page (`/bank`, `QuestionBankPage`) SHALL render a labeled search box above
the 科別 / 年份 / 次別 filter chips. Searching SHALL be a **substring match** (no
fuzzy/tokenizer library) over a per-question searchable text built from the 題號
(`q.id`) + 題幹 (`q.stem`) + 選項 (`Object.values(q.options)`) + 詳解
(`q.explanation`, tolerating its absence), normalized with **NFKC** and lowercased
so full-width and half-width Latin (e.g. `ＳＯＤ１` vs `SOD1`) match interchangeably.
A query SHALL be split on whitespace into tokens that are **AND-combined** — a
question matches only when every token is a substring of its searchable text.

The search SHALL **compose with the existing chip filters as a conjunction**
(科別 ∧ 年份 ∧ 次別 ∧ search): it narrows the already-chip-filtered set rather than
replacing the chip selection. The result-count chip SHALL reflect the combined
result and SHALL be announced to assistive tech (`aria-live="polite"`).

This capability is **presentation/derived only**: it SHALL NOT add or alter any
Dexie table, R2 bundle, synced meta key, or game-economy value.

#### Scenario: Keyword narrows the visible questions

- **GIVEN** the 題庫 page with no chip filters selected
- **WHEN** the player types a keyword present in some questions' 題幹 / 選項 / 詳解 / 題號
- **THEN** only questions whose searchable text contains the keyword SHALL remain visible
- **AND** the result-count chip SHALL drop from the full corpus count to the match count

#### Scenario: Multiple space-separated tokens are AND-combined

- **GIVEN** a query of two whitespace-separated tokens
- **THEN** a question SHALL match only if **both** tokens are substrings of its searchable text

#### Scenario: Full-width query matches half-width content via NFKC

- **GIVEN** content containing the half-width string `SOD1`
- **WHEN** the player searches the full-width string `ＳＯＤ１`
- **THEN** the question SHALL match

#### Scenario: Search composes with chip filters

- **GIVEN** a keyword that matches questions across several 科別
- **WHEN** the player also selects one 科別 chip
- **THEN** the visible set SHALL be exactly the questions that match the keyword **and** belong to the selected 科別

### Requirement: The search box SHALL be IME-safe and debounced

The search input SHALL be a controlled `type="text"` field whose value debounces
(200ms) into the query that drives filtering. While an IME composition is in
progress (注音 / 拼音 組字中), commits SHALL be suppressed; on `compositionEnd` the
value SHALL be committed immediately so 組字中 keystrokes do not thrash the filter.
The field SHALL carry an accessible label and SHALL show a custom × clear control
only while the input is non-empty (using `type="text"` rather than `type="search"`
so the browser's native cancel control does not produce a duplicate ×). Changing
the committed query SHALL reset pagination to the first page.

#### Scenario: 組字中 keystrokes do not thrash the filter

- **GIVEN** the player is composing CJK text via an IME in the search box
- **WHEN** intermediate composition keystrokes are emitted
- **THEN** the filter SHALL NOT recompute on each intermediate keystroke
- **AND** the filter SHALL update once composition ends

#### Scenario: Clearing the search restores the prior view

- **GIVEN** an active search query
- **WHEN** the player activates the × clear control
- **THEN** the search query SHALL be emptied and the question list SHALL return to the chip-filtered (or full) set

### Requirement: The empty state SHALL be filter-aware and offer recovery actions

When the combined filter yields no questions, the page SHALL show an empty state
that distinguishes the cause. With a search query and no chip filters it SHALL read
「找不到包含「{query}」的題目」; with a search query **and** active chip filters it
SHALL read 「目前篩選條件下找不到符合「{query}」的題目」. When chip filters have
hidden all otherwise-matching hits — i.e. the search alone matches at least one
question — the empty state SHALL show 「清除篩選後，「{query}」可找到 N 題」. The
empty state SHALL offer a 清除搜尋 action, and a 清除篩選 action whenever chip
filters are active. With no search query, the existing 「沒有符合篩選條件的題目」
empty state SHALL be shown.

#### Scenario: Search + chips hide all hits but search alone would match

- **GIVEN** a query that matches questions only outside the selected 科別 chip
- **WHEN** the combined filter result is empty
- **THEN** the empty state SHALL state that no question matches under the current filters
- **AND** SHALL offer 「清除篩選後，「{query}」可找到 N 題」 with N equal to the search-only match count
- **AND** SHALL offer both 清除搜尋 and 清除篩選 actions

#### Scenario: No-match search with no chip filters

- **GIVEN** no chip filters selected
- **WHEN** the player searches a string absent from every question
- **THEN** the empty state SHALL read 「找不到包含「{query}」的題目」 and offer a 清除搜尋 action

### Requirement: The 題庫 search SHALL also match per-question concept tags

The 題庫 keyword search SHALL match any of a question's tested concept tags in addition to its existing text fields, so that searching a concept name surfaces that concept's questions (including cross-concept questions tagged with it). This composes with the existing chip filters.

#### Scenario: Concept-name search surfaces the concept's questions
- **WHEN** the user searches a concept name (e.g. 「皮質脊髓徑」)
- **THEN** the results SHALL include every question tagged with that concept (whether it is the question's sole or one of several tested concepts), combined with any active chip filters

### Requirement: Question cards SHALL display concept labels that act as a search shortcut

Question cards (`QuestionReviewCard` and its usages in 題庫 / 收藏 / 考前猜題 source expansions) SHALL display the question's tested concept(s) as labels. In the standalone 題庫 / 收藏 views, tapping a concept label SHALL navigate to the 題庫 (`/bank`) with that concept pre-filled into the search box (reusing the concept search), NOT toggle a separate filter dimension. In an embedded read-only drill-down (e.g. a question opened inside the 考前猜題 source list), the label MAY be non-interactive to avoid navigating away mid-review.

#### Scenario: Concept label is a search shortcut in the standalone bank
- **WHEN** the user taps a concept label on a question card in 題庫 / 收藏
- **THEN** the app SHALL navigate to `/bank` with that concept pre-filled into the search box, showing that concept's questions

#### Scenario: Label does not disrupt in-place drill-down
- **WHEN** a question is shown inside the 考前猜題 source drill-down
- **THEN** its concept label MAY render as non-interactive so tapping it does not navigate away from the review context

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
