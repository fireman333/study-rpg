## ADDED Requirements

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
