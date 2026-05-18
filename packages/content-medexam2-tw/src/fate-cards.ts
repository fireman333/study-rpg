/**
 * Fate cards (命運卡) for the 二階 medexam2 content pack.
 *
 * Locked by `redesign-hospital-economy` (2026-05-17). Endgame reputation sink
 * — 4 card-pack tiers consume reputation in exchange for rewards (招募券 /
 * 進修保證券 / facility / throughput buff) or rare bad-luck penalties.
 *
 * Pity at 3 per pack-tier per design D6: 3 consecutive bad luck → next draw
 * forces a reward. Counter is independent per pack tier (legendary has 0%
 * bad luck → no counter).
 *
 * `drawFateCard` is a PURE function: it returns the desired draw outcome
 * plus the NEW pity counter value; caller persists the IDB write.
 */

import type { Rarity } from './recruitment'

export type FateCardTier = 'common' | 'rare' | 'epic' | 'legendary'

export const FATE_CARD_TIER_ORDER: ReadonlyArray<FateCardTier> = Object.freeze([
  'common',
  'rare',
  'epic',
  'legendary',
])

export const FATE_CARD_LABELS: Record<FateCardTier, string> = {
  common: '普通命運',
  rare: '稀有命運',
  epic: '史詩命運',
  legendary: '傳奇命運',
}

/** Reputation cost per draw. */
export const FATE_CARD_COSTS: Record<FateCardTier, number> = {
  common: 1_000,
  rare: 10_000,
  epic: 100_000,
  legendary: 1_000_000,
}

/** Bad-luck probability per draw. Legendary has 0% (no bad luck possible). */
export const FATE_CARD_BAD_LUCK_RATES: Record<FateCardTier, number> = {
  common: 0.05,
  rare: 0.05,
  epic: 0.05,
  legendary: 0,
}

/** Reputation deducted on a bad-luck result (on top of the draw cost). */
export const FATE_CARD_BAD_LUCK_PENALTIES: Record<FateCardTier, number> = {
  common: 1_000,
  rare: 10_000,
  epic: 50_000,
  legendary: 0,
}

/**
 * Pity threshold per design D6: after 3 consecutive bad-luck draws at a given
 * tier, the next draw skips the bad-luck roll and forces a reward. Pity is
 * independent per pack tier.
 */
export const FATE_CARD_PITY_THRESHOLD = 3

/** Each reward pool item — caller maps `key` onto concrete game effects. */
export interface FateCardReward {
  /** Stable id; persisted to fateCardHistory.rewardKey. */
  key: string
  /** Display label (Traditional Chinese). */
  label: string
}

/**
 * Reward pools per pack tier. Caller (TrainingPage / app) is responsible for
 * mapping `key` → concrete game effect (granting tickets, modifying facility,
 * etc.). Pool selection is uniform — equal probability across entries.
 */
export const FATE_CARD_POOLS: Record<FateCardTier, ReadonlyArray<FateCardReward>> = {
  common: Object.freeze([
    { key: 'recruitment-ticket-x3', label: '招募券 ×3' },
    { key: 'minor-revenue-5k', label: '營收 +5,000' },
    { key: 'event-immunity-1', label: '事件免疫卡 ×1' },
  ]),
  rare: Object.freeze([
    { key: 'recruitment-ticket-x10', label: '招募券 ×10' },
    { key: 'training-guarantee-x1', label: '進修保證券 ×1' },
    { key: 'event-positive-trigger', label: '事件正向觸發券 ×1' },
  ]),
  epic: Object.freeze([
    { key: 'targeted-p3-ticket', label: '指定科 P3+ 招募券' },
    { key: 'facility-plus-0.5', label: '隨機 facility +0.5（永久）' },
    { key: 'salary-waiver-1-week', label: '1 週薪水免除' },
  ]),
  legendary: Object.freeze([
    { key: 'targeted-p2-ticket', label: '指定科 P2 招募券' },
    { key: 'facility-all-plus-1', label: '全院 facility +1（永久）' },
    { key: 'throughput-x2-1-week', label: '1 週 throughput ×2' },
  ]),
}

