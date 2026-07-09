# neurons-homepage

## Purpose

Defines the composition and behavior of the neurons-tw homepage (`/`): a hook region (lightweight connectome-tree hero + cap-aware DMN-draw progress ring + first-visit onboarding) over a dashboard region (progress chips + read/quiz CTA + family picker), with homepage-scoped answer-feedback motion. Reduces friction by surfacing game mechanics as visuals rather than prose rules, while keeping the reading timer manual and the quiz entry paths intact.
## Requirements
### Requirement: Homepage SHALL render the interactive connectome tree as its centerpiece in a fixed-height contained-scroll panel

The neurons-tw homepage (`/`) SHALL render the **maze brain-map** (the four-region fog-of-war exploration view, per `neurons-brain-maze`) as its interactive centerpiece, mounted inside a **fixed-height panel**. The maze's own interaction model SHALL apply: per-branch frontier exploration, branch-filter chips, walker sprites, fog-of-war reveal, and the synapse overlay (per the `neurons-brain-maze` "Synapse network overlay" requirement). A plain (unmodified) wheel over the panel SHALL scroll the page normally — the panel SHALL NOT trap page scroll, and `overscroll-behavior` containment SHALL prevent the maze from hijacking page scroll. The connectome tree (`ConnectomeTreeSvg`) SHALL NOT be the homepage centerpiece and SHALL NOT be mounted on `/`.

#### Scenario: Maze is the interactive centerpiece on the homepage
- **WHEN** the homepage `/` renders
- **THEN** the maze brain-map renders as the interactive centerpiece with its exploration UI (frontier / branch-filter chips / walkers / fog / synapse overlay)
- **AND** the `ConnectomeTreeSvg` connectome tree is not mounted as the centerpiece

#### Scenario: Panel does not trap page scroll
- **WHEN** the user plain-wheel-scrolls (no modifier) with the pointer over the maze panel
- **THEN** the page scrolls normally and the maze does NOT trap the scroll

#### Scenario: Maze centerpiece is responsive on mobile
- **WHEN** the homepage is viewed below 768px width
- **THEN** the maze panel remains legible and within viewport without horizontal overflow, retaining contained-scroll behavior

#### Scenario: Direct URL and F5 render the maze homepage
- **WHEN** the user navigates directly to `/` or presses F5 on `/`
- **THEN** the maze homepage renders fully (centerpiece + companion surfaces), not a 404 or blank shell

### Requirement: Homepage SHALL display a cap-aware "next DMN draw" progress ring driven by real reading-timer data

The homepage SHALL replace the prose rule line describing DMN draw timing with the `DmnDrawProgressRing` component **rendered in its horizontal progress-bar form** (the previously circular ring form is retired) whose fill reflects the expedition-axis DMN draws earned today toward the daily cap (`dmnTimeAxisDrawsConsumedToday / DMN_EXPEDITION_DAILY_CAP`), sourced from `readDmnMeta()`. The DMN-draw bar SHALL be **folded into the merged daily-loop stat card** (per the composition requirement), NOT rendered as a standalone surface. (Per `add-neurons-expedition-rewards`, the first DMN axis is driven by 出征 wrong-question clears, NOT reading minutes; the `dmnTimeAxisMinutesAccrued` counter now carries cumulative expedition clears today, surfaced in the bar caption.) The bar SHALL be daily-cap aware: when the daily expedition-axis draw cap is reached it SHALL render an explicit terminal state (「今日抽卡已達上限」) rather than continuing a misleading countdown.

#### Scenario: Bar fills as expedition draws are earned today
- **WHEN** the player earns expedition-axis DMN draws within the current local-TZ day (clearing wrong-questions in 出征)
- **THEN** the bar fill advances proportionally toward the daily cap

#### Scenario: Bar reflects the daily cap as a terminal state
- **WHEN** the daily expedition-axis DMN draw cap has been reached
- **THEN** the bar shows a 「今日抽卡已達上限」 terminal state instead of a countdown toward another draw

#### Scenario: No prose rule line remains for DMN timing
- **WHEN** the homepage renders
- **THEN** the previous "每 30 min 觸發 DMN 抽卡…" prose rule line is absent, the bar conveying the mechanic visually instead

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

