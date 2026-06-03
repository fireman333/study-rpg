# neurons-motion-library Specification

## Purpose

Provides a shared, theme-agnostic motion / animation primitive library for the neurons-mode app (`apps/neurons-tw`) so downstream capabilities (gacha reveal, achievement unlock, leaderboard rank-up, connectome toast refactor) can compose tier-aware reveals, full-screen P1 cinematics, and ambient toasts without re-implementing Framer Motion variants, timing curves, or `prefers-reduced-motion` fallbacks. Exports a small surface (`<RarityRevealModal>`, `<AchievementUnlockModal>`, `<Toast>`, `<NumberTickUp>`, `useRespectsReducedMotion`) plus public timing token constants (`RARITY_TIMINGS`, `SKIP_THRESHOLD_MS`, `TOAST_AUTO_DISMISS_MS`) and a `/motion-demo` self-verify route registered in `apps/neurons-tw/src/App.tsx`.

## Requirements

### Requirement: Per-rarity reveal modal SHALL dispatch animation sequences keyed off the `rarity` prop

The library SHALL export a `<RarityRevealModal>` component that consumes a `rarity: 'P1' | 'P2' | 'P3' | 'P4' | 'P5'` prop and dispatches into one of five animation sequences whose total wall time matches `RARITY_TIMINGS[rarity].total` ms. P5 / P4 are snappy (≤ 400ms) for high-frequency reveals; P3 sits at ~600ms; P2 adds a rim shimmer at ~1.2s; P1 is a 2.8s cinematic with envelope → flip → glow → particle → centered hold stages.

The component SHALL render a skip button whenever the rarity's total wall time exceeds `SKIP_THRESHOLD_MS` (1000ms by default), and SHALL fire its `onComplete` callback when the sequence naturally finishes OR when the user clicks skip. This dual behavior lets gacha consumers run batch 10-pulls with predictable timing while letting individual reveals stay cinematic.

#### Scenario: P5 rarity triggers snappy reveal within 300ms

- **GIVEN** a consumer needs to reveal a P5-rarity item
- **WHEN** the consumer mounts `<RarityRevealModal rarity="P5" onComplete={...} />`
- **THEN** the component SHALL complete its reveal sequence within 300ms total wall time
- **AND** the component SHALL NOT render a skip button (because total < `SKIP_THRESHOLD_MS`)
- **AND** `onComplete` SHALL fire after the sequence finishes

#### Scenario: P1 rarity triggers cinematic 2.8s reveal with skip button

- **GIVEN** a consumer needs to reveal a P1-rarity item
- **WHEN** the consumer mounts `<RarityRevealModal rarity="P1" onComplete={...} />`
- **THEN** the component SHALL run an envelope → flip → glow → particle → centered sequence per `RARITY_TIMINGS.P1` ms breakdown
- **AND** the component SHALL render a skip button at 1000ms (because total > `SKIP_THRESHOLD_MS`)
- **AND** clicking skip SHALL immediately advance to the centered hold state and fire `onComplete`

#### Scenario: Reduced-motion preference falls back to fade-only reveal

- **GIVEN** the user has set OS preference `prefers-reduced-motion: reduce`
- **WHEN** the consumer mounts `<RarityRevealModal rarity="P1" onComplete={...} />`
- **THEN** the component SHALL skip the particle burst and shake / parallax variants
- **AND** the component SHALL still perform a fade + scale transition so the state change remains visible
- **AND** `onComplete` SHALL fire no later than the original `RARITY_TIMINGS.P1.total` ms

### Requirement: P1 achievement unlock modal SHALL render full-screen with staggered children and dismiss-required interaction

The library SHALL export an `<AchievementUnlockModal>` component specifically for P1 鑽石-tier achievement reveals. The modal SHALL render a full-screen backdrop, stagger its children (tier chip → badge → title → description → reward → CTA) by ≥ 80ms per sibling using Framer Motion variants, and require explicit dismiss via the CTA button (no auto-timeout).

