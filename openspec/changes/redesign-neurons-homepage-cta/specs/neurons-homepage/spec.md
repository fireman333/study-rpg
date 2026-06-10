## MODIFIED Requirements

### Requirement: Homepage SHALL compose as a CTA toolbar over the interactive tree panel over the family-detail grid

The homepage SHALL present, top to bottom: (1) a **merged daily-loop stat card as the homepage's top dashboard** (above the maze centerpiece), whose top band is the **⚔️ 錯題出征 entry as the prominent primary connectome-building CTA** (cross-subject wrong-question expedition — repairing wrong questions wires the connectome), opened directly (NOT via a co-equal chooser), and whose body presents the connectome status indicators AND the DMN-draw progress indicator (both folded in from the previously standalone surfaces) laid out as a horizontal causal chain (今日出征狀態 → 修復連線數據 → DMN 抽卡 進度). The card SHALL default-show a curated set of core signals (今日出征 ✓/✗・🔥 連續 N 天・穩定連線數・DMN 今日抽/上限) with an expandable 「詳細」 disclosure for the remaining signals (最強 pair・本週 X/7・⚡ 今日連線額外能量); no signal is removed, only progressively disclosed. The **⚔️ 錯題出征 entry SHALL be hidden for a new player who has never answered any question incorrectly, and SHALL be revealed (one-way) the first time the player answers incorrectly, persistent thereafter** (per `neurons-onboarding`) — this REPLACES the prior always-visible-but-disabled「無錯題」dead-button behavior for never-wrong new players; once revealed it MAY still render its existing disabled「無錯題」state when the player currently has zero wrong questions, and for a never-wrong new player the primary-CTA slot SHALL show guidance text (NOT a dead disabled button). The standalone connectome status strip and the standalone DMN progress indicator SHALL NOT be rendered as separate surfaces — they are folded into this card. The **🎲 cross-family random-quiz entry SHALL NOT be present** anywhere on the homepage (it is removed); the per-family quiz-mode chips (🆕 新題 / 🔄 錯題, per `neurons-quiz-modes`) are the sole homepage answering entry. (The global reading-timer toggle is no longer present — reading is per-subject in the family grid; the 📋 模考 entry lives in the 題庫 tab `/bank` per `neurons-exam-set-expedition`.) (2) the **fixed-height interactive maze panel** (the brain-map centerpiece); (3) the **study squad** surface (`StudySquadPanel`); (4) the total-collection progress status chips; (5) a **single family grid grouped by exam paper (醫學一 / 醫學二)** — the `FamilyPicker` enriched to carry the per-family quiz-mode entries (🆕 新題 / 🔄 錯題), a per-subject 📖 閱讀 entry, AND the family detail (AP + mastery + variant-collection chips + `firedToday` badge), with the **exam-year filter (`YearFilterBar`) hosted at the top of this family grid** (it scopes the per-family quiz pool). Tapping a family card SHALL focus the maze camera to that family's cluster (sticky, per `neurons-brain-maze`). There SHALL be exactly one family-card grid (its cards split across the two exam-paper sections, not an NT-branch grouping). The `DmnDrawProgressRing` indicator (in its bar form, per the DMN-draw requirement), the progress status chips, and the first-visit guided onboarding (per `neurons-onboarding`) SHALL remain present. Progress chips SHALL use the semantics 🧠 = reached maze nodes (= accumulated pull opportunities) and 🧬 = collected individual count. The dense synapse list table SHALL NOT be present anywhere in the app; synapse state is conveyed by the maze synapse overlay (and the existing formation/strengthening toast).

#### Scenario: Merged daily-loop stat card is the top dashboard above the maze
- **WHEN** the homepage renders for a player who has answered at least one question incorrectly (or has prior wrong history)
- **THEN** a single merged stat card renders as the homepage's top dashboard, directly above the maze centerpiece, with the ⚔️ 錯題出征 primary CTA as its top band and a horizontal causal-chain body (今日出征狀態 → 修復連線數據 → DMN 抽卡 進度)
- **AND** the top-to-bottom homepage order is stat-card dashboard → maze → study squad → status chips → family grid
- **AND** the standalone connectome status strip and the standalone DMN progress indicator are NOT rendered as separate surfaces
- **AND** triggering ⚔️ 錯題出征 opens the cross-subject wrong-question expedition flow directly (no co-equal chooser)

#### Scenario: Stat card defaults to core signals with an expandable detail disclosure
- **WHEN** the merged stat card renders
- **THEN** it shows the core signals (今日出征 ✓/✗・🔥 連續 N 天・穩定連線數・DMN 今日抽/上限) by default
- **AND** a 「詳細」 disclosure expands to reveal the remaining signals (最強 pair・本週 X/7・⚡ 今日連線額外能量)

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

#### Scenario: Tapping a family card focuses the maze camera
- **WHEN** the player taps a family card in the FamilyPicker grid
- **THEN** the maze camera flies to that family's cluster as a sticky focus (per `neurons-brain-maze`)

#### Scenario: Progress chips use node + collection semantics
- **WHEN** the homepage renders the progress chips
- **THEN** the 🧠 chip reads reached-maze-node count (no denominator) and the 🧬 chip reads collected individual count (no denominator)

#### Scenario: Synapse table is absent; synapse conveyed by the maze overlay
- **WHEN** the homepage renders
- **THEN** no synapse list table is present anywhere in the app
- **AND** synapse state is conveyed by the maze synapse overlay (and the existing formation/strengthening toast)

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
