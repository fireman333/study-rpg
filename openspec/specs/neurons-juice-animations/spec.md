# neurons-juice-animations Specification

## Purpose

The presentational「juice」layer for neurons gameplay — wires the existing motion-library primitives (`ParticleBurst` / `CelebrationHalo` / `NumberTickUp` / `AnswerFeedbackFlash` / `SpikeTrainFiring`) into the core-loop surfaces (DMN consumable activation, leaderboard rank, route transitions, wrong-answer feedback, companions, the maze walker) so the app reads with commercial-mobile-game juice. This capability covers the *application* of those primitives (and a one-shot answer-feedback signal bus); the primitive *definitions* live in `neurons-motion-library`. Every animation here respects the user's reduced-motion preference and is strictly session-only — no Dexie / R2 / synced state.

## Requirements

### Requirement: DMN consumable activation burst

The system SHALL play a one-shot burst animation when the player activates a DMN consumable (surge / bolus / family-buff) from the backpack. The animation MUST NOT block or alter the activation outcome, and a failure to render MUST NOT prevent the consumable from being consumed.

#### Scenario: Activating a consumable shows a burst

- **WHEN** the player activates a `surge`, `bolus`, or `family-buff` consumable from `BackpackPanel`
- **THEN** a one-shot burst overlay (e.g. `ParticleBurst` / `SpikeTrainFiring`) plays once at the activation site
- **AND** the consumable's effect is applied exactly as before (stock decrement + buff applied)

#### Scenario: No consumable, no burst

- **WHEN** activation fails (no stock / pool empty)
- **THEN** no burst animation plays

### Requirement: Leaderboard rank-up feedback

The system SHALL animate the player's own rank number with a count-up tween when the leaderboard snapshot refreshes, and SHALL play a one-shot celebration overlay when the player's rank improves (numerically decreases) versus the previous in-session value.

#### Scenario: Rank improves during the session

- **WHEN** the leaderboard snapshot refreshes and the player's new rank is better (smaller number) than the previously displayed rank
- **THEN** the rank number tweens from the previous value to the new value (`NumberTickUp`)
- **AND** a one-shot `CelebrationHalo` plays once

#### Scenario: First load shows no celebration

- **WHEN** the leaderboard page loads for the first time in a session (no previous rank recorded)
- **THEN** the rank is displayed without a celebration overlay

### Requirement: Route transition animation

The system SHALL animate transitions between top-level routes with a neural-signal entry effect. The transition MUST preserve correct SPA routing: in-app navigation, direct URL entry, and reload (F5) on any route MUST all render the target route (never a 404 or a redirect to home).

#### Scenario: Navigating between routes animates

- **WHEN** the player navigates from one route to another (e.g. `/` → `/leaderboard`)
- **THEN** the incoming route renders with a neural-signal entry transition

#### Scenario: Reload on a non-root route still works

- **WHEN** the player reloads (F5) or opens a direct URL on a non-root route (e.g. `/dmn`)
- **THEN** the target route renders correctly (no 404, no redirect to home)

### Requirement: Wrong-answer synapse-decay cue on the expedition band

The system SHALL play a one-shot synapse-decay cue on the expedition band (`MazeExpedition`) when the player answers a question incorrectly, reusing the existing `SYNAPSE_TIMINGS.decay` timing. The band is the maze-adjacent surface that remains visible inside `QuizModal` during answering. The cue is purely visual and MUST NOT change any gameplay progress, energy, or mastery value.

#### Scenario: Wrong answer dims the expedition band

- **WHEN** the player answers a question incorrectly
- **THEN** the visible `MazeExpedition` band plays a one-shot dim→restore synapse-decay flash
- **AND** no energy, mastery, or node-lit state is reduced by the cue

#### Scenario: Correct answer triggers no decay cue

- **WHEN** the player answers correctly
- **THEN** no decay cue plays on the band

### Requirement: Companion correct-answer reaction

The system SHALL play a one-shot reaction (blink / pulse) on any living companion marchers in the expedition band when the player answers a question correctly. When no companion is owned, the system MUST no-op without error.

#### Scenario: Correct answer pulses companions

- **WHEN** the player answers correctly AND at least one living companion is marching in the `MazeExpedition` band
- **THEN** each companion marcher plays a one-shot blink/pulse reaction

#### Scenario: No companion owned

- **WHEN** the player answers correctly AND no living companion is owned
- **THEN** no reaction plays and no error is raised

### Requirement: Walker easing tween

The maze walker SHALL move between cells with an eased transition rather than an instant transform jump.

#### Scenario: Walker advances to the next cell

- **WHEN** the walker advances from one cell to another on the `MazeGrid`
- **THEN** its position transitions with easing (CSS transition / motion tween), not an instant snap

### Requirement: Reduced-motion and zero-persistence discipline

All juice animations in this capability SHALL respect the user's reduced-motion preference and SHALL leave no persisted state. Under reduced-motion the animations MUST be skipped or collapsed to their end state. No animation in this capability SHALL write to Dexie, the R2 bundle, or any cross-device synced store.

#### Scenario: Reduced-motion collapses animations

- **WHEN** the user has `prefers-reduced-motion: reduce` active
- **THEN** every juice animation (burst / rank tween / route transition / decay cue / companion pulse / walker move) is skipped or rendered instantly at its end state

#### Scenario: Animations leave no persisted trace

- **WHEN** any juice animation plays and the player reloads the app or opens it on another device
- **THEN** no animation replays from persisted state, because none of these animations write to Dexie or the synced R2 bundle (no `.version()` bump, no `SCHEMA_VERSION` bump)