### Requirement: Homepage SHALL surface a skippable, replayable first-visit guided onboarding that never auto-reappears once completed or skipped

The homepage SHALL host the interactive guided onboarding overlay (per `neurons-onboarding`) for first-time players, gated on the persisted device-local `meta['neurons:onboarding:guidedComplete']` flag. Completing or skipping the overlay SHALL set the flag so it never auto-renders again, including after F5 reload. The account-reset path SHALL clear the onboarding flags (`neurons:onboarding:guidedComplete` / `expeditionSpotlightSeen`, plus the legacy `homepageOnboardingDismissed` for backward compatibility) so a reset user sees the onboarding again. The prior static four-step `HomepageOnboarding` card is RETIRED and replaced by the guided overlay; the existing `/connectome` first-visit callout SHALL be left in place (it serves users who land directly on `/connectome`). The onboarding SHALL NOT host any 首抽 (first-pull) CTA — the explicit first-pull ritual is retired; first-pull is now granted automatically on each family's first answer (per `neuron-path-representative`), so no onboarding CTA or compact 首抽 entry is shown anywhere.

#### Scenario: First-time user sees the guided onboarding
- **WHEN** the homepage loads and `meta['neurons:onboarding:guidedComplete']` is absent or false
- **THEN** the guided onboarding overlay renders with a one-tap skip control

#### Scenario: Completed or skipped onboarding does not auto-reappear
- **WHEN** the user completes or skips the guided onboarding and later reloads the homepage (including F5)
- **THEN** the overlay does not auto-render and `meta['neurons:onboarding:guidedComplete']` is true

#### Scenario: Onboarding is replayable from HelpMenu
- **WHEN** the user opens HelpMenu and selects "重看新手引導"
- **THEN** the guided onboarding overlay re-runs

#### Scenario: Account reset re-surfaces onboarding
- **WHEN** the user resets account data
- **THEN** the `neurons:onboarding:*` flags are cleared and the guided onboarding renders again on next homepage load

#### Scenario: Connectome callout is unchanged
- **WHEN** a first-time user navigates directly to `/connectome` with no synapses
- **THEN** the existing `/connectome` empty-state callout still renders (it is not removed by this change)

#### Scenario: No first-pull CTA in onboarding
- **WHEN** the onboarding renders for a new player
- **THEN** no 首抽 / first-pull CTA is present in the onboarding overlay or the CTA toolbar

### Requirement: Homepage SHALL preserve manual reading-timer start and the non-collapsed quiz CTA

The homepage SHALL NOT auto-start the reading timer and SHALL NOT collapse the quiz entry into a single button. Reading start SHALL be **manual and per-subject**: each family card in the enriched `FamilyPicker` grid SHALL expose a 📖 閱讀 entry that starts that subject's reading session; only one subject reads at a time (starting a new subject ends the prior session). The global single reading toggle previously in the CTA toolbar is **removed**. The **🎲 cross-family random-quiz entry is removed** and SHALL NOT be present on the homepage; the per-family quiz-mode chips (🆕 新題 / 🔄 錯題, per `neurons-quiz-modes`) in the `FamilyPicker` grid are the **sole homepage answering entry**. The exam-year filter (`YearFilterBar`) SHALL be hosted at the top of the `FamilyPicker` family grid (it scopes the per-family quiz pool). The quiz entry SHALL NOT be reduced to a single mega-button — the per-family chips remain distinct 🆕 新題 / 🔄 錯題 entries.

#### Scenario: Timer does not auto-start on load
- **WHEN** the homepage loads
- **THEN** the reading timer remains in `idle` until the user manually starts a per-subject reading session from a family card

#### Scenario: Reading starts per subject from the family grid
- **WHEN** the player activates a family card's 📖 閱讀 entry for subject S
- **THEN** a reading session for subject S begins (the global toolbar reading toggle is absent)
- **AND** starting another subject's reading ends the prior subject's session (one subject at a time)

