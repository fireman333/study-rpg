/**
 * DMN trigger detector — single service at app boot.
 *
 * Responsibilities (per add-neurons-dmn-fate-card + add-neurons-expedition-rewards):
 * - Maintain expedition-axis + behavior-axis daily counters with caps
 * - Listen to 3 connectome events for behavior-axis bonus draws
 * - Expose `creditExpeditionDraws(pool, cleared)` that the expedition completion
 *   path (onExpeditionComplete) invokes per session to grant percentage-milestone
 *   draws (the first axis is now expedition clears, NOT reading minutes)
 * - Daily-reset lazily at first interaction crossing local-TZ midnight
 *
 * Capability spec: openspec/specs/neurons-dmn-fate-cards/spec.md
 */

import {
  DMN_BEHAVIOR_AXIS_DAILY_CAP,
  DMN_EXPEDITION_DAILY_CAP,
  DMN_EXPEDITION_MILESTONES,
  type DmnMetaSnapshot,
} from '@study-rpg/content-neurons-tw'

import { db, todayISO } from '../db'
import { events as connectomeEvents } from './connectome'

// ─── Meta key constants ─────────────────────────────────────────────────────

const META_KEYS = {
  // ⚠️ LEGACY KEY NAMES (add-neurons-expedition-rewards): the first axis is now
  // the EXPEDITION axis (clears), not the reading-time axis. These two synced
  // meta keys keep their old names to avoid a SYNCED_META_KEYS change + R2
  // bundle SCHEMA_VERSION bump. `timeMinutes` now stores cumulative expedition
  // clears today (display/telemetry only — does NOT gate draws); `timeDrawsToday`
  // now counts expedition-axis draws granted today.
  timeMinutes: 'dmnTimeAxisMinutesAccrued',
  timeDrawsToday: 'dmnTimeAxisDrawsConsumedToday',
  behaviorDrawsToday: 'dmnBehaviorAxisDrawsConsumedToday',
  drawsAvailable: 'dmnDrawsAvailable',
  lastResetDate: 'dmnLastDailyResetDate',
  lifetimeConsumed: 'dmnLifetimeDrawsConsumed',
} as const

// ─── Meta key helpers ───────────────────────────────────────────────────────

function parseIntSafe(v: string | undefined): number {
  if (!v) return 0
  const n = parseInt(v, 10)
  return Number.isFinite(n) ? n : 0
}

async function readMetaInt(key: string): Promise<number> {
  const row = await db.meta.get(key)
  return parseIntSafe(row?.value)
}

async function writeMetaInt(key: string, value: number): Promise<void> {
  await db.meta.put({ key, value: String(value) })
}

async function readMetaString(key: string): Promise<string> {
  const row = await db.meta.get(key)
  return row?.value ?? ''
}

async function writeMetaString(key: string, value: string): Promise<void> {
  await db.meta.put({ key, value })
}

/** Snapshot all 6 DMN meta keys. Used by sync + UI status reads. */
export async function readDmnMeta(): Promise<DmnMetaSnapshot> {
  const [
    dmnTimeAxisMinutesAccrued,
    dmnTimeAxisDrawsConsumedToday,
    dmnBehaviorAxisDrawsConsumedToday,
    dmnDrawsAvailable,
    dmnLastDailyResetDate,
    dmnLifetimeDrawsConsumed,
  ] = await Promise.all([
    readMetaInt(META_KEYS.timeMinutes),
    readMetaInt(META_KEYS.timeDrawsToday),
    readMetaInt(META_KEYS.behaviorDrawsToday),
    readMetaInt(META_KEYS.drawsAvailable),
    readMetaString(META_KEYS.lastResetDate),
    readMetaInt(META_KEYS.lifetimeConsumed),
  ])
  return {
    dmnTimeAxisMinutesAccrued,
    dmnTimeAxisDrawsConsumedToday,
    dmnBehaviorAxisDrawsConsumedToday,
    dmnDrawsAvailable,
    dmnLastDailyResetDate,
    dmnLifetimeDrawsConsumed,
  }
}

// ─── Daily reset ────────────────────────────────────────────────────────────

/**
 * Lazy daily reset: if today's local date differs from `dmnLastDailyResetDate`,
 * zero the time-axis minutes + both axis draw counters. Preserves
 * `dmnDrawsAvailable` (unused draws carry over). Runs inside a tx so
 * concurrent callers don't race.
 */
async function maybeRunDailyReset(): Promise<void> {
  const today = todayISO()
  const lastReset = await readMetaString(META_KEYS.lastResetDate)
  if (lastReset === today) return
  await db.transaction('rw', db.meta, async () => {
    // Re-read inside tx to avoid double-reset race
    const lastInTx = (await db.meta.get(META_KEYS.lastResetDate))?.value ?? ''
    if (lastInTx === today) return
    await writeMetaInt(META_KEYS.timeMinutes, 0)
    await writeMetaInt(META_KEYS.timeDrawsToday, 0)
    await writeMetaInt(META_KEYS.behaviorDrawsToday, 0)
    await writeMetaString(META_KEYS.lastResetDate, today)
  })
}

