import { describe, it, expect, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import {
  DMN_BEHAVIOR_AXIS_DAILY_CAP,
  DMN_TIME_AXIS_DAILY_CAP,
} from '@study-rpg/content-neurons-tw'
import { db, todayISO } from '../lib/db'
import { accrueReadingMinutes, readDmnMeta } from '../lib/services/dmn-trigger'

/**
 * Spec Req: time-axis cap at 2 draws/day; behavior-axis cap at 3 draws/day;
 * daily reset preserves `dmnDrawsAvailable` but zeros axis counters.
 *
 * Tests the time-axis directly via accrueReadingMinutes; behavior-axis grant
 * fires from event-bus listeners which are tested indirectly via integration
 * (manual smoke / production usage).
 */

beforeEach(async () => {
  await db.delete()
  await db.open()
  // Pre-seed lastDailyResetDate to today so maybeRunDailyReset is no-op
  await db.meta.put({ key: 'dmnLastDailyResetDate', value: todayISO() })
})

describe('accrueReadingMinutes time-axis', () => {
  it('grants 0 draws before 30 minutes accumulated', async () => {
    await accrueReadingMinutes(29)
    const meta = await readDmnMeta()
    expect(meta.dmnTimeAxisMinutesAccrued).toBe(29)
    expect(meta.dmnTimeAxisDrawsConsumedToday).toBe(0)
    expect(meta.dmnDrawsAvailable).toBe(0)
  })

  it('grants 1 draw at 30 minutes', async () => {
    await accrueReadingMinutes(30)
    const meta = await readDmnMeta()
    expect(meta.dmnTimeAxisMinutesAccrued).toBe(30)
    expect(meta.dmnTimeAxisDrawsConsumedToday).toBe(1)
    expect(meta.dmnDrawsAvailable).toBe(1)
  })

  it('grants 2 draws at 60 minutes', async () => {
    await accrueReadingMinutes(60)
    const meta = await readDmnMeta()
    expect(meta.dmnTimeAxisDrawsConsumedToday).toBe(2)
    expect(meta.dmnDrawsAvailable).toBe(2)
  })

  it(`caps at ${DMN_TIME_AXIS_DAILY_CAP} draws/day even after 90+ minutes`, async () => {
    await accrueReadingMinutes(120)
    const meta = await readDmnMeta()
    expect(meta.dmnTimeAxisMinutesAccrued).toBe(120) // minutes counter still climbs
    expect(meta.dmnTimeAxisDrawsConsumedToday).toBe(DMN_TIME_AXIS_DAILY_CAP)
    expect(meta.dmnDrawsAvailable).toBe(DMN_TIME_AXIS_DAILY_CAP)
  })

  it('incremental accrual grants draws as thresholds cross', async () => {
    await accrueReadingMinutes(15)
    expect((await readDmnMeta()).dmnDrawsAvailable).toBe(0)
    await accrueReadingMinutes(15) // total 30
    expect((await readDmnMeta()).dmnDrawsAvailable).toBe(1)
    await accrueReadingMinutes(30) // total 60
    expect((await readDmnMeta()).dmnDrawsAvailable).toBe(2)
    await accrueReadingMinutes(30) // total 90 — would be 3 but capped at 2
    const meta = await readDmnMeta()
    expect(meta.dmnTimeAxisDrawsConsumedToday).toBe(DMN_TIME_AXIS_DAILY_CAP)
    expect(meta.dmnDrawsAvailable).toBe(DMN_TIME_AXIS_DAILY_CAP)
  })

  it('zero or negative delta is no-op', async () => {
    await accrueReadingMinutes(0)
    await accrueReadingMinutes(-5)
    const meta = await readDmnMeta()
    expect(meta.dmnTimeAxisMinutesAccrued).toBe(0)
  })
})

describe('Daily reset', () => {
  it('zero counters + preserve dmnDrawsAvailable when date crosses', async () => {
    // Set state as if "yesterday" had cap hit
    await db.meta.put({ key: 'dmnTimeAxisMinutesAccrued', value: '120' })
    await db.meta.put({
      key: 'dmnTimeAxisDrawsConsumedToday',
      value: String(DMN_TIME_AXIS_DAILY_CAP),
    })
    await db.meta.put({
      key: 'dmnBehaviorAxisDrawsConsumedToday',
      value: String(DMN_BEHAVIOR_AXIS_DAILY_CAP),
    })
    await db.meta.put({ key: 'dmnDrawsAvailable', value: '4' })
    await db.meta.put({ key: 'dmnLastDailyResetDate', value: '1999-01-01' })

    // Trigger reset via any subsequent interaction
    await accrueReadingMinutes(15)
    const meta = await readDmnMeta()
    // Axis counters zeroed
    expect(meta.dmnTimeAxisDrawsConsumedToday).toBe(0)
    expect(meta.dmnBehaviorAxisDrawsConsumedToday).toBe(0)
    // 15 minutes accrued after reset (because reset ran first, then accrual added 15)
    expect(meta.dmnTimeAxisMinutesAccrued).toBe(15)
    // Unused draws preserved across days
    expect(meta.dmnDrawsAvailable).toBe(4)
    // Reset date bumped to today
    expect(meta.dmnLastDailyResetDate).toBe(todayISO())
  })

  it('does not reset twice on the same day', async () => {
    await accrueReadingMinutes(45)
    const after1 = await readDmnMeta()
    await accrueReadingMinutes(45)
    const after2 = await readDmnMeta()
    expect(after2.dmnTimeAxisMinutesAccrued).toBe(90) // accumulated, not reset
    expect(after2.dmnLastDailyResetDate).toBe(after1.dmnLastDailyResetDate)
  })
})
