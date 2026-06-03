## REMOVED Requirements

### Requirement: Stub Connectome view SHALL display all 11 families grouped by NT branch plus a synapse table

**Reason**: The `/connectome` route is removed and the connectome becomes the homepage (`/`). The synapse list table is deleted (synapse state now reads off the tree edges), and the family-detail grid relocates onto the homepage. Replaced by the ADDED "Connectome homepage view" requirement below.
**Migration**: The 4-NT-branch family-card detail section now renders on `/`; the synapse table is removed entirely (decay/recency info moves to edge dimming + hover tooltip); the empty state becomes a dimmed-skeleton tree + action guidance.

### Requirement: Polished SVG Linnean phylogenetic tree SHALL render the connectome at the top of /connectome with state-driven edge styling

**Reason**: The tree now renders on the homepage (`/`), and the edge-styling model changes fundamentally — dormant synapses now render (previously invisible), and edges encode two orthogonal channels (thickness = accumulated strength, brightness = recency) instead of color-keyed discrete state. Replaced by the ADDED "two-channel recency-and-strength edge styling" requirement below.
**Migration**: Route `/connectome` → `/`; dormant edges render (thin + recency brightness) instead of being hidden; a newly-formed synapse renders brightest; idle edges dim toward the 7-day decay; the EEG cyan/amber color tokens and the wide/compact responsive layout are retained.

## ADDED Requirements

### Requirement: Connectome homepage view SHALL display all 11 families grouped by NT branch on the homepage with a dimmed-skeleton empty state

The neurons mode SHALL render the connectome on the homepage route (`/`) consisting of:

- The polished SVG Linnean tree (per the tree requirement below) as the primary visual, mounted in the homepage's fixed-height interactive panel
- A family-detail section organized into 4 columns/groups labeled by NT branch (`DA` / `5-HT` / `GABA` / `Glu`), each listing the family cards assigned to that branch (per content-pack metadata)
- Each family card SHALL display: family `displayName`, sprite (via `artKey`), current `actionPotential`, next slot threshold (or "MAX" if all 5 slots unlocked), and a `firedToday` badge when applicable

There SHALL be NO synapse table anywhere in the app. When the `synapses` table is empty, the tree SHALL render a **dimmed grayscale skeleton** of all 11 families + NT-branch structure (so the player can see what the connectome will grow into) plus an action-guidance callout naming the N=5 same-day co-fire rule, replacing any "0 連線 / 尚無 synapse" count framing. The family-card detail section SHALL remain accessible (screen-reader friendly, keyboard navigable) and SHALL NOT be hidden behind a default-collapsed section.

#### Scenario: Homepage renders all 11 families in correct NT-branch groups
- **WHEN** the homepage (`/`) renders
- **THEN** there SHALL be exactly 4 NT-branch groups labeled `DA`, `5-HT`, `GABA`, `Glu` in the family-detail section
- **AND** every content-pack family SHALL appear in exactly one group matching its `ntBranch` field, each card showing `displayName`, sprite via `artKey`, `actionPotential`, and next slot threshold

#### Scenario: No synapse table is present
- **WHEN** the homepage renders with any number of synapses
- **THEN** there SHALL be no synapse list table; synapse state is conveyed only by the tree edges and the per-edge hover/focus tooltip

#### Scenario: Empty connectome renders a dimmed skeleton plus guidance
- **WHEN** the `synapses` table is empty
- **THEN** the tree SHALL render a dimmed grayscale skeleton of all 11 family leaves + the 4 NT-branch structure
- **AND** an action-guidance callout SHALL name the rule (≥ 5 correct in 2 families on the same day forms a synapse)
- **AND** there SHALL be no "0 連線 / 尚無 synapse" count-as-failure framing

### Requirement: Polished SVG Linnean phylogenetic tree SHALL render the connectome on the homepage with two-channel recency-and-strength edge styling

The homepage SHALL render a polished SVG visualization as its primary visual, organized as a Linnean phylogenetic tree with:

- A root spanning the full width of the visualization
- Exactly 4 NT-branch sub-roots labeled `DA`, `5-HT`, `GABA`, `Glu`, fanning out from the root with vertical spacing computed by a pure layout function; each sub-root SHALL be visually distinguishable via its label and the family color of its first child leaf
- 11 neuron-family leaf nodes — each family from the content pack SHALL appear as exactly one leaf attached to its declared `ntBranch` sub-root
- Each leaf node SHALL render the family's sprite (via `artKey`) at a size legible without zoom (≥ 32px desktop, ≥ 28px mobile), the family's `displayName` label adjacent, and the family's current `actionPotential` in a small chip
- A `firedToday` indicator (visual halo or 🔥 glyph) SHALL appear on the leaf node when `firedToday` is true

Synapses SHALL render as SVG `<path>` elements between cross-NT-branch family leaves, styled by **two orthogonal channels** derived at render time from `(state, lastCoFireDate, today)`:

- **Channel 1 — stroke width / weight encodes accumulated strength** (the internal `SynapseState`): `dormant` = thin, `weak` = medium, `strong` = thick.
- **Channel 2 — brightness (opacity + glow) encodes recency**: computed from `daysSinceCoFire = today − lastCoFireDate`, mapping `0` days → brightest and `≥ 7` days → a dim but legible floor (never invisible). Co-firing resets recency to brightest.
- **Every formed synapse renders a visible edge, including `dormant`** (reversing the prior "dormant SHALL NOT render"). A newly-formed synapse (`dormant`, `daysSinceCoFire = 0`) SHALL therefore render at brightest.
- The EEG cyan/amber color tokens MAY be retained for aesthetic coherence; numeric `lastCoFireDate` / days-since SHALL be available only via the per-edge hover/focus tooltip (the only numeric surface — no text state labels on the tree).

The SVG SHALL be responsive: at viewport width ≥ 768px a wide horizontal layout (root left, branches fanning right); at < 768px a compact vertical layout (root top, branches stacking down) without DOM remount (CSS / viewBox-driven, not React conditional rendering).

#### Scenario: SVG tree renders 4 NT-branch sub-roots and 11 family leaves
- **WHEN** the homepage renders and the SVG tree mounts
- **THEN** there SHALL be exactly 4 NT-branch sub-root elements with `aria-label` attributes containing `DA`, `5-HT`, `GABA`, `Glu`
- **AND** there SHALL be exactly 11 family leaf elements, one per content-pack family, each anchored under its declared `ntBranch` sub-root

#### Scenario: Dormant synapse renders a visible edge
- **GIVEN** the `synapses` table contains a row with `state = dormant` and `lastCoFireDate = today`
- **WHEN** the SVG tree mounts
- **THEN** a visible `<path>` edge SHALL render for that pair at thin stroke width and brightest recency styling (it SHALL NOT be hidden)

#### Scenario: Fresh synapse is brightest; idle synapse dims toward the 7-day floor
- **GIVEN** synapse A has `lastCoFireDate = today` and synapse B has `lastCoFireDate = 6 days ago`
- **WHEN** the SVG tree mounts
- **THEN** edge A SHALL render at the brightest recency level
- **AND** edge B SHALL render dimmed toward the floor (visibly fading) while remaining legible

#### Scenario: Strong vs weak distinguished by thickness
- **GIVEN** a `strong` synapse and a `weak` synapse both co-fired today
- **WHEN** the SVG tree mounts
- **THEN** the `strong` edge SHALL render thicker than the `weak` edge (thickness encodes accumulated strength), both at brightest recency

#### Scenario: Compact vertical layout activates below 768px viewport
- **GIVEN** the homepage renders inside a viewport of width 600px
- **WHEN** the SVG tree mounts
- **THEN** the tree SHALL use a vertical (top-to-bottom) layout with the root at the top and the 4 NT-branch sub-roots stacked beneath, using the same SVG DOM structure (no React conditional re-mount)

## MODIFIED Requirements

### Requirement: SVG tree synapse formation, strengthening, decay, and slot-unlock SHALL drive Framer Motion animations gated by useRespectsReducedMotion

