# neuron-family-mastery Specification

## Purpose

Per-neuron-family mastery tracking layer for the neurons-mode app: persists `correct` and `total` quiz-attempt counters per family in a dedicated Dexie table (`familyMastery`, schema v2), derives a P1–P5 mastery tier via pure function with count + accuracy double-gate (P1 = 200 correct + 90% accuracy down to P4 = 10 correct + 60% accuracy; below 5 attempts returns `'none'`), and surfaces the mastery state on every neuron family card via a `<MasteryChip>` component that consumes the `neurons-motion-library` `<NumberTickUp>` primitive for animated count display. All writes co-commit with connectome's AP writes in a shared Dexie transaction to prevent torn state between AP counter and mastery counter. Designed as the substrate for future `add-neurons-achievements` (mastery-tier-based unlock criteria) and as the first concrete consumer of the motion library's `<NumberTickUp>` primitive.
## Requirements
### Requirement: Per-family mastery SHALL track correct and total attempt counts in a dedicated Dexie table

The neurons mode SHALL persist a per-neuron-family mastery row in a new `familyMastery` Dexie table (schema version 2, additive over v1's `familyAccrual` / `synapses` / `meta`). Each row stores `familyId: string` (primary key matching subject id), `correct: number` (monotonic-increment on correct quiz attempts), and `total: number` (monotonic-increment on every quiz attempt regardless of correctness).

The table SHALL be initialized lazily on first read via `initFamilyMasteryIfEmpty(pack)`: when row count is zero, seed 11 rows (one per neuron family in the content pack) with `correct: 0, total: 0`.

#### Scenario: New player has all 11 families seeded at zero

- **GIVEN** a fresh player starts neurons-tw
- **WHEN** any consumer first reads mastery state
- **THEN** the `familyMastery` table SHALL contain exactly 11 rows
- **AND** each row SHALL have `correct: 0` and `total: 0`

#### Scenario: Correct attempt increments both counters

- **GIVEN** a family currently has `correct: 5, total: 7`
- **WHEN** the player attempts a question for that family and answers correctly
- **THEN** the row SHALL update to `correct: 6, total: 8`

#### Scenario: Incorrect attempt increments only total

- **GIVEN** a family currently has `correct: 5, total: 7`
- **WHEN** the player attempts a question for that family and answers incorrectly
- **THEN** the row SHALL update to `correct: 5, total: 8`

### Requirement: Mastery tier SHALL be derived by pure function with count + accuracy double-gate

The mastery module SHALL export a pure function `deriveMasteryTier(correct, total): 'P1' | 'P2' | 'P3' | 'P4' | 'P5' | 'none'` that maps `(correct, total)` to one of six tier labels. The function SHALL NOT depend on Dexie / React / any side effect.

Tier thresholds (count AND accuracy must both meet to qualify):

- **P1 Master**: `correct ≥ 200` AND `accuracy ≥ 0.90`
- **P2 Expert**: `correct ≥ 80` AND `accuracy ≥ 0.80`
- **P3 Proficient**: `correct ≥ 30` AND `accuracy ≥ 0.70`
- **P4 Familiar**: `correct ≥ 10` AND `accuracy ≥ 0.60`
- **P5 Novice**: at least 5 attempts but not P4+
- **'none'**: fewer than 5 attempts (`total < 5`) — insufficient data to assess

`accuracy = correct / total` when `total > 0`, else 0.

#### Scenario: Fresh player below assessment threshold

- **GIVEN** a family with `correct: 2, total: 4`
- **WHEN** `deriveMasteryTier(2, 4)` is called
- **THEN** the function SHALL return `'none'`

#### Scenario: P1 master achieved with both gates met

- **GIVEN** a family with `correct: 200, total: 220` (accuracy 0.909)
- **WHEN** `deriveMasteryTier(200, 220)` is called
- **THEN** the function SHALL return `'P1'`

#### Scenario: Count met but accuracy below P1 gate

- **GIVEN** a family with `correct: 200, total: 250` (accuracy 0.80)
- **WHEN** `deriveMasteryTier(200, 250)` is called
- **THEN** the function SHALL return `'P2'` (drops one tier because accuracy gate failed for P1)

#### Scenario: Accuracy met but count below P1 gate

- **GIVEN** a family with `correct: 100, total: 100` (accuracy 1.0)
- **WHEN** `deriveMasteryTier(100, 100)` is called
- **THEN** the function SHALL return `'P2'` (count fails P1 200-threshold, falls to P2 which 100 satisfies)

### Requirement: Mastery writes SHALL share Dexie transaction with connectome AP writes for atomicity

Whenever `services/connectome.ts` `recordCorrectAnswer(familyId)` or `recordIncorrectAnswer(familyId)` is invoked, the same Dexie transaction SHALL ALSO update the `familyMastery` row for that family (incrementing `correct` on correct answer + `total` on every answer).

This ensures AP counter (from connectome) and mastery counter (from this capability) never diverge — both either commit together or roll back together.

#### Scenario: Correct answer atomically updates AP and mastery

- **GIVEN** a player answers question for family `藥理學` correctly
- **WHEN** `services/connectome.ts` `recordCorrectAnswer('藥理學')` runs
- **THEN** within a single Dexie transaction: `familyAccrual.ap` for `藥理學` SHALL increment by 1
- **AND** `familyMastery.correct` for `藥理學` SHALL increment by 1
- **AND** `familyMastery.total` for `藥理學` SHALL increment by 1

#### Scenario: Incorrect answer increments mastery total but not AP

- **GIVEN** a player answers question for family `生物化學` incorrectly
- **WHEN** `services/connectome.ts` `recordIncorrectAnswer('生物化學')` runs
- **THEN** within a single Dexie transaction: `familyAccrual.ap` for `生物化學` SHALL be unchanged (per connectome-collection Req 1)
- **AND** `familyMastery.correct` SHALL be unchanged
- **AND** `familyMastery.total` SHALL increment by 1

### Requirement: Mastery chip UI SHALL render per family using motion library NumberTickUp for animated count

For every neuron family rendered on the overview page (`/`) and the connectome page (`/connectome`), the UI SHALL display a mastery chip containing:

1. Tier badge (color-coded label e.g. "P3 Proficient", or "—" for tier `'none'`)
2. `<NumberTickUp>` (imported from `'../lib/motion'`) animating the displayed correct count when it changes
3. Accuracy percentage (formatted as integer %, e.g., "84%") or "—" when total = 0

The chip SHALL re-render when its underlying `familyMastery` row updates (subscribe via Dexie live query, useEffect polling, or explicit reactive trigger).

#### Scenario: Mastery chip displays tier and animated count

- **GIVEN** a family with `correct: 15, total: 18` (tier P4, accuracy 83%)
- **WHEN** the overview page renders the mastery section for this family
- **THEN** the chip SHALL display "P4 Familiar" tier label
- **AND** the chip SHALL contain a `<NumberTickUp>` showing "15"
- **AND** the chip SHALL display "83%" accuracy

#### Scenario: Mastery chip displays no-tier state for fresh family

- **GIVEN** a family with `correct: 1, total: 3` (tier 'none' — below 5 threshold)
- **WHEN** the overview page renders the mastery section for this family
- **THEN** the chip SHALL display "—" or equivalent neutral label (not a P-tier)
- **AND** the chip SHALL still show count "1" and accuracy "33%"

#### Scenario: Correct answer triggers animated count update

- **GIVEN** a family chip currently shows correct count "5"
- **WHEN** the player triggers a correct answer (via debug panel or future quiz)
- **AND** the mastery row updates to `correct: 6`
- **THEN** the `<NumberTickUp>` SHALL animate from 5 to 6 over ~600ms (or snap instantly if `prefers-reduced-motion`)

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
- **AND** the maze-signal accrual base for `藥理學`'s family energy pool SHALL be multiplied by `1.30`

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