// ─── Grant logic ────────────────────────────────────────────────────────────

/**
 * Grant +1 bonus draw via the behavior axis if cap not reached. Returns true
 * if a draw was granted. Idempotent on caller's responsibility to not double-
 * call from the same trigger.
 */
async function grantBehaviorAxisDraw(reason: string): Promise<boolean> {
  await maybeRunDailyReset()
  let granted = false
  await db.transaction('rw', db.meta, async () => {
    const consumed = parseIntSafe((await db.meta.get(META_KEYS.behaviorDrawsToday))?.value)
    if (consumed >= DMN_BEHAVIOR_AXIS_DAILY_CAP) return
    const available = parseIntSafe((await db.meta.get(META_KEYS.drawsAvailable))?.value)
    await writeMetaInt(META_KEYS.behaviorDrawsToday, consumed + 1)
    await writeMetaInt(META_KEYS.drawsAvailable, available + 1)
    granted = true
  })
  if (granted) {
    console.info(`[dmn] +1 behavior-axis draw granted (reason=${reason})`)
  }
  return granted
}

/**
 * Per-milestone clear-count threshold for a given session pool size:
 * `clamp(round(pct × pool), min, max)`. The clamp keeps draws reachable on
 * large backlogs and non-trivial on tiny ones (see DMN_EXPEDITION_MILESTONES).
 */
function milestoneThreshold(pool: number, pct: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(pct * pool)))
}

/**
 * Expedition-axis draw credit (add-neurons-expedition-rewards). Invoked by the
 * expedition completion path (`onExpeditionComplete`) once per session.
 *
 * @param pool    - wrong-question count the session opened against
 * @param cleared - wrong→correct flips this session (= session correct count in
 *                  the wrong-only pool)
 *
 * Grants +1 draw per DMN_EXPEDITION_MILESTONES threshold met by `cleared`,
 * capped per day via `dmnTimeAxisDrawsConsumedToday`. Also accumulates `cleared`
 * into `dmnTimeAxisMinutesAccrued` (cumulative clears today; display only).
 * Returns the number of draws granted this call.
 */
export async function creditExpeditionDraws(pool: number, cleared: number): Promise<number> {
  if (cleared <= 0 || pool <= 0) return 0
  await maybeRunDailyReset()
  const metMilestones = DMN_EXPEDITION_MILESTONES.filter(
    (m) => cleared >= milestoneThreshold(pool, m.pct, m.min, m.max),
  ).length
  let granted = 0
  await db.transaction('rw', db.meta, async () => {
    // Always record cumulative clears today (display/telemetry).
    const prevClears = parseIntSafe((await db.meta.get(META_KEYS.timeMinutes))?.value)
    await writeMetaInt(META_KEYS.timeMinutes, prevClears + cleared)
    if (metMilestones <= 0) return
    const consumed = parseIntSafe((await db.meta.get(META_KEYS.timeDrawsToday))?.value)
    const grantCount = Math.min(metMilestones, Math.max(0, DMN_EXPEDITION_DAILY_CAP - consumed))
    if (grantCount === 0) return
    const available = parseIntSafe((await db.meta.get(META_KEYS.drawsAvailable))?.value)
    await writeMetaInt(META_KEYS.timeDrawsToday, consumed + grantCount)
    await writeMetaInt(META_KEYS.drawsAvailable, available + grantCount)
    granted = grantCount
  })
  if (granted > 0) {
    console.info(`[dmn] +${granted} expedition-axis draw(s) granted (pool=${pool}, cleared=${cleared})`)
  }
  return granted
}

// ─── Boot init ──────────────────────────────────────────────────────────────

let initialized = false

/**
 * Register event-bus listeners + run initial daily-reset check. Idempotent
 * on re-init (e.g., React StrictMode double-mount).
 */
export function initializeDmnTrigger(): void {
  if (initialized) return
  initialized = true

  connectomeEvents.on('connectome.variantSlotUnlocked', () => {
    void grantBehaviorAxisDraw('variantSlotUnlocked').catch((err) => {
      console.error('[dmn] variantSlotUnlocked handler failed:', err)
    })
  })

  // synapseFormed / synapseStrengthened behavior-axis draws REMOVED
  // (rework-neurons-connectome-expedition-driven): synapse forming/strengthening is
  // now an expedition-repair side effect that already underlies the expedition-axis
  // draw, so a behavior-axis draw on it would triple-reward the same activity.

  // Kick off a one-shot reset check at boot so the day rollover happens before
  // the first user interaction (defensive — covers app left open past midnight).
  void maybeRunDailyReset().catch((err) => {
    console.error('[dmn] boot daily-reset check failed:', err)
  })
}

/** Test-only: reset singleton state. Not exported from index. */
export function __resetDmnTriggerForTests(): void {
  initialized = false
}