#### Scenario: Per-family quiz-mode chips are the sole answering entry; 🎲 absent
- **WHEN** the homepage renders
- **THEN** the 🎲 random-quiz entry is NOT present
- **AND** the per-family quiz-mode chips (🆕 新題 / 🔄 錯題) in the `FamilyPicker` grid are present (the CTA is not reduced to a single mega-button)
- **AND** the `YearFilterBar` renders at the top of the family grid

### Requirement: Homepage answer-feedback and ambient motion SHALL respect reduced-motion and survive SPA direct-URL + F5

All new homepage motion (hero ambient firing, answer-resolution feedback flash) SHALL degrade under `prefers-reduced-motion` to a static end-state cue, and the homepage SHALL render correctly under direct-URL navigation and F5 reload as an SPA route.

#### Scenario: Reduced-motion degrades homepage motion
- **WHEN** the user has `prefers-reduced-motion` enabled
- **THEN** hero ambient firing and answer-feedback flashes are dropped, but state/colour end-state cues are preserved

#### Scenario: Correct answer plays a feedback flash
- **WHEN** a quiz answer resolves as correct (reduced-motion off)
- **THEN** a green firing-pulse feedback flash plays without blocking the answer/next-question flow

#### Scenario: Direct URL and F5 render the homepage
- **WHEN** the user navigates directly to `/` or presses F5 on `/`
- **THEN** the homepage renders fully (hero + ring + dashboard), not a 404 or blank shell

### Requirement: Homepage SHALL surface connectome status as narrative indicators, not a collection denominator

The homepage SHALL present the connectome (Hebbian 連線) status as **narrative indicators**, not as an `X/N` collection progress bar. The displayed signals SHALL be drawn from connectome state + the expedition streak:

- 今日出征：完成 / 未完成（today's effective expedition completion)
- 連續出征：N 天（`expeditionStreak`)
- 本週出征：X/7（rolling weekly effective-completion days, per `connectome-collection`)
- 穩定連線：count of strong-state synapses **excluding legacy/不計入的早期連線** (per `connectome-collection` legacy-synapse requirement)
- 最強 pair：the most-recently / most-co-repaired validated pair (by `lastCoFireDate` + accumulated co-repair)
- 今日連線額外獲得：X 能量（total synaptic conduction energy received today across all wires, per `connectome-collection`)

The homepage SHALL NOT display a `116/116`-style connectome completion denominator (this would create a second collection meter competing with the 二週目 location-variant collection). The connectome overlay on the maze SHALL default to visible as the homepage's prominent layer (per `neurons-brain-maze`).

#### Scenario: Connectome status shows narrative indicators

- **WHEN** the homepage renders connectome status
- **THEN** it SHALL show 今日出征 完成/未完成、連續出征 N 天、本週 X/7、穩定連線數（不含早期連線）、最強 pair、今日連線額外獲得 X 能量
- **AND** it SHALL NOT show a `116/116` (or any fixed-denominator) connectome collection bar

#### Scenario: Homepage with no synapses shows an honest empty state

- **GIVEN** the player has formed no synapses yet
- **WHEN** the homepage renders connectome status
- **THEN** stable-link count SHALL read 0 and 最強 pair SHALL be absent
- **AND** the UI SHALL NOT fabricate any connectome line

### Requirement: Homepage SHALL offer a shareable Hebbian-connection card

The homepage SHALL let the player generate a shareable card summarizing their connectome learning trace, reusing the existing share-card infrastructure (`ShareCardModal` / `character-card`). The card content SHALL include narrative, non-numeric-bonus facts only: 今日修復 X 題 / 連續出征 N 天 / 今日連起 A–B / 穩定連線 Y 條. The card SHALL NOT imply any gameplay bonus from the connectome.

#### Scenario: Player generates a Hebbian-connection share card

- **WHEN** the player opens the share-card flow from the homepage
- **THEN** a card SHALL render with 今日修復題數 / 連續出征天數 / 今日新連起的 pair / 穩定連線數
- **AND** the card SHALL reuse the existing ShareCardModal / character-card rendering path

### Requirement: The UI SHALL make the wiring benefit (synaptic conduction) legible

To communicate the benefit of wiring (not just that conduction happened), the UI SHALL provide three presentation layers over the existing `connectome-collection` conduction mechanic. In all of them the UI SHALL NOT itself grant or compute conduction energy or wiring — it only presents engine-computed state.

