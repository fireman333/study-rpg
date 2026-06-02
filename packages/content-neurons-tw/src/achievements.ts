/**
 * Achievement catalog for neurons-mode.
 *
 * 7 categories × 4 tiers (P1 鑽石 / P2 金 / P3 銀 / P4 銅) per design.md.
 * 30 entries: 4 study + 5 quiz + 5 variant + 4 synapse + 4 mastery + 4 fortune
 * + 4 hidden.
 *
 * Authoring rules (per neurons-achievements spec):
 * - Every P1 entry MUST set `composite: true` (validator rejects otherwise)
 * - Non-P1 entries MUST NOT set `composite: true` (validator rejects)
 * - Each P1 entry header comment names the 2 composite dimensions
 * - Predicates are pure functions of (player, stats)
 *
 * Reward distribution:
 * - Default: `{kind: 'leaderboard'}` — every unlock contributes to badges_csv
 * - P1 + selected high-impact P2: `{kind: 'title', title: '<flavour>'}`
 *
 * Borrowed pattern from 二階 `achievement-system` per `neurons-mode` Req 5.
 * Semantic mappings: doctor → variant, hospital → synapse, subject → mastery.
 *
 * Capability spec: openspec/specs/neurons-achievements/spec.md
 */

import type {
  NeuronsAchievement,
  NeuronsAchievementStats,
  NeuronsPlayerSnapshot,
} from './achievement-types'

// ─── Helper predicates ──────────────────────────────────────────────────────

const studyMin = (m: number) => (_p: NeuronsPlayerSnapshot, s: NeuronsAchievementStats) =>
  s.totalStudyMinutes >= m

const correctAtLeast = (n: number) => (_p: NeuronsPlayerSnapshot, s: NeuronsAchievementStats) =>
  s.totalQuestionsCorrect >= n

const streakAtLeast = (n: number) => (_p: NeuronsPlayerSnapshot, s: NeuronsAchievementStats) =>
  s.maxQuizCorrectStreak >= n

const variantsAtLeast = (n: number) => (_p: NeuronsPlayerSnapshot, s: NeuronsAchievementStats) =>
  s.variantCount >= n

const synapseFormedAtLeast = (n: number) =>
  (_p: NeuronsPlayerSnapshot, s: NeuronsAchievementStats) => s.synapseFormedCount >= n

const synapseStrongAtLeast = (n: number) =>
  (_p: NeuronsPlayerSnapshot, s: NeuronsAchievementStats) => s.synapseStrongCount >= n

const familiesAt = (
  tier: 'P5' | 'P4' | 'P3' | 'P2' | 'P1',
  n: number,
) => (_p: NeuronsPlayerSnapshot, s: NeuronsAchievementStats) => {
  const key = {
    P5: 'familiesAtP5OrBetter',
    P4: 'familiesAtP4OrBetter',
    P3: 'familiesAtP3OrBetter',
    P2: 'familiesAtP2OrBetter',
    P1: 'familiesAtP1',
  }[tier] as keyof NeuronsAchievementStats
  return (s[key] as number) >= n
}

const naturalP1AtLeast = (n: number) =>
  (_p: NeuronsPlayerSnapshot, s: NeuronsAchievementStats) => s.naturalP1VariantCount >= n

// ─── Catalog ────────────────────────────────────────────────────────────────

