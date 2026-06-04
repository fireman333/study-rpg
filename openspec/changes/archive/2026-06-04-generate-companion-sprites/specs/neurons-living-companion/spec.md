## MODIFIED Requirements

### Requirement: Companion animation asset SHALL resolve placeholder-first

The companion marcher SHALL resolve its artwork as `companion:<id>` → `equipment:<id>` → a transparent guard, so a dedicated companion sprite is preferred when present and the static dex sprite is the fallback (never a broken image). Dedicated `companion:<id>` marcher sprites SHALL ship for the living-cell companions; the registry SHALL key a `companion:<id>` entry only when its PNG is present (an absent sprite SHALL leave the key unresolved so the `equipment:<id>` fallback fires, rather than resolving to a transparent pixel). Companion marchers SHALL render at a **reduced size relative to the squad marchers** (a single tunable scale), so the glia read as smaller companions.

#### Scenario: dedicated companion art is preferred

- **WHEN** a `companion:<id>` sprite is registered for an owned companion
- **THEN** the band SHALL render the dedicated `companion:<id>` art (not the `equipment:<id>` dex sprite)

#### Scenario: missing companion asset falls back to the dex sprite

- **WHEN** no `companion:<id>` sprite is registered
- **THEN** the band SHALL render the existing static `equipment:<id>` sprite (never a broken image or a transparent pixel)

#### Scenario: companion marchers are smaller than the squad

- **WHEN** a companion marches in the band alongside squad marchers
- **THEN** the companion sprite SHALL render at a smaller size than the squad marcher at the same depth
