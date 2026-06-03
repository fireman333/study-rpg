import { describe, it, expect, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import {
  DMN_BEHAVIOR_AXIS_DAILY_CAP,
  DMN_EXPEDITION_DAILY_CAP,
} from '@study-rpg/content-neurons-tw'
import { db, todayISO } from '../lib/db'
import { creditExpeditionDraws, readDmnMeta } from '../lib/services/dmn-trigger'

/**
 * Spec Req (add-neurons-expedition-rewards): expedition axis grants draws by
 * per-session percentage-with-clamp milestones (25% / 50% clamped to 3–15 /
 * 6–30 clears), capped at DMN_EXPEDITION_DAILY_CAP (=2) draws/day. Daily reset
 * zeros axis counters + cumulative clears but preserves `dmnDrawsAvailable`.
 *
 * Tests the expedition axis directly via creditExpeditionDraws(pool, cleared);
 * behavior-axis grant fires from event-bus listeners (tested via integration).
 *
 * Milestone thresholds = clamp(round(pct × pool), min, max):
 *   pool 40  → 10 / 20      pool 8 → 3 / 6 (floor)     pool 300 → 15 / 30 (ceiling)
 */

beforeEach(async () => {
  await db.delete()
  await db.open()
  // Pre-seed lastDailyResetDate to today so maybeRunDailyReset is a no-op
  await db.meta.put({ key: 'dmnLastDailyResetDate', value: todayISO() })
})

describe('creditExpeditionDraws expedition-axis', () => {
  it('grants 0 draws below the first milestone', async () => {
    const granted = await creditExpeditionDraws(40, 9) // 9 < t1(10)
    expect(granted).toBe(0)
    const meta = await readDmnMeta()
    expect(meta.dmnTimeAxisMinutesAccrued).toBe(9) // cumulative clears recorded
    expect(meta.dmnTimeAxisDrawsConsumedToday).toBe(0)
    expect(meta.dmnDrawsAvailable).toBe(0)
  })

  it('grants 1 draw at the first (25%) milestone', async () => {
    const granted = await creditExpeditionDraws(40, 12) // 10 ≤ 12 < 20
    expect(granted).toBe(1)
    const meta = await readDmnMeta()
    expect(meta.dmnTimeAxisDrawsConsumedToday).toBe(1)
    expect(meta.dmnDrawsAvailable).toBe(1)
  })

  it('grants 2 draws at the second (50%) milestone in one session', async () => {
    const granted = await creditExpeditionDraws(40, 20) // both milestones met
    expect(granted).toBe(2)
    const meta = await readDmnMeta()
    expect(meta.dmnTimeAxisDrawsConsumedToday).toBe(2)
    expect(meta.dmnDrawsAvailable).toBe(2)
  })

  it('small-backlog floor prevents a trivially cheap draw', async () => {
    const granted = await creditExpeditionDraws(8, 2) // t1 = clamp(2,3,15) = 3; 2 < 3
    expect(granted).toBe(0)
    expect((await readDmnMeta()).dmnDrawsAvailable).toBe(0)
  })

  it('large-backlog ceiling keeps the milestone reachable', async () => {
    const granted = await creditExpeditionDraws(300, 15) // t1 = clamp(75,3,15) = 15
    expect(granted).toBe(1)
    expect((await readDmnMeta()).dmnDrawsAvailable).toBe(1)
  })

  it(`caps at ${DMN_EXPEDITION_DAILY_CAP} draws/day across sessions`, async () => {
    await creditExpeditionDraws(40, 20) // 2 draws → cap hit
    const granted2 = await creditExpeditionDraws(40, 20) // would be 2 more, but capped
    expect(granted2).toBe(0)
    const meta = await readDmnMeta()
    expect(meta.dmnTimeAxisDrawsConsumedToday).toBe(DMN_EXPEDITION_DAILY_CAP)
    expect(meta.dmnDrawsAvailable).toBe(DMN_EXPEDITION_DAILY_CAP)
    expect(meta.dmnTimeAxisMinutesAccrued).toBe(40) // cumulative clears keep climbing
  })

  it('cumulative clears accumulate across sessions (display counter)', async () => {
    await creditExpeditionDraws(40, 5) // 5 < t1(10) → 0 draws
    await creditExpeditionDraws(40, 7) // 7 < t1(10) → 0 draws
    const meta = await readDmnMeta()
    expect(meta.dmnTimeAxisMinutesAccrued).toBe(12)
    expect(meta.dmnTimeAxisDrawsConsumedToday).toBe(0)
  })

  it('zero or non-positive input is a no-op', async () => {
    expect(await creditExpeditionDraws(40, 0)).toBe(0)
    expect(await creditExpeditionDraws(0, 5)).toBe(0)
    expect((await readDmnMeta()).dmnTimeAxisMinutesAccrued).toBe(0)
  })
})

describe('Daily reset', () => {
  it('zeros counters + preserves dmnDrawsAvailable when date crosses', async () => {
    // Set state as if "yesterday" had cap hit
    await db.meta.put({ key: 'dmnTimeAxisMinutesAccrued', value: '22' })
    await db.meta.put({
      key: 'dmnTimeAxisDrawsConsumedToday',
      value: String(DMN_EXPEDITION_DAILY_CAP),
    })
    await db.meta.put({
      key: 'dmnBehaviorAxisDrawsConsumedToday',
      value: String(DMN_BEHAVIOR_AXIS_DAILY_CAP),
    })
    await db.meta.put({ key: 'dmnDrawsAvailable', value: '4' })
    await db.meta.put({ key: 'dmnLastDailyResetDate', value: '1999-01-01' })

    // Trigger reset via a subsequent session that itself earns no draw (3 < t1=10)
    await creditExpeditionDraws(40, 3)
    const meta = await readDmnMeta()
    // Axis counters zeroed
    expect(meta.dmnTimeAxisDrawsConsumedToday).toBe(0)
    expect(meta.dmnBehaviorAxisDrawsConsumedToday).toBe(0)
    // 3 clears accrued after reset (reset ran first, then this session added 3)
    expect(meta.dmnTimeAxisMinutesAccrued).toBe(3)
    // Unused draws preserved across days
    expect(meta.dmnDrawsAvailable).toBe(4)
    // Reset date bumped to today
    expect(meta.dmnLastDailyResetDate).toBe(todayISO())
  })

  it('does not reset twice on the same day', async () => {
    await creditExpeditionDraws(40, 5)
    const after1 = await readDmnMeta()
    await creditExpeditionDraws(40, 7)
    const after2 = await readDmnMeta()
    expect(after2.dmnTimeAxisMinutesAccrued).toBe(12) // accumulated, not reset
    expect(after2.dmnLastDailyResetDate).toBe(after1.dmnLastDailyResetDate)
  })
})
