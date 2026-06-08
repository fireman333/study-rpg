## MODIFIED Requirements

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
