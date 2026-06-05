## MODIFIED Requirements

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
- **AND** the maze-signal accrual base for `藥理學`'s family energy pool SHALL be multiplied by `1.30`

#### Scenario: Unmastered correct answer is unaffected

- **GIVEN** family `生物化學` has a mastery tier of `none` (multiplier 1.0)
- **WHEN** the player answers a `生物化學` question correctly
- **THEN** the neural-energy award SHALL equal `CORRECT_ANSWER_ENERGY` (unchanged)
- **AND** the maze-signal accrual base SHALL be unchanged by the mastery factor

#### Scenario: Reading energy and incorrect answers are not mastery-boosted

- **WHEN** a reading minute accrues energy, OR `recordIncorrectAnswer(familyId)` runs
- **THEN** no `masteryEnergyMultiplier` factor SHALL be applied to that energy
