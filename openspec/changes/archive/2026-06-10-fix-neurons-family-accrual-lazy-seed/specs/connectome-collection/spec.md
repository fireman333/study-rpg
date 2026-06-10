## MODIFIED Requirements

### Requirement: Per-family Action Potential SHALL be tracked as monotonic counter incremented by correct quiz answers

The neurons mode SHALL maintain a per-neuron-family `actionPotential` (AP) counter
that:

- Reads as 0 for every family until its first interaction — a family with no
  `familyAccrual` row yet SHALL be treated as `ap = 0` (the row is **lazily
  seeded**, not pre-created en masse at save creation)
- Increments by exactly 1 for every correct quiz answer attributed to that family
  (plus any active DMN family-buff bonus)
- Is monotonic (never decreases — no per-day reset, no decay)
- Persists across sessions via the local Dexie `familyAccrual` table, whose row for
  a family is created lazily on that family's first write (correct answer or pull)

AP is a **display + progression signal** (shown on the connectome homepage, and
recorded as `apAtUnlock` provenance at pull time). AP SHALL NOT gate variant
collection — variant acquisition is the `neuron-variant-gacha` capability's
currency-gated pull. AP is distinct from `pullCount` (the per-family P0 pity clock).

When `recordCorrectAnswer` runs for a family with no `familyAccrual` row yet (fresh
save / not-yet-hydrated), it SHALL lazily seed a default zero-initialized row
(`ap = 0`, `firedToday = false`, `lastFireDate = null`, `unlockedSlots = []`,
`sameDayCorrect = 0`, `pullCount = 0`) **inside the same write transaction** as the
mastery / streak / AP writes, rather than throwing — so the first correct answer for
a fresh family commits its AP atomically instead of aborting the transaction.

#### Scenario: Initial AP is zero for all families

- **GIVEN** the player creates a new save in neurons-tw
- **THEN** every family's `actionPotential` SHALL read as 0
- **AND** the `familyAccrual` table MAY be empty until a family is first interacted with — a family with no row SHALL be treated as `ap = 0` and `pullCount = 0`

#### Scenario: Correct answer on a family with no accrual row lazily seeds it

- **GIVEN** family F has no `familyAccrual` row yet (fresh save / not-yet-hydrated)
- **WHEN** the player answers a question correctly attributed to F
- **THEN** the system SHALL lazily seed a default `familyAccrual` row for F (`ap = 0`, `pullCount = 0`) inside the same write transaction
- **AND** the transaction SHALL commit with F's `actionPotential` equal to 1 (plus DMN bonus if active)
- **AND** the transaction SHALL NOT abort or throw on the missing row

#### Scenario: Correct answer increments AP by exactly 1

- **GIVEN** a family's current `actionPotential` is `X`
- **WHEN** the player answers a question correctly attributed to that family
- **THEN** that family's `actionPotential` SHALL become `X + 1` (plus DMN bonus if active)
- **AND** no `connectome.variantSlotUnlocked` event SHALL be emitted (the event no longer exists)

#### Scenario: AP no longer unlocks variants

- **GIVEN** a family's AP crosses any value (e.g. 10, 30, 80)
- **WHEN** the answer commits
- **THEN** no variant row SHALL be created as a result of the AP value
- **AND** variants SHALL only be created by an explicit player pull
