## ADDED Requirements

### Requirement: Affinity multiplier shares hospital-specialty-bonus source of truth

The system SHALL source the affinity multiplier from the existing `SPECIALTY_MATCH_MULTIPLIER` table and `getSpecialtyMultiplier()` helper exported by `packages/content-medexam2-tw/src/specialty.ts`. The system MUST NOT introduce a parallel multiplier table, enum, or helper function for affinity. Dogfood tuning MUST remain a single-file edit.

#### Scenario: Affinity uses the same multiplier table as mastery

- **WHEN** a same-subject P1 partner answers a quiz correctly
- **THEN** both the mastery delta and the affinity delta MUST use `SPECIALTY_MATCH_MULTIPLIER["P1"] = 1.5` (identical value, single source)

#### Scenario: No duplicate helper or constants defined

- **WHEN** a developer searches `packages/content-medexam2-tw/src/` for affinity-specific multiplier exports
- **THEN** they MUST find no `AFFINITY_SPECIALTY_MATCH_MULTIPLIER` / no `getAffinitySpecialtyMultiplier` / no parallel table — only `SPECIALTY_MATCH_MULTIPLIER` and `getSpecialtyMultiplier` (the existing mastery-tier exports) MUST be reused

### Requirement: Tier-based affinity multiplier on correct answer

The system SHALL apply the rarity-tiered multiplier to the affinity increment when the specialty match predicate returns true. The increment formula MUST be `affinity.correctCount += multiplier`. When the predicate returns false (cross-subject partner or no partner), the multiplier MUST equal 1.0 and the increment MUST remain `+= 1` exactly.

#### Scenario: P1 same-subject partner answering correctly

- **WHEN** a P1 doctor whose subject matches the quiz subject is the bound partner and the user answers correctly
- **THEN** `affinity.correctCount` MUST increment by 1.5 (e.g. from 3 to 4.5)

#### Scenario: P5 same-subject partner answering correctly

- **WHEN** a P5 doctor whose subject matches the quiz subject is the bound partner and the user answers correctly
- **THEN** `affinity.correctCount` MUST increment by 1.05

#### Scenario: Cross-subject partner answering correctly

- **WHEN** any rarity doctor whose subject does NOT match the quiz subject is the bound partner and the user answers correctly
- **THEN** `affinity.correctCount` MUST increment by exactly 1 (no bonus, identical to the pre-change behavior)

#### Scenario: No partner answering correctly

- **WHEN** the user answers correctly with no bound partner (`partner === null`)
- **THEN** `affinity.correctCount` MUST increment by exactly 1

### Requirement: Wrong answer never increments affinity

The system SHALL NOT modify `affinity.correctCount` on a wrong answer, regardless of partner rarity, partner subject, or specialty match outcome. The pre-existing `recordWrongAnswer` behavior (defined by `recruitment-gacha`) MUST be preserved verbatim — wrong answers do not touch the affinity table at all.

#### Scenario: Same-subject P1 partner answering wrong

- **WHEN** a P1 same-subject partner is bound and the user answers wrong
- **THEN** `affinity.correctCount` MUST remain unchanged (multiplier MUST NOT apply, decrement MUST NOT occur)

#### Scenario: Cross-subject partner answering wrong

- **WHEN** a cross-subject partner is bound and the user answers wrong
- **THEN** `affinity.correctCount` MUST remain unchanged

### Requirement: Float storage for affinity.correctCount (no schema migration)

The system SHALL store the post-multiplier `affinity.correctCount` value as a JavaScript number (IEEE-754 double), reusing the existing v4 schema column. No Dexie version bump or upgrade hook MUST be introduced. Pre-existing integer values MUST coexist with float values without normalization or backfill.

#### Scenario: Pre-existing int correctCount upgrades to float in place

- **WHEN** an existing v4 save has `affinity.correctCount = 3` (integer, from before this change) and the user answers a same-subject P1 quiz correctly
- **THEN** the system MUST write `affinity.correctCount = 4.5` to the same row without a schema migration

#### Scenario: Integer rows stay integer when no bonus applies

- **WHEN** an existing v4 save has `affinity.correctCount = 7` (integer) and the user answers a cross-subject quiz correctly
- **THEN** the system MUST write `affinity.correctCount = 8` (integer + 1.0 = 8, JS native arithmetic keeps integer representation)

### Requirement: Recruitment threshold comparison stays unchanged

The system SHALL continue to evaluate `affinity.correctCount >= threshold` as the recruitment banner unlock gate, where `threshold` remains an integer defined by `packages/content-medexam2-tw/src/recruitment.ts`. The comparison MUST work correctly when `correctCount` is a float (JS numeric comparison handles int-vs-float natively). Threshold values MUST NOT be re-tuned in this change.

#### Scenario: Float affinity 10.5 unlocks threshold 10

- **WHEN** `affinity.correctCount = 10.5` and `threshold = 10`
- **THEN** the recruitment banner MUST report `unlocked = true`

#### Scenario: Float affinity 9.5 stays locked below threshold 10

- **WHEN** `affinity.correctCount = 9.5` and `threshold = 10`
- **THEN** the recruitment banner MUST report `unlocked = false` (gate not yet crossed)

### Requirement: RecruitmentBanner displays affinity with smart decimal precision

The system SHALL display `affinity.correctCount` in the recruitment banner progress label rounded to at most one decimal place. Values whose fractional component is zero MUST display as integers (e.g. `3 / 10`, not `3.0 / 10`); values with a non-zero fractional component MUST display with one decimal (e.g. `3.5 / 10`, `9.85` MUST display as `9.9 / 10`).

#### Scenario: Integer affinity displays without decimal

- **WHEN** `affinity.correctCount = 7` (integer)
- **THEN** the banner MUST render `7 / 10` (no trailing `.0`)

#### Scenario: Half-integer affinity displays one decimal

- **WHEN** `affinity.correctCount = 3.5`
- **THEN** the banner MUST render `3.5 / 10`

#### Scenario: Multi-decimal affinity rounds to one decimal

- **WHEN** `affinity.correctCount = 9.85`
- **THEN** the banner MUST render `9.9 / 10` (`Math.round(9.85 * 10) / 10 = 9.9`)