P2 / P3 / P4 achievements are intentionally NOT covered by this modal — they SHOULD use the generic `<Toast>` primitive wrapped with achievement-specific content. This separation keeps the modal a P1-only "wow moment" specialist while letting lower tiers stream by without blocking the UI.

#### Scenario: P1 achievement modal renders full-screen with staggered children

- **GIVEN** a P1 achievement has just unlocked
- **WHEN** the consumer mounts `<AchievementUnlockModal achievement={...} onDismiss={...} />`
- **THEN** the modal SHALL render a full-screen backdrop overlay
- **AND** children (tier chip → badge → title → description → reward → CTA) SHALL enter with stagger ≥ 80ms between siblings
- **AND** the modal SHALL require explicit dismiss (no auto-timeout)
- **AND** clicking the CTA SHALL fire `onDismiss`

#### Scenario: Reduced-motion drops stagger but keeps fade

- **GIVEN** the user has set OS preference `prefers-reduced-motion: reduce`
- **WHEN** the consumer mounts `<AchievementUnlockModal achievement={...} onDismiss={...} />`
- **THEN** all children SHALL enter simultaneously with a single 200ms opacity fade
- **AND** the visual hierarchy (badge centered, title beneath, CTA at bottom) SHALL be preserved
- **AND** dismiss-required behavior SHALL be unchanged

### Requirement: Generic Toast primitive SHALL support multiple variants, auto-dismiss, and arbitrary children for capability composition

The library SHALL export a `<Toast>` primitive that fixed-positions itself at top-center, accepts a `variant: 'celebratory' | 'info' | 'warning'` prop for visual styling, slides in from above on mount, and auto-dismisses after `TOAST_AUTO_DISMISS_MS` (8000ms) by firing its `onDismiss` callback.

The primitive SHALL accept arbitrary `children` so that future capability changes can compose their own domain-specific copy without forking the component — connectome's existing `SynapseFormationToast` (currently inline) can later refactor to wrap this primitive; achievement P2-P4 unlocks can wrap with badge + name; leaderboard rank-up can wrap with rank delta; etc.

#### Scenario: Celebratory toast slides in from top and auto-dismisses

- **GIVEN** a consumer wants to surface a positive event (e.g., synapse formation, achievement unlock)
- **WHEN** the consumer mounts `<Toast variant="celebratory" onDismiss={...}>...</Toast>`
- **THEN** the toast SHALL slide from y=-100 to y=0 over 300ms
- **AND** the toast SHALL auto-dismiss after `TOAST_AUTO_DISMISS_MS` (8000ms) by firing `onDismiss`
- **AND** clicking the close button SHALL immediately fire `onDismiss`

#### Scenario: Reduced-motion uses fade-in instead of slide

- **GIVEN** the user has set OS preference `prefers-reduced-motion: reduce`
- **WHEN** the consumer mounts `<Toast variant="celebratory" onDismiss={...}>...</Toast>`
- **THEN** the toast SHALL enter with a 200ms opacity fade
- **AND** no transform animation SHALL run
- **AND** auto-dismiss behavior SHALL be unchanged

#### Scenario: Toast accepts arbitrary children for consumer composition

- **GIVEN** a future capability change (connectome refactor / achievement P2-P4 / leaderboard rank-up) needs a domain-specific toast
- **WHEN** the consumer passes `<Toast>{customContent}</Toast>`
- **THEN** the toast SHALL render the custom content in its body slot
- **AND** the consumer SHALL be free to wrap with capability-specific copy without forking the primitive

### Requirement: `useRespectsReducedMotion` hook SHALL surface system a11y preference and drive soft-mode degradation across all primitives

The library SHALL export a `useRespectsReducedMotion()` React hook that returns the current `prefers-reduced-motion` state via `window.matchMedia('(prefers-reduced-motion: reduce)')`. The hook SHALL be SSR-safe (returns `false` when `window` is undefined) and SHALL update live when the user toggles their OS preference mid-session (via `matchMedia.addEventListener('change')`).

