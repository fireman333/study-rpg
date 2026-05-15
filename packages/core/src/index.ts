export * from './types'
export { getDB, resetDB, StudyRpgDB } from './lib/db'
export {
  rollRarity,
  pickItemByRarity,
  rollLoot,
  instanceFromRoll,
  initialLootStats,
  DEFAULT_RARITY_WEIGHTS,
  PITY_SR_THRESHOLD,
  PITY_SSR_THRESHOLD,
  type RollResult,
} from './lib/loot'
export {
  xpToNext,
  xpAtLevel,
  levelFromTotalXp,
  applyXp,
  addStat,
  newPlayer,
  REWARD,
  FAST_ANSWER_THRESHOLD_MS,
  type XpGainResult,
} from './lib/xp'
export {
  STREAK_CHECK_IN_THRESHOLD,
  STREAK_MULTIPLIER_CAP_DAYS,
  getTaipeiToday,
  getTaipeiYesterday,
  getStreakMultiplier,
  applyCheckIn,
  ensureTodayProgress,
  incrementReadingMinutes,
  incrementQuestionsAnswered,
  hasMetCheckInThreshold,
} from './lib/streak'
export { newCard, reviewCard, dueCards } from './lib/srs'
export {
  sampleMiniBoss,
  passed,
  badgeId,
  BOSS_PASS_THRESHOLD,
  MINI_BOSS_QUESTIONS,
  MINI_BOSS_UNLOCK_SUBJECT_XP,
  MINI_BOSS_DURATION_MS,
  ANNUAL_BOSS_DURATION_MS,
} from './lib/boss'
export {
  unlockedCount,
  detectUnlocks,
  resolveSkillTree,
  thresholdForIndex,
  ENGINE_FALLBACK_SKILL_TREE,
  SKILL_BRANCH_ORDER,
  SKILL_TREE_NODES_PER_BRANCH,
  SKILL_TREE_THRESHOLD_STEP,
  type SkillNode,
  type SkillBranch,
  type SkillBranchStatKey,
  type SkillTreeContent,
} from './lib/skillTree'
