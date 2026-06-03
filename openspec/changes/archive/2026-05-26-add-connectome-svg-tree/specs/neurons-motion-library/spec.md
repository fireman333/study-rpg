## ADDED Requirements

### Requirement: Synapse-state timing tokens SHALL be exported as public constants for the connectome tree

The library SHALL export `SYNAPSE_TIMINGS` as a named TypeScript `const` with the shape `{ formation: number; strengthen: number; decay: number; slotUnlock: number }` (all ms). Default values SHALL be:

- `formation: 600` — synapse edge draw-in (pathLength 0 → 1)
- `strengthen: 400` — weak → strong stroke and glow morph
- `decay: 600` — strong → weak morph OR weak → dormant fade-out
- `slotUnlock: 500` — family leaf pulse + halo when an AP variant slot unlocks

These constants exist so that the connectome SVG tree consumer (and any future visualization reusing the same animation grammar) can subscribe to connectome lifecycle events and animate state transitions without re-implementing the timing logic, and so that test harnesses / e2e specs can deterministically wait the published wall time.

The library's existing `RARITY_TIMINGS`, `SKIP_THRESHOLD_MS`, and `TOAST_AUTO_DISMISS_MS` exports SHALL remain unchanged.

#### Scenario: Consumer reads SYNAPSE_TIMINGS.formation to schedule edge animation

- **GIVEN** the connectome SVG tree consumer receives a `connectome.synapseFormed` event
- **WHEN** the consumer dispatches the edge draw-in animation
- **THEN** the consumer SHALL read `SYNAPSE_TIMINGS.formation` from the motion library
- **AND** the consumer SHALL set the Framer Motion `transition.duration` to that value in ms (or seconds divided by 1000) without re-declaring a literal

#### Scenario: SYNAPSE_TIMINGS values match published defaults

- **GIVEN** a downstream test imports `SYNAPSE_TIMINGS` from the motion library
- **WHEN** the test asserts the default values
- **THEN** `SYNAPSE_TIMINGS.formation` SHALL equal `600`
- **AND** `SYNAPSE_TIMINGS.strengthen` SHALL equal `400`
- **AND** `SYNAPSE_TIMINGS.decay` SHALL equal `600`
- **AND** `SYNAPSE_TIMINGS.slotUnlock` SHALL equal `500`

### Requirement: `/motion-demo` route SHALL expose SVG tree animation primitives for self-verify

The library's existing `/motion-demo` route SHALL gain a new section titled "Synapse tree animations" with four trigger buttons, one per `SYNAPSE_TIMINGS` key, each rendering a small standalone SVG demo that drives the corresponding animation against a static 2-node sample. The buttons SHALL respect the same `useRespectsReducedMotion` gating contract as other primitives in this library.

This demo enables `/opsx:apply` of `add-connectome-svg-tree` to be self-verified end-to-end against the motion library without requiring a fully populated `synapses` table on the actual `/connectome` route.

#### Scenario: /motion-demo Synapse tree section renders 4 trigger buttons

- **GIVEN** the user navigates to `/motion-demo`
- **WHEN** the route renders
- **THEN** there SHALL be a section titled `Synapse tree animations`
- **AND** the section SHALL contain exactly 4 trigger buttons labeled `formation`, `strengthen`, `decay`, `slotUnlock`
- **AND** each trigger SHALL drive its named animation on a small inline SVG demo with two visible leaf placeholders

#### Scenario: /motion-demo Synapse animations respect reduced motion

- **GIVEN** the user has set OS preference `prefers-reduced-motion: reduce`
- **WHEN** the user clicks the `formation` trigger in the demo's Synapse tree section
- **THEN** the edge SHALL appear instantly at its final styling
- **AND** there SHALL be no `pathLength` draw-in animation