All motion primitives in this library SHALL consult this hook and degrade to "soft mode" when it returns `true`: particle bursts, shake, parallax, and large transforms SHALL be removed, but fade and small scale transitions SHALL be retained so that state changes remain visible. This follows WCAG 2.1 guidance to preserve visual cues for users who otherwise might miss silent state transitions.

#### Scenario: Hook returns false when user has no preference

- **GIVEN** the OS has no `prefers-reduced-motion` preference set
- **WHEN** a component calls `useRespectsReducedMotion()`
- **THEN** the hook SHALL return `false`
- **AND** motion primitives SHALL run their full animation variant

#### Scenario: Hook updates live on system setting change

- **GIVEN** a component is currently rendered and consuming `useRespectsReducedMotion()`
- **WHEN** the user toggles their OS `prefers-reduced-motion` preference mid-session
- **THEN** the hook SHALL re-render its consumers with the new value
- **AND** subsequently-mounted motion primitives SHALL use the appropriate variant

#### Scenario: Reduced-motion preserves visual state-change cues

- **GIVEN** `useRespectsReducedMotion()` returns `true`
- **WHEN** any motion primitive renders
- **THEN** modals SHALL still fade-in (not jump-cut to visible)
- **AND** toasts SHALL still appear (not silent)
- **AND** `<NumberTickUp>` SHALL display the final value within 1 frame (no animated count, but value still updates)

### Requirement: Per-rarity timing tokens SHALL be exported as public constants for downstream batch UX prediction

The library SHALL export `RARITY_TIMINGS` (per-rarity ms breakdown), `SKIP_THRESHOLD_MS` (skip button threshold, default 1000ms), and `TOAST_AUTO_DISMISS_MS` (toast auto-dismiss timeout, default 8000ms) as named TypeScript `const` exports.

These constants exist so that future capability consumers (gacha batch UX, achievement queue rate-limiter, leaderboard rank-up cooldown) can predict animation duration without re-implementing the timing logic — e.g., a gacha 10-pull worst-case (all P1) is computable as `RARITY_TIMINGS.P1.total * 10`, letting the consumer decide whether to expose a "skip all" affordance.

#### Scenario: Consumer reads P1 total to budget batch wall time

- **GIVEN** a future gacha consumer is rendering a 10-pull with worst-case all-P1 results
- **WHEN** the consumer needs to estimate batch duration
- **THEN** the consumer SHALL compute `RARITY_TIMINGS.P1.total * 10` = 28000ms
- **AND** the consumer SHALL decide whether to expose a "skip all" button accordingly

#### Scenario: Consumer aligns dismiss UX with skip threshold

- **GIVEN** a consumer renders a custom rarity-aware modal where total > `SKIP_THRESHOLD_MS`
- **WHEN** the consumer designs its skip-button placement
- **THEN** the consumer SHALL match the convention used by built-in `<RarityRevealModal>` for visual consistency

### Requirement: Self-verify `/motion-demo` route SHALL trigger each exported primitive in isolation for apply-time verification

The library SHALL provide a `/motion-demo` route registered in `apps/neurons-tw/src/App.tsx` `<Routes>` (which `add-connectome-collection` already established as a `<BrowserRouter>` + `<Routes>` wrapper). The route SHALL render trigger buttons covering every exported primitive: Toast (one button), NumberTickUp (one button, demonstrating 0→100 count-up), RarityRevealModal (five buttons, one per rarity P1–P5), and AchievementUnlockModal (one button with mock P1 achievement).

This demo enables the change to be verified end-to-end during `/opsx:apply` without requiring any future capability (gacha / achievement / leaderboard) to ship first. The route SHALL survive F5 reload as a SPA route both in dev (Vite SPA fallback) and production (Cloudflare Pages SPA fallback, post `add-neurons-deploy`).

#### Scenario: Demo route lists all exported components

