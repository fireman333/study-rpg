## MODIFIED Requirements

### Requirement: Homepage SHALL compose as a CTA toolbar over the interactive tree panel over the family-detail grid

The homepage SHALL present, top to bottom: (1) a **merged daily-loop stat card as the homepage's top dashboard**, whose top band is the **⚔️ 錯題出征 entry as the prominent primary connectome-building CTA** (cross-subject wrong-question expedition — repairing wrong questions wires the connectome), opened directly (NOT via a co-equal chooser), and whose body presents the connectome status indicators AND the DMN-draw progress indicator (both folded in from the previously standalone surfaces) laid out as a causal chain (今日出征狀態 → 修復連線數據 → DMN 抽卡 進度) that SHALL be **responsive**: a horizontal row with `→` connectors on wide viewports and a **vertical stack with `↓` connectors on narrow viewports (< 520px)**, so the connectors never orphan onto their own line. The card SHALL show a curated set of **always-visible** core signals (今日出征 ✓/✗・🔥 連續 N 天・穩定連線數・本週 X/7・DMN 今日抽/上限) and SHALL render the secondary signals 最強 pair / ⚡ 今日連線額外能量 **inline only when they have a value** (absent values take no space); the card SHALL NOT render a 「詳細」 disclosure toggle (no signal is removed — every signal is either always-visible or shown inline-when-present). The card SHALL ALSO contain the **total-collection progress chips (🧬 collected count / 💎 DMN owned / 📖 cumulative reading minutes)** as a bottom row rendered in the card's own (cream) theme — these are NOT a separate standalone strip — wrapping cleanly on narrow widths. The **⚔️ 錯題出征 entry SHALL be hidden for a new player who has never answered any question incorrectly, and SHALL be revealed (one-way) the first time the player answers incorrectly, persistent thereafter** (per `neurons-onboarding`) — this REPLACES the prior always-visible-but-disabled「無錯題」dead-button behavior for never-wrong new players; once revealed it MAY still render its existing disabled「無錯題」state when the player currently has zero wrong questions, and for a never-wrong new player the primary-CTA slot SHALL show guidance text (NOT a dead disabled button). The standalone connectome status strip, the standalone DMN progress indicator, and the standalone total-collection chip strip SHALL NOT be rendered as separate surfaces — they are folded into this card. The **🎲 cross-family random-quiz entry SHALL NOT be present** anywhere on the homepage (it is removed); the per-family quiz-mode chips (🆕 新題 / 🔄 錯題, per `neurons-quiz-modes`) are the sole homepage answering entry. (The global reading-timer toggle is no longer present — reading is per-subject in the family grid; the 📋 模考 entry lives in the 題庫 tab `/bank` per `neurons-exam-set-expedition`.) (2) a **read-only squad preview** (`SquadPreview`, per `neurons-study-squad`) — a compact「神經元遠征隊」avatar-stack plus a「到圖鑑編隊 →」link to `/collection?squad=1`; the editable squad panel SHALL NOT be on the homepage. (3) a **family-grid + embedded-maze surface** — the `FamilyPicker` (a **single family grid grouped by exam paper 醫學一 / 醫學二**, carrying the per-family quiz-mode entries 🆕 新題 / 🔄 錯題, a per-subject 📖 閱讀 entry, an explicit **🔍 聚焦** maze-focus button, AND the family detail: AP + mastery + variant-collection chips + `firedToday` badge + the derived axon-progress strip, with the **exam-year filter `YearFilterBar` hosted at the top of this grid**) **coupled to a single embedded `MazeGrid` instance**. There SHALL be exactly **one** `MazeGrid` canvas on the homepage, held in the **same stable DOM node across every layout-state change** (collapse / expand / focus) — every change is a CSS class / camera change, never a re-parent or remount. The embedded maze SHALL be **collapsed by default to a slim teaser strip**; tapping the teaser OR a family card's 🔍 聚焦 button SHALL expand it. On **wide viewports (≥ 768px)** the expanded maze SHALL render as a **full-width panel stacked ABOVE the subject-card grid and BELOW the exam-year filter chips**, scrolling with the page (no side column, no sticky panel). **Focusing a family SHALL be a maze-camera operation only — it SHALL NOT enter a page detail mode.** The subject-card grid SHALL NOT collapse, the other subjects SHALL remain fully answerable, and the focused subject's answer chips SHALL NOT move. There SHALL be **NO desktop detail mode** — NO dock header above the maze, NO grid `display:none`, and NO single-row family chip rail. The card header / sprite SHALL NOT be a click-to-focus target; the explicit **🔍 聚焦** button (a **secondary** action that SHALL NOT out-weight the 🆕/🔄/📖 CTAs) is the sole per-card focus trigger. Activating 🔍 聚焦 SHALL expand the maze if collapsed, fly the camera to that family's cluster as a sticky focus (per `neurons-brain-maze`), and highlight the focused card. The maze panel SHALL render a **status pill** reflecting state: unfocused →「腦圖全覽」; focused →「聚焦：<科>｜全覽」. The **🔭 全覽** control SHALL zoom the camera back out to the whole connectome and clear the focus — it SHALL be a convenience, NOT a required exit to resume answering. A family with **no explorable node** SHALL still center the camera on that family's cluster, with the pill reading「目前沒有可探索節點」(聚焦 SHALL NOT be disabled). When a year-filter narrowing removes the focused family from the visible set, the focus SHALL clear back to 全覽. When 🔍 聚焦 fires and the expanded maze band is fully scrolled offscreen above the viewport, the UI SHALL surface a brief toast「已聚焦腦圖：<科> ↑」rather than force-scroll the page to the top; a gentle `scrollIntoView({ block: 'nearest' })` is permitted only when the band is partially visible. On **narrow viewports (< 768px)** activating a family card's 🔍 聚焦 button SHALL **dock the single maze panel directly under that card** (an accordion, CSS-positioned with the DOM unchanged — no re-parent) focused on that family, with that card's 🆕/🔄/📖 chips remaining on screen, the other cards unchanged in normal flow (NO chip rail), and WITHOUT a page scroll-jump; a separate collapse chevron SHALL collapse the accordion (distinct from 🔭 全覽, which only resets the camera). The focus target SHALL be tracked by **ephemeral, device-local-only state** (`focusedFamilyId`; React state, NOT persisted, NOT synced), replacing the prior `selectedFamilyId` detail-mode state. The embedded maze SHALL NOT animate the size of the canvas container (size changes snap); only non-canvas siblings MAY use one-shot fade/translate animations, all disabled under `prefers-reduced-motion`. There SHALL be exactly one family-card grid (its cards split across the two exam-paper sections, not an NT-branch grouping). The `DmnDrawProgressRing` indicator (in its bar form), the total-collection progress chips (now inside the card), and the first-visit guided onboarding (per `neurons-onboarding`) SHALL remain present. Progress chips SHALL use the semantics 🧬 = collected individual count. The dense synapse list table SHALL NOT be present anywhere in the app; synapse state is conveyed by the maze synapse overlay (and the existing formation/strengthening toast).

