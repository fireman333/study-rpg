# quiz-partner-card-rwd Specification

## Purpose
TBD - created by archiving change fix-quiz-partner-card-mobile-rwd. Update Purpose after archive.

## Requirements

### Requirement: QuizModal partner card SHALL adopt two-row layout when viewport width ≤ 520px

The `.quiz-modal__partner` container in `apps/medexam2-hospital-tw` SHALL stack its child elements into two rows when the viewport's CSS-pixel width is 520px or less. Row 1 SHALL contain the doctor sprite (`.quiz-modal__partner-sprite`, 56px square) followed by the partner info column (`.quiz-modal__partner-info`, name + cosmetic meta). Row 2 SHALL contain — when present — the specialty-bonus badge (`.quiz-modal__partner-bonus`) and / or the doctor picker dropdown (`.quiz-modal__partner-picker`). Row 2 children SHALL be left-aligned to the info column (indented by sprite width 56px + container gap 10px = 66px from the container's left edge).

The two-row behavior SHALL be implemented as a CSS `@media (max-width: 520px)` block using `flex-wrap: wrap` plus `order` on the four child element classes. No JSX / HTML structure change SHALL be required. The viewport width threshold (520px) SHALL be a CSS-only breakpoint with no JavaScript media-query listener.

At viewport widths > 520px, the partner card SHALL retain the existing single-row layout (sprite | info | bonus? | picker?) with no behavior change.

#### Scenario: Mobile viewport with both bonus and picker shows both on Row 2

- **GIVEN** viewport width = 375px (iPhone 14 mini portrait)
- **AND** `boundDoctor.subjectId === currentSubject` (specialty multiplier > 1.0, bonus badge renders)
- **AND** `doctors.length > 1` (picker dropdown renders)
- **WHEN** `QuizModal` opens
- **THEN** the partner card SHALL render as two rows
- **AND** Row 1 SHALL contain the 56px sprite followed by the info column showing the full doctor name without truncation
- **AND** Row 2 SHALL contain the bonus badge (`✨ 1.1×`) followed by the picker dropdown, both visually below Row 1
- **AND** the bonus badge's left edge SHALL be horizontally aligned with the info column's left edge (66px from the container's left edge)
- **AND** the picker dropdown SHALL be clickable and SHALL NOT visually overlap the bonus badge or extend past the container's right edge

#### Scenario: Mobile viewport with bonus only (no picker) shows bonus alone on Row 2

- **GIVEN** viewport width = 375px
- **AND** `boundDoctor.subjectId === currentSubject` (bonus badge renders)
- **AND** `doctors.length === 1` (picker dropdown does NOT render)
- **WHEN** `QuizModal` opens
- **THEN** Row 1 SHALL contain sprite + info column
- **AND** Row 2 SHALL contain only the bonus badge, left-aligned 66px from container left edge

#### Scenario: Mobile viewport with picker only (no bonus) shows picker alone on Row 2

- **GIVEN** viewport width = 375px
- **AND** `boundDoctor.subjectId !== currentSubject` (specialty multiplier === 1.0, bonus badge does NOT render)
- **AND** `doctors.length > 1` (picker dropdown renders)
- **WHEN** `QuizModal` opens
- **THEN** Row 1 SHALL contain sprite + info column
- **AND** Row 2 SHALL contain only the picker dropdown, left-aligned 66px from container left edge (NOT pushed further right by the absent bonus badge)
- **AND** the picker dropdown SHALL be clickable and selectable across all roster doctors

#### Scenario: Mobile viewport with neither bonus nor picker shows single row only

- **GIVEN** viewport width = 375px
- **AND** `boundDoctor.subjectId !== currentSubject` (no bonus)
- **AND** `doctors.length === 1` (no picker)
- **WHEN** `QuizModal` opens
- **THEN** the partner card SHALL render as a single row (sprite + info)
- **AND** no empty Row 2 SHALL be visible (`flex-wrap` is set but no children fall to the second line)
- **AND** the info column SHALL fill the remaining horizontal space without truncation

#### Scenario: Desktop viewport retains single-row layout

- **GIVEN** viewport width = 1280px (desktop)
- **AND** any combination of bonus / picker visibility
- **WHEN** `QuizModal` opens
- **THEN** the partner card SHALL render in a single row: sprite | info | bonus? | picker?
- **AND** the media query block SHALL NOT apply (above 520px threshold)
- **AND** the layout SHALL match the pre-change desktop appearance exactly (visual regression baseline)

#### Scenario: Breakpoint transition at 520px CSS pixels

- **GIVEN** viewport width = 521px
- **WHEN** `QuizModal` is open
- **THEN** the partner card SHALL display in single-row layout
- **WHEN** the viewport is resized to 520px (or less)
- **THEN** the partner card SHALL immediately switch to two-row layout via CSS-only media-query reflow (no JavaScript listener, no React re-render required)

#### Scenario: Narrow mobile viewport (320px iPhone SE) does not overflow container

- **GIVEN** viewport width = 320px (narrowest supported mobile)
- **AND** both bonus badge and picker dropdown render
- **WHEN** `QuizModal` opens
- **THEN** Row 2's picker dropdown SHALL be constrained by `max-width: calc(100% - 66px)` so it fits within the container's right edge
- **AND** no horizontal scrollbar SHALL appear on the partner card or its parent modal
- **AND** the picker SHALL remain operable (selectable, options visible when tapped)
