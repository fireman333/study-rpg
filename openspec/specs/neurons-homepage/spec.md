# neurons-homepage

## Purpose

Defines the composition and behavior of the neurons-tw homepage (`/`): a hook region (lightweight connectome-tree hero + cap-aware DMN-draw progress ring + first-visit onboarding) over a dashboard region (progress chips + read/quiz CTA + family picker), with homepage-scoped answer-feedback motion. Reduces friction by surfacing game mechanics as visuals rather than prose rules, while keeping the reading timer manual and the quiz entry paths intact.

## Requirements

### Requirement: Homepage SHALL render the interactive connectome tree as its centerpiece in a fixed-height contained-scroll panel

The neurons-tw homepage (`/`) SHALL render the real labeled connectome tree (`ConnectomeTreeSvg`) as its interactive centerpiece by passing `interactive={true}`, mounted inside a **fixed-height panel**. Zooming SHALL be reachable via `ctrl`/`⌘`+wheel, two-finger pinch, and the `+` / `−` / 重置 toolbar buttons; node-drag SHALL reposition nodes and empty-canvas drag SHALL pan. A plain (unmodified) wheel over the panel SHALL scroll the page normally — the tall panel SHALL NOT trap page scroll (the Google-Maps-embed pattern), and `overscroll-behavior` containment SHALL prevent the tree from hijacking page scroll. The tree SHALL NOT be a navigation link (no `navigate('/connectome')`) — it is the homepage itself, not a thumbnail. The force-sim layout pass SHALL be allowed to run only until it self-settles (its rAF loop stops when stable).

#### Scenario: Tree is interactive on the homepage
- **WHEN** the user drags a node, pinches, or uses the toolbar over the tree panel on the homepage
- **THEN** the tree pans / zooms (the homepage embed passes `interactive={true}`) and the zoom toolbar is present

#### Scenario: Panel does not trap page scroll
- **WHEN** the user plain-wheel-scrolls (no modifier) with the pointer over the tree panel
- **THEN** the page scrolls normally and the tree does NOT zoom or trap the scroll
- **AND WHEN** the user `ctrl`/`⌘`+wheels, pinches, or clicks the `+` / `−` buttons
- **THEN** the tree zooms

#### Scenario: Tree is not a navigation link
- **WHEN** the user clicks a family node or empty area inside the tree
- **THEN** the app does NOT navigate to `/connectome` (the route no longer exists) and stays on `/`

#### Scenario: Tree is responsive on mobile
- **WHEN** the homepage is viewed below 768px width
- **THEN** the tree panel remains legible and within viewport without horizontal overflow, retaining contained-scroll behavior

### Requirement: Homepage SHALL display a cap-aware "next DMN draw" progress ring driven by real reading-timer data

The homepage SHALL replace the prose rule line describing DMN draw timing with a `DmnDrawProgressRing` whose fill reflects reading minutes accrued toward the next 30-minute time-axis threshold, sourced from `readDmnMeta()` / the wired reading-timer + DMN time-axis. The ring SHALL be daily-cap aware: when the daily time-axis draw cap is reached it SHALL render an explicit terminal state rather than continuing a misleading countdown.

#### Scenario: Ring fills as reading minutes accrue
- **WHEN** the reading timer accrues minutes within the current 30-minute window
- **THEN** the ring fill advances proportionally toward the next draw threshold

#### Scenario: Ring reflects the daily cap as a terminal state
- **WHEN** the daily time-axis DMN draw cap has been reached
- **THEN** the ring shows a "今日抽卡已達上限" terminal state instead of a countdown toward another draw

#### Scenario: No prose rule line remains for DMN timing
- **WHEN** the homepage renders
- **THEN** the previous "每 30 min 觸發 DMN 抽卡…" prose rule line is absent, the ring conveying the mechanic visually instead

### Requirement: Homepage SHALL compose as a CTA toolbar over the interactive tree panel over the family-detail grid

The homepage SHALL present, top to bottom: (1) a **CTA toolbar** containing the reading-timer toggle and the 🎲 cross-family random-quiz entry, visually grouped with the tree's zoom controls; (2) the **fixed-height interactive tree panel**; (3) a **single per-NT-branch family grid** — the `FamilyPicker` enriched to carry BOTH the per-family quiz entry (🎯 答題) AND the connectome detail (AP + next-slot threshold + mastery + variant-collection chips + `firedToday` badge). There SHALL be exactly one family-card grid (the prior separate read-only family-detail grid is folded into the enriched `FamilyPicker`, not duplicated). The `DmnDrawProgressRing`, the progress status chips, and the first-visit onboarding SHALL remain present. The dense synapse list table SHALL NOT be present anywhere in the app.

#### Scenario: Single enriched family grid renders on the homepage
- **WHEN** the homepage renders
- **THEN** exactly one per-NT-branch family grid (4 branches DA / 5-HT / GABA / Glu) is present on `/`, each card showing AP + next slot threshold + mastery chip + variant-collection chip + the 🎯 答題 quiz entry
- **AND** there SHALL NOT be a second, separate read-only family-detail grid

#### Scenario: Synapse table is absent
- **WHEN** the homepage renders
- **THEN** no synapse list table is present anywhere in the app (synapse state is conveyed only by the tree edges + hover tooltip)

### Requirement: Homepage SHALL surface a one-tap-dismissable first-visit onboarding that never reappears once dismissed

The homepage SHALL render a brief, skippable onboarding panel gated on a persisted `meta['homepageOnboardingDismissed']` flag. Dismissing it SHALL set the flag so it never reappears, including after F5 reload. The account-reset path SHALL clear the flag so a reset user sees the onboarding again. The existing `/connectome` first-visit callout SHALL be left in place (it serves users who land directly on `/connectome`).

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

### Requirement: Homepage SHALL preserve manual reading-timer start and the non-collapsed quiz CTA

The homepage redesign SHALL NOT auto-start the reading timer and SHALL NOT collapse the quiz entry into a single button. The manual reading toggle and the 🎲 cross-family random-quiz entry SHALL live in the CTA toolbar above the tree; the per-family family-select entry SHALL live in the enriched `FamilyPicker` grid below the tree. Both quiz entry paths SHALL remain available; only the path into answering is smoothed.

#### Scenario: Timer does not auto-start on load
- **WHEN** the homepage loads
- **THEN** the reading timer remains in `idle` until the user manually starts it from the toolbar toggle

#### Scenario: Both quiz entry paths remain
- **WHEN** the homepage renders
- **THEN** the 🎲 random-quiz entry (in the toolbar) and the per-family 🎯 答題 select entry (in the `FamilyPicker` grid) are both present (the CTA is not reduced to a single mega-button)

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
