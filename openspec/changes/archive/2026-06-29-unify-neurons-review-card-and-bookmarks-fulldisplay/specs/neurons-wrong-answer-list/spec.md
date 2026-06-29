## MODIFIED Requirements

### Requirement: `/bookmarks` SHALL present three tabs — 手動收藏 / 目前未答對 / 歷史曾錯

The `/bookmarks` route SHALL render a tabbed container with three sub-tabs: 「手動收藏」 (the existing ⭐ bookmark list, default tab), 「目前未答對」 (live derived view of `questionHistory` filtered `lastResult === 'wrong'`), and 「歷史曾錯」 (live derived view filtered `everWrong === true`). The two wrong-answer lists SHALL be derived at read time from `questionHistory` — no separate store.

Every row in all three tabs SHALL render the FULL question via the shared read-only `QuestionReviewCard` component: a row head followed by the question body. The row head SHALL show the verbatim 題號 (the question id, e.g. `104-1-醫學二-病理學-Q92`, which already encodes 年-次-冊-科目-題號) plus any ✨/🤔 標記 chips and a relative `lastAnsweredAt` / `addedAt` time — it SHALL NOT show separate 科目 and 年份 badges. The question body SHALL show the 承上題 前文 (when the question is a continuation question), the full stem, the figure, all options, the 正解 line, the 「看原始詳解 PDF」 button, and the per-option 簡答 — with no truncation. The card SHALL be read-only: no option is answerable and no state is mutated. Rows in the two wrong-answer lists SHALL be display-only with NO inline action buttons. The 「手動收藏」 tab SHALL retain a single per-row action — 取消收藏; the 重新作答 button SHALL NOT be rendered.

#### Scenario: Wrong answer appears in 目前未答對 and 歷史曾錯 immediately

- **GIVEN** the player has no `questionHistory` row for `106-1-醫學一-解剖學-Q1`
- **WHEN** the player answers it incorrectly
- **THEN** the 「目前未答對」 list SHALL contain that question
- **AND** the 「歷史曾錯」 list SHALL also contain that question
- **AND** both lists SHALL update reactively without a manual reload

#### Scenario: Correct answer leaves 目前未答對 but stays in 歷史曾錯

- **GIVEN** `questionHistory["106-1-醫學一-解剖學-Q1"] = { lastResult: 'wrong', everWrong: true }`
- **WHEN** the player answers that question correctly
- **THEN** the 「目前未答對」 list SHALL no longer contain that question
- **AND** the 「歷史曾錯」 list SHALL still contain that question

#### Scenario: Default tab is 手動收藏

- **WHEN** the player navigates to `/bookmarks`
- **THEN** the 「手動收藏」 tab SHALL be active by default

#### Scenario: Every tab renders the full question with a 題號 head

- **GIVEN** any of the three tabs is active with at least one row
- **THEN** each row's head SHALL show the verbatim 題號 (e.g. `104-1-醫學二-病理學-Q92`) and SHALL NOT show separate 科目 / 年份 badges
- **AND** each row SHALL render the full question body (stem + figure + options + 正解 + 「看原始詳解 PDF」 button + 簡答) inline with no truncation

#### Scenario: Wrong-answer rows have no action buttons; 手動收藏 keeps only 取消收藏

- **GIVEN** the 「歷史曾錯」 tab is active with at least one row
- **THEN** each row SHALL NOT render any action button (no 重新作答, no 收藏)
- **AND WHEN** the 「手動收藏」 tab is active with at least one row
- **THEN** each row SHALL render a 取消收藏 button and SHALL NOT render a 重新作答 button

### Requirement: The three tabs SHALL share one filter bar — family + year + exam-year chips

The `/bookmarks` page SHALL render a single shared filter bar above the tab strip that applies to all three sub-tabs: the existing family (科目) chips, the existing 標記 chips (✨ 太簡單 / 🤔 我亂猜的), and a NEW exam-year chip set. Exam year SHALL be derived from the question id prefix (e.g. `106-1-醫學一-解剖學-Q1` → `106`); a non-numeric prefix SHALL fall into an `unknown` bucket. The year chip set SHALL list the distinct years present in the currently-relevant rows. The 科目 and 年份 chip sets SHALL each lead with a 「全部」 select-all chip (mirroring the homepage `YearFilterBar`): the chip SHALL render active when nothing in that set is excluded, and clicking it SHALL clear that set's exclusions (show all). No separate 「重置（顯示全部）」 button SHALL be shown for the 科目 / 年份 sets.

#### Scenario: Year is parsed from the question id prefix

- **WHEN** the system derives the exam year for `108-2-醫學二-生理學-Q14`
- **THEN** it SHALL be `108`

#### Scenario: Filter applies across all three tabs

- **GIVEN** the player excludes family `解剖學` and selects only year `106` in the shared filter bar
- **WHEN** the player switches between 手動收藏 / 目前未答對 / 歷史曾錯
- **THEN** every visible list SHALL exclude `解剖學` rows and show only `106` rows

#### Scenario: 全部 select-all chip restores a filter set

- **GIVEN** the player has excluded one or more 科目 chips (so the 科目 「全部」 chip renders inactive)
- **WHEN** the player clicks the 科目 「全部」 chip
- **THEN** all 科目 exclusions SHALL be cleared (every 科目 shown) and the 「全部」 chip SHALL render active
