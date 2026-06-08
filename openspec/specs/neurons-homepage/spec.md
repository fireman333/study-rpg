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

The homepage SHALL replace the prose rule line describing DMN draw timing with a `DmnDrawProgressRing` whose fill reflects the expedition-axis DMN draws earned today toward the daily cap (`dmnTimeAxisDrawsConsumedToday / DMN_EXPEDITION_DAILY_CAP`), sourced from `readDmnMeta()`. (Per `add-neurons-expedition-rewards`, the first DMN axis is driven by 出征 wrong-question clears, NOT reading minutes; the `dmnTimeAxisMinutesAccrued` counter now carries cumulative expedition clears today, surfaced in the ring caption.) The ring SHALL be daily-cap aware: when the daily expedition-axis draw cap is reached it SHALL render an explicit terminal state rather than continuing a misleading countdown.

#### Scenario: Ring fills as expedition draws are earned today
- **WHEN** the player earns expedition-axis DMN draws within the current local-TZ day (clearing wrong-questions in 出征)
- **THEN** the ring fill advances proportionally toward the daily cap

#### Scenario: Ring reflects the daily cap as a terminal state
- **WHEN** the daily expedition-axis DMN draw cap has been reached
- **THEN** the ring shows a "今日抽卡已達上限" terminal state instead of a countdown toward another draw

#### Scenario: No prose rule line remains for DMN timing
- **WHEN** the homepage renders
- **THEN** the previous "每 30 min 觸發 DMN 抽卡…" prose rule line is absent, the ring conveying the mechanic visually instead

### Requirement: Homepage SHALL compose as a CTA toolbar over the interactive tree panel over the family-detail grid

The homepage SHALL present, top to bottom: (1) a **CTA toolbar** containing the 🎲 cross-family random-quiz entry and the **⚔️ 出征 (全科錯題 expedition) entry** as a persistent CTA (the global reading-timer toggle is **no longer** in the toolbar — reading is now per-subject, surfaced in the family grid); (2) the **fixed-height interactive maze panel** (the brain-map centerpiece); (3) a **single family grid grouped by exam paper (醫學一 / 醫學二)** — the `FamilyPicker` enriched to carry the per-family quiz-mode entries (**🆕 新題 / 🔄 錯題 chips**, per `neurons-quiz-modes`), a **per-subject 📖 閱讀 entry** that starts that subject's reading session, AND the family detail (AP + mastery + variant-collection chips + `firedToday` badge). Tapping a family card SHALL focus the maze camera to that family's cluster (sticky, per `neurons-brain-maze`). There SHALL be exactly one family-card grid (its cards split across the two exam-paper sections, not an NT-branch grouping). The `DmnDrawProgressRing`, the progress status chips, and the first-visit onboarding SHALL remain present. Progress chips SHALL use the semantics 🧠 = reached maze nodes (= accumulated pull opportunities) and 🧬 = collected individual count. The dense synapse list table SHALL NOT be present anywhere in the app; synapse state is conveyed by the maze synapse overlay (and the existing formation/strengthening toast).

#### Scenario: Single enriched family grid renders on the homepage
- **WHEN** the homepage renders
- **THEN** exactly one family grid is present on `/`, with its cards grouped into the two exam-paper sections (醫學一 / 醫學二) — NOT grouped into NT branches (DA / 5-HT / GABA / Glu) — each card showing AP + mastery chip + variant-collection chip + the two per-family quiz-mode chips (🆕 新題 / 🔄 錯題) + a per-subject 📖 閱讀 entry
- **AND** each of the 11 cards SHALL render its own distinct per-subject accent color
- **AND** there SHALL NOT be a second, separate read-only family-detail grid

#### Scenario: Expedition CTA is present in the toolbar
- **WHEN** the homepage renders
- **THEN** the CTA toolbar contains the 🎲 random-quiz entry AND the ⚔️ 出征 entry (and NOT a global reading-timer toggle)
- **AND** triggering 出征 opens the cross-subject wrong-question expedition flow

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

### Requirement: Homepage SHALL surface a one-tap-dismissable first-visit onboarding that never reappears once dismissed

