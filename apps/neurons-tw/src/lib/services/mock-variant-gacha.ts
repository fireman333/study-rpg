// Mock-exam variant gacha (add-neurons-exam-set-mock-variants).
//
// An INDEPENDENT collection line rolled on 模擬考試 submit — no maze pool, no
// energy, no DMN. Reuses the content-agnostic core `rollGacha` with a per-score-
// band tier-weight config + a "≥P2 after N dry" pity rule. Roll bookkeeping
// (pity stats + per-paper daily-cap dates) is device-LOCAL meta (NOT synced);
// only the collected `mockExamVariants` table syncs to R2.

import { rollGacha, initialGachaStats, type GachaConfig, type GachaStats } from '@study-rpg/core'
import {
  MOCK_RARITY_WEIGHTS,
  MOCK_RARITY_ORDER,
  MOCK_PITY_AT_ROLLS,
  MOCK_PITY_FLOOR,
  mockBandForScore,
  mockVariantsByRarity,
  mockVariantById,
  type Rarity,
} from '@study-rpg/content-neurons-tw'
import { db, todayISO, type MockExamVariantRow } from '../db'

const STATS_KEY = 'mockGachaStats'
const ROLL_DATES_KEY = 'mockVariantRollDates'

export interface MockRollResult {
  variantId: string
  rarity: Rarity
  displayName: string
  spriteKey: string
  /** true = first time collected; false = a duplicate (copies incremented). */
  isNew: boolean
  copies: number
  wasPity: boolean
}

/** Core gacha config for a score band: tiers low→high (P5..P0) + a ≥P2 pity. */
export function buildMockGachaConfig(score: number): GachaConfig {
  const weights = MOCK_RARITY_WEIGHTS[mockBandForScore(score)]
  return {
    tiers: MOCK_RARITY_ORDER.map((r) => ({ id: r, weight: weights[r] })),
    pityRules: [{ tier: MOCK_PITY_FLOOR, atRolls: MOCK_PITY_AT_ROLLS }],
  }
}

/** Pure roll: rolled rarity (score-weighted, pity-floored) + a within-tier pick. */
export function rollMockVariant(
  score: number,
  stats: GachaStats,
  rng: () => number = Math.random,
): { rarity: Rarity; variantId: string; wasPity: boolean; newStats: GachaStats } {
  const result = rollGacha(buildMockGachaConfig(score), stats, rng)
  const rarity = result.tier as Rarity
  const pool = mockVariantsByRarity(rarity)
  const pick = pool[Math.floor(rng() * pool.length)]
  return { rarity, variantId: pick.variantId, wasPity: result.wasPity, newStats: result.newStats }
}

async function readStats(): Promise<GachaStats> {
  const row = await db.meta.get(STATS_KEY)
  if (row?.value) {
    try {
      return JSON.parse(row.value) as GachaStats
    } catch {
      /* corrupt → fall through to a fresh init */
    }
  }
  return initialGachaStats(buildMockGachaConfig(0))
}

async function readRollDates(): Promise<Record<string, string>> {
  const row = await db.meta.get(ROLL_DATES_KEY)
  if (row?.value) {
    try {
      return JSON.parse(row.value) as Record<string, string>
    } catch {
      /* corrupt → treat as empty */
    }
  }
  return {}
}

/** True iff this paper has NOT already granted a roll today (local-day). */
export async function canRollPaperToday(paperKey: string): Promise<boolean> {
  const dates = await readRollDates()
  return dates[paperKey] !== todayISO()
}

async function markPaperRolled(paperKey: string): Promise<void> {
  const dates = await readRollDates()
  dates[paperKey] = todayISO()
  await db.meta.put({ key: ROLL_DATES_KEY, value: JSON.stringify(dates) })
}

async function persistRoll(
  variantId: string,
  rarity: Rarity,
  displayName: string,
  spriteKey: string,
  now: number,
): Promise<{ isNew: boolean; copies: number }> {
  const existing = await db.mockExamVariants.get(variantId)
  if (existing) {
    const copies = existing.copies + 1
    await db.mockExamVariants.put({ ...existing, copies, lastRolledAt: now })
    return { isNew: false, copies }
  }
  const row: MockExamVariantRow = {
    variantId,
    rarity,
    displayName,
    spriteKey,
    copies: 1,
    firstRolledAt: now,
    lastRolledAt: now,
  }
  await db.mockExamVariants.put(row)
  return { isNew: true, copies: 1 }
}

/**
 * Roll + persist one mock variant for a submitted exam. Returns the reveal
 * payload, or `null` if the per-paper daily cap is already spent today (the
 * exam still completes / records 錯題 — only the roll is capped).
 *
 * `now` is injectable for deterministic tests.
 */
export async function submitMockVariantRoll(
  paperKey: string,
  score: number,
  rng: () => number = Math.random,
  now: number = Date.now(),
): Promise<MockRollResult | null> {
  if (!(await canRollPaperToday(paperKey))) return null
  const stats = await readStats()
  const roll = rollMockVariant(score, stats, rng)
  const def = mockVariantById(roll.variantId)
  if (!def) return null // unknown catalog id (should not happen) — fail safe, no write
  await db.meta.put({ key: STATS_KEY, value: JSON.stringify(roll.newStats) })
  const { isNew, copies } = await persistRoll(
    roll.variantId,
    roll.rarity,
    def.displayName,
    def.spriteKey,
    now,
  )
  await markPaperRolled(paperKey)
  return {
    variantId: roll.variantId,
    rarity: roll.rarity,
    displayName: def.displayName,
    spriteKey: def.spriteKey,
    isNew,
    copies,
    wasPity: roll.wasPity,
  }
}
