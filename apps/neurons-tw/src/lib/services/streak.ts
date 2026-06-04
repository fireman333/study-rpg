/**
 * Correct-answer streak counter persistence.
 *
 * Two meta keys (per neurons-achievements spec):
 * - `currentQuizCorrectStreak` — LWW; +1 on correct, reset 0 on wrong
 * - `maxQuizCorrectStreak` — MAX-merge; bumps whenever current exceeds it
 *
 * All updates co-commit inside the same Dexie transaction as the originating
 * `recordCorrectAnswer` / `recordIncorrectAnswer` (caller is responsible for
 * passing the active transaction reference).
 *
 * Capability spec: openspec/specs/neurons-achievements/spec.md
 */

import { db } from '../db'

const KEY_CURRENT = 'currentQuizCorrectStreak'
const KEY_MAX = 'maxQuizCorrectStreak'

function parseIntSafe(v: string | undefined): number {
  if (!v) return 0
  const n = parseInt(v, 10)
  return Number.isFinite(n) ? n : 0
}

/** Read both counters; missing rows return 0. */
export async function getStreaks(): Promise<{ current: number; max: number }> {
  const [c, m] = await Promise.all([db.meta.get(KEY_CURRENT), db.meta.get(KEY_MAX)])
  return { current: parseIntSafe(c?.value), max: parseIntSafe(m?.value) }
}

/**
 * Increment current by 1, bump max if exceeded. Caller MUST invoke from within
 * an active Dexie transaction that already holds the `meta` table for write.
 */
export async function incrementCurrentStreak(): Promise<void> {
  const current = parseIntSafe((await db.meta.get(KEY_CURRENT))?.value) + 1
  const max = parseIntSafe((await db.meta.get(KEY_MAX))?.value)
  await db.meta.put({ key: KEY_CURRENT, value: String(current) })
  if (current > max) {
    await db.meta.put({ key: KEY_MAX, value: String(current) })
  }
}

/** Reset current to 0; preserve max. Caller invokes from active transaction. */
export async function resetCurrentStreak(): Promise<void> {
  // A wrong answer always breaks the current streak. (The DMN streak-shield
  // crutch was removed for integrity — add-neurons-acceleration-system.)
  await db.meta.put({ key: KEY_CURRENT, value: '0' })
}
