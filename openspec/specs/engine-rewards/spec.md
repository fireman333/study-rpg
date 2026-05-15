# engine-rewards Specification

## Purpose
TBD - created by archiving change lock-engine-rewards. Update Purpose after archive.
## Requirements
### Requirement: XP-to-next-level curve is fixed

The engine SHALL compute "XP needed to advance from level L to level L+1" via the exact formula `xpToNext(L) = floor(50 * L^1.4) + 50`.

#### Scenario: Known curve values

- **WHEN** `xpToNext(1)` is called
- **THEN** the result SHALL be exactly `100`
- **AND** `xpToNext(2)` SHALL be exactly `181` (`floor(50 * 2^1.4) + 50 = floor(131.95) + 50`)
- **AND** `xpToNext(10)` SHALL be exactly `1305` (`floor(50 * 10^1.4) + 50 = floor(1255.94) + 50`)

#### Scenario: Changing the curve is a breaking change

- **WHEN** any PR modifies the `xpToNext` formula in `packages/core/src/lib/xp.ts`
- **THEN** the PR SHALL include a delta proposal modifying this requirement
- **AND** the proposal SHALL document migration impact on existing players' `Player.level`

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

### Requirement: applyXp is a pure level computation

`applyXp(player, gain)` SHALL be a pure function that takes a `Player` snapshot + non-negative XP gain and returns `{ player, leveledUp, levelsGained }` without mutating the input.

#### Scenario: applyXp does not mutate input

- **WHEN** `applyXp(originalPlayer, 100)` is called
- **THEN** the returned `player` SHALL be a new object
- **AND** `originalPlayer.level` and `originalPlayer.xp` SHALL be unchanged
- **AND** `leveledUp` SHALL be `true` if and only if the new level > original level
- **AND** `levelsGained` SHALL equal `newLevel - originalLevel` (non-negative)

#### Scenario: Cross-level gains accumulate correctly

- **WHEN** a level-1 player with `xp: 0` receives a gain that exceeds two levels of `xpToNext`
- **THEN** `levelsGained` SHALL be exactly `2`
- **AND** the residual `player.xp` SHALL equal `gain - xpToNext(1) - xpToNext(2)` (positive remainder carries into the new level)

### Requirement: addStat is non-mutating

`addStat(stats, name, delta)` SHALL return a new `PlayerStats` object with the named stat incremented by `delta`, without mutating the input.

#### Scenario: addStat returns new object

- **WHEN** `addStat({ knowledge: 5 }, 'knowledge', 3)` is called
- **THEN** the result SHALL be `{ knowledge: 8 }`
- **AND** the input `{ knowledge: 5 }` SHALL remain `{ knowledge: 5 }`

#### Scenario: addStat creates absent key

- **WHEN** `addStat({}, 'reflex', 1)` is called on an empty stats object
- **THEN** the result SHALL be `{ reflex: 1 }`
- **AND** the missing key SHALL be treated as `0` before the delta is applied

### Requirement: newPlayer factory has fixed initial shape

`newPlayer(id, name, initialStatNames)` SHALL return a fresh `Player` with these invariants:

- `level: 1`
- `xp: 0`
- `hp: 100`
- `stats`: every name in `initialStatNames` initialized to `0`
- `subjectLevels: {}`
- `badges: []`
- `unlocks: []`
- `equipment: {}` (no slots filled)
- `inventory: []`
- `lootStats: { rollsSinceLastSR: 0, rollsSinceLastSSR: 0, totalRolls: 0 }`
- `lastCheckInDate: undefined`
- `currentStreak: 0`
- `longestStreak: 0`
- `createdAt` and `lastActiveAt` set to `Date.now()` at call time

#### Scenario: Fresh player has zero progression

- **WHEN** `newPlayer('p1', '見習醫師', ['knowledge', 'reflex', 'memory', 'stamina'])` is called
- **THEN** the returned player SHALL match the invariants above
- **AND** all 4 stats SHALL be `0`
- **AND** `equipment.head`, `equipment.body`, `equipment.weapon`, `equipment.charm` SHALL all be `undefined`
- **AND** `currentStreak` and `longestStreak` SHALL both be `0`
- **AND** `lastCheckInDate` SHALL be `undefined`

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

### Requirement: Breaking-change discipline for reward constants

Modifying any `xpToNext` formula, `REWARD` entry, `applyXp` return shape, `addStat` signature, or `newPlayer` initial invariants SHALL require an OpenSpec change proposal that explicitly modifies this capability.

#### Scenario: Stealth modification is rejected at review

- **WHEN** a PR changes `REWARD.quizCorrect.xp` from `10` to a different number without an accompanying spec delta in `openspec/changes/<name>/specs/engine-rewards/spec.md`
- **THEN** reviewers SHALL reject the PR pending the missing delta
- **AND** the delta SHALL document why the new value is chosen (dogfood telemetry, balance feedback, etc.)

### Requirement: Player carries daily-streak state

The `Player` type SHALL carry three streak fields:

- `lastCheckInDate?: string` — ISO `YYYY-MM-DD` in the UTC+8 (Asia/Taipei) calendar, or `undefined` if the player has never checked in.
- `currentStreak: number` — non-negative integer; number of consecutive UTC+8 days (counting today) on which the player has met the check-in threshold.
- `longestStreak: number` — non-negative integer; the maximum `currentStreak` ever observed for this player.

`currentStreak` and `longestStreak` SHALL be present on every persisted `Player` (no `undefined`). `lastCheckInDate` MAY be `undefined` only when the player has never checked in.

#### Scenario: Fresh player has zero streak

- **WHEN** `newPlayer('p1', '見習醫師', ['knowledge', 'reflex', 'memory', 'stamina'])` returns
- **THEN** `player.currentStreak` SHALL be `0`
- **AND** `player.longestStreak` SHALL be `0`
- **AND** `player.lastCheckInDate` SHALL be `undefined`

#### Scenario: Streak fields survive a `setPlayer` round-trip

- **WHEN** a player with `{ currentStreak: 3, longestStreak: 7, lastCheckInDate: '2026-05-15' }` is written through `setPlayer` and re-read from the store
- **THEN** the three fields SHALL come back exactly equal

### Requirement: Daily check-in threshold and same-day idempotence

A UTC+8 calendar day SHALL count as "checked in" for a player when **either** of the following is true on that day:

- The player accumulates **5 or more** focused reading-minute ticks (the same ticks that grant `REWARD.readPerMinute`), OR
- The player completes **5 or more** answered questions (any mode; both correct and wrong count).

Reaching the threshold SHALL update streak state at most once per UTC+8 day for a given player (same-day duplicate triggers are no-ops on streak fields).

#### Scenario: First crossing of threshold on a new day records check-in

- **WHEN** today is `2026-05-16` UTC+8 and the player completes their 5th reading-minute tick of the day
- **AND** `applyCheckIn(player, '2026-05-16')` is invoked by the reward pipeline
- **THEN** `player.lastCheckInDate` SHALL become `'2026-05-16'`
- **AND** `player.currentStreak` SHALL become `1` (if previously `0`) or increment by 1 (if yesterday was also checked in)

#### Scenario: Same-day re-trigger is a no-op

- **WHEN** `player.lastCheckInDate === '2026-05-16'` and the player completes their 10th reading-minute tick on `2026-05-16`
- **AND** `applyCheckIn(player, '2026-05-16')` is invoked again
- **THEN** `player.currentStreak` and `player.longestStreak` SHALL be unchanged
- **AND** the returned player SHALL be referentially equal to the input or carry no streak-field diff

#### Scenario: Quiz-question path also satisfies the threshold

- **WHEN** the player answers their 5th question of the UTC+8 day (no reading time accumulated)
- **THEN** the day SHALL count as checked in
- **AND** `applyCheckIn(player, <today>)` SHALL be invoked exactly once

### Requirement: `applyCheckIn` is a pure helper that handles day-roll-over and streak break

`applyCheckIn(player: Player, today: string): Player` SHALL be a pure function exported from `packages/core/src/lib/streak.ts` that returns a new `Player` with streak fields updated. It SHALL NOT mutate the input.

Behavior matrix on call:

| Condition | Action |
|---|---|
| `lastCheckInDate === today` | Return input unchanged (no-op). |
| `lastCheckInDate === yesterday(today)` | `currentStreak += 1`; update `longestStreak = max(longestStreak, currentStreak)`; set `lastCheckInDate = today`. |
| `lastCheckInDate` is older than yesterday, or `undefined` | Set `currentStreak = 1`; update `longestStreak = max(longestStreak, 1)`; set `lastCheckInDate = today`. The pre-existing `currentStreak` is implicitly reset (the break has already happened; this is the first day of a new run). |

`yesterday(today)` SHALL compute by subtracting one calendar day in UTC+8, NOT 24 hours of wall-clock UTC.

#### Scenario: Consecutive day increments streak

- **WHEN** `applyCheckIn({ lastCheckInDate: '2026-05-15', currentStreak: 3, longestStreak: 3 }, '2026-05-16')`
- **THEN** the result SHALL have `currentStreak === 4`
- **AND** `longestStreak === 4`
- **AND** `lastCheckInDate === '2026-05-16'`

#### Scenario: Gap day resets streak to 1

- **WHEN** `applyCheckIn({ lastCheckInDate: '2026-05-14', currentStreak: 7, longestStreak: 7 }, '2026-05-16')` (one missed day)
- **THEN** the result SHALL have `currentStreak === 1`
- **AND** `longestStreak === 7` (preserved — the old peak is not lost)
- **AND** `lastCheckInDate === '2026-05-16'`

#### Scenario: Long gap also resets to 1

- **WHEN** `applyCheckIn({ lastCheckInDate: '2026-05-01', currentStreak: 5, longestStreak: 5 }, '2026-05-16')` (15-day gap)
- **THEN** `currentStreak === 1`
- **AND** `longestStreak === 5`
- **AND** `lastCheckInDate === '2026-05-16'`

