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
import { consumeStreakShield } from './dmn-event-dispatcher'

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
  // DMN streak-shield: if an armed shield is available, consume it instead of
  // resetting current. Shield prevents one streak break (per DMN spec Req
  // "Five DMN event types SHALL be defined with bounded magnitudes" — streak-
  // shield row). Best-effort: failure to read shield falls through to normal
  // reset.
  try {
    const shielded = await consumeStreakShield()
    if (shielded) {
      console.info('[streak] DMN streak-shield consumed; preserving current streak')
      return
    }
  } catch (err) {
    console.error('[streak] shield check failed; proceeding with reset:', err)
  }
  await db.meta.put({ key: KEY_CURRENT, value: '0' })
}
