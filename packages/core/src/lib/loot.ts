import type { Item, ItemInstance, LootStats, Rarity, Drop } from '../types'
import { rollGacha, type GachaConfig, type GachaStats, type PityRule, type GachaTier } from './gacha'

/**
 * Default rarity weights, summing to 100.
 * Adjustable per-content-pack via ContentPack.meta.lootTriggers (not exposed yet).
 */
export const DEFAULT_RARITY_WEIGHTS: Record<Rarity, number> = {
  N: 60,
  R: 25,
  SR: 10,
  SSR: 4,
  UR: 1,
}

export const PITY_SR_THRESHOLD = 30   // 30 rolls without SR+ → force SR
export const PITY_SSR_THRESHOLD = 100 // 100 rolls without SSR+ → force SSR

const RARITY_ORDER: Rarity[] = ['N', 'R', 'SR', 'SSR', 'UR']

const LOOT_PITY_RULES: PityRule[] = [
  { tier: 'SR', atRolls: PITY_SR_THRESHOLD },
  { tier: 'SSR', atRolls: PITY_SSR_THRESHOLD },
]

function buildLootConfig(weights: Record<Rarity, number>): GachaConfig {
  const tiers: GachaTier[] = RARITY_ORDER.map((id) => ({ id, weight: weights[id] ?? 0 }))
  return { tiers, pityRules: LOOT_PITY_RULES }
}

function lootStatsToGacha(stats: LootStats): GachaStats {
  return {
    totalRolls: stats.totalRolls,
    rollsSinceLast: {
      SR: stats.rollsSinceLastSR,
      SSR: stats.rollsSinceLastSSR,
    },
  }
}

function gachaStatsToLoot(s: GachaStats): LootStats {
  return {
    totalRolls: s.totalRolls,
    rollsSinceLastSR: s.rollsSinceLast.SR ?? 0,
    rollsSinceLastSSR: s.rollsSinceLast.SSR ?? 0,
  }
}

/**
 * Sample a rarity bucket with optional pity override.
 * Returns the selected rarity and whether pity fired.
 */
export function rollRarity(
  stats: LootStats,
  weights: Record<Rarity, number> = DEFAULT_RARITY_WEIGHTS,
  rng: () => number = Math.random,
): { rarity: Rarity; wasPity: boolean } {
  const result = rollGacha(buildLootConfig(weights), lootStatsToGacha(stats), rng)
  return { rarity: result.tier as Rarity, wasPity: result.wasPity }
}

/** Uniform pick from items that match the rolled rarity. Cosmetic items are always excluded from gacha. */
export function pickItemByRarity(
  catalog: Item[],
  rarity: Rarity,
  rng: () => number = Math.random,
): Item | undefined {
  const pool = catalog.filter((i) => !i.isCosmetic && i.rarity === rarity)
  if (pool.length === 0) {
    const idx = RARITY_ORDER.indexOf(rarity)
    for (let i = idx - 1; i >= 0; i--) {
      const fallback = catalog.filter((it) => !it.isCosmetic && it.rarity === RARITY_ORDER[i])
      if (fallback.length > 0) return fallback[Math.floor(rng() * fallback.length)]
    }
    return undefined
  }
  return pool[Math.floor(rng() * pool.length)]
}

export interface RollResult {
  item: Item
  rarity: Rarity
  wasPity: boolean
  newStats: LootStats
}

/**
 * One full roll: pick rarity (with pity), then pick an item, then update pity counters.
 * Pure function — caller persists newStats + ItemInstance + Drop.
 */
export function rollLoot(
  catalog: Item[],
  stats: LootStats,
  opts?: {
    weights?: Record<Rarity, number>
    rng?: () => number
  },
): RollResult | undefined {
  const weights = opts?.weights ?? DEFAULT_RARITY_WEIGHTS
  const rng = opts?.rng ?? Math.random
  const gResult = rollGacha(buildLootConfig(weights), lootStatsToGacha(stats), rng)
  const rarity = gResult.tier as Rarity
  const item = pickItemByRarity(catalog, rarity, rng)
  if (!item) return undefined
  return {
    item,
    rarity,
    wasPity: gResult.wasPity,
    newStats: gachaStatsToLoot(gResult.newStats),
  }
}

/**
 * Build an ItemInstance + Drop record from a RollResult.
 * Caller wires them into the DB.
 */
export function instanceFromRoll(
  result: RollResult,
  source: Drop['source'],
  now: number = Date.now(),
  idFn: () => string = randomId,
): { instance: ItemInstance; drop: Drop } {
  const id = idFn()
  return {
    instance: { id, itemId: result.item.id, obtainedAt: now, locked: false },
    drop: {
      id: idFn(),
      ts: now,
      source,
      rarity: result.rarity,
      itemId: result.item.id,
      wasPity: result.wasPity,
    },
  }
}

/** crypto.randomUUID with a Math.random fallback for older runtimes. Safe for
 *  client-side game IDs; do NOT use where cryptographic uniqueness matters. */
export function randomId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

export const initialLootStats: LootStats = {
  rollsSinceLastSR: 0,
  rollsSinceLastSSR: 0,
  totalRolls: 0,
}
