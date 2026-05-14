# loot-mechanics Specification

## Purpose
TBD - created by archiving change lock-loot-mechanics. Update Purpose after archive.
## Requirements
### Requirement: Default rarity weights sum to 100

The exported `DEFAULT_RARITY_WEIGHTS` SHALL be exactly:

| Rarity | Weight |
|---|---|
| N | 60 |
| R | 25 |
| SR | 10 |
| SSR | 4 |
| UR | 1 |

The sum SHALL equal 100, allowing weights to be read directly as percentages.

#### Scenario: Weight table values match exactly

- **WHEN** `DEFAULT_RARITY_WEIGHTS` is imported and inspected
- **THEN** the 5 entries SHALL match the table above
- **AND** `Object.values(DEFAULT_RARITY_WEIGHTS).reduce((a,b)=>a+b)` SHALL equal `100`

### Requirement: Pity thresholds are fixed

- `PITY_SR_THRESHOLD` SHALL be exactly `30` (rolls without SR-or-better → next roll is forced SR)
- `PITY_SSR_THRESHOLD` SHALL be exactly `100` (rolls without SSR-or-better → next roll is forced SSR)

These two constants SHALL be exported from `packages/core/src/lib/loot.ts`.

#### Scenario: Pity values match

- **WHEN** `PITY_SR_THRESHOLD` and `PITY_SSR_THRESHOLD` are imported
- **THEN** they SHALL be `30` and `100` respectively
- **AND** changing either SHALL require a delta proposal modifying this requirement

### Requirement: rollRarity prioritizes pity over weights

When pity is active, `rollRarity` SHALL bypass weight sampling and force the corresponding tier.

#### Scenario: SSR pity overrides SR pity overrides weights

- **WHEN** `rollRarity` is called with `stats.rollsSinceLastSSR === 100` and any `rollsSinceLastSR` value
- **THEN** the return SHALL be `{ rarity: 'SSR', wasPity: true }` regardless of weights or rng

- **WHEN** `rollRarity` is called with `rollsSinceLastSSR < 100` and `rollsSinceLastSR === 30`
- **THEN** the return SHALL be `{ rarity: 'SR', wasPity: true }`

- **WHEN** `rollRarity` is called with `rollsSinceLastSR < 30` and `rollsSinceLastSSR < 100`
- **THEN** weight-based sampling SHALL be used
- **AND** the returned `wasPity` SHALL be `false`

### Requirement: rollLoot is pure

`rollLoot(catalog, stats, opts?)` SHALL return a new `RollResult` (or `undefined` if catalog is empty) without mutating either `catalog` or `stats`.

#### Scenario: rollLoot does not mutate stats

- **WHEN** `rollLoot(catalog, originalStats)` is called
- **THEN** `originalStats.totalRolls` and pity counters SHALL be unchanged
- **AND** the returned `newStats` SHALL be a different object reference
- **AND** `newStats.totalRolls` SHALL equal `originalStats.totalRolls + 1`

### Requirement: Pity counters reset on tier hit

After a successful roll, the pity counters SHALL reset based on the achieved rarity tier:

- Rolling SR, SSR, or UR SHALL reset `rollsSinceLastSR` to `0`
- Rolling SSR or UR SHALL reset `rollsSinceLastSSR` to `0`
- Rolling N or R SHALL increment both counters by `1`

(Rarity order: N < R < SR < SSR < UR)

#### Scenario: SR roll resets SR counter only

- **WHEN** a roll returns `rarity: 'SR'` with `originalStats = { totalRolls: 10, rollsSinceLastSR: 8, rollsSinceLastSSR: 50 }`
- **THEN** `newStats.rollsSinceLastSR` SHALL be `0`
- **AND** `newStats.rollsSinceLastSSR` SHALL be `51`

#### Scenario: SSR roll resets both counters

- **WHEN** a roll returns `rarity: 'SSR'` with `originalStats = { totalRolls: 50, rollsSinceLastSR: 5, rollsSinceLastSSR: 49 }`
- **THEN** `newStats.rollsSinceLastSR` SHALL be `0`
- **AND** `newStats.rollsSinceLastSSR` SHALL be `0`

#### Scenario: N or R roll increments both counters

- **WHEN** a roll returns `rarity: 'N'` with `originalStats = { totalRolls: 5, rollsSinceLastSR: 5, rollsSinceLastSSR: 5 }`
- **THEN** `newStats.rollsSinceLastSR` SHALL be `6`
- **AND** `newStats.rollsSinceLastSSR` SHALL be `6`

### Requirement: 10k-roll distribution stays within statistical tolerance

The smoke script `scripts/loot-smoke.mjs` running 10000 rolls against `ITEM_CATALOG` with `Math.random` SHALL produce a rarity tally where each bucket falls within ±2σ of the expected count (binomial approximation: σ ≈ sqrt(N · p · (1-p))).

Expected counts and ±2σ envelopes for `N=10000`:

| Rarity | Expected | σ | ±2σ envelope |
|---|---|---|---|
| N (p=0.60) | 6000 | 48.99 | 5902–6098 |
| R (p=0.25) | 2500 | 43.30 | 2413–2587 |
| SR (p=0.10) | 1000 | 30.00 | 940–1060 |
| SSR (p=0.04) | 400 | 19.60 | 361–439 |
| UR (p=0.01) | 100 | 9.95 | 80–120 |

Pity-fire counts (SR / SSR) inflate SR slightly above expectation; this is intentional and acceptable as long as N is not statistically depressed (>2σ low).

#### Scenario: Recent smoke result passes spec

- **WHEN** `node scripts/loot-smoke.mjs` is run on the current `ITEM_CATALOG` + default weights
- **THEN** the printed tally `{N, R, SR, SSR, UR}` SHALL have every bucket within the envelopes above
- **AND** `final stats.totalRolls` SHALL equal `10000`
- **AND** the script SHALL exit `0`

#### Scenario: Modifying weights without updating envelopes is rejected

- **WHEN** a PR modifies `DEFAULT_RARITY_WEIGHTS` but leaves the envelope table in this requirement unchanged
- **THEN** reviewers SHALL reject the PR pending a delta that updates both the weights and the recalculated expected ±2σ envelopes

### Requirement: pickItemByRarity falls back to lower rarities

If the rolled rarity has no items in the catalog, `pickItemByRarity` SHALL search downward (UR → SSR → SR → R → N) and return any item from the first non-empty pool.

#### Scenario: UR rarity with empty UR pool falls back

- **WHEN** `pickItemByRarity(catalog, 'UR', rng)` is called and `catalog` contains 0 UR items but ≥ 1 SSR item
- **THEN** the function SHALL return an item from the SSR pool
- **AND** SHALL NOT return `undefined` unless all rarity pools are empty

#### Scenario: Completely empty catalog returns undefined

- **WHEN** `pickItemByRarity([], 'N', rng)` is called
- **THEN** the function SHALL return `undefined`
- **AND** the caller's `rollLoot` wrapper SHALL also return `undefined`

