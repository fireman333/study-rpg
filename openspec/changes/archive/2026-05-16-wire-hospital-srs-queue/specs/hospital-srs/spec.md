## ADDED Requirements

### Requirement: Binary-input SM-2 review on answer

The system SHALL update each question's `interval`, `easeFactor`, and `nextDueAt` after every quiz answer using a binary (correct / wrong) input variant of SM-2. Mastery, affinity, and SRS state updates MUST happen in a single atomic Dexie transaction.

#### Scenario: First correct answer on a fresh question

- **WHEN** a user answers a question correctly for the first time (existing row has `interval: 0`, `easeFactor: 2.5`, `nextDueAt: null`)
- **THEN** the system MUST set `interval = 1` (days), `easeFactor` unchanged (2.5), and `nextDueAt = now + 1 day` (in ms epoch)

#### Scenario: Second consecutive correct answer

- **WHEN** a user answers correctly and the existing row has `interval = 1`
- **THEN** the system MUST set `interval = 6`, `easeFactor` unchanged, and `nextDueAt = now + 6 days`

#### Scenario: Subsequent correct answer expands interval by easeFactor

- **WHEN** a user answers correctly and the existing row has `interval ≥ 6`
- **THEN** the system MUST set `interval = round(prev.interval × prev.easeFactor)`, `easeFactor` unchanged, and `nextDueAt = now + newInterval × DAY`

### Requirement: Partial reset on wrong answer

The system SHALL apply a partial reset (not full SM-2 "again" reset) when the user answers a question wrong, balancing retention pressure against a养成-game friendly tone.

#### Scenario: Wrong answer reduces interval and easeFactor

- **WHEN** a user answers a question wrong (regardless of prior interval)
- **THEN** the system MUST set `interval = max(1, round(prev.interval × 0.5))`, `easeFactor = max(1.3, prev.easeFactor × 0.85)`, and `nextDueAt = now + newInterval × DAY`

#### Scenario: Wrong answer on a fresh question

- **WHEN** a user answers wrong on a question with no prior history (`interval = 0`)
- **THEN** the system MUST set `interval = 1`, `easeFactor = max(1.3, 2.5 × 0.85) = 2.125`, and `nextDueAt = now + 1 day`

#### Scenario: easeFactor floor is enforced

- **WHEN** repeated wrong answers would drive `easeFactor` below 1.3
- **THEN** the system MUST clamp `easeFactor` to 1.3 (the SM-2 floor)

### Requirement: Due queue surface via subject banner badge

The system SHALL display a "🔴 N due" chip on each subject banner, where N is the number of due cards available to the user for that subject under the current daily cap. When N is 0 the chip MUST NOT render. When N exceeds 99 the chip MUST display "99+".

#### Scenario: Subject with due cards shows badge

- **WHEN** a subject has at least one card with `nextDueAt ≤ now` and the global daily cap has slots remaining for this subject
- **THEN** the subject banner MUST render a chip showing the per-subject due count (post-cap allocation)

#### Scenario: Subject with no due cards hides badge

- **WHEN** a subject has no card with `nextDueAt ≤ now`
- **THEN** the subject banner MUST NOT render the due chip (visual stays clean)

#### Scenario: High due count displays as 99+

- **WHEN** the per-subject allocated due count exceeds 99
- **THEN** the chip MUST display "99+" rather than the literal count

### Requirement: Due-first picker in quiz modal

The system SHALL prefer due cards over random new questions when the user opens the quiz modal for a subject. The due queue MUST be consumed first; only when the due queue is empty does the picker fall back to the existing `pickRandomQuestion` random new-question flow.

#### Scenario: Subject has due card, modal opens with due card

- **WHEN** a user clicks a subject banner with N ≥ 1 due cards and opens the quiz modal
- **THEN** the modal MUST display the first due card (sorted by overdue days descending), looked up by `questionHistory.questionId` from the content pack

#### Scenario: Due queue depleted, fall back to new question

