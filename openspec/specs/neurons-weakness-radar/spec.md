# neurons-weakness-radar

## Purpose

Defines the neurons-tw weakness surface: a read-time derived, non-persisted **weakness-pressure score** per family and per concept tag (computed from existing `questionHistory` joined with content `conceptTags`), a FamilyPicker colour scale that surfaces it, and a one-tap targeted drill scoped to the weakest family/concept. Weakness-pressure is a forward-looking "what to review now" signal — deliberately distinct from and complementary to the backward-looking `familyMastery` accuracy ratio (`neuron-family-mastery`) — and introduces no new Dexie table, synced field, or schema/version bump.

## Requirements

### Requirement: A per-family and per-concept weakness-pressure score SHALL be derived from questionHistory without new persistence

The app SHALL compute a **weakness-pressure score** for each family and each concept tag, derived at read time from the existing `questionHistory` rows (`family`, `lastResult`, `everWrong`, `easeFactor`, `nextDueAt`) joined with the content pack's per-question `conceptTags`. This score SHALL be a pure derivation — it SHALL NOT introduce a new Dexie table, a new synced field, or a schema/version bump.

Weakness-pressure is **distinct from and complementary to** the existing `neuron-family-mastery` signal (`familyMastery`, a per-family answer-accuracy `correct/total` ratio). The new score MUST NOT read from, write to, relabel, or overwrite `familyMastery`. The difference is deliberate and normative: `familyMastery` is a backward-looking accuracy ratio, whereas weakness-pressure is a **forward-looking "what to review now" signal** that additionally weighs `everWrong` presence, low SM-2 `easeFactor`, and overdue `nextDueAt` — dimensions that a raw accuracy ratio does not capture. The naming SHALL avoid a second "mastery" so the two never read as the same number.

The exact weighting of the inputs SHALL be implementation-defined and dogfood-tunable; the spec fixes only the ordering property: a family/concept with more wrong, lower-ease, more-overdue questions SHALL rank as higher weakness-pressure (weaker) than one with fewer.

#### Scenario: Weakness-pressure is derived, never persisted

- **WHEN** the weakness view computes a family's weakness-pressure
- **THEN** it reads existing `questionHistory` rows plus content `conceptTags` in memory
- **AND** it writes no new Dexie row and triggers no schema/version bump
- **AND** the existing `familyMastery` (correct/total) value for that family is neither read as its source nor modified

#### Scenario: A weaker family ranks higher weakness-pressure

- **GIVEN** family A has more `everWrong` questions with lower `easeFactor` and more overdue `nextDueAt` than family B
- **WHEN** weakness-pressure is computed for both
- **THEN** family A SHALL rank higher weakness-pressure (weaker / dimmer on the scale) than family B

#### Scenario: Weakness-pressure captures review pressure that accuracy alone misses

- **GIVEN** two families with identical `familyMastery` correct/total accuracy, but family A has more overdue `nextDueAt` and more `everWrong` questions
- **WHEN** weakness-pressure is computed
- **THEN** family A SHALL rank weaker than family B (the two signals legitimately diverge; weakness-pressure is not a copy of accuracy)

#### Scenario: A family with no answered questions is undiagnosed, not weak

- **GIVEN** a family whose questions have no `questionHistory` rows
- **WHEN** weakness-pressure is computed
- **THEN** that family SHALL render as an undiagnosed/neutral state, NOT as maximally weak (absence of data is not evidence of weakness)

### Requirement: FamilyPicker cards SHALL surface a weakness-pressure colour scale

Each family card in the homepage `FamilyPicker` grid (per `neurons-homepage`) SHALL render a weakness-pressure indicator driven by the derived score, using a "dimmer = weaker, brighter = stronger" colour scale. This indicator SHALL be visually and semantically distinct from the card's existing `familyMastery` accuracy display and from the variant-collection chips, and SHALL NOT replace or relabel them. The indicator SHALL respect `prefers-reduced-motion` (no pulsing animation when reduced motion is requested).

#### Scenario: Weak family renders dim, strong family renders bright

- **GIVEN** the player has a weak family and a strong family by weakness-pressure
- **WHEN** the `FamilyPicker` grid renders
- **THEN** the weak family's card SHALL show the dim end of the scale and the strong family's card the bright end
- **AND** each card's existing `familyMastery` accuracy display and variant chips SHALL remain present and unchanged

#### Scenario: Undiagnosed family shows a neutral indicator

- **WHEN** a family with no answering history renders
- **THEN** its weakness indicator SHALL show a neutral/undiagnosed state rather than the weakest colour

### Requirement: The weakest family/concept SHALL offer a one-tap targeted drill

The weakness surface SHALL let the player launch, in one tap from a weak family (or its weakest concept), a targeted drill of at most 10 questions scoped to that family/concept, reusing the existing quiz pool builder and quiz-mode entry (no new answering path). The drill SHALL prioritise the family/concept's high-weakness-pressure questions (wrong / low-ease / overdue) when selecting the ≤10 questions.

WHEN the family has an **active single-subject rescue plan** (per `neurons-single-subject-rescue`), the one-tap targeted-drill affordance for that family SHALL be **absorbed** — tapping it SHALL route into that day's rescue queue rather than opening a parallel generic drill, so a single family never runs two distinct selection algorithms (weakness-pressure vs rescue `priority`) at once. Absorption SHALL apply only to the family under an active plan; every other family's targeted drill SHALL behave unchanged. WHEN the plan is archived or abandoned, the family's targeted drill SHALL revert to its normal generic behavior.

#### Scenario: One-tap drill launches a scoped ≤10-question set

- **WHEN** the player taps the targeted-drill affordance on a weak family/concept
- **THEN** a quiz session of at most 10 questions scoped to that family/concept SHALL start via the existing quiz-mode entry
- **AND** the selected questions SHALL prioritise that family/concept's high-weakness-pressure (wrong / low-ease / overdue) questions

#### Scenario: Drill answers flow through the normal recording path

- **WHEN** the player answers questions in the targeted drill
- **THEN** each answer SHALL record to `questionHistory` and update SRS exactly as any other quiz answer (the drill is a scoped launcher, not a new scoring path)

#### Scenario: Targeted drill is absorbed into the rescue queue during an active plan

- **GIVEN** family A has an active rescue plan
- **WHEN** the player taps A's targeted-drill affordance
- **THEN** it SHALL route into A's current-day rescue queue instead of opening a separate generic drill
- **AND** every other family's targeted drill SHALL behave unchanged
- **AND** when A's plan is archived or abandoned, A's targeted drill SHALL revert to its normal generic behavior
