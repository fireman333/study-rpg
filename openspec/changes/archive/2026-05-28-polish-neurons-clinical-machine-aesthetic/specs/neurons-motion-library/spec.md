## ADDED Requirements

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