export const NEURONS_ACHIEVEMENTS: readonly NeuronsAchievement[] = [
  // ━━━ STUDY (4) ━━━
  // total_study_min IS wired: reading-timer.ts accrues meta['totalStudyMinutes']
  // and buildAchievementStats() (achievement.ts) reads it into stats, so these
  // predicates evaluate against live accrued reading minutes.
  {
    id: 'study-warmup',
    name: '初次唸書',
    description: '累積唸書 10 分鐘 — 第一支神經元甦醒。',
    tier: 'P4',
    category: 'study',
    hidden: false,
    predicate: studyMin(10),
    reward: { kind: 'leaderboard' },
  },
  {
    id: 'study-hours-5',
    name: '穩定累積',
    description: '累積唸書 5 小時 — 連線開始浮現。',
    tier: 'P3',
    category: 'study',
    hidden: false,
    predicate: studyMin(300),
    reward: { kind: 'leaderboard' },
  },
  {
    id: 'study-hours-20',
    name: '深度沉浸',
    description: '累積唸書 20 小時 — neuron 已穩定 firing。',
    tier: 'P2',
    category: 'study',
    hidden: false,
    predicate: studyMin(1200),
    reward: { kind: 'leaderboard' },
  },
  {
    // P1 composite: 量 (50 hr) × 持續 (14-day streak proxied via maxQuizCorrectStreak ≥ 50)
    // Note: dogfood-only proxy — true daily-login streak counter is deferred
    // to a future change. For now use quiz streak as a continuity signal.
    id: 'study-marathon',
    name: '神經馬拉松',
    description: '累積 50 小時唸書 且 持續維持高頻刺激（最高連續答對 ≥ 50）。',
    tier: 'P1',
    category: 'study',
    hidden: false,
    predicate: (p, s) => studyMin(3000)(p, s) && streakAtLeast(50)(p, s),
    reward: { kind: 'title', title: '神經馬拉松者' },
    composite: true,
  },

  // ━━━ QUIZ (5) ━━━
  {
    id: 'quiz-first-50',
    name: '初試啼聲',
    description: '答對 50 題 — 第一波 AP 已點燃。',
    tier: 'P4',
    category: 'quiz',
    hidden: false,
    predicate: correctAtLeast(50),
    reward: { kind: 'leaderboard' },
  },
  {
    id: 'quiz-correct-300',
    name: '穩定共振',
    description: '答對 300 題 — neuron 間共振穩定。',
    tier: 'P3',
    category: 'quiz',
    hidden: false,
    predicate: correctAtLeast(300),
    reward: { kind: 'leaderboard' },
  },
  {
    id: 'quiz-streak-10',
    name: '連發共振',
    description: '連續答對 10 題 — 突觸傳遞無延遲。',
    tier: 'P2',
    category: 'quiz',
    hidden: false,
    predicate: streakAtLeast(10),
    reward: { kind: 'leaderboard' },
  },
  {
    id: 'quiz-correct-1000',
    name: '千題達人',
    description: '答對 1000 題 — connectome 全面活絡。',
    tier: 'P2',
    category: 'quiz',
    hidden: false,
    predicate: correctAtLeast(1000),
    reward: { kind: 'leaderboard' },
  },
  {
    // P1 composite: 量 (3000 correct) × 質 (overallAccuracy ≥ 0.80)
    id: 'quiz-master-3000',
    name: '答題大師',
    description: '答對 3000 題 且 整體準確率 ≥ 80% — 神經迴路臻於頂峰。',
    tier: 'P1',
    category: 'quiz',
    hidden: false,
    predicate: (_p, s) => s.totalQuestionsCorrect >= 3000 && s.overallAccuracy >= 0.8,
    reward: { kind: 'title', title: '答題大師' },
    composite: true,
  },

  // ━━━ VARIANT (5) ━━━
  {
    id: 'variant-first-pull',
    name: '初次共振',
    description: '收集第 1 個 variant — 第一個 neuron 變體誕生。',
    tier: 'P4',
    category: 'variant',
    hidden: false,
    predicate: variantsAtLeast(1),
    reward: { kind: 'leaderboard' },
  },
  {
    id: 'variant-fifteen',
    name: '小型集落',
    description: '收集 20 個 variants — colony 開始成形。',
    tier: 'P3',
    category: 'variant',
    hidden: false,
    predicate: variantsAtLeast(20),
    reward: { kind: 'leaderboard' },
  },
  {
    id: 'variant-thirty',
    name: '群落擴張',
    description: '收集 40 個 variants — colony 持續壯大。',
    tier: 'P2',
    category: 'variant',
    hidden: false,
    predicate: variantsAtLeast(40),
    reward: { kind: 'leaderboard' },
  },
  {
    id: 'variant-fifty',
    name: '半壁江山',
    description: '收集 70 個 variants — 典藏過半。',
    tier: 'P2',
    category: 'variant',
    hidden: false,
    predicate: variantsAtLeast(70),
    reward: { kind: 'leaderboard' },
  },
  {
    // P1 composite: 量 (90 distinct variants) × 廣質 (natural P1 apex across ≥ 3
    // families). Genuine multi-dimension — at 90 distinct the breadth gate is NOT
    // implied (you can amass 90 yet hold natural P1 apexes in < 3 families), so
    // this satisfies the anti-grind P1 rule without a degenerate full-dex AND.
    id: 'variant-grand-collector',
    name: '萬神殿建構者',
    description: '收集 90 個 variants 且 在 ≥ 3 個家族擁有自然 P1 apex — connectome 萬神殿就位。',
    tier: 'P1',
    category: 'variant',
    hidden: false,
    predicate: (_p, s) => s.variantCount >= 90 && s.naturalP1DistinctFamilies >= 3,
    reward: { kind: 'title', title: '萬神殿建構者' },
    composite: true,
  },

  // ━━━ SYNAPSE (4) ━━━
  {
    id: 'synapse-first-formed',
    name: '初次連線',
    description: '形成第 1 個 synapse — neurons that fire together, wire together。',
    tier: 'P4',
    category: 'synapse',
    hidden: false,
    predicate: synapseFormedAtLeast(1),
    reward: { kind: 'leaderboard' },
  },
  {
    id: 'synapse-five-formed',
    name: '初級網絡',
    description: '形成 5 個 synapses — 跨家族迴路成形。',
    tier: 'P3',
    category: 'synapse',
    hidden: false,
    predicate: synapseFormedAtLeast(5),
    reward: { kind: 'leaderboard' },
  },
  {
    id: 'synapse-three-strong',
    name: '深層強連結',
    description: '3 個 synapses 進入 strong 狀態 — LTP 穩固。',
    tier: 'P2',
    category: 'synapse',
    hidden: false,
    predicate: synapseStrongAtLeast(3),
    reward: { kind: 'leaderboard' },
  },
  {
    // P1 composite: 量 (10 strong synapses) × 廣度 (live same-day ≥ 4 distinct families fired)
    // Note: uses live `currentlyFiredFamilies` count (semantically "right now ≥ 4 families
    // crossed N=5 fired-threshold on today's local-TZ calendar day"). Player must hit both
    // conditions simultaneously on a single day. Daily reset midnight clears firedToday flags.
    id: 'synapse-broadcast',
    name: '全網共振者',
    description: '10 個 strong synapses 且 當日激發 ≥ 4 個家族 — connectome 大開大合。',
    tier: 'P1',
    category: 'synapse',
    hidden: false,
    predicate: (_p, s) => s.synapseStrongCount >= 10 && s.currentlyFiredFamilies >= 4,
    reward: { kind: 'title', title: '全網共振者' },
    composite: true,
  },

  // ━━━ MASTERY (4) ━━━
  {
    id: 'mastery-first-novice',
    name: '初窺門徑',
    description: '1 個家族達到 P5 Novice — 第一份學科入門。',
    tier: 'P4',
    category: 'mastery',
    hidden: false,
    predicate: familiesAt('P5', 1),
    reward: { kind: 'leaderboard' },
  },
  {
    id: 'mastery-three-familiar',
    name: '多面學習',
    description: '3 個家族達到 P4 Familiar — 廣度開始浮現。',
    tier: 'P3',
    category: 'mastery',
    hidden: false,
    predicate: familiesAt('P4', 3),
    reward: { kind: 'leaderboard' },
  },
  {
    id: 'mastery-five-proficient',
    name: '半數熟練',
    description: '5 個家族達到 P3 Proficient — 全 11 家族近半熟練。',
    tier: 'P2',
    category: 'mastery',
    hidden: false,
    predicate: familiesAt('P3', 5),
    reward: { kind: 'leaderboard' },
  },
  {
    // P1 composite: 廣 (3 families ≥ P2 Expert) × 高度 (1 family P1 Master)
    id: 'mastery-grandmaster',
    name: '神經學大師',
    description: '3 個家族達到 P2 Expert 且 1 個家族達到 P1 Master — 跨域精深兼備。',
    tier: 'P1',
    category: 'mastery',
    hidden: false,
    predicate: (_p, s) => s.familiesAtP2OrBetter >= 3 && s.familiesAtP1 >= 1,
    reward: { kind: 'title', title: '神經學大師' },
    composite: true,
  },

  // ━━━ FORTUNE (4) ━━━
  {
    id: 'fortune-first-pity-4',
    name: '保底初遇',
    description: '第 1 次 slot 4 保底觸發 — 神明出手。',
    tier: 'P4',
    category: 'fortune',
    hidden: false,
    predicate: (_p, s) => s.variantPityFloorCount >= 1,
    reward: { kind: 'leaderboard' },
  },
  {
    id: 'fortune-first-pity-5',
    name: '雙重保底',
    description: '第 1 次 slot 5 保底觸發 — 兩道保險網都啟動過。',
    tier: 'P3',
    category: 'fortune',
    hidden: false,
    predicate: (_p, s) => s.variantPityFloorCount >= 2,
    reward: { kind: 'leaderboard' },
  },
  {
    id: 'fortune-natural-p1',
    name: '天命所歸',
    description: '自然滾出第 1 個 P1 variant（非保底）— 真歐皇。',
    tier: 'P2',
    category: 'fortune',
    hidden: false,
    predicate: naturalP1AtLeast(1),
    reward: { kind: 'leaderboard' },
  },
  {
    // P1 composite: 量 (5 natural P1s) × 廣度 (跨 ≥ 3 distinct families)
    id: 'fortune-prophet',
    name: '神經學歐皇',
    description: '5 個自然 P1 variants 且 跨 ≥ 3 個家族 — RNG 之神在你這邊。',
    tier: 'P1',
    category: 'fortune',
    hidden: false,
    predicate: (_p, s) => s.naturalP1VariantCount >= 5 && s.naturalP1DistinctFamilies >= 3,
    reward: { kind: 'title', title: '神經學歐皇' },
    composite: true,
  },

  // ━━━ HIDDEN (4) ━━━
  {
    id: 'hidden-first-day-blitz',
    name: '首日衝刺',
    description: '首日就答對 10 題 — 開局氣勢驚人。',
    tier: 'P4',
    category: 'hidden',
    hidden: true,
    predicate: (_p, s) => s.isFirstSaveDay && s.todayCorrectCount >= 10,
    reward: { kind: 'leaderboard' },
  },
  {
    id: 'hidden-synapse-weaver',
    name: '網絡編織師',
    description: '形成 ≥ 5 個 synapses 且 至少 1 個達 strong — connectome 既廣且深。',
    tier: 'P3',
    category: 'hidden',
    hidden: true,
    predicate: (_p, s) => s.synapseFormedCount >= 5 && s.synapseStrongCount >= 1,
    reward: { kind: 'leaderboard' },
  },
  {
    id: 'hidden-rarity-diversity',
    name: '稀有度俱全',
    description: '同時持有 P1 / P2 / P3 / P4 / P5 各 ≥ 1 個 variant — 全光譜共存。',
    tier: 'P2',
    category: 'hidden',
    hidden: true,
    predicate: (_p, s) => s.variantRarityDiversity >= 5,
    reward: { kind: 'leaderboard' },
  },
  {
    // P1 composite: 廣 (全 11 family) × 高度 (各至少 P3 Proficient)
    id: 'hidden-connectome-saint',
    name: '完美聖徒',
    description: '全 11 個家族都達到 ≥ P3 Proficient — 真正的 connectome 聖徒。',
    tier: 'P1',
    category: 'hidden',
    hidden: true,
    predicate: (_p, s) => s.familiesAtP3OrBetter >= 11,
    reward: { kind: 'title', title: '完美聖徒' },
    composite: true,
  },
] as const

/** Catalog summary for build-time sanity check (count assertions). */
export const NEURONS_ACHIEVEMENTS_STATS = {
  total: NEURONS_ACHIEVEMENTS.length,
  byCategory: NEURONS_ACHIEVEMENTS.reduce(
    (acc, a) => {
      acc[a.category] = (acc[a.category] ?? 0) + 1
      return acc
    },
    {} as Record<string, number>,
  ),
  byTier: NEURONS_ACHIEVEMENTS.reduce(
    (acc, a) => {
      acc[a.tier] = (acc[a.tier] ?? 0) + 1
      return acc
    },
    {} as Record<string, number>,
  ),
} as const
