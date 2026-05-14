import type { Item, ItemInstance, LootStats, Rarity, Drop } from '../types'

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

function rarityAtOrAbove(r: Rarity, threshold: Rarity): boolean {
  return RARITY_ORDER.indexOf(r) >= RARITY_ORDER.indexOf(threshold)
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
  if (stats.rollsSinceLastSSR >= PITY_SSR_THRESHOLD) {
    return { rarity: 'SSR', wasPity: true }
  }
  if (stats.rollsSinceLastSR >= PITY_SR_THRESHOLD) {
    return { rarity: 'SR', wasPity: true }
  }
  const total = RARITY_ORDER.reduce((s, r) => s + (weights[r] || 0), 0)
  const target = rng() * total
  let acc = 0
  for (const r of RARITY_ORDER) {
    acc += weights[r] || 0
    if (target < acc) return { rarity: r, wasPity: false }
  }
  return { rarity: 'N', wasPity: false }
}

/** Uniform pick from items that match the rolled rarity. */
export function pickItemByRarity(
  catalog: Item[],
  rarity: Rarity,
  rng: () => number = Math.random,
): Item | undefined {
  const pool = catalog.filter((i) => i.rarity === rarity)
  if (pool.length === 0) {
    // Fallback: degrade to the next-lowest rarity available
    const idx = RARITY_ORDER.indexOf(rarity)
    for (let i = idx - 1; i >= 0; i--) {
      const fallback = catalog.filter((it) => it.rarity === RARITY_ORDER[i])
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
  const { rarity, wasPity } = rollRarity(stats, opts?.weights, opts?.rng)
  const item = pickItemByRarity(catalog, rarity, opts?.rng)
  if (!item) return undefined

  const newStats: LootStats = {
    totalRolls: stats.totalRolls + 1,
    rollsSinceLastSR: rarityAtOrAbove(rarity, 'SR') ? 0 : stats.rollsSinceLastSR + 1,
    rollsSinceLastSSR: rarityAtOrAbove(rarity, 'SSR') ? 0 : stats.rollsSinceLastSSR + 1,
  }
  return { item, rarity, wasPity, newStats }
}

/**
 * Build an ItemInstance + Drop record from a RollResult.
 * Caller wires them into the DB.
 */
export function instanceFromRoll(
  result: RollResult,
  source: Drop['source'],
  now: number = Date.now(),
  idFn: () => string = defaultId,
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

function defaultId(): string {
  // crypto.randomUUID is available in Node 19+ and modern browsers
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  // Fallback (still random enough for client-side game IDs)
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

export const initialLootStats: LootStats = {
  rollsSinceLastSR: 0,
  rollsSinceLastSSR: 0,
  totalRolls: 0,
}
