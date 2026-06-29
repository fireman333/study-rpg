## MODIFIED Requirements

### Requirement: Decorative expedition animation band

The system SHALL render a cosmetic side-scrolling "expedition" animation band composed of three independently-scrolling parallax layers — a far brain-sulci sky (slowest), a neural-tissue ground, and fast foreground synapse particles — that loop seamlessly to simulate the squad marching deeper into the brain. The band SHALL render in two contexts: a full-size band on the maze homepage, and a **compact** band in `QuizModal` during a quiz session. The band SHALL be purely decorative and MUST NOT read from or mutate any maze game state. The compact quiz band SHALL be non-interactive (`pointer-events: none`) and SHALL be rendered as an **in-flow strip that reserves its own vertical space between the title bar and the question body** — NOT as an out-of-flow translucent overlay positioned over the content — so it can never obscure or intercept the answer UI on any viewport.

#### Scenario: Band renders with three parallax layers
- **WHEN** the expedition animation is shown (on the maze homepage or in QuizModal)
- **THEN** a far sky layer, a tissue ground layer, and a foreground particle layer are each present and animate via CSS `background-position` at distinct (slow → fast) speeds, looping seamlessly

#### Scenario: Band does not affect game state
- **WHEN** the expedition band is shown or hidden in either context
- **THEN** maze growth-signal accrual, node settling, and connected-region count are unchanged (the band neither pauses nor advances the journey)

#### Scenario: Compact quiz band stays out of the way
- **WHEN** the compact band renders in the QuizModal
- **THEN** it is non-interactive (does not intercept clicks) and occupies its own strip of vertical space between the title bar and the question body
- **AND** the question stem and options sit entirely below the band and are never overlapped by it, on both desktop and mobile viewports
