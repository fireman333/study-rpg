# hospital-fate-cards Specification

## Purpose

命運卡 — 消耗 reputation 抽 4 階卡包（普通 1k / 稀有 10k / 史詩 100k / 傳奇 1M），內容池含招募券、進修保證券、facility / throughput 加成。Pity 3：連續 3 次衰運後第 4 次必中（每階獨立 counter，via monotonicCounters MAX-merge）。

## Requirements
### Requirement: Fate cards SHALL be unlocked at 醫學中心 tier

The system SHALL gate fate card draws behind `gameCounters.tier >= '醫學中心'`. The fate card UI SHALL be hidden (no nav link visible, route returns 404 if accessed directly) until the player reaches this tier. Once unlocked, the UI SHALL remain available even if the tier definition changes (no regression possible due to monotonic tiers).

#### Scenario: Pre-醫學中心 player cannot access fate cards

- **GIVEN** tier `'區域醫院'`
- **WHEN** the player navigates the app
- **THEN** no fate card nav link SHALL be visible
- **AND** directly navigating to `/fate-cards` SHALL render a "tier-locked" placeholder

#### Scenario: 醫學中心 player sees fate card nav

- **GIVEN** tier `'醫學中心'`
- **WHEN** the player views the home navigation
- **THEN** a fate card nav entry SHALL be visible

### Requirement: Four card-pack tiers SHALL be available with locked costs

The system SHALL provide exactly 4 card-pack tiers with locked reputation costs and content pools:

| Pack | Reputation cost | Content pool | Bad-luck rate |
|---|---|---|---|
| 普通命運（白） | 1,000 | recruitment ticket ×3 / minor revenue / event-immunity card | 5% (penalty: `-1,000 rep`) |
| 稀有命運（藍） | 10,000 | recruitment ticket ×10 / training guarantee voucher ×1 / event-positive trigger | 5% (penalty: `-10,000 rep`) |
| 史詩命運（紫） | 100,000 | targeted P3+ recruitment ticket / facility +0.5 permanent / 1-week salary waiver | 5% (penalty: `-50,000 rep`) |
| 傳奇命運（金） | 1,000,000 | targeted P2 recruitment ticket / all-room facility +1 / 1-week throughput ×2 | 0% |

The costs SHALL be recorded as literals in `packages/content-medexam2-tw/src/fate-cards.ts`. Insufficient-reputation attempts SHALL be blocked client-side BEFORE the draw.

#### Scenario: Common pack draw deducts reputation

- **GIVEN** `reputation = 5,000` and player initiates a 普通命運 draw
- **WHEN** the draw completes
- **THEN** `reputation` SHALL equal `4,000` (1,000 deducted regardless of result)
- **AND** a row SHALL appear in `fateCardHistory`

#### Scenario: Insufficient reputation blocks draw

- **GIVEN** `reputation = 5,000` and player attempts a 稀有命運 draw (cost 10,000)
- **WHEN** the draw button is pressed
- **THEN** no reputation deduction SHALL occur
- **AND** the UI SHALL display an insufficient-reputation error

### Requirement: Fate card draw history SHALL be persisted

The system SHALL append a row to `fateCardHistory` table for every draw with:

- `drawnAt: number` — Unix ms timestamp
- `packTier: 'common' | 'rare' | 'epic' | 'legendary'`
- `resultType: 'reward' | 'badLuck'`
- `rewardKey: string | null` — which reward pool item was drawn (null if bad luck)
- `costPaid: number` — reputation deducted

#### Scenario: Each draw creates history row

- **GIVEN** a clean `fateCardHistory` table
- **WHEN** the player completes 5 fate card draws
- **THEN** `fateCardHistory` SHALL contain exactly 5 rows
- **AND** the rows SHALL be ordered by `drawnAt`

### Requirement: Bad luck penalty SHALL never reduce reputation below zero

If a bad-luck penalty would drive `reputation` below 0, the system SHALL clamp to 0 (not negative). The player's tier SHALL never regress due to a bad-luck event (tier progression is monotonic per `clinic-level-up`).

#### Scenario: Penalty clamps at zero

- **GIVEN** `reputation = 500` and a 普通命運 draw resolves to bad luck (-1,000 rep penalty)
- **WHEN** the penalty applies
- **THEN** `reputation` SHALL equal `0`
- **AND** the player SHALL be notified of the penalty cap

### Requirement: Fate card SHALL apply consecutive-bad-luck pity at threshold 3

The system SHALL track a per-pack-tier `consecutiveBadLuckCount` counter (initialized 0 for each of `'common' / 'rare' / 'epic'`; the legendary tier has 0% bad luck rate and no counter). On each draw at a tier:

1. Before rolling, if `consecutiveBadLuckCount[tier] >= 3`, the draw SHALL skip the bad-luck roll and force a reward result (drawn from the reward pool with uniform probability). The counter SHALL then reset to 0.
2. Otherwise, the system SHALL roll bad-luck-vs-reward per the standard probability table.
3. If the result is bad luck, `consecutiveBadLuckCount[tier] += 1`.
4. If the result is reward (including pity-forced reward), `consecutiveBadLuckCount[tier] = 0`.

The counter SHALL be persistent across app reloads (stored in `gameCounters.singleton` or similar). The counter SHALL be independent per pack tier — bad luck at 普通命運 does NOT increment the counter for 稀有命運.

#### Scenario: Pity triggers reward after 3 consecutive bad luck

- **GIVEN** `consecutiveBadLuckCount['common'] = 3` (from 3 prior bad-luck draws at 普通命運)
- **WHEN** the player initiates another 普通命運 draw
- **THEN** the draw SHALL skip the 5% bad-luck roll
- **AND** the result SHALL be a reward drawn from the common reward pool
- **AND** `consecutiveBadLuckCount['common']` SHALL reset to `0`

#### Scenario: Reward resets the counter

- **GIVEN** `consecutiveBadLuckCount['common'] = 2`
- **WHEN** the player initiates a 普通命運 draw and the result is a reward (95% probability)
- **THEN** `consecutiveBadLuckCount['common']` SHALL reset to `0`

#### Scenario: Counter is independent per tier

- **GIVEN** `consecutiveBadLuckCount['common'] = 3` and `consecutiveBadLuckCount['rare'] = 0`
- **WHEN** the player draws a 稀有命運 card
- **THEN** the draw SHALL use the standard 5% bad-luck roll (no pity)
- **AND** if the result is bad luck, `consecutiveBadLuckCount['rare']` SHALL equal `1`
- **AND** `consecutiveBadLuckCount['common']` SHALL remain `3`

#### Scenario: Pity counter persists across reload

- **GIVEN** `consecutiveBadLuckCount['epic'] = 2`
- **WHEN** the app reloads
- **THEN** after rehydration, `consecutiveBadLuckCount['epic']` SHALL still equal `2`
