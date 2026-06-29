/**
 * Drive edge-throttle cooldown (fix-neurons-pdf-edge-throttle, design D5).
 *
 * When the offline-all download detects a SUSPECTED Google per-IP edge throttle (a CORS-masked Drive
 * failure while the player's own origin is reachable), it persists a progressive cooldown so the app
 * stops hammering Drive. Bulk HARD-respects the cooldown (refuses to start while active); single-open
 * SOFT-respects it (still tries one fetch, and each success counts toward clearing it).
 *
 * State rides the existing key-value `meta` store as a single JSON entry — NO Dexie schema bump
 * (`meta` is `{ key, value }`), consistent with the byte-store no-schema stance.
 */
import { db } from '../lib/db'

const COOLDOWN_KEY = 'pdfDriveCooldown'
/** Progressive backoff by strike count: 30 min → 2 h → 6 h → 24 h cap. Dogfood-tunable. */
const LADDER_MS = [30 * 60_000, 2 * 3_600_000, 6 * 3_600_000, 24 * 3_600_000]
/** Consecutive Drive successes that clear the cooldown + reset the strike count. */
const SUCCESS_RESET = 3

interface CooldownState {
  /** Epoch ms until which the cooldown is active (0 = none). */
  until: number
  /** How many throttle strikes have been recorded (indexes the ladder). */
  strikes: number
  /** Consecutive Drive successes since the last strike. */
  successes: number
}

const EMPTY: CooldownState = { until: 0, strikes: 0, successes: 0 }

async function read(): Promise<CooldownState> {
  try {
    const row = await db.meta.get(COOLDOWN_KEY)
    if (!row?.value) return { ...EMPTY }
    const p = JSON.parse(row.value) as Partial<CooldownState>
    return {
      until: Number(p.until) || 0,
      strikes: Number(p.strikes) || 0,
      successes: Number(p.successes) || 0,
    }
  } catch {
    return { ...EMPTY }
  }
}

async function write(s: CooldownState): Promise<void> {
  try {
    await db.meta.put({ key: COOLDOWN_KEY, value: JSON.stringify(s) })
  } catch {
    /* best-effort — a cooldown that fails to persist just means the next run re-detects the throttle */
  }
}

/** Epoch ms the cooldown is active until, or 0 if not currently cooling down. */
export async function getCooldownUntil(now: number = Date.now()): Promise<number> {
  const s = await read()
  return s.until > now ? s.until : 0
}

/**
 * Record one suspected-throttle strike and (re)arm the cooldown one rung up the ladder. Returns the
 * new `until` timestamp. Resets the success streak.
 */
export async function recordThrottleStrike(now: number = Date.now()): Promise<number> {
  const s = await read()
  const strikes = Math.min(s.strikes + 1, LADDER_MS.length)
  const until = now + LADDER_MS[strikes - 1]
  await write({ until, strikes, successes: 0 })
  return until
}

/**
 * Note a successful Drive fetch. After {@link SUCCESS_RESET} consecutive successes the cooldown +
 * strike count are fully cleared; earlier successes just accrue toward that reset (and never extend an
 * existing cooldown).
 */
export async function noteDriveSuccess(now: number = Date.now()): Promise<void> {
  const s = await read()
  // Steady state — no throttle has ever been hit (the overwhelmingly common case, e.g. every
  // successful booklet in a clean bulk run): nothing to clear, so skip the write entirely.
  if (s.strikes === 0 && s.until <= now) return
  const successes = s.successes + 1
  if (successes >= SUCCESS_RESET) await write({ ...EMPTY })
  else await write({ until: s.until, strikes: s.strikes, successes })
}