1. **Settlement conduction ledger**: at expedition settlement, a short ledger SHALL list each conduction that flowed (`<source> → <target> +<amount> 能量`) plus a total (`今日連線額外獲得 +X 能量`), alongside the day's repairs, whether a wire formed/strengthened, and (when no cross-subject wiring occurred) an honest "今日已修復，尚未形成跨科連線" line.

2. **Per-wire tooltip**: hovering (desktop) or tapping (touch) a wire on the maze synapse overlay SHALL surface a tooltip describing that wire's two subjects, its tier and conduction rate, and today's conduction usage against the per-wire cap (e.g. 「藥理 ↔ 解剖 · 強連線 +12% · 今日傳導 12/15」). A legacy / not-re-validated wire (per the `connectome-collection` legacy-synapse rule) SHALL be labelled as 早期連線 and indicated as non-conducting. On touch devices, tapping elsewhere SHALL dismiss the tooltip. The wire/rate/usage values SHALL be read from engine state, not computed in the UI.

3. **About-to-wire ghost line**: at expedition settlement the recap SHALL surface the closest about-to-wire pair as a nudge — 「再修復 X 題就能和 <subject> 形成連線」 — where the pair and the remaining-repair count X are derived by the engine from today's per-subject repair counts versus the wiring gate. When no pair is close, the recap SHALL show an honest empty state rather than a fabricated hint.

#### Scenario: Settlement shows the conduction ledger

- **GIVEN** today's expedition settlement conducted +12 from 藥理 to 解剖 and +5 from 藥理 to 生化
- **WHEN** the settlement screen renders
- **THEN** it SHALL list `藥理 → 解剖 +12`、`藥理 → 生化 +5` and `今日連線額外獲得 +17 能量`

#### Scenario: Per-wire tooltip on hover (desktop)

- **GIVEN** a strong wire between 藥理 and 解剖 has conducted 12 of its 15 daily cap today
- **WHEN** the player hovers that wire's spark on the maze synapse overlay
- **THEN** a tooltip SHALL appear naming both subjects, the rate (`+12%`), and today's usage (`今日傳導 12/15`)
- **AND** moving the pointer off the wire SHALL dismiss the tooltip

#### Scenario: Per-wire tooltip on tap (touch)

- **GIVEN** the player is on a touch device viewing the maze synapse overlay
- **WHEN** the player taps a wire's spark
- **THEN** the per-wire tooltip SHALL appear
- **WHEN** the player taps elsewhere
- **THEN** the tooltip SHALL dismiss

#### Scenario: Legacy wire tooltip indicates non-conducting

- **GIVEN** a legacy wire whose `lastCoFireDate` predates the conduction epoch
- **WHEN** the player hovers or taps it
- **THEN** the tooltip SHALL label it 早期連線 and indicate it does not conduct

#### Scenario: About-to-wire ghost line in the settlement recap

- **GIVEN** after settlement one subject is repaired-today at the wiring threshold and a not-yet-wired subject is 2 repairs short
- **WHEN** the settlement recap renders
- **THEN** it SHALL show 「再修復 2 題就能和 <that subject> 形成連線」

#### Scenario: About-to-wire ghost line honest empty state

- **WHEN** the settlement recap renders and no pair is close to wiring
- **THEN** no fabricated 「再修復 X 題…」 hint SHALL be shown (an honest empty state is shown instead)

### Requirement: The homepage SHALL play a once-per-day completion ritual on the first effective expedition completion

To give the daily loop a payoff moment, the homepage SHALL play a brief celebratory ritual overlay the first time the day's effective-completion gate is reached (the same gate that flips 今日出征 → 完成 and increments the daily streak). The ritual SHALL fire at most once per day, SHALL reuse the existing completion-celebration presentation primitives, and SHALL respect `prefers-reduced-motion` (degrading to a static/no-animation acknowledgement). The once-per-day guard SHALL be a date-keyed `meta` flag that is NOT added to the synced meta-key allowlist (cosmetic; a second device the same day MAY re-show it once). The ritual SHALL NOT block interaction and SHALL auto-dismiss.

