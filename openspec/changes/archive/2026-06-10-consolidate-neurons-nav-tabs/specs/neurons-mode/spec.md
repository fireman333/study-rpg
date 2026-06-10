# neurons-mode (delta)


## ADDED Requirements

### Requirement: Top navigation SHALL consolidate to five tabs with grouped sub-tab navigation

The App-level top navigation SHALL present exactly five tabs: 腦圖 (`/`)、圖鑑、收藏 (`/bookmarks`)、題庫 (`/bank`)、社群. The 圖鑑 tab SHALL link to `/collection` and SHALL render as active whenever the current path is `/collection`, `/dmn`, or `/achievements`; the 社群 tab SHALL link to `/leaderboard` and SHALL render as active whenever the current path is `/leaderboard` or `/shoutout`. The grouped pages SHALL render a sub-tab bar (underline tablist, ported from 二階's achievements-tab pattern) above their content — 圖鑑 group: 神經元圖鑑 (`/collection`) / DMN (`/dmn`) / 成就 (`/achievements`); 社群 group: 排名 (`/leaderboard`) / 留言 (`/shoutout`) — with the tab matching the current path highlighted (gold underline + emphasised text). Route paths SHALL NOT change: every grouped page keeps its pre-existing URL, direct navigation and F5 reload behavior (no redirects introduced by this consolidation). This requirement supersedes any older implementation note describing the retired 8-tab nav order (e.g. positional notes such as「收藏 → added between DMN → and 成就 →」).

#### Scenario: Five tabs render and group tabs cover their sub-pages

- **WHEN** the app shell renders on any route
- **THEN** the top nav SHALL contain exactly the five tabs 腦圖 / 圖鑑 / 收藏 / 題庫 / 社群 (DMN、成就、排名、留言 SHALL NOT appear as top-level tabs)
- **AND** on `/dmn` or `/achievements` the 圖鑑 tab SHALL render in its active style
- **AND** on `/shoutout` the 社群 tab SHALL render in its active style

#### Scenario: Sub-tab bar switches pages within a group

- **GIVEN** the player is on `/collection`
- **WHEN** the player taps the DMN sub-tab
- **THEN** the app SHALL navigate to `/dmn` and render the DMN page with the DMN tab highlighted
- **AND** tapping 成就 SHALL navigate to `/achievements` likewise

#### Scenario: Grouped page URLs are unchanged (direct URL + F5)

- **WHEN** the player loads `/dmn`, `/achievements`, `/leaderboard`, or `/shoutout` directly or presses F5 there
- **THEN** the page SHALL render at that same URL with its group's sub-tab bar (no redirect, no blank shell)
