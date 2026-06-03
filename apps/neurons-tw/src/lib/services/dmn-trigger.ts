/**
 * DMN trigger detector — single service at app boot.
 *
 * Responsibilities (per add-neurons-dmn-fate-card spec):
 * - Maintain time-axis + behavior-axis daily counters with caps
 * - Listen to 3 connectome events for behavior-axis bonus draws
 * - Expose ReadingTimerSubscriber interface that the reading-timer service uses
 *   to push minutes into the time-axis counter (wired via reading-timer.ts)
 * - Daily-reset lazily at first interaction crossing local-TZ midnight
 *
 * Capability spec: openspec/specs/neurons-dmn-fate-cards/spec.md
 */

import {
  DMN_BEHAVIOR_AXIS_DAILY_CAP,
  DMN_TIME_AXIS_DAILY_CAP,
  DMN_TIME_AXIS_MINUTES_PER_DRAW,
  type DmnMetaSnapshot,
} from '@study-rpg/content-neurons-tw'

import { db, todayISO } from '../db'
import { events as connectomeEvents } from './connectome'

// ─── Meta key constants ─────────────────────────────────────────────────────

const META_KEYS = {
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
 * Increment time-axis minute accrual. Called by reading-timer subscriber.
 * When accrued minutes crosses a multiple of 30, grants +1 draw if time
 * cap not reached.
 */
export async function accrueReadingMinutes(deltaMinutes: number): Promise<void> {
  if (deltaMinutes <= 0) return
  await maybeRunDailyReset()
  await db.transaction('rw', db.meta, async () => {
    const prevMinutes = parseIntSafe((await db.meta.get(META_KEYS.timeMinutes))?.value)
    const newMinutes = prevMinutes + deltaMinutes
    await writeMetaInt(META_KEYS.timeMinutes, newMinutes)
    // Count how many 30-min thresholds we crossed within today's cap
    const prevCrossed = Math.floor(prevMinutes / DMN_TIME_AXIS_MINUTES_PER_DRAW)
    const newCrossed = Math.floor(newMinutes / DMN_TIME_AXIS_MINUTES_PER_DRAW)
    const deltaCrossings = newCrossed - prevCrossed
    if (deltaCrossings <= 0) return
    const consumed = parseIntSafe((await db.meta.get(META_KEYS.timeDrawsToday))?.value)
    const headroom = Math.max(0, DMN_TIME_AXIS_DAILY_CAP - consumed)
    const grantCount = Math.min(deltaCrossings, headroom)
    if (grantCount === 0) return
    const available = parseIntSafe((await db.meta.get(META_KEYS.drawsAvailable))?.value)
    await writeMetaInt(META_KEYS.timeDrawsToday, consumed + grantCount)
    await writeMetaInt(META_KEYS.drawsAvailable, available + grantCount)
    console.info(`[dmn] +${grantCount} time-axis draw(s) granted (minutes=${newMinutes})`)
  })
}

// ─── ReadingTimerSubscriber interface ──────────────────────────────────────

/**
 * Contract for the reading-timer service to publish minute ticks.
 * WIRED: reading-timer.ts `fireMinuteSideEffects` calls
 * `dmnReadingTimerSubscriber.onMinutesAccrued(1)` each accrued minute, so the
 * DMN time-axis (30-min accrual → bonus draw) is live.
 */
export interface ReadingTimerSubscriber {
  /** Called by the timer each time accrued minutes advance. */
  onMinutesAccrued(deltaMinutes: number): Promise<void>
}

export const dmnReadingTimerSubscriber: ReadingTimerSubscriber = {
  onMinutesAccrued: accrueReadingMinutes,
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

  connectomeEvents.on('connectome.synapseFormed', () => {
    void grantBehaviorAxisDraw('synapseFormed').catch((err) => {
      console.error('[dmn] synapseFormed handler failed:', err)
    })
  })

  connectomeEvents.on('connectome.synapseStrengthened', () => {
    void grantBehaviorAxisDraw('synapseStrengthened').catch((err) => {
      console.error('[dmn] synapseStrengthened handler failed:', err)
    })
  })

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
