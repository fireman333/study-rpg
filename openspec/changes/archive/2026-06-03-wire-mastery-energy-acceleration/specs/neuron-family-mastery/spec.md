## ADDED Requirements

### Requirement: Mastery tier SHALL accelerate energy acquisition via a pure multiplier function

The mastery module SHALL export a pure function
`masteryEnergyMultiplier(tier: 'P1' | 'P2' | 'P3' | 'P4' | 'P5' | 'none'): number`
that maps a mastery tier to an energy-acquisition multiplier. The function SHALL NOT
depend on Dexie / React / any side effect, and SHALL be the single source of truth for
mastery-driven energy acceleration (consumed by both energy faucets and the chip).

First-cut multiplier values (declared as named tunable constants; dogfood telemetry
calibrates):

- `none` → 1.0
- P5 → 1.0
- P4 → 1.05
- P3 → 1.10
- P2 → 1.20
- P1 → 1.30

The multiplier SHALL be monotonic non-decreasing from `none`/P5 up to P1, and SHALL
never return a value below 1.0.

#### Scenario: Unassessed and Novice tiers give no acceleration

- **WHEN** `masteryEnergyMultiplier('none')` and `masteryEnergyMultiplier('P5')` are called
- **THEN** both SHALL return `1.0`

#### Scenario: Each rewarded tier returns its first-cut multiplier

- **WHEN** `masteryEnergyMultiplier` is called for P4, P3, P2, P1
- **THEN** it SHALL return `1.05`, `1.10`, `1.20`, `1.30` respectively

### Requirement: Mastery multiplier SHALL apply at both correct-answer energy faucets for the answered family

When `services/connectome.ts` `recordCorrectAnswer(familyId)` runs, it SHALL derive the
answered family's mastery tier from its mastery counters and apply
`masteryEnergyMultiplier(tier)` at **both** correct-answer energy faucets for that family:

1. the neural-energy award — the awarded amount SHALL be `CORRECT_ANSWER_ENERGY`
   multiplied by the mastery multiplier, rounded to an integer
2. the maze-signal accrual — the accrual base SHALL be multiplied by the same mastery
   multiplier (composing with the existing streak and collection multipliers)

The same tier value SHALL be used for both faucets within a single
`recordCorrectAnswer` invocation, so the two counters stay in lockstep.

Mastery acceleration SHALL apply to correct answers only. Reading-minute energy (which
has no family context) SHALL NOT be mastery-boosted, and `recordIncorrectAnswer` SHALL
NOT apply any mastery energy multiplier.

#### Scenario: High-mastery correct answer accelerates both faucets

- **GIVEN** family `藥理學` has a mastery tier of P1 (multiplier 1.30)
- **WHEN** the player answers a `藥理學` question correctly via `recordCorrectAnswer('藥理學')`
- **THEN** the neural-energy award SHALL be `round(CORRECT_ANSWER_ENERGY × 1.30)`
- **AND** the maze-signal accrual base for `藥理學`'s NT branch SHALL be multiplied by `1.30`

#### Scenario: Unmastered correct answer is unaffected

- **GIVEN** family `生物化學` has a mastery tier of `none` (multiplier 1.0)
- **WHEN** the player answers a `生物化學` question correctly
- **THEN** the neural-energy award SHALL equal `CORRECT_ANSWER_ENERGY` (unchanged)
- **AND** the maze-signal accrual base SHALL be unchanged by the mastery factor

#### Scenario: Reading energy and incorrect answers are not mastery-boosted

- **WHEN** a reading minute accrues energy, OR `recordIncorrectAnswer(familyId)` runs
- **THEN** no `masteryEnergyMultiplier` factor SHALL be applied to that energy

### Requirement: Mastery chip SHALL surface the active energy multiplier

For every family rendered with a `MasteryChip`, the chip SHALL display the active energy
acceleration derived from `masteryEnergyMultiplier(tier)` when the multiplier is greater
than 1.0 (e.g. "⚡+10%" for P3). When the multiplier equals 1.0 (tier `none` or P5), the
chip SHALL NOT render a boost element.

#### Scenario: Chip shows boost for an accelerated tier

- **GIVEN** a family with mastery tier P3 (multiplier 1.10)
- **WHEN** its `MasteryChip` renders
- **THEN** the chip SHALL display a boost indicator equivalent to "+10%"

#### Scenario: Chip shows no boost for an unrewarded tier

- **GIVEN** a family with mastery tier `none` or P5 (multiplier 1.0)
- **WHEN** its `MasteryChip` renders
- **THEN** the chip SHALL NOT display any energy boost indicator
