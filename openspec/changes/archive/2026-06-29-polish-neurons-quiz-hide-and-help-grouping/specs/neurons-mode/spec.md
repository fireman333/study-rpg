## ADDED Requirements

### Requirement: HelpMenu sections SHALL be organized under labeled categories

The HelpMenu panel (per "Neurons-tw SHALL surface a global HelpMenu accessible from every route") SHALL present its accordion sections grouped under a small set of **labeled category headers**, rather than as one flat list, so the panel stays scannable as the section count grows. The grouping SHALL be **presentational only**: every section retains its stable `id`, icon, title, and body copy; no section is removed, merged, or rewritten by the grouping; and the section-level single-expand behavior (only one `<details>` open at a time, keyed on the globally-unique section `id`) SHALL be preserved across categories — opening a section in one category SHALL collapse an open section in any other category.

- Each category SHALL render a **static, non-collapsible header label** (an icon + a short Traditional-Chinese label), with that category's sections nested beneath it in declared order.
- Every existing section SHALL belong to exactly one category (no section orphaned or duplicated).
- The category set and ordering follow a「使用者旅程」progression — getting started → finding/reviewing questions → the core expedition loop → collection/gacha → long-term growth & social → support/destructive actions — with the destructive `account-reset` section kept last (retaining its existing danger styling).
- The categories are NOT a locked set: categories and section membership MAY be added or re-grouped as mechanics ship, without requiring a `neurons-mode` spec change for each (mirroring the existing "section list is NOT a locked count" allowance).

As of this change the categories are: **🧭 開始使用** (`onboarding`, `hotkeys`) · **📚 題目與複習** (`question-bank`, `bookmark`, `wrong-review`, `source-pdf`) · **⚔️ 出征與地圖修復** (`expedition`, `synapse-formation`, `connector-neuron`) · **🧬 收集與抽卡** (`variant-unlock`, `first-pull-second-lap`, `dmn-draws`) · **⚡ 強化與進度** (`acceleration`, `companion`, `achievements`, `leaderboard`) · **🩺 帳號與支援** (`bug-report`, `account-reset`).

#### Scenario: Panel renders sections grouped under category headers
- **WHEN** the player opens the HelpMenu panel
- **THEN** the sections SHALL appear under labeled category headers (not as one flat list)
- **AND** each category header SHALL render its member sections nested beneath it, with every section's stable `id`, icon, title, and body preserved

#### Scenario: Single-expand still holds across categories
- **GIVEN** the panel is open with a section in one category expanded and all others collapsed
- **WHEN** the player clicks the summary of a section in a different category
- **THEN** that section SHALL expand AND the previously-open section SHALL collapse (no two sections open simultaneously, regardless of category)

#### Scenario: Every section is reachable under exactly one category
- **WHEN** the panel renders
- **THEN** each defined section (including the keyboard-hotkeys reference and the bug-reporting entry) SHALL appear under exactly one category header, with none dropped or duplicated