#### Scenario: Ritual fires once on first effective completion of the day

- **GIVEN** the player has not yet reached an effective expedition completion today
- **WHEN** an expedition settles with `effectiveCompletion === true`
- **THEN** the completion ritual overlay SHALL play
- **AND** the date-keyed ritual flag for today SHALL be set

#### Scenario: Ritual does not replay later the same day

- **GIVEN** the ritual already played today
- **WHEN** a later expedition settles with `effectiveCompletion === true`
- **THEN** the ritual SHALL NOT play again that day

#### Scenario: Ritual respects reduced motion

- **GIVEN** the player's OS reports `prefers-reduced-motion: reduce`
- **WHEN** the ritual triggers
- **THEN** it SHALL present a static / non-animated acknowledgement rather than the full motion overlay

#### Scenario: No effective completion → no ritual

- **WHEN** an expedition settles with `effectiveCompletion === false`
- **THEN** the ritual SHALL NOT play

### Requirement: Family cards SHALL show a derived axon-progress strip mirroring the maze tract

Each family card in the homepage `FamilyPicker` SHALL render a compact node-dot strip (an "axon progress strip") **derived** from that family's lit-node progress on the single embedded maze — in the family's accent colour, with lit nodes filled, the frontier node pulsing, unlit nodes hollow, and the second-lap nodes shown when applicable. It SHALL be a derived DOM element (NOT a second canvas), so each card reads as a slice of the one maze (same accent colour, same lit nodes). Under reduced-motion the frontier pulse SHALL be dropped.

#### Scenario: Each card shows its maze tract progress
- **WHEN** the homepage renders the family cards
- **THEN** each card shows a node-dot strip in the family's accent colour whose lit / frontier / unlit states match that family's maze tract
- **AND** no second canvas is mounted (the strip is DOM, derived from the maze view)

### Requirement: Family cards SHALL render the family's representative variant as the header sprite

Each homepage family card's header sprite SHALL render that family's **representative variant** — the collected variant the player has chosen as the family's representative on `/collection` (the `representativeVariants` meta selection, per `neurons-variant-collection-view`) — using `VariantSprite`, so the homepage card and the dex show the same chosen variant. When the family has no representative set (or its stored representative points at a variant that is no longer collected), the card SHALL fall back to the generic per-subject sprite (`subject:<familyId>`). This is a derived, read-only presentation: it reuses the existing synced `representativeVariants` meta key and introduces no new persistence or schema change. The selection SHALL stay in sync reactively (changing the representative on `/collection` updates the homepage card without a reload).

#### Scenario: Card shows the chosen representative variant
- **GIVEN** the player has set a collected variant as a family's representative on `/collection`
- **WHEN** that family's homepage card renders
- **THEN** the card header sprite SHALL be that representative variant's sprite (via `VariantSprite`), not the generic subject sprite

#### Scenario: No representative falls back to the subject sprite
- **WHEN** a family has no representative set
- **THEN** the card header SHALL render the generic `subject:<familyId>` sprite

#### Scenario: Stale representative falls back to the subject sprite
- **GIVEN** a family's stored representative points at a variant that is no longer collected
- **WHEN** the card renders
- **THEN** the representative SHALL be treated as absent and the generic subject sprite SHALL render (no broken image)

#### Scenario: Representative change reflects without reload
- **WHEN** the player changes a family's representative on `/collection` and returns to the homepage
- **THEN** that family's card sprite SHALL reflect the new representative (the binding is reactive via the shared meta key)

### Requirement: Homepage SHALL surface a collapsible 今日處方箋 card above the merged stat card

