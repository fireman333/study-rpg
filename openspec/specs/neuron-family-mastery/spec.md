# neuron-family-mastery Specification

## Purpose

Per-neuron-family mastery tracking layer for the neurons-mode app: persists `correct` and `total` quiz-attempt counters per family in a dedicated Dexie table (`familyMastery`, schema v2), derives a P1–P5 mastery tier via pure function with count + accuracy double-gate (P1 = 200 correct + 90% accuracy down to P4 = 10 correct + 60% accuracy; below 5 attempts returns `'none'`), and surfaces the mastery state on every neuron family card via a `<MasteryChip>` component that consumes the `neurons-motion-library` `<NumberTickUp>` primitive for animated count display. All writes co-commit with connectome's AP writes in a shared Dexie transaction to prevent torn state between AP counter and mastery counter. Designed as the substrate for future `add-neurons-achievements` (mastery-tier-based unlock criteria) and as the first concrete consumer of the motion library's `<NumberTickUp>` primitive.
## Requirements
### Requirement: Per-family mastery SHALL track correct and total attempt counts in a dedicated Dexie table

The neurons mode SHALL persist a per-neuron-family mastery row in a new `familyMastery` Dexie table (schema version 2, additive over v1's `familyAccrual` / `synapses` / `meta`). Each row stores `familyId: string` (primary key matching subject id), `correct: number` (monotonic-increment on correct quiz attempts), and `total: number` (monotonic-increment on every quiz attempt regardless of correctness).

The table SHALL be initialized lazily on first read via `initFamilyMasteryIfEmpty(pack)`: when row count is zero, seed 11 rows (one per neuron family in the content pack) with `correct: 0, total: 0`.

**Cross-device sync (R2 bundle merge) semantics.** The bundle adapter for `familyMastery` SHALL merge each row per-field by monotonic-MAX: `merged.correct = max(local.correct, incoming.correct)` and `merged.total = max(local.total, incoming.total)`. Plain row-LWW (i.e. picking either local or incoming as a whole based on a timestamp or arrival order) SHALL NOT be used; it would silently swallow a concurrent device's attempt increment. The MAX merge is correct because both `correct` and `total` are monotonic non-decreasing on every same-device write, so MAX is the lattice join — newer values dominate strictly older ones, and concurrent values cannot regress the counter.

The merge SHALL preserve the invariant `total >= correct` for every row at all times. This invariant holds trivially under per-field MAX given the on-device write rules: every correct attempt writes `(correct = c+1, total = t+1)` and every incorrect attempt writes `(correct = c, total = t+1)`, so on-device `total >= correct` always holds, and MAX of two values both satisfying the invariant cannot violate it.

**Documented limitation (accepted trade-off).** Two concurrent attempts on two devices starting from the same `(correct=N, total=N)` snapshot can collapse into one merged attempt: device A answering correctly writes `(N+1, N+1)`, device B answering incorrectly writes `(N, N+1)`, and MAX merge yields `(N+1, N+1)` — the wrong attempt's `total` increment is lost. The failure mode is exam-attempt-count under-counting at the boundary of simultaneous play; it cannot produce `correct > total` and it cannot regress either counter. An op-log upgrade (append-only `(familyId, isCorrect, deviceId, attemptedAt)` rows merged by monotonic-union, projecting `correct` = count of `isCorrect=true` rows and `total` = all rows) is permitted as a future enhancement but SHALL NOT be required by this requirement. The simpler MAX projection is the canonical implementation.

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

#### Scenario: Cross-device merge picks per-field MAX, never row-LWW

- **GIVEN** device A has `familyMastery` row `{familyId: 'pharma', correct: 12, total: 17}` and device B has `{familyId: 'pharma', correct: 11, total: 19}` (B has answered 2 more incorrectly than A; A has answered 1 more correctly than B)
- **WHEN** the two bundles round-trip through the merge adapter (in either order)
- **THEN** the merged row SHALL be `{familyId: 'pharma', correct: 12, total: 19}`
- **AND** the merge SHALL NOT replace the whole row with either side's snapshot (no row-LWW)
- **AND** the invariant `total >= correct` SHALL hold on the merged row

#### Scenario: Concurrent same-state attempts collapse (documented limitation)

- **GIVEN** both devices share the same starting snapshot `{familyId: 'physio', correct: 3, total: 5}`
- **WHEN** device A answers one question correctly (locally `{correct: 4, total: 6}`) and device B answers one question incorrectly (locally `{correct: 3, total: 6}`) before either pushes
- **AND** both bundles round-trip through the merge adapter
- **THEN** the merged row SHALL be `{familyId: 'physio', correct: 4, total: 6}` (the incorrect attempt's `total` increment is collapsed into the correct attempt's `total` increment)
- **AND** the merge SHALL NOT yield `correct: 4, total: 7` (the MAX projection cannot recover the lost attempt without an op-log)
- **AND** this collapse is the accepted limitation; an op-log upgrade is permitted but not required

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