The SVG tree SHALL animate state transitions using Framer Motion (`motion.path`, `motion.g`) and the timing tokens defined in `neurons-motion-library`'s `SYNAPSE_TIMINGS` requirement:

- **Synapse formation** (`connectome.synapseFormed` event arrives): the new edge `<path>` SHALL animate `pathLength` from 0 → 1 over `SYNAPSE_TIMINGS.formation` ms with an ease-out curve, accompanied by a brief birth glow burst that lands the edge at its brightest recency level, then settling to its steady thin `dormant` width — celebrating the new connection rather than hiding it
- **Synapse strengthening** (`connectome.synapseStrengthened` event arrives): the existing edge `<path>` SHALL animate stroke width upward along the accumulated-strength channel (thin → medium → thick for dormant → weak → strong), over `SYNAPSE_TIMINGS.strengthen` ms; brightness stays at the brightest level (the pair just co-fired)
- **Synapse decay** (`connectome.synapseDecayed` event arrives, transitioning strong→weak or weak→dormant): the edge SHALL animate stroke width DOWNWARD to its new state's thickness over `SYNAPSE_TIMINGS.decay` ms and SHALL REMAIN in the SVG DOM at its new (possibly `dormant`-thin) styling — the edge SHALL NOT be removed from the DOM (dormant edges are now visible)
- **Recency dimming** (no event; continuous): edge brightness SHALL be re-evaluated as a function of `daysSinceCoFire` on render and on each daily reset, so idle edges visibly dim toward the 7-day floor without requiring a discrete event
- **AP slot unlock** (`connectome.variantSlotUnlocked` event arrives): the family leaf node SHALL pulse — scale 1 → 1.15 → 1 with a brief halo glow expand and fade — over `SYNAPSE_TIMINGS.slotUnlock` ms

When the `useRespectsReducedMotion()` hook returns `true`, the tree SHALL skip all animations and apply the new visual state instantly (no `pathLength` draw-in, no birth glow burst, no stroke-width morph, no scale pulse). Stroke widths (accumulated strength) and brightness (recency) SHALL still reflect the correct end-state so the visual hierarchy is preserved, and dormant edges SHALL still render (never removed).

#### Scenario: Synapse formation animates pathLength draw-in and a birth glow burst
- **GIVEN** the SVG tree is mounted and `useRespectsReducedMotion()` returns `false`
- **WHEN** a `connectome.synapseFormed` event fires for the `藥理學|解剖學` pair
- **THEN** the new edge `<path>` SHALL animate `pathLength` from 0 to 1 over `SYNAPSE_TIMINGS.formation` ms with an ease-out curve
- **AND** a brief birth glow burst SHALL land the edge at its brightest recency level before settling to its steady thin `dormant` width
- **AND** the edge SHALL be visible (not hidden) immediately after the animation completes

#### Scenario: Synapse decay weak→dormant thins the edge but keeps it in the DOM
- **GIVEN** the SVG tree shows a `weak` edge for the `藥理學|解剖學` pair and `useRespectsReducedMotion()` returns `false`
- **WHEN** a `connectome.synapseDecayed` event fires transitioning the pair from `weak` → `dormant`
- **THEN** the edge SHALL animate stroke width down to the thin `dormant` width over `SYNAPSE_TIMINGS.decay` ms
- **AND** the edge SHALL REMAIN in the SVG DOM at its new dormant styling (it SHALL NOT be removed)
- **AND** the surrounding leaf nodes SHALL NOT visually shift during the transition

#### Scenario: Reduced motion skips all animations but preserves state styling and keeps dormant edges visible
- **GIVEN** the user has set OS preference `prefers-reduced-motion: reduce` and `useRespectsReducedMotion()` returns `true`
- **WHEN** a `connectome.synapseFormed` event fires for the `藥理學|解剖學` pair
- **THEN** the edge `<path>` SHALL appear instantly at its final thin `dormant` width and brightest recency styling, with no `pathLength` draw-in and no birth glow burst
- **AND** on a subsequent `connectome.synapseDecayed` weak→dormant event the edge SHALL snap to thin dormant styling and remain in the DOM (not removed)
- **AND** the leaf nodes SHALL NOT pulse on subsequent `connectome.variantSlotUnlocked` events