The homepage (`/`) SHALL render a `DailyPrescriptionCard` (per `neurons-daily-prescription`) as the **topmost homepage surface, directly above the merged daily-loop stat card**. Placing it above the stat card SHALL preserve the existing relative order of the merged stat card → read-only squad preview → (family grid + embedded maze) surfaces beneath it (it adds a surface above the stat card; it does NOT reorder those existing surfaces among themselves). The card SHALL be **collapsible / expandable**: the collapsed state SHALL show a slim single-row strip (a summary of the two lines' progress + the「已固化 X 天」indicator + an affordance to start/expand), and the expanded state SHALL show the two prescription lines with their progress (e.g. `訂正錯題 2/4`, `開發盲區 5/8`), the single 「開始今日處方」 CTA, the「已固化 X 天」cumulative indicator, and the NG-0717 收藏神經元 at its derived maturation stage. The collapse/expand state SHALL persist device-local (a `meta` flag, NOT added to `SYNCED_META_KEYS`), defaulting to expanded on first view. The card SHALL degrade under `prefers-reduced-motion` (no mascot/arc animation, static end-state), and SHALL render correctly under direct-URL navigation and F5 as an SPA route.

#### Scenario: Prescription card is the topmost homepage surface above the stat card
- **WHEN** the homepage renders
- **THEN** the `DailyPrescriptionCard` SHALL render as the topmost surface, directly above the merged daily-loop stat card
- **AND** the existing relative order of merged stat card → squad preview → (family grid + embedded maze) SHALL be preserved beneath it

#### Scenario: Card collapses to a summary strip and expands, persisting device-local
- **WHEN** the player collapses the card
- **THEN** it SHALL show a slim strip summarizing the two lines' progress plus the「已固化 X 天」indicator and a start/expand affordance
- **WHEN** the player expands the card
- **THEN** it SHALL show the two lines with progress, the single 「開始今日處方」 CTA, the「已固化 X 天」indicator, and the NG-0717 收藏神經元 at its derived maturation stage
- **AND** the collapse/expand choice SHALL persist across reloads (device-local `meta`, not synced), defaulting to expanded on first view

#### Scenario: Card degrades under reduced motion and survives F5
- **WHEN** the user has `prefers-reduced-motion` enabled, or navigates directly to `/` / presses F5
- **THEN** the card SHALL render its static end-state (no mascot/arc animation) and SHALL render fully as an SPA route (not a blank shell)

### Requirement: Expedition settlement SHALL offer a one-time session-repair pass over this session's wrong questions

At expedition settlement (the same recap surface that shows the settlement conduction ledger and completion ritual), the homepage SHALL offer an optional「當場回鍋」session-repair pass. The availability of this pass SHALL depend **only on whether the just-finished session has any wrong questions to repair** (i.e. `buildSessionRepairPool` is non-empty) — it SHALL NOT be gated on `todayRepairs`, the connectome settlement, or any completion metric. In particular, a session in which the player got everything wrong (zero correct → zero today-repairs) SHALL still surface the session-repair entry; `todayRepairs` and connectome ledger data are recap statistics, not the render gate for the pass. This pass SHALL be built by a dedicated pool builder (`buildSessionRepairPool`) that takes **only the questions the player got wrong in the just-finished session** and presents each **at most once** (`maxAttempts: 1`). Answering within the session-repair pass SHALL still record the question result (so `everWrong` and last-result stay truthful) but SHALL apply **no SM-2 schedule change** (`srsEffect: none`). This SHALL be implemented by recording the result **without invoking the SRS scheduler** (i.e. not calling `scheduleSrsForAnswer`): the row's `interval`, `easeFactor`, `nextDueAt`, `attempts`, and `correctCount` SHALL be preserved unchanged — it is an immediate retrieval-after-error correction, not a scheduled review. A question answered correctly in the pass SHALL receive a「當場修復」cosmetic stamp (UI-only; it SHALL NOT add any synced field or schema bump). The pass SHALL be skippable and SHALL NOT block returning to the homepage.

#### Scenario: Session-repair surfaces this session's wrong questions once each

- **GIVEN** the player got 3 questions wrong during the just-finished expedition
- **WHEN** the settlement recap renders
- **THEN** a「當場回鍋」pass SHALL be offered containing exactly those 3 questions, each presented at most once

#### Scenario: Session-repair does not alter the SRS schedule

- **WHEN** the player answers a question inside the session-repair pass
- **THEN** the answer SHALL record the result without invoking `scheduleSrsForAnswer`
- **AND** the question's `interval`, `easeFactor`, `nextDueAt`, `attempts`, and `correctCount` SHALL all be unchanged (`srsEffect: none`)

#### Scenario: Correct repair earns a cosmetic-only stamp

- **WHEN** the player answers a session-repair question correctly
- **THEN** a「當場修復」cosmetic stamp SHALL show for that question
- **AND** no synced field is written and no schema/version bump occurs

#### Scenario: Session-repair is offered even when today-repairs is zero

- **GIVEN** the player got every question wrong in the just-finished session (zero correct, so `todayRepairs` is 0 and no connectome settlement is produced)
- **WHEN** the settlement recap surfaces
- **THEN** the「當場回鍋」session-repair pass SHALL still be offered over that session's wrong questions
- **AND** its availability SHALL NOT be gated on `todayRepairs` or the connectome settlement

#### Scenario: Session-repair is skippable

- **WHEN** the player dismisses the「當場回鍋」pass
- **THEN** the player SHALL return to the homepage with no penalty and no forced re-quiz

### Requirement: Session-repair SHALL be distinct from the DMN quick-review-batch card

The homepage session-repair pass SHALL be clearly distinguished, in behaviour and in UI wording, from the DMN `quick-review-batch` consumable (per `neurons-dmn-fate-cards`). The distinctions are normative: session-repair is **auto-offered at settlement**, sources **only the current session's wrong questions**, is capped at **one attempt per question**, and has **no SRS effect and no DMN-draw-axis credit**; the DMN quick-review-batch is **manually activated from the backpack**, sources from the **historical wrong-question pool**, and its clears **credit the expedition DMN draw axis**. UI copy SHALL use「當場修復 / 當場回鍋」for session-repair and「快速複習」for the DMN card so the two never read as the same feature.

#### Scenario: The two review paths use distinct wording and sources

- **WHEN** both the session-repair pass and the DMN quick-review-batch are available
- **THEN** session-repair SHALL be labelled「當場回鍋 / 當場修復」and source only the current session's wrong questions with no DMN-axis credit
- **AND** the DMN quick-review-batch SHALL be labelled「快速複習」and source the historical wrong-question pool, crediting the DMN draw axis

### Requirement: The full 錯題出征 expedition SHALL surface and drain pinned quick-review questions

The homepage's full cross-subject 錯題出征 expedition pool SHALL lead with the **synced** pinned **still-wrong** ids (ordered ahead of the remaining wrong-question pool, in `pinnedAt` ascending order), so questions pinned via「置頂下次出征」(per `neurons-simplified-explanations`) surface first in the player's daily expedition. A pin is `questionFlags.pinnedAt != null` (per `neurons-quiz-modes`); the pinned-lead and badge derivation SHALL be reactive (Dexie `liveQuery` over `questionFlags`, joined with the wrong-question set), not a bespoke `localStorage` subscription. When the full expedition closes, the served pinned ids SHALL be dequeued by setting `pinnedAt = null` with a fresh `updatedAt`, so a cleared pin does not re-lead the next expedition; because this rides the per-row LWW `questionFlags` sync, the dequeue SHALL propagate cross-device with no tombstone. The ⚔️ 錯題出征 entry SHALL render a「已置頂 N 題」badge when at least one pinned id is still marked `wrong` (N counts only pinned ids still `wrong`), and SHALL omit the badge when no pinned id is still `wrong`. This behavior is now **durable cross-device** (the pin is synced via `questionFlags.pinnedAt`), superseding the prior transient-`localStorage` behavior; it SHALL NOT add a synced Dexie table or a synced meta key, and SHALL NOT require a Dexie `.version()` bump (`pinnedAt` is non-indexed), but it DOES require an R2 `SCHEMA_VERSION` bump (per `neurons-quiz-modes`). The DMN `quick-review-batch` mini-batch path (its own ≤5-question drain of the same pinned set) is unaffected in behavior.

#### Scenario: Pinned questions lead the full expedition pool

- **GIVEN** the player has pinned 2 still-wrong questions via「置頂下次出征」
- **WHEN** the player opens the full ⚔️ 錯題出征 expedition
- **THEN** the two pinned questions SHALL appear ahead of the other wrong questions in the expedition pool, ordered by `pinnedAt` ascending

#### Scenario: Cleared pins are dequeued after a full expedition and propagate cross-device

- **GIVEN** the player has pinned questions and opens the full expedition
- **WHEN** the player closes the full expedition after it served the pinned questions
- **THEN** the served pinned ids SHALL have `pinnedAt` set to `null` with a fresh `updatedAt` so they do not re-lead the next expedition
- **AND** the null dequeue SHALL propagate to the player's other devices under per-row LWW (no tombstone)

#### Scenario: Expedition entry shows a pinned-count badge

- **GIVEN** 3 pinned ids are still marked `wrong`
- **WHEN** the homepage renders the ⚔️ 錯題出征 entry
- **THEN** the entry SHALL show a「已置頂 3 題」badge

#### Scenario: No badge when nothing is pinned

- **GIVEN** no question is pinned, or all pinned ids are no longer marked `wrong`
- **WHEN** the homepage renders the ⚔️ 錯題出征 entry
- **THEN** no「已置頂」badge SHALL be shown

### Requirement: FamilyPicker SHALL offer a header-level always-on 考前救急 entry independent of the weakness gate

The homepage `FamilyPicker` region SHALL render a header-level, always-visible "考前救急" entry affordance that opens the **rescue-plans overview** (a list of the currently-active plans plus an "＋ 新增計畫" action; per `neurons-single-subject-rescue`). When no plan is active the entry MAY open setup directly. Adding a plan opens setup (choose family + exam date + daily-minutes budget). This entry SHALL NOT be gated by the `pressure >= 0.45` threshold that governs the per-card one-tap targeted-drill button (per `neurons-weakness-radar`), because the subjects most in need of rescue (thin history, or currently strong-looking but exam-imminent) would otherwise have no reachable entry. The header entry SHALL be the single top-level entry point for rescue (no per-card rescue-start buttons on the 11 family cards); it SHALL NOT imply a one-rescue-at-a-time constraint — multiple plans may coexist and each active family surfaces its own card chip (per the card-chip requirement).

#### Scenario: Rescue entry is reachable even for a green / undiagnosed family

- **GIVEN** a family whose weakness-pressure is below 0.45 (no per-card targeted-drill button rendered)
- **WHEN** the homepage renders
- **THEN** the header-level "考前救急" entry SHALL still be present and able to start a rescue for that family

#### Scenario: Rescue entry opens the overview, and adding a plan opens setup

- **WHEN** the player taps the header "考前救急" entry with at least one active plan
- **THEN** it SHALL open the rescue-plans overview listing the active plans plus an add-new-plan action
- **AND** choosing add-new-plan SHALL open setup (family + exam date + daily minutes), not launch a zero-setup drill

### Requirement: A family card with an active rescue plan SHALL render a rescue chip in place of its weakness indicator

WHEN a family has an active rescue plan (per `neurons-single-subject-rescue`), its `FamilyPicker` card SHALL replace the WeaknessIndicator row with a rescue chip that surfaces the countdown, RescueScore, and a "今日佇列" CTA (e.g. "D-3 · RescueScore 62 · 今日佇列"). This override SHALL apply to **every** family that has an active plan — each such card renders its own rescue chip independently; a family with no active plan SHALL render its normal weakness indicator unchanged. Tapping a card's rescue chip SHALL open that family's own rescue scene instance. When a family's plan is archived or abandoned, only that family's card SHALL revert to the normal weakness indicator.

#### Scenario: Every active-rescue family card shows its own rescue chip

- **GIVEN** active rescue plans for families A and B
- **WHEN** the `FamilyPicker` grid renders
- **THEN** both A's and B's cards SHALL each show their own rescue chip (countdown, RescueScore, 今日佇列 CTA)
- **AND** every family without an active plan SHALL render its normal weakness indicator unchanged

#### Scenario: Tapping a chip opens that family's scene

- **GIVEN** active plans for families A and B
- **WHEN** the player taps family A's rescue chip
- **THEN** the rescue scene SHALL open bound to family A's plan (not B's)

#### Scenario: Card reverts after its plan ends

- **WHEN** family A's rescue plan is archived or abandoned
- **THEN** family A's card SHALL revert to rendering its normal weakness indicator, while family B's chip (if still active) is unaffected

