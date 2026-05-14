/**
 * XP / level curve + stat-reward constants.
 *
 * This is the single "game design constants" file — expect to tweak frequently
 * during dogfood. Keep functions pure for easy unit testing.
 */

import type { Player, PlayerStats } from '../types'

// ─── Level curve ─────────────────────────────────────────────────────────────

/** XP needed to advance FROM level L TO level L+1. Mildly polynomial. */
export function xpToNext(level: number): number {
  return Math.floor(50 * Math.pow(level, 1.4)) + 50
}

/** Total cumulative XP needed to reach a given level from level 1. */
export function xpAtLevel(level: number): number {
  let total = 0
  for (let i = 1; i < level; i++) total += xpToNext(i)
  return total
}

/** Resolve current level + carry-over XP from a cumulative total. */
export function levelFromTotalXp(totalXp: number): { level: number; xpInLevel: number; xpForNext: number } {
  let level = 1
  let remaining = totalXp
  while (remaining >= xpToNext(level)) {
    remaining -= xpToNext(level)
    level++
  }
  return { level, xpInLevel: remaining, xpForNext: xpToNext(level) }
}

// ─── Reward rules (default) ──────────────────────────────────────────────────

export const REWARD = {
  /** Reading: per focused minute. */
  readPerMinute: { xp: 5, subjectXp: 1, stat: { name: 'stamina', delta: 1 } },
  /** Quiz: per correct answer. */
  quizCorrect: { xp: 10, subjectXp: 2, stat: { name: 'knowledge', delta: 1 } },
  /** Quiz: per wrong answer (still tiny XP to keep loop going, push to SRS). */
  quizWrong: { xp: 2, subjectXp: 0 },
  /** Mini-boss pass bonus. */
  bossMiniPass: { xp: 50, subjectXp: 20 },
  /** Annual-boss pass bonus. */
  bossAnnualPass: { xp: 200, subjectXp: 60 },
} as const

// ─── Pure stat mutation helpers ──────────────────────────────────────────────

export function addStat(stats: PlayerStats, name: string, delta: number): PlayerStats {
  return { ...stats, [name]: (stats[name] ?? 0) + delta }
}

export interface XpGainResult {
  player: Player
  leveledUp: boolean
  levelsGained: number
}

/** Apply a raw XP gain and recompute level. */
export function applyXp(player: Player, gain: number): XpGainResult {
  const totalBefore = player.xp + xpAtLevel(player.level)
  const totalAfter = totalBefore + gain
  const { level: newLevel, xpInLevel } = levelFromTotalXp(totalAfter)
  return {
    player: { ...player, level: newLevel, xp: xpInLevel },
    leveledUp: newLevel > player.level,
    levelsGained: Math.max(0, newLevel - player.level),
  }
}

export function newPlayer(id: string, name: string, initialStatNames: string[]): Player {
  const now = Date.now()
  const stats: PlayerStats = {}
  for (const s of initialStatNames) stats[s] = 0
  return {
    id,
    name,
    level: 1,
    xp: 0,
    hp: 100,
    stats,
    subjectLevels: {},
    badges: [],
    unlocks: [],
    equipment: {},
    inventory: [],
    lootStats: { rollsSinceLastSR: 0, rollsSinceLastSSR: 0, totalRolls: 0 },
    createdAt: now,
    lastActiveAt: now,
  }
}