#### Scenario: Merged daily-loop stat card is the top dashboard above the squad preview + family/maze surface
- **WHEN** the homepage renders for a player who has answered at least one question incorrectly (or has prior wrong history)
- **THEN** a single merged stat card renders as the homepage's top dashboard, with the ⚔️ 錯題出征 primary CTA as its top band and a causal-chain body (今日出征狀態 → 修復連線數據 → DMN 抽卡 進度)
- **AND** the top-to-bottom homepage order is stat-card dashboard → read-only squad preview → (family grid + embedded maze)
- **AND** the standalone connectome status strip, the standalone DMN progress indicator, and the standalone total-collection chip strip are NOT rendered as separate surfaces
- **AND** triggering ⚔️ 錯題出征 opens the cross-subject wrong-question expedition flow directly (no co-equal chooser)

#### Scenario: Maze is collapsed to a teaser by default and expands on interaction
- **WHEN** the homepage first renders (no prior expand preference)
- **THEN** the embedded maze shows as a slim teaser strip (not the full-height panel), and the full maze canvas is not expanded
- **WHEN** the player taps the teaser or a family card's 🔍 聚焦 button
- **THEN** the embedded maze expands to its full panel
- **AND** the expand/collapse state persists across reloads (device-local, not synced)

#### Scenario: Desktop expanded maze stacks above the family grid
- **WHEN** the homepage renders at ≥ 768px with the maze expanded
- **THEN** the single maze instance renders as a full-width panel stacked ABOVE the subject-card grid and BELOW the exam-year filter chips
- **AND** no side-column / sticky-right-panel layout is used (the maze scrolls with the page)
- **AND** the maze stage renders as a viewport-bounded full-width band (not a 1:1 square), with size changes snapping (no animated container resize)

