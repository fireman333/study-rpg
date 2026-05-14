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

The `REWARD` constant exported from `packages/core/src/lib/xp.ts` SHALL contain exactly these five entries with exactly these values:

| Key | xp | subjectXp | stat |
|---|---|---|---|
| `readPerMinute` | 5 | 1 | `{ name: 'stamina', delta: 1 }` |
| `quizCorrect` | 10 | 2 | `{ name: 'knowledge', delta: 1 }` |
| `quizWrong` | 2 | 0 | (no stat) |
| `bossMiniPass` | 50 | 20 | (no stat) |
| `bossAnnualPass` | 200 | 60 | (no stat) |

#### Scenario: Reward shape matches table

- **WHEN** `REWARD` is inspected at runtime or compile time
- **THEN** all 5 keys SHALL be present
- **AND** each entry's `xp` field SHALL match the table value exactly
- **AND** removing or renaming any of these 5 keys SHALL be considered a breaking change requiring a delta proposal

#### Scenario: Quiz wrong still grants minimal XP

- **WHEN** a quiz answer is wrong and `REWARD.quizWrong` is consulted
- **THEN** the player SHALL still receive 2 XP (not 0)
- **AND** no stat bonus SHALL be applied
- **AND** this is intentional: keeps the gameplay loop forward-moving and feeds SRS queue per design rationale

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
- `createdAt` and `lastActiveAt` set to `Date.now()` at call time

#### Scenario: Fresh player has zero progression

- **WHEN** `newPlayer('p1', '見習醫師', ['knowledge', 'reflex', 'memory', 'stamina'])` is called
- **THEN** the returned player SHALL match the invariants above
- **AND** all 4 stats SHALL be `0`
- **AND** `equipment.head`, `equipment.body`, `equipment.weapon`, `equipment.charm` SHALL all be `undefined`

### Requirement: Breaking-change discipline for reward constants

Modifying any `xpToNext` formula, `REWARD` entry, `applyXp` return shape, `addStat` signature, or `newPlayer` initial invariants SHALL require an OpenSpec change proposal that explicitly modifies this capability.

#### Scenario: Stealth modification is rejected at review

- **WHEN** a PR changes `REWARD.quizCorrect.xp` from `10` to a different number without an accompanying spec delta in `openspec/changes/<name>/specs/engine-rewards/spec.md`
- **THEN** reviewers SHALL reject the PR pending the missing delta
- **AND** the delta SHALL document why the new value is chosen (dogfood telemetry, balance feedback, etc.)