- **WHEN** the user has consumed all due cards in the current session for a subject
- **THEN** the picker MUST call `pickRandomQuestion(subject, seenIds)` to fetch a new random question (existing behavior)

#### Scenario: Due card is not added to seenIds set

- **WHEN** a due card is surfaced and the user answers it
- **THEN** the system MUST NOT add the due card's questionId to the in-session `seenIds` set (allowing the card to re-appear immediately if it becomes due again)

### Requirement: Global daily cap with round-robin distribution

The system SHALL enforce a global daily cap on surfaced due cards across all subjects, defaulting to 20. Allocation across subjects MUST use round-robin (one subject at a time) to prevent single-subject monopolization. Overflow due cards MUST be carried forward to the next day without compressing interval values.

#### Scenario: Daily cap allocates round-robin across subjects

- **WHEN** the daily cap is 20 and 14 subjects each have multiple due cards
- **THEN** the system MUST distribute slots one subject at a time (subject A pops 1, subject B pops 1, ... subject N pops 1, then back to subject A) until 20 slots are filled or all queues are exhausted

#### Scenario: Single subject does not exceed proportional share

- **WHEN** subject A has 100 due cards and other subjects have 1 due card each
- **THEN** subject A MUST NOT receive more than `ceil(20 / 14) = 2` slots in the round-robin allocation (other subjects each receive at least 1)

#### Scenario: Within-subject ordering is by overdue days descending

- **WHEN** a subject has multiple due cards
- **THEN** the round-robin allocation MUST pop them in order of `now - nextDueAt` descending (oldest overdue first)

#### Scenario: Overflow carries forward without interval compression

- **WHEN** total due cards across all subjects exceed the daily cap of 20
- **THEN** the un-surfaced overflow cards MUST retain their original `interval` and `nextDueAt` values (no compression or rescheduling)

### Requirement: SRS state independent from mastery and specialty match

The system SHALL keep SRS state (`interval`, `easeFactor`, `nextDueAt`) decoupled from mastery counters and from doctor specialty match bonuses. The SRS scheduler MUST NOT read mastery values when computing intervals, and MUST NOT apply specialty match multipliers to interval or easeFactor.

#### Scenario: SRS update on correct answer with high mastery

- **WHEN** a user with mastery ≥ 80% on a subject answers a question correctly
- **THEN** the SRS update MUST follow the standard SM-2 expansion rules (1d → 6d → ×EF) without any mastery-aware adjustment

#### Scenario: SRS update on correct answer with matching specialty partner

- **WHEN** the doctor partner's subject equals the quiz subject (specialty match condition)
- **THEN** the SRS update MUST NOT apply any multiplier to `interval` or `easeFactor` (the specialty match boost belongs to mastery / affinity reward only, handled outside this capability)

### Requirement: No schema migration required

The system SHALL operate entirely on existing v4 schema fields (`questionHistory.nextDueAt: number | null`, `questionHistory.interval: number`, `questionHistory.easeFactor: number`). No Dexie version bump or upgrade hook is required.

#### Scenario: Existing dogfood save reads stub values and writes real values

- **WHEN** a user with an existing v4 save (questionHistory rows with `interval: 0`, `easeFactor: 2.5`, `nextDueAt: null`) answers a question
- **THEN** the system MUST update those fields in place using the binary SM-2 scheduler, with no schema migration or version bump

### Requirement: Tunable constants centralized

The system SHALL keep SRS tunable constants (daily cap, wrong-answer interval multiplier, wrong-answer easeFactor multiplier, standard interval seeds) at the top of `packages/core/src/lib/srs.ts` with named exports, enabling dogfood-driven adjustment without scattered code changes.

#### Scenario: Constants are named exports

- **WHEN** a future change needs to adjust the daily cap or reset multipliers
- **THEN** the constants MUST be discoverable as named exports from `packages/core/src/lib/srs.ts` (e.g., `SRS_DAILY_CAP`, `WRONG_INTERVAL_MULTIPLIER`, `WRONG_EASE_MULTIPLIER`, `STANDARD_INITIAL_INTERVALS`)
