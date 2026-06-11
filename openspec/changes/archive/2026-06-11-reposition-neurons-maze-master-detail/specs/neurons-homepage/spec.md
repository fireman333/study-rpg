## MODIFIED Requirements

### Requirement: Homepage SHALL compose as a CTA toolbar over the interactive tree panel over the family-detail grid

The homepage SHALL present, top to bottom: (1) a **merged daily-loop stat card as the homepage's top dashboard**, whose top band is the **⚔️ 錯題出征 entry as the prominent primary connectome-building CTA** (cross-subject wrong-question expedition — repairing wrong questions wires the connectome), opened directly (NOT via a co-equal chooser), and whose body presents the connectome status indicators AND the DMN-draw progress indicator (both folded in from the previously standalone surfaces) laid out as a causal chain (今日出征狀態 → 修復連線數據 → DMN 抽卡 進度) that SHALL be **responsive**: a horizontal row with `→` connectors on wide viewports and a **vertical stack with `↓` connectors on narrow viewports (< 520px)**, so the connectors never orphan onto their own line. The card SHALL show a curated set of **always-visible** core signals (今日出征 ✓/✗・🔥 連續 N 天・穩定連線數・本週 X/7・DMN 今日抽/上限) and SHALL render the secondary signals 最強 pair / ⚡ 今日連線額外能量 **inline only when they have a value** (absent values take no space); the card SHALL NOT render a 「詳細」 disclosure toggle (no signal is removed — every signal is either always-visible or shown inline-when-present). The card SHALL ALSO contain the **total-collection progress chips (🧬 collected count / 💎 DMN owned / 📖 cumulative reading minutes)** as a bottom row rendered in the card's own (cream) theme — these are NOT a separate standalone strip — wrapping cleanly on narrow widths. The **⚔️ 錯題出征 entry SHALL be hidden for a new player who has never answered any question incorrectly, and SHALL be revealed (one-way) the first time the player answers incorrectly, persistent thereafter** (per `neurons-onboarding`) — this REPLACES the prior always-visible-but-disabled「無錯題」dead-button behavior for never-wrong new players; once revealed it MAY still render its existing disabled「無錯題」state when the player currently has zero wrong questions, and for a never-wrong new player the primary-CTA slot SHALL show guidance text (NOT a dead disabled button). The standalone connectome status strip, the standalone DMN progress indicator, and the standalone total-collection chip strip SHALL NOT be rendered as separate surfaces — they are folded into this card. The **🎲 cross-family random-quiz entry SHALL NOT be present** anywhere on the homepage (it is removed); the per-family quiz-mode chips (🆕 新題 / 🔄 錯題, per `neurons-quiz-modes`) are the sole homepage answering entry. (The global reading-timer toggle is no longer present — reading is per-subject in the family grid; the 📋 模考 entry lives in the 題庫 tab `/bank` per `neurons-exam-set-expedition`.) (2) the **study squad** surface (`StudySquadPanel`); (3) a **family-grid + embedded-maze master-detail surface** — the `FamilyPicker` (a **single family grid grouped by exam paper 醫學一 / 醫學二**, enriched to carry the per-family quiz-mode entries 🆕 新題 / 🔄 錯題, a per-subject 📖 閱讀 entry, AND the family detail: AP + mastery + variant-collection chips + `firedToday` badge, with the **exam-year filter `YearFilterBar` hosted at the top of this grid**) **coupled to a single embedded `MazeGrid` instance** (the brain-map detail), laid out responsively per `neurons-brain-maze`. The embedded maze SHALL be **collapsed by default to a slim teaser strip** (a recognisable brain-map preview), and tapping the teaser **or any family card** SHALL expand it. There SHALL be exactly **one** `MazeGrid` canvas instance on the homepage (no second/per-subject canvas), and that canvas SHALL remain in the same stable DOM node across all layout-state changes (collapse / expand / detail-mode / dock) — every layout change SHALL be a CSS class-toggle / grid-template change only, never a re-parent or remount of the canvas. On **wide viewports (≥ 768px)** the master-detail SHALL have two presentations: a **non-detail** state with the subject-card grid and the maze as a **sticky right detail panel**, and a **detail mode** entered when a family is selected (detail-mode SHALL be defined as `selectedFamilyId !== null`, reusing the existing selection state) in which the detail region expands to the **full box width** with a **dock header** (the full enlarged selected card — sprite, 科名/persona, AP, axon-progress strip, mastery/variant chips, the two quiz-mode chips 🆕 新題 / 🔄 錯題 with live badge counts, and the 📖 reading entry with its active label — mirroring the family card's affordances and reusing the same quiz / reading callbacks) above the maze, the two-column card grid collapses to `display:none` (the grid SHALL stay mounted so its live chip counts stay warm), and a **single-row family chip rail** (all 11 families as light chips: sprite + 科名 + 🆕 count, the selected one highlighted, the 醫學一 / 醫學二 grouping flattened to a divider) renders below the maze for one-tap family switching with **no 返回 step**. On **narrow viewports (< 768px)** tapping a family card SHALL **dock the single maze panel directly under that card** (an accordion, CSS-positioned with the DOM unchanged — no re-parent), focused on that family, with the card's quiz chips remaining on screen and **without a page scroll-jump** (the prior「點卡片→頁面跳到最上面開迷宮」behaviour SHALL NOT occur). The narrow-viewport dock anchor SHALL be tracked by **ephemeral, device-local-only state** (React state, NOT persisted, NOT a synced meta key) separate from the selection state, so that 🔭 全覽 can clear the family spotlight while keeping the panel docked. Tapping a family card SHALL **expand the embedded maze (if collapsed) AND focus its camera to that family's cluster** (sticky, per `neurons-brain-maze`); a 🔭 全覽 control inside the maze panel SHALL zoom the same map out to the whole connectome (the sole whole-map entry) and SHALL be the exit from desktop detail mode (no separate 返回 button). Switching between families while already in detail mode (or while already docked) SHALL NOT reflow the cards (only the dock-header content + the maze camera change); the maze observation panel SHALL be treated as a recessed well whose frame picks up the selected family's accent colour. The embedded maze SHALL NOT animate the size of the canvas container (size changes SHALL snap); only non-canvas sibling elements (dock header, chip rail, dock-in) MAY use one-shot fade/translate animations, and all such animations SHALL be disabled under `prefers-reduced-motion`. There SHALL be exactly one family-card grid (its cards split across the two exam-paper sections, not an NT-branch grouping). The `DmnDrawProgressRing` indicator (in its bar form, per the DMN-draw requirement), the total-collection progress chips (now inside the card), and the first-visit guided onboarding (per `neurons-onboarding`) SHALL remain present. Progress chips SHALL use the semantics 🧬 = collected individual count (the maze-node count remains conveyed by the maze itself). The dense synapse list table SHALL NOT be present anywhere in the app; synapse state is conveyed by the maze synapse overlay (and the existing formation/strengthening toast).

#### Scenario: Merged daily-loop stat card is the top dashboard above the squad + master-detail
- **WHEN** the homepage renders for a player who has answered at least one question incorrectly (or has prior wrong history)
- **THEN** a single merged stat card renders as the homepage's top dashboard, with the ⚔️ 錯題出征 primary CTA as its top band and a causal-chain body (今日出征狀態 → 修復連線數據 → DMN 抽卡 進度)
- **AND** the top-to-bottom homepage order is stat-card dashboard → study squad → (family grid + embedded maze) master-detail
- **AND** the standalone connectome status strip, the standalone DMN progress indicator, and the standalone total-collection chip strip are NOT rendered as separate surfaces
- **AND** triggering ⚔️ 錯題出征 opens the cross-subject wrong-question expedition flow directly (no co-equal chooser)

#### Scenario: Maze is collapsed to a teaser by default and expands on interaction
- **WHEN** the homepage first renders (no prior expand preference)
- **THEN** the embedded maze shows as a slim teaser strip (not the full-height panel), and the full maze canvas is not expanded
- **WHEN** the player taps the teaser or any family card
- **THEN** the embedded maze expands to its full panel
- **AND** the expand/collapse state persists across reloads (device-local, not synced)

#### Scenario: Desktop non-detail state is a two-column rail
- **WHEN** the homepage renders at ≥ 768px, the maze is expanded, and no family is selected (`selectedFamilyId === null`)
- **THEN** the subject cards occupy the left column and the single maze instance occupies a sticky right detail panel

#### Scenario: Desktop enters full-width detail mode with a dock header and chip rail
- **WHEN** the player taps a family card at ≥ 768px (so `selectedFamilyId !== null`)
- **THEN** the detail region expands to the full box width with a dock header (the full enlarged selected card, carrying its sprite, AP, axon strip, mastery/variant chips, the 🆕/🔄 quiz-mode chips with live badge counts, and the 📖 reading entry) above the single maze, focused on that family
- **AND** the two-column card grid is hidden (`display:none`) but stays mounted (its live chip counts stay warm)
- **AND** a single-row family chip rail (all 11 families, the selected one highlighted, 醫學一/醫學二 flattened to a divider) renders below the maze
- **AND** tapping a chip (or another card) switches the focused family with no card reflow
- **AND** 🔭 全覽 exits detail mode back to the two-column rail (no separate 返回 button)
- **AND** the canvas is not re-parented or remounted across entering / switching / exiting detail mode (one canvas, stable DOM node)

#### Scenario: Mobile docks the maze under the tapped card without a scroll-jump
- **WHEN** the homepage renders at < 768px and the player taps a family card
- **THEN** the single maze panel docks directly under that card (an accordion, CSS-positioned with the DOM unchanged), focused on that family, with the card's quiz chips still on screen
- **AND** the page does NOT jump-scroll to the top (the docked card stays visually anchored)
- **AND** there is exactly one `MazeGrid` instance (no per-card canvas), not re-parented or remounted
- **WHEN** the player then taps 🔭 全覽
- **THEN** the family spotlight clears and the camera shows the whole connectome while the panel stays docked (no relayout)

#### Scenario: Causal-chain body is responsive (no orphaned connectors on mobile)
- **WHEN** the merged stat card renders below 520px viewport width
- **THEN** the three stages stack vertically with `↓` connectors between them (not a horizontal row with `→`)
- **AND** no connector glyph is stranded on its own line misaligned from the stages
- **WHEN** the card renders at ≥ 520px
- **THEN** the stages lay out horizontally with `→` connectors

#### Scenario: Total-collection chips are folded into the card in its theme
- **WHEN** the merged stat card renders
- **THEN** the 🧬 變體 / 💎 DMN (/20) / 📖 累積閱讀 chips render as a bottom row inside the card in the card's cream theme (not a separate dark strip)
- **AND** the chips wrap cleanly on narrow widths
- **AND** there is no standalone `進度狀態` strip elsewhere on the page

#### Scenario: Stat card shows all signals inline with no 詳細 disclosure toggle
- **WHEN** the merged stat card renders
- **THEN** the always-visible core signals (今日出征 ✓/✗・🔥 連續 N 天・穩定連線數・本週 X/7・DMN 今日抽/上限) are shown without any toggle
- **AND** there is NO 「詳細 / 收合」 disclosure toggle button on the card
- **AND** 最強 pair and ⚡ 今日連線額外能量 render inline only when they have a value (and take no space when absent)

#### Scenario: 🎲 random-quiz entry is absent; per-family chips are the sole answering entry
- **WHEN** the homepage renders
- **THEN** the 🎲 cross-family random-quiz entry is NOT present anywhere on the homepage
- **AND** the per-family quiz-mode chips (🆕 新題 / 🔄 錯題) in the family grid are the sole homepage answering entry
- **AND** the 📋 模考 entry is NOT present on the homepage (it lives in the 題庫 tab `/bank`)

#### Scenario: Single enriched family grid renders with the year filter at its top
- **WHEN** the homepage renders
- **THEN** exactly one family grid is present on `/`, with its cards grouped into the two exam-paper sections (醫學一 / 醫學二) — NOT grouped into NT branches (DA / 5-HT / GABA / Glu) — each card showing AP + mastery chip + variant-collection chip + the two per-family quiz-mode chips (🆕 新題 / 🔄 錯題) + a per-subject 📖 閱讀 entry
- **AND** the `YearFilterBar` renders at the top of this family grid (scoping the per-family quiz pool)
- **AND** each of the 11 cards renders its own distinct per-subject accent color
- **AND** there is NOT a second, separate read-only family-detail grid

#### Scenario: Expedition CTA is hidden for a never-wrong new player
- **WHEN** the homepage renders for a new player who has never answered any question incorrectly
- **THEN** the ⚔️ 錯題出征 entry is NOT present as a button (no disabled「無錯題」dead button)
- **AND** the card's primary-CTA slot shows guidance text (e.g.「答錯題開始修復連線」) instead
- **AND** the merged card otherwise renders an honest empty state (zeroed / not-completed signals), not a fabricated connectome line

#### Scenario: Tapping a family card expands and focuses the embedded maze
- **WHEN** the player taps a family card in the FamilyPicker grid
- **THEN** the embedded maze expands (if collapsed) and its camera flies to that family's cluster as a sticky focus (per `neurons-brain-maze`)

#### Scenario: Synapse table is absent; synapse conveyed by the maze overlay
- **WHEN** the homepage renders
- **THEN** no synapse list table is present anywhere in the app
- **AND** synapse state is conveyed by the maze synapse overlay (and the existing formation/strengthening toast)

## ADDED Requirements

### Requirement: Family cards SHALL show a derived axon-progress strip mirroring the maze tract

Each family card in the homepage `FamilyPicker` SHALL render a compact node-dot strip (an "axon progress strip") **derived** from that family's lit-node progress on the single embedded maze — in the family's accent colour, with lit nodes filled, the frontier node pulsing, unlit nodes hollow, and the second-lap nodes shown when applicable. It SHALL be a derived DOM element (NOT a second canvas), so each card reads as a slice of the one maze (same accent colour, same lit nodes). Under reduced-motion the frontier pulse SHALL be dropped.

#### Scenario: Each card shows its maze tract progress
- **WHEN** the homepage renders the family cards
- **THEN** each card shows a node-dot strip in the family's accent colour whose lit / frontier / unlit states match that family's maze tract
- **AND** no second canvas is mounted (the strip is DOM, derived from the maze view)
