# @study-rpg/core

Engine layer of [study-rpg](https://github.com/fireman333/study-rpg) — a content-pack-agnostic「養成型 RPG for exam prep」runtime. Provides the deterministic primitives (4-stat character, XP curves, gacha loot with pity, SRS due queue, mini-boss runs, daily streak multiplier, skill tree resolver) that any content / theme fork can build on top of. The default content pack ships Taiwan 一階 醫師國考 questions, but core itself knows nothing about medicine.

## Install

```bash
pnpm add @study-rpg/core
# peer deps your app probably already has:
pnpm add react react-dom dexie dexie-react-hooks framer-motion
```

Requires Node ≥ 20.19 (for ESM `import()` of typed declarations) and a modern bundler (Vite / Webpack 5 / esbuild).

## Minimal usage

```ts
import {
  newPlayer,
  applyXp,
  addStat,
  rollRarity,
  REWARD,
  DEFAULT_RARITY_WEIGHTS,
  DEFAULT_STAT_SCHEMA,
} from '@study-rpg/core'

// Bootstrap a player. The third arg is the ordered list of stat ids your
// theme/content pack uses; DEFAULT_STAT_SCHEMA is the engine's 4-stat default.
let player = newPlayer('p1', '見習醫師', DEFAULT_STAT_SCHEMA.order)
console.log(player.level) // 1

// Grant one minute of focused reading: REWARD primitives are structured —
// apply the xp portion via applyXp, and the stat bump via addStat.
const r = REWARD.readPerMinute
player = {
  ...applyXp(player, r.xp).player,
  stats: addStat(player.stats, r.stat.name, r.stat.delta),
}
console.log(player.xp, player.stats.stamina) // 5, 1

// Roll a rarity tier with built-in pity (SR at 30, SSR at 100).
// player.lootStats is initialized by newPlayer; reuse it for pity tracking.
const { rarity } = rollRarity(player.lootStats, DEFAULT_RARITY_WEIGHTS)
console.log(rarity) // 'N' | 'R' | 'SR' | 'SSR'
```

## What you get

- `Player` / `Item` / `Question` / `Subject` / `ThemePack` type definitions
- `applyXp` / `addStat` / `applyCheckIn` / `getStreakMultiplier` reward helpers
- `rollLoot` with built-in pity rules (`PITY_SR_THRESHOLD = 30`, `PITY_SSR_THRESHOLD = 100`)
- `newCard` / `reviewCard` / `dueCards` SM-2 style spaced repetition
- `sampleMiniBoss` / `passed` boss-run sampler
- `resolveSkillTree` skill-node unlock resolver
- `getDB` / `StudyRpgDB` Dexie wrapper for client-side persistence

Full API: see TypeScript declarations shipped with the package, or browse [`src/index.ts`](https://github.com/fireman333/study-rpg/blob/main/packages/core/src/index.ts) in the main repo.

## License

AGPL-3.0-or-later. See `LICENSE`. Engine + themes are AGPL; default content pack is CC-BY-NC-4.0 (separate package).

## Status

Pre-1.0 (`0.x.y`). Patch bumps are additive; minor bumps are breaking. The API surface stabilizes at `1.0.0` after the engine has more dogfood mileage. See the [main repo](https://github.com/fireman333/study-rpg) for the roadmap.