- **GIVEN** a developer wants to verify motion primitives in isolation
- **WHEN** the developer navigates to `/motion-demo`
- **THEN** the page SHALL render trigger buttons for Toast / NumberTickUp / RarityRevealModal × 5 rarities / AchievementUnlockModal
- **AND** clicking each button SHALL trigger the corresponding primitive in isolation

#### Scenario: Demo route survives F5 reload as a SPA route

- **GIVEN** the developer is viewing `/motion-demo`
- **WHEN** the developer reloads the browser
- **THEN** the page SHALL re-render without a 404 in dev mode (Vite dev server SPA fallback)
- **AND** the page SHALL re-render without a 404 in production deploy (post `add-neurons-deploy`, Cloudflare Pages SPA fallback)

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

### Requirement: EEG-anchored motion timing tokens SHALL be exported as public constants

The motion library (`apps/neurons-tw/src/lib/motion/`) SHALL export two new EEG-anchored timing tokens as public named constants, mirroring the existing `RARITY_TIMINGS` / `SYNAPSE_TIMINGS` export pattern:

- A **spike-train** timing token describing the correct-answer firing burst (burst duration, spike count, settle duration).
- A **signal-oscillation** timing token describing the loading / pending oscillation (period and amplitude or equivalent).

These additions SHALL NOT modify the existing `RARITY_TIMINGS` values or constraints (all rarities `total >= 1000ms`; P1 `spinTurns >= 3` and `total >= 1500ms`; P2–P5 `spinTurns === 0`), and SHALL NOT modify the existing `SYNAPSE_TIMINGS` values. The new tokens SHALL be consumable by downstream UX for duration prediction in the same way the existing tokens are.

#### Scenario: New timing tokens exported and existing tokens unchanged

- **WHEN** a consumer imports the motion library's public timing tokens
- **THEN** a spike-train timing token and a signal-oscillation timing token SHALL be available as exported constants
- **AND** `RARITY_TIMINGS` SHALL retain its pre-change values (P1 `total >= 1500` and `spinTurns >= 3`; P2–P5 `spinTurns === 0`; all `total >= 1000`)
- **AND** `SYNAPSE_TIMINGS` (formation / strengthen / decay / slotUnlock) SHALL retain its pre-change values

### Requirement: Spike-train firing and signal-oscillation primitives SHALL respect reduced-motion and be self-verifiable

The spike-train firing primitive and the signal-oscillation primitive SHALL honor the `useRespectsReducedMotion` preference: when reduced motion is set, they SHALL degrade to a static / zero-duration fallback rather than animating. Both primitives SHALL be triggerable in isolation on the `/motion-demo` self-verify route so their behavior can be confirmed at apply time without driving the full quiz / loading flows.

The spike-train firing primitive, when wired into the quiz correct-answer flow, SHALL render as a short peripheral EEG-spike burst that does NOT block or delay the answer-resolution interaction.

#### Scenario: Reduced-motion degrades the new primitives

- **GIVEN** the system `prefers-reduced-motion` preference is set
- **WHEN** the spike-train firing or signal-oscillation primitive is triggered
- **THEN** it SHALL render a static / zero-duration fallback rather than an animation

#### Scenario: New primitives appear on the self-verify route

- **GIVEN** a developer opens `/motion-demo`
- **WHEN** the page renders its primitive triggers
- **THEN** the spike-train firing primitive and the signal-oscillation primitive SHALL each be triggerable in isolation
- **AND** triggering them SHALL not require driving the full quiz or loading flow

#### Scenario: Spike-train does not block answer resolution

- **GIVEN** the spike-train firing primitive is wired into the quiz correct-answer feedback
- **WHEN** the player answers a question correctly
- **THEN** the spike-train burst SHALL render as short peripheral feedback
- **AND** the answer-resolution interaction (reward, next-question availability) SHALL NOT be blocked or delayed by the burst animation

### Requirement: Reward reveal and toast primitives SHALL render an enhanced cinematic celebration layer without mutating published timing tokens

