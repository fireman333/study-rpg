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

The homepage SHALL present, top to bottom: (1) a **CTA toolbar** containing the reading-timer toggle, the 🎲 cross-family random-quiz entry, and the **⚔️ 出征 (全科錯題 expedition) entry** as a persistent CTA; (2) the **fixed-height interactive maze panel** (the brain-map centerpiece); (3) a **single family grid grouped by exam paper (醫學一 / 醫學二)** — the `FamilyPicker` enriched to carry BOTH the per-family quiz-mode entries (**🆕 新題 / 🔄 錯題 chips**, per `neurons-quiz-modes`) AND the family detail (AP + mastery + variant-collection chips + `firedToday` badge). There SHALL be exactly one family-card grid (its cards split across the two exam-paper sections, not an NT-branch grouping). The `DmnDrawProgressRing`, the progress status chips, and the first-visit onboarding SHALL remain present. Progress chips SHALL use the semantics 🧠 = reached maze nodes (= accumulated pull opportunities) and 🧬 = collected individual count. The dense synapse list table SHALL NOT be present anywhere in the app; synapse state is conveyed by the maze synapse overlay (and the existing formation/strengthening toast).

#### Scenario: Single enriched family grid renders on the homepage
- **WHEN** the homepage renders
- **THEN** exactly one family grid is present on `/`, with its cards grouped into the two exam-paper sections (醫學一 / 醫學二) — NOT grouped into NT branches (DA / 5-HT / GABA / Glu) — each card showing AP + mastery chip + variant-collection chip + the two per-family quiz-mode chips (🆕 新題 / 🔄 錯題)
- **AND** each of the 11 cards SHALL render its own distinct per-subject accent color
- **AND** there SHALL NOT be a second, separate read-only family-detail grid

#### Scenario: Expedition CTA is present in the toolbar
- **WHEN** the homepage renders
- **THEN** the CTA toolbar contains the reading-timer toggle, the 🎲 random-quiz entry, AND the ⚔️ 出征 entry
- **AND** triggering 出征 opens the cross-subject wrong-question expedition flow

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

The homepage redesign SHALL NOT auto-start the reading timer and SHALL NOT collapse the quiz entry into a single button. The manual reading toggle and the 🎲 cross-family random-quiz entry SHALL live in the CTA toolbar above the tree; the per-family quiz-mode entry SHALL live in the enriched `FamilyPicker` grid below the tree, surfaced as the two quiz-mode chips (🆕 新題 / 🔄 錯題, per `neurons-quiz-modes`). Both the toolbar and per-family quiz entry paths SHALL remain available; only the path into answering is smoothed.

#### Scenario: Timer does not auto-start on load
- **WHEN** the homepage loads
- **THEN** the reading timer remains in `idle` until the user manually starts it from the toolbar toggle

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

