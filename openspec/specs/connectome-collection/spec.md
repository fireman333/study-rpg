# connectome-collection Specification

## Purpose

Implements step 3 of the `neurons-mode` Hebbian game loop: a synapse state machine (`dormant → weak → strong`), same-day cross-family co-fire detection (N=5 correct answers per family per local-TZ calendar day), LTD decay (one level after 7+ days without co-fire, never removing a synapse), a monotonic per-family Action Potential counter with a 5-step variant slot unlock threshold ladder, and a stub `/connectome` view grouping the 11 neuron families by NT branch alongside a synapse table. Daily reset runs lazily on the next user interaction crossing local-TZ midnight; all per-answer writes are wrapped in a single Dexie transaction with events emitted only after commit.
## Requirements
### Requirement: Per-family Action Potential SHALL be tracked as monotonic counter incremented by correct quiz answers

The neurons mode SHALL maintain a per-neuron-family `actionPotential` (AP) counter
that:

- Starts at 0 for each of the 11 families on save creation
- Increments by exactly 1 for every correct quiz answer attributed to that family
  (plus any active DMN family-buff bonus)
- Is monotonic (never decreases — no per-day reset, no decay)
- Persists across sessions via the local Dexie `familyAccrual` table

AP is a **display + progression signal** (shown on the connectome homepage, and
recorded as `apAtUnlock` provenance at pull time). AP SHALL NOT gate variant
collection — variant acquisition is the `neuron-variant-gacha` capability's
currency-gated pull. AP is distinct from `pullCount` (the per-family P0 pity clock).

#### Scenario: Initial AP is zero for all families

- **GIVEN** the player creates a new save in neurons-tw
- **THEN** every family's `actionPotential` SHALL equal 0
- **AND** the `familyAccrual` table SHALL contain one row per family initialized with
  `ap = 0` and `pullCount = 0`

#### Scenario: Correct answer increments AP by exactly 1

- **GIVEN** a family's current `actionPotential` is `X`
- **WHEN** the player answers a question correctly attributed to that family
- **THEN** that family's `actionPotential` SHALL become `X + 1` (plus DMN bonus if active)
- **AND** no `connectome.variantSlotUnlocked` event SHALL be emitted (the event no longer exists)

#### Scenario: AP no longer unlocks variants

- **GIVEN** a family's AP crosses any value (e.g. 10, 30, 80)
- **WHEN** the answer commits
- **THEN** no variant row SHALL be created as a result of the AP value
- **AND** variants SHALL only be created by an explicit player pull

### Requirement: Synapse SHALL be created between two families upon first same-day co-firing reaching N=5 threshold per family

The neurons mode SHALL detect cross-family co-firing within a single calendar day (local time zone, midnight-to-midnight) using N = 5 correct answers per family as the per-family fired threshold:

- A family is `firedToday` once its same-day correct-answer count reaches 5
- The system SHALL maintain a `firedToday` boolean flag in `familyAccrual` (reset by daily lazy job — see daily reset requirement)
- When ≥ 2 families have `firedToday = true`, the system SHALL ensure a `synapse` row exists for every unordered pair among them
- Newly created synapses SHALL be in the `dormant` state
- The synapse primary key SHALL be `<smallerFamilyId>|<largerFamilyId>` (lexicographic sort) to ensure undirected uniqueness
- Synapse creation SHALL emit a `connectome.synapseFormed` event

#### Scenario: First synapse forms when two families both reach N=5 on the same day

- **GIVEN** the player has answered 5 correct questions for family `藥理學` today
- **AND** the player has answered 4 correct questions for family `解剖學` today
- **WHEN** the player answers a 5th correct question for `解剖學` today
- **THEN** a synapse with `pairKey = "藥理學|解剖學"` SHALL exist in the `synapses` table
- **AND** the synapse's `state` SHALL equal `dormant`
- **AND** the synapse's `lastCoFireDate` SHALL equal today's local date
- **AND** a `connectome.synapseFormed` event SHALL have been emitted with payload `{ pairKey, state: "dormant" }`

#### Scenario: No synapse forms below N=5 threshold

- **GIVEN** the player has answered 4 correct questions for family `藥理學` today
- **AND** the player has answered 5 correct questions for family `解剖學` today
- **THEN** no synapse SHALL exist for `pairKey = "藥理學|解剖學"`
- **AND** no `connectome.synapseFormed` event SHALL have been emitted

#### Scenario: Three families firing same day produces all 3 pairwise synapses

- **GIVEN** the player has answered ≥ 5 correct questions for each of families `A`, `B`, `C` on the same day
- **THEN** synapses SHALL exist for all three unordered pairs: `A|B`, `A|C`, `B|C` (assuming lexicographic sort)
- **AND** three `connectome.synapseFormed` events SHALL have been emitted (once each per pair on initial creation)

### Requirement: Synapse state machine SHALL implement three discrete states (dormant / weak / strong) with strengthening on subsequent same-day co-fires

