## ADDED Requirements

### Requirement: QuizModal partner section SHALL be responsive to viewport width

The doctor partner section (`.quiz-modal__partner`) rendered by `QuizModal` SHALL display correctly at all viewport widths from 320px (narrowest mobile) up to desktop sizes. On mobile widths (≤ 520px CSS pixels) the partner card's child elements (sprite, info, bonus badge, picker dropdown) SHALL NOT visually overlap, SHALL NOT truncate the doctor name text, and SHALL NOT cause horizontal overflow of the modal container.

The detailed responsive layout behavior — including the two-row stacking, indentation, and combinatorial scenarios for bonus/picker presence — SHALL be defined by the `quiz-partner-card-rwd` capability spec.

#### Scenario: Mobile partner card renders without overlap on iPhone-class viewport

- **GIVEN** viewport width = 375px (iPhone 14 mini)
- **AND** `boundDoctor` is a same-subject roster doctor with specialty multiplier > 1.0
- **AND** `doctors.length > 1` (picker visible)
- **WHEN** the player opens `QuizModal`
- **THEN** the partner section SHALL render per the `quiz-partner-card-rwd` two-row layout
- **AND** the doctor name SHALL be fully visible (no truncation)
- **AND** the bonus badge (`✨ 1.1×`) SHALL NOT overlap the doctor name or meta text
- **AND** the picker dropdown SHALL be fully visible and operable within the modal's horizontal bounds

#### Scenario: Desktop partner card layout unchanged by responsive rules

- **GIVEN** viewport width ≥ 521px (tablet portrait, desktop)
- **WHEN** the player opens `QuizModal`
- **THEN** the partner section SHALL render in the existing single-row layout
- **AND** the visual appearance SHALL match the pre-change desktop baseline
- **AND** no regression in spacing, alignment, or element visibility SHALL be introduced by the responsive CSS rules
