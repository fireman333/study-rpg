## MODIFIED Requirements

### Requirement: REWARD table values are locked

The `REWARD` constant exported from `packages/core/src/lib/xp.ts` SHALL contain exactly these eight entries with exactly these values:

| Key | xp | subjectXp | stat | Notes |
|---|---|---|---|---|
| `readPerMinute` | 5 | 1 | `{ name: 'stamina', delta: 1 }` | |
| `quizCorrect` | 10 | 2 | `{ name: 'knowledge', delta: 1 }` | |
| `quizWrong` | 2 | 0 | (no stat) | |
| `quizFastAnswer` | 0 | 0 | `{ name: 'reflex', delta: 1 }` | |
| `srsReviewCorrect` | 0 | 0 | `{ name: 'memory', delta: 1 }` | |
| `bossMiniPass` | 50 | 20 | (no stat) | |
| `bossAnnualPass` | 200 | 60 | (no stat) | |
| `mockExamPass` | 800 | 240 | `{ name: 'knowledge', delta: 4 }` | **Ultimate boss tier** — applied once per mock submit; exempt from any per-minute rate caps; subjectXp targets the paper's primary subject group |

The two stat-only entries (`quizFastAnswer`, `srsReviewCorrect`) deliberately have `xp: 0` and `subjectXp: 0` — they are **stat-only** rewards stacked on top of the existing `quizCorrect` XP path. XP / levelling curve remains unchanged.

The `mockExamPass` entry is the engine's **largest single-event reward**. It is applied exactly once when the user submits a completed mock exam (see `mock-exam` capability). Unlike per-minute reward accumulation in reading / quiz loops, `mockExamPass` SHALL bypass any rate-limiting heuristics and apply the full `xp`, `subjectXp`, and `stat` delta in a single tick.

A companion constant `FAST_ANSWER_THRESHOLD_MS = 10000` SHALL also be exported from the same module to define what counts as a "fast" answer.

#### Scenario: Reward shape matches table

- **WHEN** `REWARD` is inspected at runtime or compile time
- **THEN** all 8 keys SHALL be present
- **AND** each entry's `xp` field SHALL match the table value exactly
- **AND** removing or renaming any of these 8 keys SHALL be considered a breaking change requiring a delta proposal

#### Scenario: Quiz wrong still grants minimal XP

- **WHEN** a quiz answer is wrong and `REWARD.quizWrong` is consulted
- **THEN** the player SHALL still receive 2 XP (not 0)
- **AND** no stat bonus SHALL be applied
- **AND** this is intentional: keeps the gameplay loop forward-moving and feeds SRS queue per design rationale

#### Scenario: Fast answer is stat-only, no extra XP

- **WHEN** `REWARD.quizFastAnswer` is consulted on a correct fast answer
- **THEN** `REWARD.quizFastAnswer.xp` SHALL equal `0` (the XP comes from `quizCorrect` only)
- **AND** `REWARD.quizFastAnswer.stat` SHALL equal `{ name: 'reflex', delta: 1 }`
- **AND** the existing levelling curve SHALL NOT be inflated by this entry

#### Scenario: SRS review correct is stat-only, no extra XP

- **WHEN** `REWARD.srsReviewCorrect` is consulted on a correct review-mode answer
- **THEN** `REWARD.srsReviewCorrect.xp` SHALL equal `0` (the XP comes from `quizCorrect` only)
- **AND** `REWARD.srsReviewCorrect.stat` SHALL equal `{ name: 'memory', delta: 1 }`

#### Scenario: Mock exam pass applies full burst in one tick

- **WHEN** the mock-exam capability submits a completed paper and `REWARD.mockExamPass` is applied
- **THEN** `applyXp(player, 800)` SHALL be invoked exactly once
- **AND** the paper's primary subject SHALL receive `+240` subject XP via the existing `applySubjectXp` path
- **AND** `addStat(stats, 'knowledge', 4)` SHALL be applied
- **AND** the loot system SHALL grant exactly one guaranteed SR-tier roll (per `loot-mechanics` capability rules)
- **AND** no per-minute stat rate cap SHALL clamp or defer this application

#### Scenario: Mock exam pass quantum is non-stackable

- **WHEN** two mock submits occur within the same minute (unusual but possible)
- **THEN** each submit SHALL independently apply the full `mockExamPass` burst
- **AND** the engine SHALL NOT debounce, merge, or skip the second application
