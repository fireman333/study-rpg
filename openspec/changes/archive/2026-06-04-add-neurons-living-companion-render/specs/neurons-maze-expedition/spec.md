## ADDED Requirements

### Requirement: Owned living companions SHALL march with the expedition squad

The expedition animation band SHALL append the player's owned living-cell glial companions (per `neurons-living-companion`) as additional marchers at the back of the squad parade. Companion marchers SHALL inherit the band's existing treatment — bob animation, depth-stagger, paused/hidden state, and reduced-motion/performance behavior — exactly as the variant marchers do. When the player owns no companion, the parade SHALL be the squad alone (unchanged). Companion marchers SHALL appear in every context the band renders (the homepage band and the compact QuizModal band).

#### Scenario: companions append to the parade

- **WHEN** the band renders and the player owns ≥ 1 living companion
- **THEN** each owned companion SHALL appear as a marcher after the squad members, sharing the band's bob + depth-stagger treatment

#### Scenario: no companions owned leaves the squad unchanged

- **WHEN** the player owns no living companion
- **THEN** the band SHALL render only the squad (or its growth-cone fallback), with no companion marcher

#### Scenario: companions ride the band's hidden/paused state

- **WHEN** the expedition band is hidden (opt-out) or paused (reading not active)
- **THEN** the companion marchers SHALL follow the same hidden/paused behavior as the rest of the parade (no separate visibility path)
