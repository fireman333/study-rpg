## ADDED Requirements

### Requirement: Second-lap location variants SHALL render a position-keyed hue/filter over the base sprite

A second-lap location variant (per `neurons-maze-second-lap`) SHALL render as its family's base sprite with a **position-keyed hue/filter** shift derived deterministically from its `location`, composited via the existing shared context-art component. The change SHALL add ZERO new sprite asset files. The hue/filter SHALL be a pure function of `(familyId, location)` so a second device renders identically. This location channel SHALL remain visually distinct from the rarity channel and SHALL coexist with the existing decor / brain-wave-band context channels.

#### Scenario: Location variant renders base sprite with a derived hue/filter

- **WHEN** a second-lap location variant is rendered at any site (reveal, dex, maze walker)
- **THEN** it shows the family's base sprite with a hue/filter deterministically derived from its location
- **AND** no new sprite file is shipped for it

#### Scenario: Location hue/filter is deterministic and device-stable

- **WHEN** the same location variant is rendered on two devices
- **THEN** both compute the identical hue/filter from `(familyId, location)`

#### Scenario: Location channel coexists with existing context channels

- **WHEN** a location variant also has decor / brain-wave-band context art
- **THEN** the location hue/filter composites with them without replacing the rarity channel’s distinct styling