The synapse state machine SHALL have exactly three states with forward transitions triggered by repeated co-firing:

| Current state | Transition trigger | Next state |
|---|---|---|
| `dormant` | Both families re-fire on a subsequent day (later than `lastCoFireDate`) | `weak` |
| `weak` | Both families re-fire on a subsequent day | `strong` |
| `strong` | Both families re-fire on a subsequent day | `strong` (no further forward transitions; `lastCoFireDate` updates) |

Transitions to `weak` or `strong` SHALL emit a `connectome.synapseStrengthened` event. Updates that only refresh `lastCoFireDate` without a state change SHALL NOT emit a strengthening event.

#### Scenario: Dormant synapse upgrades to weak after second same-day co-fire on a later day

- **GIVEN** a synapse `pairKey = "藥理學|解剖學"` exists with `state = dormant` and `lastCoFireDate = "2026-05-26"`
- **WHEN** on `"2026-05-27"` both families re-reach N=5 fired status on the same day
- **THEN** the synapse's `state` SHALL become `weak`
- **AND** the synapse's `lastCoFireDate` SHALL equal `"2026-05-27"`
- **AND** a `connectome.synapseStrengthened` event SHALL have been emitted with payload `{ pairKey, fromState: "dormant", toState: "weak" }`

#### Scenario: Strong synapse stays strong on subsequent co-fire but refreshes lastCoFireDate

- **GIVEN** a synapse exists with `state = strong` and `lastCoFireDate = "2026-05-26"`
- **WHEN** on `"2026-05-30"` both families re-reach N=5 fired status on the same day
- **THEN** the synapse's `state` SHALL remain `strong`
- **AND** the synapse's `lastCoFireDate` SHALL equal `"2026-05-30"`
- **AND** NO `connectome.synapseStrengthened` event SHALL be emitted

#### Scenario: Same-day repeated firing does not re-trigger strengthening

- **GIVEN** a synapse exists with `state = dormant` and `lastCoFireDate = today`
- **WHEN** the player continues answering more correct questions for both families on the same day
- **THEN** the synapse's `state` SHALL remain `dormant` (no same-day forward transition)
- **AND** the synapse's `lastCoFireDate` SHALL remain today's date
- **AND** NO `connectome.synapseStrengthened` event SHALL be emitted on this day

### Requirement: LTD decay SHALL downgrade synapse state by one level after 7+ days without co-fire, never removing the synapse

The daily reset job (see daily reset requirement) SHALL run an LTD decay pass:

- For every synapse where `today - lastCoFireDate` > 7 days:
  - `strong` → `weak`
  - `weak` → `dormant`
  - `dormant` → `dormant` (no further decay)
- Decay SHALL emit a `connectome.synapseDecayed` event with payload `{ pairKey, fromState, toState }`
- After decay, the system SHALL set the synapse's `lastCoFireDate` to today's date (the decay date) so that the next decay opportunity is at least 7 more days away; this prevents a single check pass from cascading multiple decay steps
- A synapse SHALL NEVER be removed from the `synapses` table (no ruptures even at full `dormant` decay)

#### Scenario: Strong synapse decays to weak after 8 days without co-fire

- **GIVEN** a synapse exists with `state = strong` and `lastCoFireDate = "2026-05-26"`
- **AND** between `2026-05-26` and today (`2026-06-03`) the two families have not co-fired on any same day
- **WHEN** the daily reset job runs on `"2026-06-03"`
- **THEN** the synapse's `state` SHALL become `weak`
- **AND** the synapse's `lastCoFireDate` SHALL be updated to `"2026-06-03"`
- **AND** a `connectome.synapseDecayed` event SHALL have been emitted with payload `{ pairKey, fromState: "strong", toState: "weak" }`

#### Scenario: Dormant synapse does not decay further (never removed)

- **GIVEN** a synapse exists with `state = dormant` and `lastCoFireDate = "2026-05-01"`
- **WHEN** the daily reset job runs on `"2026-06-15"` (45 days later)
- **THEN** the synapse SHALL still exist in the `synapses` table
- **AND** the synapse's `state` SHALL remain `dormant`
- **AND** no `connectome.synapseDecayed` event SHALL be emitted

#### Scenario: Incorrect answer does not trigger decay or downgrade

- **GIVEN** a synapse exists with `state = strong`
- **WHEN** the player answers a question incorrectly for either of its two families
- **THEN** the synapse's `state` SHALL remain `strong`
- **AND** the synapse's `lastCoFireDate` SHALL remain unchanged
- **AND** no `connectome.synapseDecayed` event SHALL be emitted

### Requirement: Daily reset SHALL run lazily on next user interaction crossing local-TZ midnight

The system SHALL use a lazy daily reset strategy rather than a background scheduler:

