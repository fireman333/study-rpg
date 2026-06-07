## RENAMED Requirements

- FROM: `### Requirement: Mastery multiplier SHALL apply at both correct-answer energy faucets for the answered family`
- TO: `### Requirement: Mastery multiplier SHALL apply at the maze-energy faucet for the answered family`

## MODIFIED Requirements

### Requirement: Mastery multiplier SHALL apply at the maze-energy faucet for the answered family

When `services/connectome.ts` `recordCorrectAnswer(familyId)` runs, it SHALL derive the answered family's mastery tier from its mastery counters and apply `masteryEnergyMultiplier(tier)` at the answered family's **single live maze-energy faucet**: the per-family maze-signal accrual base (the value passed to `accrueMazeEnergy`) SHALL be multiplied by the mastery multiplier, composing with the existing streak, acceleration, collection-speed, and synapse multipliers.

This requirement was previously written for a dual-faucet world ("both correct-answer energy faucets … two counters stay in lockstep") that predated `promote-maze-to-home`. The global `neuralEnergyEarned` / `neuralEnergySpent` currency is now **retired** — `recordCorrectAnswer` no longer awards it as a live progression faucet (the keys persist only as zeroed, sync-continuity meta and SHALL NOT be treated as a second faucet). There is exactly ONE live correct-answer energy faucet, so the mastery multiplier applies there.

Mastery acceleration SHALL apply to correct answers only. Reading-minute energy SHALL NOT be mastery-boosted, and `recordIncorrectAnswer` SHALL NOT apply any mastery energy multiplier. The multiplier value mapping (none/P5 → ×1.0 … P1 → ×1.30) is unchanged by this requirement.

#### Scenario: High-mastery correct answer accelerates the maze-energy faucet

- **GIVEN** family `藥理學` has a mastery tier of P1 (multiplier 1.30)
- **WHEN** the player answers a `藥理學` question correctly via `recordCorrectAnswer('藥理學')`
- **THEN** the maze-signal accrual base for `藥理學`'s family energy pool SHALL be multiplied by `1.30` (composing with streak / acceleration / collection / synapse factors)

#### Scenario: Unmastered correct answer is unaffected

- **GIVEN** family `生物化學` has a mastery tier of `none` (multiplier 1.0)
- **WHEN** the player answers a `生物化學` question correctly
- **THEN** the maze-signal accrual base SHALL be unchanged by the mastery factor

#### Scenario: Retired global currency is not a second faucet

- **WHEN** `recordCorrectAnswer(familyId)` runs
- **THEN** no live award SHALL be written to the retired `neuralEnergyEarned` currency as a progression faucet
- **AND** the mastery multiplier SHALL apply only at the single live maze-energy accrual

#### Scenario: Reading energy and incorrect answers are not mastery-boosted

- **WHEN** a reading minute accrues energy, OR `recordIncorrectAnswer(familyId)` runs
- **THEN** no `masteryEnergyMultiplier` factor SHALL be applied to that energy