/**
 * Suggested rarity hint for the "targeted-pN-ticket" rewards above — not
 * enforced here (caller decides ticket UX), but kept as a stable mapping so
 * docs/UI can reference it.
 */
export const FATE_CARD_TARGETED_TICKET_RARITY: Readonly<Record<string, Rarity>> = Object.freeze({
  'targeted-p3-ticket': 'P3',
  'targeted-p2-ticket': 'P2',
})

/**
 * Max reroll attempts when a targeted ticket consume rolls below the rarity
 * floor. After this many consecutive sub-floor rolls, the consume forces a
 * floor-tier doctor by sampling from the banner's pool at the floor rarity
 * directly (no further random rarity choice).
 *
 * Set to 5 as a balance between (a) honoring the natural weight table for
 * lucky players who roll above floor early, and (b) ensuring the floor
 * guarantee actually fires within a bounded number of attempts.
 *
 * For epic targeted tickets (P3 floor), the per-roll P3+ probability is ~42%
 * given the standard weight table, so 5 attempts gives ~93.5% chance of
 * accepting a natural roll. For legendary (P2 floor) the per-roll P2+
 * probability is ~12%, giving ~47% natural acceptance — the remaining ~53%
 * routes to force-floor, which is the intended P2 guarantee.
 */
export const TARGETED_REROLL_CAP = 5

export type FateCardDrawResult =
  | {
      kind: 'reward'
      tier: FateCardTier
      reward: FateCardReward
      costPaid: number
      newPityCounter: 0
      pityTriggered: boolean
    }
  | {
      kind: 'badLuck'
      tier: FateCardTier
      costPaid: number
      penaltyAmount: number
      newPityCounter: number
    }
  | {
      kind: 'aborted'
      tier: FateCardTier
      reason: 'insufficient-reputation'
      requiredReputation: number
    }

export interface DrawFateCardOptions {
  currentReputation: number
}

/**
 * Resolve a single fate-card draw at the given pack tier.
 *
 * Pure: does not touch persistence; caller writes reputation deduction +
 * appends fateCardHistory row + updates the per-tier consecutiveBadLuckCount
 * to `newPityCounter` (on non-aborted results).
 *
 * `consecutiveBadLuck` is the per-tier counter BEFORE this draw. Pity logic:
 *   - if counter ≥ FATE_CARD_PITY_THRESHOLD → skip bad-luck roll, force reward
 *   - else roll badLuck-vs-reward at FATE_CARD_BAD_LUCK_RATES[tier]
 *   - bad luck → counter += 1
 *   - reward (incl. pity-forced) → counter = 0
 */
export function drawFateCard(
  tier: FateCardTier,
  rng: () => number,
  consecutiveBadLuck: number,
  opts: DrawFateCardOptions,
): FateCardDrawResult {
  const cost = FATE_CARD_COSTS[tier]
  if (opts.currentReputation < cost) {
    return {
      kind: 'aborted',
      tier,
      reason: 'insufficient-reputation',
      requiredReputation: cost,
    }
  }

  const pityTriggered = consecutiveBadLuck >= FATE_CARD_PITY_THRESHOLD
  const badLuckRate = FATE_CARD_BAD_LUCK_RATES[tier]
  const rolledBadLuck = !pityTriggered && badLuckRate > 0 && rng() < badLuckRate

  if (rolledBadLuck) {
    return {
      kind: 'badLuck',
      tier,
      costPaid: cost,
      penaltyAmount: FATE_CARD_BAD_LUCK_PENALTIES[tier],
      newPityCounter: consecutiveBadLuck + 1,
    }
  }

  // Reward — uniform pick across the pool.
  const pool = FATE_CARD_POOLS[tier]
  const idx = Math.min(Math.floor(rng() * pool.length), pool.length - 1)
  return {
    kind: 'reward',
    tier,
    reward: pool[idx],
    costPaid: cost,
    newPityCounter: 0,
    pityTriggered,
  }
}