- A `meta.lastResetDate` value SHALL be persisted (initialized on save creation to that date)
- On every entry into `recordCorrectAnswer` and `loadConnectome` (and equivalent connectome service entry points), the system SHALL check whether `meta.lastResetDate` ≠ today's local date
- If different, the system SHALL run the daily reset sequence before continuing:
  1. Reset every `familyAccrual.firedToday` flag to `false`
  2. Run the LTD decay pass per the decay requirement
  3. Update `meta.lastResetDate` to today's local date

The reset SHALL handle multi-day gaps (user opens the app after a multi-day absence) by running decay loop checks per day-passed if needed; for the LTD decay, since post-decay `lastCoFireDate` is set to the decay date, no cascading occurs and a single pass suffices.

#### Scenario: First app entry of a new day triggers reset before processing the answer

- **GIVEN** `meta.lastResetDate = "2026-05-30"` and today is `"2026-05-31"`
- **AND** every family's `firedToday = true` (carried over from yesterday's storage)
- **WHEN** the player answers a correct question (first action of `2026-05-31`)
- **THEN** before processing the answer, every family's `firedToday` SHALL be reset to `false`
- **AND** the LTD decay pass SHALL have run
- **AND** `meta.lastResetDate` SHALL equal `"2026-05-31"`
- **AND** the player's answer SHALL then be applied (AP increments, `firedToday` for the answered family may flip to true if N=5 reached)

#### Scenario: Same-day repeated entry does not re-run reset

- **GIVEN** `meta.lastResetDate = "2026-05-31"` and today is `"2026-05-31"`
- **WHEN** the player answers a second correct question on the same day
- **THEN** the daily reset sequence SHALL NOT run again
- **AND** `meta.lastResetDate` SHALL remain `"2026-05-31"`

### Requirement: Connectome homepage view SHALL display all 11 families grouped by NT branch on the homepage with a dimmed-skeleton empty state

The neurons mode SHALL render the connectome on the homepage route (`/`) consisting
of:

- The polished SVG Linnean tree as the primary visual
- A family-detail section organized into 4 NT-branch groups (`DA` / `5-HT` / `GABA` /
  `Glu`), each listing its family cards
- Each family card SHALL display: family `displayName`, sprite (via `artKey`), current
  `actionPotential`, the `🧬 X / 6` collection chip, and a `firedToday` badge when
  applicable. The card SHALL **NOT** display a "next slot threshold" / "MAX" line
  (slot-unlock thresholds are removed).

When the `synapses` table is empty, the tree SHALL render a dimmed grayscale skeleton
of all 11 families + NT-branch structure plus an action-guidance callout naming the
N=5 same-day co-fire rule. The family-card detail section SHALL remain accessible and
SHALL NOT be hidden behind a default-collapsed section.

#### Scenario: Homepage family card shows AP and collection chip, not a slot threshold

- **WHEN** the homepage renders a family card
- **THEN** the card SHALL show `displayName`, sprite, `actionPotential`, and the
  `🧬 X / 6` chip
- **AND** the card SHALL NOT show a "next slot threshold" or "MAX" line

#### Scenario: Homepage renders all 11 families in correct NT-branch groups

- **WHEN** the homepage renders
- **THEN** there SHALL be exactly 4 NT-branch groups (`DA`, `5-HT`, `GABA`, `Glu`)
- **AND** every content-pack family SHALL appear in exactly one group matching its
  `ntBranch`

#### Scenario: Empty connectome renders a dimmed skeleton plus guidance

- **WHEN** the `synapses` table is empty
- **THEN** the tree SHALL render a dimmed grayscale skeleton of all 11 family leaves +
  the 4 NT-branch structure
- **AND** an action-guidance callout SHALL name the N=5 same-day co-fire rule

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

### Requirement: Connectome service SHALL wrap all writes in a single Dexie transaction with events emitted after commit

The connectome service layer SHALL perform all per-answer state writes (AP increment, `firedToday` flag update, synapse creation or strengthening, daily reset if triggered, `lastCoFireDate` update, `unlockedSlots` mutation) inside a single Dexie `transaction()` block. Event emissions SHALL be deferred until after the transaction commits successfully, to ensure subscribers do not observe partial state.

If the transaction fails, no events SHALL be emitted and the in-memory state SHALL remain consistent with the pre-transaction Dexie state.

#### Scenario: Transaction failure rolls back all writes and emits no events

- **GIVEN** a `recordCorrectAnswer` call begins a Dexie transaction
- **WHEN** the transaction throws partway through (e.g., due to storage quota exceeded)
- **THEN** AP, `firedToday`, `synapses`, and `unlockedSlots` SHALL remain at their pre-call values
- **AND** no `connectome.*` event SHALL have been emitted

#### Scenario: All writes commit before any event fires

- **WHEN** a `recordCorrectAnswer` call succeeds and triggers both AP slot unlock and synapse formation
- **THEN** all Dexie writes SHALL have committed before either `connectome.variantSlotUnlocked` or `connectome.synapseFormed` event handlers run
- **AND** event subscribers reading from Dexie SHALL observe the committed post-call state

