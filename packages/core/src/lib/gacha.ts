/**
 * Generic gacha sampling with pity. Tier ids are arbitrary strings supplied by
 * the caller; the loot system (`./loot.ts`) and the recruitment-gacha content
 * pack both build on this primitive.
 *
 * Tier ordering convention: `config.tiers[0]` is the lowest rarity (highest
 * weight); the last entry is the highest rarity. Pity comparisons rely on this
 * ordering, so callers MUST preserve it.
 */

export interface GachaTier {
  id: string
  weight: number
}

export interface PityRule {
  /** The tier this rule both tracks and forces. After `atRolls` consecutive
   *  rolls without a result at this tier or higher, the next roll is forced to
   *  exactly this tier. */
  tier: string
  atRolls: number
}

export interface GachaConfig {
  /** Ordered low rarity → high rarity. */
  tiers: GachaTier[]
  pityRules: PityRule[]
}

export interface GachaStats {
  totalRolls: number
  /** Rolls since the last result at-or-above each tracked tier. Keyed by tier id. */
  rollsSinceLast: Record<string, number>
}

export interface GachaRollResult {
  tier: string
  wasPity: boolean
  newStats: GachaStats
}

function tierRank(tierId: string, tiers: GachaTier[]): number {
  const idx = tiers.findIndex((t) => t.id === tierId)
  if (idx < 0) throw new Error(`Unknown gacha tier id: ${tierId}`)
  return idx
}

function tierAtOrAbove(resultTier: string, thresholdTier: string, tiers: GachaTier[]): boolean {
  return tierRank(resultTier, tiers) >= tierRank(thresholdTier, tiers)
}

export function rollGacha(
  config: GachaConfig,
  stats: GachaStats,
  rng: () => number = Math.random,
): GachaRollResult {
  const rulesByForceDesc = [...config.pityRules].sort(
    (a, b) => tierRank(b.tier, config.tiers) - tierRank(a.tier, config.tiers),
  )
  let pitiedTier: string | undefined
  for (const rule of rulesByForceDesc) {
    const counter = stats.rollsSinceLast[rule.tier] ?? 0
    if (counter >= rule.atRolls) {
      pitiedTier = rule.tier
      break
    }
  }

  let resultTier: string
  if (pitiedTier !== undefined) {
    resultTier = pitiedTier
  } else {
    const totalWeight = config.tiers.reduce((s, t) => s + t.weight, 0)
    const target = rng() * totalWeight
    let acc = 0
    let picked: string | undefined
    for (const t of config.tiers) {
      acc += t.weight
      if (target < acc) {
        picked = t.id
        break
      }
    }
    resultTier = picked ?? config.tiers[0].id
  }

  const trackedTiers = new Set<string>([
    ...Object.keys(stats.rollsSinceLast),
    ...config.pityRules.map((r) => r.tier),
  ])
  const newRollsSinceLast: Record<string, number> = {}
  for (const tierId of trackedTiers) {
    newRollsSinceLast[tierId] = tierAtOrAbove(resultTier, tierId, config.tiers)
      ? 0
      : (stats.rollsSinceLast[tierId] ?? 0) + 1
  }

  return {
    tier: resultTier,
    wasPity: pitiedTier !== undefined,
    newStats: {
      totalRolls: stats.totalRolls + 1,
      rollsSinceLast: newRollsSinceLast,
    },
  }
}

export function initialGachaStats(config: GachaConfig): GachaStats {
  const rollsSinceLast: Record<string, number> = {}
  for (const rule of config.pityRules) {
    rollsSinceLast[rule.tier] = 0
  }
  return { totalRolls: 0, rollsSinceLast }
}