The shared reward-reveal modal and celebratory toast primitives SHALL render an additional enhanced celebration layer (e.g. glow / particle / scale accent) so that synapse-formation, variant-unlock, DMN-draw, and achievement reveals feel more cinematic for every consumer, with no change required in the consuming capabilities. The celebration layer SHALL be gated by `useRespectsReducedMotion`. The enhancement SHALL NOT mutate the value of any already-published exported timing token that downstream code budgets against; new layers SHALL ride within existing total durations, and any genuinely new token SHALL be added additively rather than redefined.

#### Scenario: Reveal renders the enhanced celebration layer
- **WHEN** a reward reveal (reveal modal or celebratory toast) fires with reduced-motion off
- **THEN** the enhanced celebration layer renders within the reveal's existing duration window, on top of the base reveal

#### Scenario: Reduced-motion drops the celebration layer
- **WHEN** the user has `prefers-reduced-motion` enabled
- **THEN** the enhanced celebration layer is omitted and the base reveal + its end-state cue are preserved

#### Scenario: Published timing tokens are unchanged
- **WHEN** a consumer reads the exported per-rarity / reveal timing tokens after this change
- **THEN** the previously published token values are unchanged (no silent breakage of downstream batch wall-time budgeting)

#### Scenario: Consumers receive the upgrade without spec edits
- **WHEN** variant-gacha / dmn-fate-cards / achievements / connectome-collection trigger their reveals
- **THEN** they show the enhanced celebration with no change to their own component code or specs

### Requirement: An ambient resting-state firing primitive SHALL be available, CSS-driven and reduced-motion gated

The motion library SHALL export an ambient resting-state firing primitive suitable for the homepage connectome hero, implemented with CSS `@keyframes` / compositor-driven transforms (opacity / transform only) rather than a per-frame JS `requestAnimationFrame` loop, so it stays cheap at 60fps and continues animating in backgrounded tabs. It SHALL be gated by `useRespectsReducedMotion` and SHALL be self-verifiable on `/motion-demo`.

#### Scenario: Ambient firing animates via CSS
- **WHEN** the ambient firing primitive renders with reduced-motion off
- **THEN** it animates using CSS keyframes / compositor transforms, without registering a per-frame JS rAF loop

#### Scenario: Reduced-motion makes ambient firing static
- **WHEN** the user has `prefers-reduced-motion` enabled
- **THEN** the ambient firing primitive renders static (no animation) while preserving its visual state

#### Scenario: Ambient primitive appears on the self-verify route
- **WHEN** the `/motion-demo` route renders
- **THEN** the ambient resting-state firing primitive is present as an isolated self-verify trigger

### Requirement: An answer-resolution feedback-flash primitive SHALL be available, non-blocking and reduced-motion gated

The motion library SHALL export an answer-resolution feedback-flash primitive: a green firing pulse on a correct answer and a red dim cue on an incorrect answer. The flash SHALL NOT block answer resolution or the transition to the next question. It SHALL be gated by `useRespectsReducedMotion` and SHALL be self-verifiable on `/motion-demo`.

#### Scenario: Correct answer triggers a green firing pulse
- **WHEN** a quiz answer resolves as correct with reduced-motion off
- **THEN** a green firing-pulse flash plays and does not block the next-question transition

#### Scenario: Incorrect answer triggers a red dim cue
- **WHEN** a quiz answer resolves as incorrect with reduced-motion off
- **THEN** a red dim feedback cue plays and does not block the next-question transition

#### Scenario: Reduced-motion degrades the flash to an end-state cue
- **WHEN** the user has `prefers-reduced-motion` enabled
- **THEN** the feedback flash degrades to a static colour end-state cue with no motion

#### Scenario: Feedback-flash primitive appears on the self-verify route
- **WHEN** the `/motion-demo` route renders
- **THEN** the answer-resolution feedback-flash primitive is present as an isolated self-verify trigger
