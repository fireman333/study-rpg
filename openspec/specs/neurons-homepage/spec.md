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

