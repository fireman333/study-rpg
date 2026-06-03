/**
 * Achievement system types for neurons-mode.
 *
 * Locally declared (not imported from @study-rpg/core) because the core
 * `AchievementStats` / `AchievementCategory` / `AchievementReward` types
 * are 二階-specific (hospital tier / doctors / subject mastery indexed by
 * SubjectId) and a structural mismatch with neurons stats shape (variants /
 * synapses / family mastery).
 *
 * Per `neurons-mode` Req 4 (data isolation) and Req 5 (independent capability
 * spec): neurons re-declares these types and re-implements the 5-line
 * `checkAchievementUnlocks` diff function locally. Apply log entry in
 * `add-neurons-achievements/tasks.md` §1.2 documents this decision.
 *
 * Capability spec: openspec/specs/neurons-achievements/spec.md
 */

/** 4 tiers aligned with PSN Trophy (鑽石 / 金 / 銀 / 銅). */
export type NeuronsAchievementTier = 'P1' | 'P2' | 'P3' | 'P4'

/** 7 categories — neurons-specific. */
export type NeuronsAchievementCategory =
  | 'study'
  | 'quiz'
  | 'variant'
  | 'synapse'
  | 'mastery'
  | 'fortune'
  | 'hidden'

/** Stable tuple for iteration / validation. */
export const NEURONS_ACHIEVEMENT_CATEGORIES: readonly NeuronsAchievementCategory[] = [
  'study',
  'quiz',
  'variant',
  'synapse',
  'mastery',
  'fortune',
  'hidden',
] as const

/**
 * 2 reward channels. `cosmetic` / `equipment` / `ticket` / `currency` are
 * intentionally absent — TypeScript SHALL reject them per spec Req
 * "Reward dispatcher SHALL support exactly 2 channels".
 */
export type NeuronsAchievementReward =
  | { kind: 'leaderboard' } // implicit — every unlock contributes to badges_csv
  | { kind: 'title'; title: string } // explicit selectable display title

/**
 * Family mastery tier from neuron-family-mastery capability. P5 = Novice
 * (≥ 5 attempts) through P1 = Master (≥ 200 correct + ≥ 90% accuracy).
 */
export type FamilyMasteryTier = 'P1' | 'P2' | 'P3' | 'P4' | 'P5' | 'none'

/**
 * Stats reducer state passed to neurons achievement predicates. Permissive —
 * specific predicates only read what they need. Caller (apps/neurons-tw
 * `services/achievement.ts` orchestrator) assembles this from Dexie tables
 * (familyAccrual / synapses / familyMastery / neuronVariants / meta) at
 * the moment of evaluation.
 */
export interface NeuronsAchievementStats {
  /** Cumulative focused study minutes — 0 until reading-timer wires (see
   *  proposal note: study category predicates evaluate false today). */
  totalStudyMinutes: number

  /** Total quiz questions answered (correct + incorrect). */
  totalQuestionsAnswered: number
  /** Total quiz questions answered correctly. */
  totalQuestionsCorrect: number
  /** Overall accuracy ∈ [0, 1]; 0 if no questions answered. */
  overallAccuracy: number
  /** Current consecutive correct-answer streak. */
  currentQuizCorrectStreak: number
  /** Highest consecutive correct streak ever achieved (monotonic). */
  maxQuizCorrectStreak: number

  /** Total DISTINCT variants collected (open collection — the sole collection
   *  metric; no family-complete concept). */
  variantCount: number
  /** Number of P1 variants ever rolled NOT via pity floor (natural P1). */
  naturalP1VariantCount: number
  /** Number of variants flagged wasPityFloor=true (slot 4/5 entries). */
  variantPityFloorCount: number
  /** Distinct families holding ≥ 1 natural-P1 variant (for fortune capstone). */
  naturalP1DistinctFamilies: number
  /** Distinct rarities present in variant collection (for hidden rarity-diversity entry). */
  variantRarityDiversity: number

  /** Sum of AP across all families. */
  totalAP: number
  /** Highest single-family AP value. */
  maxFamilyAP: number

  /** Lifetime tier-promotes performed (add-neurons-dupe-fusion). 0 if never. */
  promoteCount: number

  /** Total synapses ever formed (count of rows in synapses table). */
  synapseFormedCount: number
  /** Synapses currently in 'strong' state. */
  synapseStrongCount: number
  /** Synapses currently in 'dormant' state. */
  synapseDormantCount: number
  /** Synapses currently in 'weak' state. */
  synapseWeakCount: number
  /** Count of families currently flagged firedToday (live; resets at midnight via daily reset job). */
  currentlyFiredFamilies: number

  /** Tier per family (P1..P5 / 'none' if insufficient data). */
  masteryTierByFamily: Record<string, FamilyMasteryTier>
  /** Count of families currently at ≥ given tier (helper, computed). */
  familiesAtP5OrBetter: number
  familiesAtP4OrBetter: number
  familiesAtP3OrBetter: number
  familiesAtP2OrBetter: number
  familiesAtP1: number

  /** True iff today's local date equals `meta['saveCreatedDate']` (for hidden first-day-blitz). */
  isFirstSaveDay: boolean
  /** Correct-answer count on today's local-TZ calendar day. Sum of `familyAccrual.sameDayCorrect`; resets at midnight via daily reset. */
  todayCorrectCount: number
}

/** Lightweight player snapshot — neurons-mode doesn't need a rich Player
 *  object for predicates since the catalog only reads from stats. Predicates
 *  receive this for parity with core API shape. */
export interface NeuronsPlayerSnapshot {
  /** Optional auth user id; predicates ignore. */
  userId?: string
}

/** Achievement catalog entry — declarative, predicate-driven. */
export interface NeuronsAchievement {
  /** Stable kebab-case unique id. Used as PK in `achievements` Dexie table + leaderboard CSV derivation. */
  id: string
  /** zh-TW display name (≤ 12 char). */
  name: string
  /** zh-TW 1–2 sentence flavour blurb. */
  description: string
  /** Difficulty tier — drives badge color cell + reveal UI (P1 → modal). */
  tier: NeuronsAchievementTier
  /** Category — drives badge sprite row in atlas. */
  category: NeuronsAchievementCategory
  /** When true: do NOT render anywhere in UI until unlocked. */
  hidden: boolean
  /** Pure predicate. Caller ensures stats is fresh at evaluation time. */
  predicate: (player: NeuronsPlayerSnapshot, stats: NeuronsAchievementStats) => boolean
  /** What the player gets on unlock. Routes to reward dispatcher. */
  reward: NeuronsAchievementReward
  /**
   * REQUIRED when `tier === 'P1'`: marks predicate as composite (≥ 2 of
   * 量/質/持續/廣度 ANDed). Build-time validator rejects P1 missing this.
   * MUST NOT be true for non-P1 entries.
   */
  composite?: boolean
}

/** tierRank: lower number = better tier (P1=1, P4=4). For max-tier-per-category derivation. */
export function tierRank(tier: NeuronsAchievementTier): number {
  return { P1: 1, P2: 2, P3: 3, P4: 4 }[tier]
}

/** Convenience: zh-TW tier display label. */
export const TIER_LABEL: Record<NeuronsAchievementTier, string> = {
  P1: '鑽石',
  P2: '金',
  P3: '銀',
  P4: '銅',
}

/** Convenience: zh-TW category display label. */
export const CATEGORY_LABEL: Record<NeuronsAchievementCategory, string> = {
  study: '學習',
  quiz: '答題',
  variant: '變體',
  synapse: '連線',
  mastery: '精通',
  fortune: '時運',
  hidden: '隱藏',
}