#### Scenario: First-ever check-in initializes everything

- **WHEN** `applyCheckIn({ lastCheckInDate: undefined, currentStreak: 0, longestStreak: 0 }, '2026-05-16')`
- **THEN** `currentStreak === 1`
- **AND** `longestStreak === 1`
- **AND** `lastCheckInDate === '2026-05-16'`

#### Scenario: applyCheckIn does not mutate input

- **WHEN** `applyCheckIn(originalPlayer, today)` is called
- **THEN** the returned player SHALL be a new object (reference inequality)
- **AND** `originalPlayer.currentStreak`, `originalPlayer.longestStreak`, `originalPlayer.lastCheckInDate` SHALL be unchanged

### Requirement: Streak multiplier applies to reading and quiz-correct XP only

A multiplier `getStreakMultiplier(streak: number): number` SHALL be exported from `packages/core/src/lib/streak.ts` with the exact formula:

```
multiplier = 1 + 0.05 * min(max(streak, 0), 10)
```

This multiplier SHALL be applied to the integer XP granted by `REWARD.readPerMinute` and `REWARD.quizCorrect` when those rewards are computed, by multiplying the `xp` field and then applying `Math.floor` to the result. It SHALL NOT be applied to:

- `REWARD.quizWrong`, `REWARD.quizFastAnswer`, `REWARD.srsReviewCorrect` (the consolation / stat-only rewards)
- `REWARD.bossMiniPass`, `REWARD.bossAnnualPass` (boss rewards — avoid compounding gacha-tier variance)
- `subjectXp` on any reward (subject XP curve stays untouched for fork stability)
- Any stat delta (`stat.delta` is never multiplied)

The multiplier SHALL be evaluated against `player.currentStreak` as observed at the moment of reward computation. If the same reward call also crosses the check-in threshold (e.g. 5th minute of reading on a fresh day), the order SHALL be: check-in increments streak first, then the multiplier is computed from the new streak. This makes day-1 of a new run grant the day-1 multiplier (×1.05) starting from the very tick that crossed the threshold.

#### Scenario: Day-0 player gets no multiplier

- **WHEN** a player with `currentStreak: 0` consumes a reading-minute tick that does not yet cross the check-in threshold
- **THEN** the granted XP SHALL be `REWARD.readPerMinute.xp` (5), unchanged

#### Scenario: Day-1 multiplier is 1.05x

- **WHEN** the tick that crosses today's threshold is computed and the player ends with `currentStreak: 1`
- **THEN** the granted reading XP for that tick SHALL equal `floor(5 * 1.05) === 5` (rounding holds at low streaks)
- **AND** subsequent ticks today SHALL also use `currentStreak: 1` (multiplier × 1.05)

#### Scenario: Streak cap at day 10

- **WHEN** `getStreakMultiplier(10)` is computed
- **THEN** the result SHALL equal `1.5`
- **AND** `getStreakMultiplier(11)` SHALL also equal `1.5`
- **AND** `getStreakMultiplier(99)` SHALL also equal `1.5`

#### Scenario: Quiz-correct path is multiplied; wrong path is not

- **WHEN** a player with `currentStreak: 5` answers a question correctly
- **THEN** the granted XP for the answer SHALL equal `floor(REWARD.quizCorrect.xp * 1.25)` = `floor(10 * 1.25)` = `12`

- **WHEN** the same player answers wrong
- **THEN** the granted XP for the answer SHALL equal `REWARD.quizWrong.xp` (2), unchanged by streak

#### Scenario: Mini-boss reward is NOT multiplied

- **WHEN** a player with `currentStreak: 10` passes a mini-boss
- **THEN** the granted XP SHALL equal `REWARD.bossMiniPass.xp` (50), unchanged
- **AND** the same SHALL hold for `REWARD.bossAnnualPass`

#### Scenario: SubjectXp is NOT multiplied

- **WHEN** a player with `currentStreak: 10` answers a quiz correctly
- **THEN** `subjectXp` granted SHALL equal `REWARD.quizCorrect.subjectXp` (2), unchanged

### Requirement: Breaking-change discipline covers streak constants and helper

Modifying the streak threshold (`5 minutes` OR `5 questions`), the multiplier formula coefficients (`0.05`, `min cap 10`), the per-day idempotence rule, or the `applyCheckIn` return shape SHALL require an OpenSpec change proposal that explicitly modifies this capability.

#### Scenario: Stealth tweak to the multiplier coefficient is rejected at review

- **WHEN** a PR changes `getStreakMultiplier` to use coefficient `0.10` instead of `0.05` without an accompanying delta in `openspec/changes/<name>/specs/engine-rewards/spec.md`
- **THEN** reviewers SHALL reject the PR pending the missing delta
- **AND** the delta SHALL document the dogfood telemetry or balance argument behind the new coefficient