#### Scenario: Explicit 聚焦 button is the sole focus trigger; the header is not clickable
- **WHEN** a family card renders
- **THEN** it carries an explicit 🔍 聚焦 secondary button (icon-only < 768px, icon + short label ≥ 768px) that does not out-weight the 🆕/🔄/📖 CTAs
- **AND** the card header / sprite is NOT a click-to-focus target
- **WHEN** the player activates the 🔍 聚焦 button
- **THEN** the maze expands (if collapsed), the camera flies to that family's cluster as a sticky focus, and the card is highlighted

#### Scenario: Desktop focus is camera-only and does not reflow the answering grid
- **WHEN** the player activates 🔍 聚焦 on a family card at ≥ 768px
- **THEN** the maze camera focuses that family but the subject-card grid does NOT collapse, the other subjects remain fully answerable, and the focused card's 🆕/🔄/📖 chips do NOT move
- **AND** there is NO dock header above the maze, NO grid `display:none`, and NO single-row family chip rail
- **AND** the canvas is not re-parented or remounted (one canvas, stable DOM node)

#### Scenario: 全覽 is a camera reset, not a required exit
- **WHEN** a family is focused and the player activates 🔭 全覽
- **THEN** the camera zooms back out to the whole connectome and the focus clears (pill returns to「腦圖全覽」)
- **AND** the player could already answer any subject before pressing 全覽 (it was never a required exit)

#### Scenario: Maze status pill reflects focus state
- **WHEN** the maze is expanded and no family is focused
- **THEN** the status pill reads「腦圖全覽」
- **WHEN** a family is focused
- **THEN** the status pill reads「聚焦：<科>｜全覽」
- **WHEN** the focused family has no explorable node
- **THEN** the camera still centers on that family's cluster and the pill reads「目前沒有可探索節點」(聚焦 is not disabled)

#### Scenario: Offscreen focus surfaces a toast instead of a scroll-jump
- **WHEN** the player activates 🔍 聚焦 and the expanded maze band is fully scrolled offscreen above the viewport
- **THEN** a brief toast「已聚焦腦圖：<科> ↑」is surfaced and the page is NOT force-scrolled to the top

#### Scenario: Year-filter removing the focused family clears focus
- **WHEN** a family is focused and a year-filter narrowing removes that family from the visible set
- **THEN** the focus clears back to 全覽 (no highlight pointing at a hidden card)

#### Scenario: Mobile docks the maze under the tapped card without a scroll-jump or chip rail
- **WHEN** the homepage renders at < 768px and the player activates a family card's 🔍 聚焦 button
- **THEN** the single maze panel docks directly under that card (an accordion, CSS-positioned with the DOM unchanged), focused on that family, with that card's 🆕/🔄/📖 chips still on screen
- **AND** the other cards remain unchanged in normal flow (NO chip rail) and the page does NOT jump-scroll to the top
- **AND** there is exactly one `MazeGrid` instance (no per-card canvas), not re-parented or remounted
- **WHEN** the player activates the accordion's collapse chevron
- **THEN** the docked maze collapses (this is distinct from 🔭 全覽, which only resets the camera)

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
- **THEN** exactly one family grid is present on `/`, with its cards grouped into the two exam-paper sections (醫學一 / 醫學二) — NOT grouped into NT branches (DA / 5-HT / GABA / Glu) — each card showing AP + mastery chip + variant-collection chip + the two per-family quiz-mode chips (🆕 新題 / 🔄 錯題) + a per-subject 📖 閱讀 entry + an explicit 🔍 聚焦 button
- **AND** the `YearFilterBar` renders at the top of this family grid (scoping the per-family quiz pool)
- **AND** each of the 11 cards renders its own distinct per-subject accent color
- **AND** there is NOT a second, separate read-only family-detail grid

#### Scenario: Expedition CTA is hidden for a never-wrong new player
- **WHEN** the homepage renders for a new player who has never answered any question incorrectly
- **THEN** the ⚔️ 錯題出征 entry is NOT present as a button (no disabled「無錯題」dead button)
- **AND** the card's primary-CTA slot shows guidance text (e.g.「答錯題開始修復連線」) instead
- **AND** the merged card otherwise renders an honest empty state (zeroed / not-completed signals), not a fabricated connectome line

#### Scenario: Synapse table is absent; synapse conveyed by the maze overlay
- **WHEN** the homepage renders
- **THEN** no synapse list table is present anywhere in the app
- **AND** synapse state is conveyed by the maze synapse overlay (and the existing formation/strengthening toast)
