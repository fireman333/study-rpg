## MODIFIED Requirements

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
