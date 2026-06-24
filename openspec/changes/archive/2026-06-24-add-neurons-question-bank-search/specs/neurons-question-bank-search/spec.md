## ADDED Requirements

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
