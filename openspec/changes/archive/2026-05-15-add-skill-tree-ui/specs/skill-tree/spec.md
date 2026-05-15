## ADDED Requirements

### Requirement: Skill tree composed of 4 stat branches with 9 nodes each

The skill tree SHALL consist of exactly 4 branches — one per stat key (`knowledge`, `reflex`, `memory`, `stamina`, matching `DEFAULT_STAT_SCHEMA.order` in `packages/core/src/types.ts`) — and each branch SHALL contain exactly 9 nodes ordered by unlock threshold ascending. Branch content (node name, flavor text, sprite key) SHALL be supplied by the active theme pack via `theme.skillTree`; when the active theme does not provide `skillTree` or provides an incomplete structure, the engine SHALL substitute a built-in fallback content set covering all 36 nodes.

#### Scenario: Theme provides complete skillTree

- **WHEN** the active `ThemePack` exposes `skillTree.branches` with 4 entries and each branch's `nodes` array length equals 9
- **THEN** the skill tree UI SHALL render using the theme-supplied `name`, `flavor`, and `spriteKey` for every node
- **AND** no fallback content SHALL be substituted

#### Scenario: Theme missing skillTree falls back to engine defaults

- **WHEN** the active `ThemePack` does not export `skillTree` (or any branch has fewer than 9 nodes)
- **THEN** the engine SHALL substitute its built-in fallback content for the missing branches/nodes
- **AND** the `/skills` route SHALL still render without runtime error
- **AND** a single console warning SHALL be emitted naming the missing theme keys

### Requirement: Node unlock derived from stat value via linear threshold

The unlock count for a branch SHALL be `min(floor(statValue / 100) + 1, 9)`, meaning the first node (index 0) is always unlocked at `statValue = 0`, the second unlocks at `statValue ≥ 100`, and so on through the ninth at `statValue ≥ 800`. The unlock check SHALL be a pure derivation from `Player.stats`; no separate persistence field SHALL be added for skill tree progression.

#### Scenario: Stat value zero unlocks only the first node

- **WHEN** `Player.stats.knowledge === 0`
- **THEN** `unlockedCount(0, knowledgeBranch) === 1`
- **AND** only the node at index 0 SHALL be visually marked unlocked

#### Scenario: Stat value 350 unlocks first 4 nodes

- **WHEN** `Player.stats.stamina === 350`
- **THEN** `unlockedCount(350, staminaBranch) === 4`
- **AND** nodes at indices 0, 1, 2, 3 SHALL render unlocked while indices 4–8 render locked

#### Scenario: Stat value 800 or above unlocks all 9 nodes

- **WHEN** `Player.stats.reflex === 800` (or any value ≥ 800)
- **THEN** `unlockedCount(reflex, reflexBranch) === 9`
- **AND** all 9 nodes in the branch SHALL render unlocked

#### Scenario: No skill-tree-specific field added to persisted Player state

- **WHEN** the persisted `Player` schema is inspected after the change ships
- **THEN** no new field corresponding to skill tree progression (e.g., `unlockedSkillNodes`, `skillTreeState`) SHALL exist
- **AND** unlock state SHALL be recomputed from `Player.stats` on every render

### Requirement: `/skills` route renders 4 stat columns side by side

The application SHALL register a `/skills` route under react-router v6 that renders the skill tree UI. On viewports ≥ 768px the UI SHALL render 4 columns side by side, one per stat branch, in the order defined by `DEFAULT_STAT_SCHEMA.order` (`knowledge → reflex → memory → stamina`). Each column SHALL display its 9 nodes stacked vertically from index 0 (top) to index 8 (bottom).

#### Scenario: Route accessible from character card button

- **WHEN** the player clicks the "技能樹" button on the character card
- **THEN** the router SHALL navigate to `/skills`
- **AND** the skill tree UI SHALL render within 1 frame (no spinner needed at MVP scope)

#### Scenario: Desktop layout shows 4 columns

