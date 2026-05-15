export * from './types'
export { getDB, resetDB, StudyRpgDB } from './lib/db'
export {
  rollRarity,
  pickItemByRarity,
  rollLoot,
  instanceFromRoll,
  initialLootStats,
  randomId,
  DEFAULT_RARITY_WEIGHTS,
  PITY_SR_THRESHOLD,
  PITY_SSR_THRESHOLD,
  type RollResult,
} from './lib/loot'
export {
  rollGacha,
  initialGachaStats,
  type GachaTier,
  type PityRule,
  type GachaConfig,
  type GachaStats,
  type GachaRollResult,
} from './lib/gacha'
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