### Requirement: Synapse formation and strengthening SHALL surface user-facing toast notification, decay SHALL NOT

The system SHALL render a toast notification when the user is in the app and one of the following events fires:

- `connectome.synapseFormed`: toast with copy naming both family `displayName`s and the wiring relation
- `connectome.synapseStrengthened`: toast with copy naming both family `displayName`s and the new state (`weak` or `strong`)

Toasts SHALL auto-dismiss after `TOAST_AUTO_DISMISS_MS` (8 seconds, sourced from `neurons-motion-library`). Toasts SHALL NOT block input or pause gameplay.

The toast host (`ConnectomeToastHost`) SHALL consume `neurons-motion-library` primitives for animation and timing:

- Entry animation SHALL use Framer Motion `motion.div` slide-from-right + opacity-fade variants (not raw CSS keyframes), so `prefers-reduced-motion` can be honored at runtime via the `useRespectsReducedMotion` hook
- Auto-dismiss timing SHALL be the imported `TOAST_AUTO_DISMISS_MS` constant, not a locally-declared literal
- When `useRespectsReducedMotion()` returns true, the entry animation SHALL degrade to opacity fade only (no horizontal translation) while preserving auto-dismiss timing

The host SHALL retain its existing top-right anchored fixed-position vertical-stack layout (distinct from the motion library's single-`<Toast>` top-center primitive) so that multiple concurrent toasts remain visible without overlap.

Decay events (`connectome.synapseDecayed`) SHALL NOT trigger toast notifications (to avoid negative-feedback fatigue). Decay is visible only via the tree edge's recency dimming (edge brightness fading toward the 7-day decay) and the per-edge hover/focus tooltip; there is no synapse table.

#### Scenario: New synapse formation triggers a toast naming both families
- **WHEN** a `connectome.synapseFormed` event fires for `pairKey = "藥理學|解剖學"`
- **THEN** a toast SHALL render containing both family `displayName`s (the renamed neuron family names per `wire-neurons-content-and-theme`)
- **AND** the toast SHALL auto-dismiss after `TOAST_AUTO_DISMISS_MS` (8 seconds)

#### Scenario: Synapse decay does NOT trigger a toast
- **WHEN** a `connectome.synapseDecayed` event fires
- **THEN** no toast SHALL render
- **AND** the user discovers the decay only via the edge's recency dimming / hover tooltip or a future strengthening event

#### Scenario: Standard motion users see slide-from-right entry animation
- **GIVEN** the user has not enabled OS `prefers-reduced-motion`
- **WHEN** a connectome toast event fires and the toast mounts
- **THEN** the toast SHALL enter with Framer Motion `motion.div` variant `initial={{ x: 400, opacity: 0 }}` → `animate={{ x: 0, opacity: 1 }}`
- **AND** the entry transition SHALL complete within 300ms

#### Scenario: Reduced-motion users see opacity fade only on entry
- **GIVEN** the user has set OS preference `prefers-reduced-motion: reduce`
- **WHEN** a connectome toast event fires and the toast mounts
- **THEN** `useRespectsReducedMotion()` SHALL return `true`
- **AND** the toast SHALL enter with `initial={{ opacity: 0 }}` → `animate={{ opacity: 1 }}` (no horizontal translation)
- **AND** auto-dismiss timing SHALL remain `TOAST_AUTO_DISMISS_MS` (8 seconds) — only the entry animation degrades

#### Scenario: Toast auto-dismiss timing sourced from motion library constant
- **GIVEN** the developer audits `apps/neurons-tw/src/components/SynapseFormationToast.tsx`
- **WHEN** the developer searches for the value `8000`
- **THEN** the value SHALL NOT appear as a local literal in the file
- **AND** the file SHALL import `TOAST_AUTO_DISMISS_MS` from `'../lib/motion'` and reference it at the auto-dismiss `setTimeout` call site