The homepage SHALL render a brief, skippable onboarding panel gated on a persisted `meta['homepageOnboardingDismissed']` flag. Dismissing it SHALL set the flag so it never reappears, including after F5 reload. The account-reset path SHALL clear the flag so a reset user sees the onboarding again. The existing `/connectome` first-visit callout SHALL be left in place (it serves users who land directly on `/connectome`). The onboarding panel SHALL NOT host any 首抽 (first-pull) CTA — the explicit first-pull ritual is retired; first-pull is now granted automatically on each family's first answer (per `neuron-path-representative`), so no onboarding CTA or compact 首抽 entry is shown anywhere.

#### Scenario: First-time user sees onboarding
- **WHEN** the homepage loads and `meta['homepageOnboardingDismissed']` is absent or false
- **THEN** the onboarding panel renders above the fold with a one-tap dismiss control

#### Scenario: Dismissed onboarding does not reappear
- **WHEN** the user dismisses the onboarding and later reloads the homepage (including F5)
- **THEN** the onboarding does not render and `meta['homepageOnboardingDismissed']` is true

#### Scenario: Account reset re-surfaces onboarding
- **WHEN** the user resets account data
- **THEN** `meta['homepageOnboardingDismissed']` is cleared and the onboarding renders again on next homepage load

#### Scenario: Connectome callout is unchanged
- **WHEN** a first-time user navigates directly to `/connectome` with no synapses
- **THEN** the existing `/connectome` empty-state callout still renders (it is not removed by this change)

#### Scenario: No first-pull CTA in onboarding
- **WHEN** the onboarding renders for a new player
- **THEN** no 首抽 / first-pull CTA is present in the onboarding panel or the CTA toolbar

### Requirement: Homepage SHALL preserve manual reading-timer start and the non-collapsed quiz CTA

The homepage SHALL NOT auto-start the reading timer and SHALL NOT collapse the quiz entry into a single button. Reading start SHALL be **manual and per-subject**: each family card in the enriched `FamilyPicker` grid SHALL expose a 📖 閱讀 entry that starts that subject's reading session; only one subject reads at a time (starting a new subject ends the prior session). The global single reading toggle previously in the CTA toolbar is **removed**. The 🎲 cross-family random-quiz entry SHALL remain in the CTA toolbar above the tree; the per-family quiz-mode entry SHALL live in the `FamilyPicker` grid below the tree, surfaced as the two quiz-mode chips (🆕 新題 / 🔄 錯題, per `neurons-quiz-modes`). Both the toolbar (🎲) and per-family quiz entry paths SHALL remain available; only the path into answering and reading is smoothed.

#### Scenario: Timer does not auto-start on load
- **WHEN** the homepage loads
- **THEN** the reading timer remains in `idle` until the user manually starts a per-subject reading session from a family card

#### Scenario: Reading starts per subject from the family grid
- **WHEN** the player activates a family card's 📖 閱讀 entry for subject S
- **THEN** a reading session for subject S begins (the global toolbar reading toggle is absent)
- **AND** starting another subject's reading ends the prior subject's session (one subject at a time)

#### Scenario: Both quiz entry paths remain
- **WHEN** the homepage renders
- **THEN** the 🎲 random-quiz entry (in the toolbar) and the per-family quiz-mode chips (🆕 新題 / 🔄 錯題, in the `FamilyPicker` grid) are both present (the CTA is not reduced to a single mega-button)

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

To communicate the benefit of wiring (not just that conduction happened), the UI SHALL provide a **settlement conduction ledger**: at expedition settlement, a short ledger SHALL list each conduction that flowed (`<source> → <target> +<amount> 能量`) plus a total (`今日連線額外獲得 +X 能量`), alongside the day's repairs, whether a wire formed/strengthened, and (when no cross-subject wiring occurred) an honest "今日已修復，尚未形成跨科連線" line. This is presentation of the `connectome-collection` conduction mechanic; the UI SHALL NOT itself grant or compute conduction energy.

(Deferred to follow-up `polish-neurons-connectome-visual`: per-wire hover tooltip + about-to-wire ghost line in the picker.)

#### Scenario: Settlement shows the conduction ledger

- **GIVEN** today's expedition settlement conducted +12 from 藥理 to 解剖 and +5 from 藥理 to 生化
- **WHEN** the settlement screen renders
- **THEN** it SHALL list `藥理 → 解剖 +12`、`藥理 → 生化 +5` and `今日連線額外獲得 +17 能量`