- **WHEN** the viewport width is ≥ 768px and the `/skills` route is active
- **THEN** the 4 branch columns SHALL render in a single horizontal row
- **AND** the column order SHALL match `DEFAULT_STAT_SCHEMA.order` (`knowledge`, `reflex`, `memory`, `stamina` from left to right)
- **AND** each column header SHALL display the stat name and current stat value

### Requirement: Locked vs unlocked node visual rendering

Each node SHALL render with a clearly different visual state depending on its unlock status. Unlocked nodes SHALL display the full-color theme sprite, the node name, and clicking SHALL reveal the flavor text. Locked nodes SHALL display a dimmed/desaturated sprite or generic lock placeholder, hide the name, and SHALL display the integer threshold value (e.g., "400") as a hint.

#### Scenario: Unlocked node click reveals flavor

- **WHEN** the player clicks an unlocked node tile
- **THEN** the node's `flavor` text SHALL appear in a tooltip / inline panel
- **AND** the panel SHALL show the node name as a header

#### Scenario: Locked node displays threshold hint

- **WHEN** rendering a locked node at unlock index `n` (1 ≤ n ≤ 8)
- **THEN** the tile SHALL show a lock placeholder (dim sprite or padlock icon)
- **AND** the integer value `n * 100` SHALL be visible on or below the tile
- **AND** the node's name and flavor text SHALL NOT be visible

### Requirement: New-unlock toast notification

When a stat update crosses a node threshold, the UI SHALL surface a toast announcing the newly unlocked node. If multiple thresholds are crossed in a single stat update, all newly unlocked nodes SHALL be queued and surfaced one at a time (max 1 visible simultaneously). Toasts SHALL NOT trigger gacha rolls, loot drops, or any state mutation beyond the visual notification at MVP scope.

#### Scenario: Single threshold crossing fires one toast

- **WHEN** `Player.stats.memory` changes from 95 to 105 (crossing the 100 threshold)
- **THEN** exactly one toast SHALL be enqueued containing the node at index 1 of the memory branch
- **AND** the toast SHALL display the node name + sprite

#### Scenario: Multi-threshold crossing queues sequentially

- **WHEN** `Player.stats.knowledge` changes from 50 to 280 (crossing thresholds at 100 and 200)
- **THEN** 2 toasts SHALL be enqueued (for nodes at indices 1 and 2)
- **AND** they SHALL appear sequentially with at most 1 visible at a time

#### Scenario: Toast does not mutate game state

- **WHEN** a new-unlock toast appears and is dismissed
- **THEN** no roll SHALL be added to the gacha queue
- **AND** no item SHALL be added to inventory
- **AND** no stat SHALL be modified

### Requirement: Character card displays skill tree entry button

The character card on the home screen SHALL display a "技能樹" button. The button SHALL be a peer of any other character-card navigation affordance (not nested inside another menu) and SHALL navigate to `/skills` on click.

#### Scenario: Button visible on home screen

- **WHEN** the home screen renders the character card
- **THEN** a button labeled "技能樹" SHALL be visible within the character card area
- **AND** the button SHALL be reachable by keyboard tab navigation

#### Scenario: Button click navigates to /skills

- **WHEN** the player clicks the "技能樹" button
- **THEN** the router SHALL navigate to the `/skills` route
- **AND** the home screen SHALL be replaced by the skill tree UI

### Requirement: Mobile viewport uses horizontal scroll without breaking page navigation

On viewports < 768px the 4 branch columns SHALL remain side by side and become horizontally scrollable inside the skill tree container. Horizontal swipe gestures inside the skill tree container SHALL NOT trigger the browser's back/forward navigation (i.e., the container SHALL apply `overscroll-behavior-x: contain` or equivalent).

#### Scenario: Mobile shows horizontal scroll container

- **WHEN** the viewport width is < 768px and the `/skills` route is active
- **THEN** the 4 columns SHALL render in a horizontally scrollable container
- **AND** the visible column count at any scroll position MAY be fewer than 4

#### Scenario: Swipe inside skill tree does not trigger browser navigation

- **WHEN** the player performs a horizontal swipe inside the skill tree container on a touch device
- **THEN** the browser's back/forward navigation SHALL NOT be triggered
- **AND** the horizontal scroll position of the skill tree container SHALL update
