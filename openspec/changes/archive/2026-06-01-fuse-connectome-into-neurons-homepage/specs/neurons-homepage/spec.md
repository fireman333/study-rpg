## REMOVED Requirements

### Requirement: Homepage SHALL render a lightweight presentational connectome-tree hero that routes to the full interactive view

**Reason**: The connectome is no longer a presentational thumbnail that routes to a separate `/connectome` page — it becomes the homepage's interactive centerpiece. "The connectome IS the homepage." Replaced by the ADDED "interactive centerpiece in a fixed-height contained-scroll panel" requirement below.
**Migration**: The homepage hero embed changes from `interactive={false}` (presentational, click → `navigate('/connectome')`) to `interactive={true}` inside a fixed-height contained-scroll panel; the `/connectome` route is removed and redirects to `/`. The `ConnectomeHero` link wrapper + its `navigate('/connectome')` are deleted.

### Requirement: Homepage SHALL compose as hook-on-top + dashboard-on-bottom without merging dense connectome detail

**Reason**: The "do not merge the dense family-detail grid / synapse table onto the homepage" constraint reverses — the family-detail grid now lives on the homepage and the synapse table is removed entirely. Replaced by the ADDED "compose as CTA toolbar over interactive tree panel over family-detail grid" requirement below.
**Migration**: The per-family AP detail grid relocates from `/connectome` onto `/`; the synapse list table is deleted (its decay/recency information now reads off the tree edges + hover tooltip).

## ADDED Requirements

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

### Requirement: Homepage SHALL compose as a CTA toolbar over the interactive tree panel over the family-detail grid

The homepage SHALL present, top to bottom: (1) a **CTA toolbar** containing the reading-timer toggle and the 🎲 cross-family random-quiz entry, visually grouped with the tree's zoom controls; (2) the **fixed-height interactive tree panel**; (3) a **single per-NT-branch family grid** — the `FamilyPicker` enriched to carry BOTH the per-family quiz entry (🎯 答題) AND the connectome detail (AP + next-slot threshold + mastery + variant-collection chips + `firedToday` badge). There SHALL be exactly one family-card grid (the prior separate read-only family-detail grid is folded into the enriched `FamilyPicker`, not duplicated). The `DmnDrawProgressRing`, the progress status chips, and the first-visit onboarding SHALL remain present. The dense synapse list table SHALL NOT be present anywhere in the app.

#### Scenario: Single enriched family grid renders on the homepage
- **WHEN** the homepage renders
- **THEN** exactly one per-NT-branch family grid (4 branches DA / 5-HT / GABA / Glu) is present on `/`, each card showing AP + next slot threshold + mastery chip + variant-collection chip + the 🎯 答題 quiz entry
- **AND** there SHALL NOT be a second, separate read-only family-detail grid

#### Scenario: Synapse table is absent from the app
- **WHEN** the homepage renders
- **THEN** no synapse list table is present (it is removed, not relocated); synapse state is conveyed only by the tree edges + hover tooltip

#### Scenario: CTA toolbar renders above the tree panel
- **WHEN** the homepage renders
- **THEN** the reading-timer toggle, the 🎲 random-quiz entry, and the `FamilyPicker` entry appear in a toolbar above the tree panel, alongside the zoom controls

## MODIFIED Requirements

### Requirement: Homepage SHALL preserve manual reading-timer start and the non-collapsed quiz CTA

The homepage redesign SHALL NOT auto-start the reading timer and SHALL NOT collapse the quiz entry into a single button. The manual reading toggle and the 🎲 cross-family random-quiz entry SHALL live in the CTA toolbar above the tree; the per-family family-select entry SHALL live in the enriched `FamilyPicker` grid below the tree. Both quiz entry paths SHALL remain available; only the path into answering is smoothed.

#### Scenario: Timer does not auto-start on load
- **WHEN** the homepage loads
- **THEN** the reading timer remains in `idle` until the user manually starts it from the toolbar toggle

#### Scenario: Both quiz entry paths remain
- **WHEN** the homepage renders
- **THEN** the 🎲 random-quiz entry (in the toolbar) and the per-family 🎯 答題 select entry (in the `FamilyPicker` grid) are both present (the CTA is not reduced to a single mega-button)
