## MODIFIED Requirements

### Requirement: A `/bookmarks` route SHALL list all bookmarked questions with full content inline

The system SHALL expose a `/bookmarks` route accessible from the hospital home page navigation. The route SHALL host a two-tab structure 「手動收藏」 / 「錯題」 — this requirement defines the 「手動收藏」 tab behavior. The 「錯題」 tab is owned by the `wrong-answer-list` capability. Tab state SHALL be controlled via URL query string `?tab=manual` (default — also when the param is absent or invalid) and `?tab=wrong`. Tab clicks SHALL update the query string via `history.replaceState` (no full page reload). Manual bookmark behavior described below is scoped to the 「手動收藏」 tab; navigating between tabs SHALL NOT affect the underlying `bookmarks` Dexie store.

The 「手動收藏」 tab SHALL render every row from the local `bookmarks` Dexie store, sorted by `addedAt` descending (most recent first). Each list entry SHALL display the question identifier verbatim, the full question stem, all four options with their texts, the correct-answer label, and the explanation — without any truncation or "click to expand" interaction. Bookmark entries whose `questionId` is not present in the currently-loaded `questions.json` SHALL render a stub with the identifier and a "題目已不在題庫" notice plus a remove button.

The explanation in each list entry SHALL be rendered through the `ExplanationMarkdown` component, applying the same markdown parse + whitelist + sanitization rules defined in the `hospital-quiz` capability. Raw markdown control characters (`###`, `**`, `-`) SHALL NOT appear as literal text in the rendered output. Explanations that are empty, null, or whitespace-only SHALL render the placeholder `「（解析待補）」`.

The Markdown export flow (`匯出 Markdown` button) SHALL remain unchanged: it SHALL echo the raw `corpus.explanation` source string into the downloaded `.md` file, NOT the rendered DOM. This preserves the round-trip-able authoring format so the exported file remains a valid Markdown document for offline note-taking. The export button SHALL be scoped to the 「手動收藏」 tab and export ONLY manual bookmarks (not wrong-answer entries).

#### Scenario: Bookmarks list renders all bookmarks most-recent-first

- **GIVEN** the player has 3 bookmarks with `addedAt` values T1 < T2 < T3
- **WHEN** the player navigates to `/bookmarks` (or `/bookmarks?tab=manual`)
- **THEN** the 「手動收藏」 tab SHALL be active
- **AND** the page SHALL render 3 entries
- **AND** the entry with `addedAt = T3` SHALL appear first
- **AND** the entry with `addedAt = T1` SHALL appear last

#### Scenario: Each entry shows full question content inline

- **GIVEN** the player has bookmarked question `106-2-醫學三-內科-Q10`
- **WHEN** the player views `/bookmarks?tab=manual`
- **THEN** the entry SHALL display the literal identifier `106-2-醫學三-內科-Q10`
- **AND** the full question stem SHALL be visible
- **AND** all four option labels (A, B, C, D) and their text SHALL be visible
- **AND** the correct answer label SHALL be visible
- **AND** the explanation text SHALL be visible
- **AND** no further click SHALL be required to reveal any of the above

#### Scenario: Explanation renders markdown structure inline

- **GIVEN** the player has bookmarked a question whose `corpus.explanation` contains `### 選項詳解\n\n**A. ...**\n  - ✗ 錯誤 [P1 夯]\n  - 詳解：...`
- **WHEN** the player views `/bookmarks?tab=manual`
- **THEN** the entry's explanation region SHALL contain at least one `<h3>` element with text content `選項詳解`
- **AND** the explanation region SHALL contain `<strong>` elements wrapping option labels (`A. ...`)
- **AND** the explanation region SHALL contain a `<ul>` element with `<li>` children for the option bullets
- **AND** the literal characters `###`, `**`, and `  - ` (leading dash-space) SHALL NOT appear as visible text in the rendered output

#### Scenario: Empty explanation renders placeholder

- **GIVEN** the player has bookmarked a question whose `corpus.explanation` is `""`, `null`, undefined, or whitespace-only
- **WHEN** the player views `/bookmarks?tab=manual`
- **THEN** the entry's explanation region SHALL display the placeholder text `「（解析待補）」`
- **AND** no error SHALL be thrown
- **AND** no markdown parser SHALL be invoked for that entry

#### Scenario: Markdown export preserves raw source

- **GIVEN** the player has 3 bookmarks, at least one with markdown-rich `corpus.explanation`
- **WHEN** the player clicks 「匯出 Markdown」 on the 「手動收藏」 tab and the file downloads
- **THEN** the exported `.md` file SHALL contain the raw `corpus.explanation` string verbatim (with `###`, `**`, `-` characters intact)
- **AND** the exported file SHALL contain ONLY manual bookmark entries (NOT wrong-answer entries)
- **AND** the exported file SHALL NOT contain HTML tags (`<h3>`, `<strong>`, `<ul>`) — the export channel is independent of the in-app render pipeline

#### Scenario: Orphaned bookmark renders stub with remove option

- **GIVEN** the player has a bookmark for `questionId = "999-9-醫學一-X-Q99"`
- **AND** that identifier is not present in the currently-loaded `questions.json`
- **WHEN** the player views `/bookmarks?tab=manual`
- **THEN** the entry SHALL display the identifier
- **AND** the entry SHALL display the text `題目已不在題庫`
- **AND** the entry SHALL display a remove-bookmark button
- **AND** the page SHALL NOT throw or crash

#### Scenario: Empty state when no bookmarks exist

- **GIVEN** the `bookmarks` Dexie store contains zero rows
- **WHEN** the player navigates to `/bookmarks?tab=manual`
- **THEN** the page SHALL display the message `還沒有收藏題目。答題時點右上 ⭐ 把題目收藏起來。`
- **AND** no list entries SHALL render
- **AND** the export button SHALL be disabled
- **AND** the 「錯題」 tab SHALL remain available for switching to

#### Scenario: Tab navigation preserves bookmarks state

- **GIVEN** the player is on `/bookmarks?tab=manual` viewing 3 bookmarks
- **WHEN** the player clicks the 「錯題」 tab, then clicks back to the 「手動收藏」 tab
- **THEN** the 「手動收藏」 tab SHALL still render the same 3 bookmarks in the same order
- **AND** no Dexie writes SHALL have occurred as a side effect of tab navigation
