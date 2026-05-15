/**
 * Cosmetic catalog for `theme-pixel-medical`.
 *
 * Each entry: id / display name / category / unlockCondition pure predicate /
 * unlockDescription / artKey (sprite map key).
 *
 * Sprite assets generated via codex `$imagegen` — GBA pixel art layer style,
 * 384×384 transparent PNG (or full-canvas for background).
 *
 * Spec: openspec/specs/cosmetic-system/spec.md
 */

import type { Cosmetic, Player } from '@study-rpg/core'

const lvl = (n: number) => (p: Player) => p.level >= n
const stat = (name: string, n: number) => (p: Player) => (p.stats[name] ?? 0) >= n
const streakAtLeast = (n: number) => (p: Player) => p.currentStreak >= n || p.longestStreak >= n
const hasBadge = (id: string) => (p: Player) => p.badges.includes(id)
const todayMinutes = (n: number) => (p: Player) => (p.todayProgress?.readingMinutes ?? 0) >= n

export const COSMETIC_CATALOG: readonly Cosmetic[] = [
  // ─── Head (4) ────────────────────────────────────────────────
  {
    id: 'medical-student-glasses',
    name: '醫學生眼鏡',
    category: 'head',
    unlockCondition: lvl(1),
    unlockDescription: '起始裝備',
    artKey: 'cosmetic-head-medical-student-glasses',
    rarity: 'N',
  },
  {
    id: 'knowledge-glasses',
    name: '博學眼鏡',
    category: 'head',
    unlockCondition: stat('knowledge', 50),
    unlockDescription: '知識力 ≥ 50 解鎖',
    artKey: 'cosmetic-head-knowledge-glasses',
    rarity: 'R',
  },
  {
    id: 'reflex-mirror',
    name: '反射檢查鏡',
    category: 'head',
    unlockCondition: stat('reflex', 30),
    unlockDescription: '反應 ≥ 30 解鎖',
    artKey: 'cosmetic-head-reflex-mirror',
    rarity: 'R',
  },
  {
    id: 'streak7-cap',
    name: '七連勝小帽',
    category: 'head',
    unlockCondition: streakAtLeast(7),
    unlockDescription: '連續 7 天 check-in 解鎖',
    artKey: 'cosmetic-head-streak7-cap',
    rarity: 'SR',
  },

  // ─── Body (4) ─────────────────────────────────────────────────
  {
    id: 'student-coat',
    name: '醫學生白袍',
    category: 'body',
    unlockCondition: lvl(1),
    unlockDescription: '起始裝備',
    artKey: 'cosmetic-body-student-coat',
    rarity: 'N',
  },
  {
    id: 'resident-coat',
    name: '住院醫師白袍',
    category: 'body',
    unlockCondition: lvl(10),
    unlockDescription: '達 level 10 解鎖',
    artKey: 'cosmetic-body-resident-coat',
    rarity: 'R',
  },
  {
    id: 'attending-coat',
    name: '主治醫師白袍',
    category: 'body',
    unlockCondition: lvl(20),
    unlockDescription: '達 level 20 解鎖',
    artKey: 'cosmetic-body-attending-coat',
    rarity: 'SR',
  },
  {
    id: 'fullmoon-coat',
    name: '滿月加冕袍',
    category: 'body',
    unlockCondition: streakAtLeast(30),
    unlockDescription: '連續 30 天 check-in 解鎖',
    artKey: 'cosmetic-body-fullmoon-coat',
    rarity: 'SSR',
  },

  // ─── Accessory (4) ────────────────────────────────────────────
  {
    id: 'stethoscope',
    name: '聽診器',
    category: 'accessory',
    unlockCondition: lvl(1),
    unlockDescription: '起始裝備',
    artKey: 'cosmetic-accessory-stethoscope',
    rarity: 'N',
  },
  {
    id: 'memory-notebook',
    name: '強記筆記本',
    category: 'accessory',
    unlockCondition: stat('memory', 50),
    unlockDescription: '記憶 ≥ 50 解鎖',
    artKey: 'cosmetic-accessory-memory-notebook',
    rarity: 'R',
  },
  {
    id: 'stamina-medal',
    name: '持久勳章',
    category: 'accessory',
    unlockCondition: stat('stamina', 100),
    unlockDescription: '耐力 ≥ 100 解鎖',
    artKey: 'cosmetic-accessory-stamina-medal',
    rarity: 'SR',
  },
  {
    id: 'streak7-badge',
    name: '七連勝徽章',
    category: 'accessory',
    unlockCondition: streakAtLeast(7),
    unlockDescription: '連續 7 天 check-in 解鎖',
    artKey: 'cosmetic-accessory-streak7-badge',
    rarity: 'SR',
  },

  // ─── Held (4) ─────────────────────────────────────────────────
  {
    id: 'exam-book',
    name: '國考考古題本',
    category: 'held',
    unlockCondition: (p) => hasBadge('boss-mini')(p) || lvl(3)(p),
    unlockDescription: '達 level 3 或拿 mini-boss 徽章解鎖',
    artKey: 'cosmetic-held-exam-book',
    rarity: 'N',
  },
  {
    id: 'detailed-notes',
    name: '詳解筆記',
    category: 'held',
    unlockCondition: stat('memory', 30),
    unlockDescription: '記憶 ≥ 30 解鎖',
    artKey: 'cosmetic-held-detailed-notes',
    rarity: 'R',
  },
  {
    id: 'prescription-pad',
    name: '處方箋',
    category: 'held',
    unlockCondition: lvl(15),
    unlockDescription: '達 level 15 解鎖',
    artKey: 'cosmetic-held-prescription-pad',
    rarity: 'SR',
  },
  {
    id: 'boss-cert',
    name: '年度大魔王打敗證書',
    category: 'held',
    unlockCondition: hasBadge('boss-annual'),
    unlockDescription: '通過 annual-boss 解鎖',
    artKey: 'cosmetic-held-boss-cert',
    rarity: 'SSR',
  },

  // ─── Background (4) ───────────────────────────────────────────
  {
    id: 'textbook-mountain',
    name: '書山有路',
    category: 'background',
    unlockCondition: todayMinutes(60),
    unlockDescription: '單日累積 60 分鐘閱讀解鎖',
    artKey: 'cosmetic-background-textbook-mountain',
    rarity: 'R',
  },
  {
    id: 'late-night-desk',
    name: '凌晨書桌',
    category: 'background',
    unlockCondition: streakAtLeast(14),
    unlockDescription: '連續 14 天 check-in 解鎖',
    artKey: 'cosmetic-background-late-night-desk',
    rarity: 'SR',
  },
  {
    id: 'party-room',
    name: '勝利慶祝廳',
    category: 'background',
    unlockCondition: hasBadge('boss-annual'),
    unlockDescription: '通過 annual-boss 解鎖',
    artKey: 'cosmetic-background-party-room',
    rarity: 'SSR',
  },
  {
    id: 'weekend-rest',
    name: '週末小憩',
    category: 'background',
    unlockCondition: lvl(5),
    unlockDescription: '達 level 5 解鎖',
    artKey: 'cosmetic-background-weekend-rest',
    rarity: 'R',
  },
] as const

/** Helper for tests / debug — total cosmetic count + breakdown */
export const COSMETIC_CATALOG_SIZE = COSMETIC_CATALOG.length
