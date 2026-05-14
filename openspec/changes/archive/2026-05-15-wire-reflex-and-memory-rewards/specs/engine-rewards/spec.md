## MODIFIED Requirements

### Requirement: REWARD table values are locked

The `REWARD` constant exported from `packages/core/src/lib/xp.ts` SHALL contain exactly these seven entries with exactly these values:

| Key | xp | subjectXp | stat |
|---|---|---|---|
| `readPerMinute` | 5 | 1 | `{ name: 'stamina', delta: 1 }` |
| `quizCorrect` | 10 | 2 | `{ name: 'knowledge', delta: 1 }` |
| `quizWrong` | 2 | 0 | (no stat) |
| `quizFastAnswer` | 0 | 0 | `{ name: 'reflex', delta: 1 }` |
| `srsReviewCorrect` | 0 | 0 | `{ name: 'memory', delta: 1 }` |
| `bossMiniPass` | 50 | 20 | (no stat) |
| `bossAnnualPass` | 200 | 60 | (no stat) |

The two new entries (`quizFastAnswer`, `srsReviewCorrect`) deliberately have `xp: 0` and `subjectXp: 0` — they are **stat-only** rewards stacked on top of the existing `quizCorrect` XP path. XP / levelling curve remains unchanged.

A companion constant `FAST_ANSWER_THRESHOLD_MS = 10000` SHALL also be exported from the same module to define what counts as a "fast" answer.

#### Scenario: Reward shape matches table

- **WHEN** `REWARD` is inspected at runtime or compile time
- **THEN** all 7 keys SHALL be present
- **AND** each entry's `xp` field SHALL match the table value exactly
- **AND** removing or renaming any of these 7 keys SHALL be considered a breaking change requiring a delta proposal

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

## ADDED Requirements

### Requirement: All four default stats have a defined growth source

For every stat `s` in `DEFAULT_STAT_SCHEMA.order`, exactly one entry in `REWARD` SHALL exist whose `stat.name === s`. There SHALL be no dangling stat that the schema exposes but no action awards.

The current mapping is:

| Stat | Growth source |
|---|---|
| `knowledge` | `REWARD.quizCorrect` — any correct quiz answer |
| `reflex` | `REWARD.quizFastAnswer` — correct answer with elapsedMs < `FAST_ANSWER_THRESHOLD_MS` |
| `memory` | `REWARD.srsReviewCorrect` — correct answer in QuizModal `mode='review'` (SRS due card) |
| `stamina` | `REWARD.readPerMinute` — per focused minute of reading mode |

#### Scenario: Every stat in DEFAULT_STAT_SCHEMA has a REWARD entry

- **WHEN** the test enumerates `DEFAULT_STAT_SCHEMA.order` and inspects `REWARD`
- **THEN** for each stat name `s`, at least one entry of `REWARD` SHALL satisfy `entry.stat?.name === s`
- **AND** adding a new stat to `DEFAULT_STAT_SCHEMA.order` without a corresponding REWARD source SHALL be considered a breaking change

#### Scenario: Fast answer threshold is exported as a named constant

- **WHEN** application code needs to determine if an answer qualifies as "fast"
- **THEN** it SHALL compare `elapsedMs < FAST_ANSWER_THRESHOLD_MS`
- **AND** `FAST_ANSWER_THRESHOLD_MS` SHALL be exported from `packages/core/src/lib/xp.ts`
- **AND** the value SHALL be `10000` (10 seconds) for this MVP
