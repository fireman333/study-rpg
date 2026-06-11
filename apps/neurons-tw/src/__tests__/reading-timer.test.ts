import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import 'fake-indexeddb/auto'

// Minimal DOM stub for node-env tests — service uses document.hidden + visibilitychange
// (window stub kept for transitively-imported modules that probe it)
const documentListeners = new Map<string, Set<() => void>>()
const windowListeners = new Map<string, Set<() => void>>()
const stubEventTarget = (map: Map<string, Set<() => void>>) => ({
  addEventListener: (event: string, fn: () => void) => {
    if (!map.has(event)) map.set(event, new Set())
    map.get(event)!.add(fn)
  },
  removeEventListener: (event: string, fn: () => void) => {
    map.get(event)?.delete(fn)
  },
  dispatchEvent: (e: Event | { type: string }) => {
    const type = 'type' in e ? e.type : ''
    map.get(type)?.forEach((fn) => fn())
    return true
  },
})

if (typeof document === 'undefined') {
  ;(globalThis as unknown as { document: object }).document = {
    hidden: false,
    ...stubEventTarget(documentListeners),
  }
}
if (typeof window === 'undefined') {
  ;(globalThis as unknown as { window: object }).window = stubEventTarget(windowListeners)
}

import { FAMILY_IDS } from '@study-rpg/content-neurons-tw'
import { db, todayISO } from '../lib/db'
import {
  start,
  stop,
  pause,
  resume,
  getReadingTimerState,
  __resetForTests,
  readTotalStudyMinutes,
} from '../lib/services/reading-timer'

const FAM = FAMILY_IDS[0] // 藥理學
const FAM2 = FAMILY_IDS[1] // 公共衛生學

/**
 * Spec Req: reading-timer accrues minutes, fires both side-effects per minute
 * crossing, auto-pauses on visibility (the ONLY auto-pause — the input-activity
 * idle pause was removed per remove-neurons-reading-timer-idle-pause), no
 * auto-resume on focus return.
 */

beforeEach(async () => {
  // Set up DB with REAL timers first (Dexie internals need real microtask timing)
  await db.delete()
  await db.open()
  await db.meta.put({ key: 'dmnLastDailyResetDate', value: todayISO() })
  __resetForTests()
  // Switch to fake timers AFTER DB setup so tick intervals are controlled.
  // Don't shim queueMicrotask / Promise; microtasks must run real for Dexie.
  vi.useFakeTimers({
    toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'],
  })
})

afterEach(() => {
  vi.useRealTimers()
  __resetForTests()
})

describe('reading-timer service', () => {
  it('starts in idle state', () => {
    expect(getReadingTimerState().status).toBe('idle')
    expect(getReadingTimerState().accumulatedSeconds).toBe(0)
  })

  it('start(FAM) transitions to reading', () => {
    start(FAM)
    expect(getReadingTimerState().status).toBe('reading')
    expect(getReadingTimerState().pauseReason).toBe(null)
  })

  it('accrues seconds via tick interval (dev = 10s/tick)', () => {
    start(FAM)
    expect(getReadingTimerState().accumulatedSeconds).toBe(0)
    vi.advanceTimersByTime(10_000)
    expect(getReadingTimerState().accumulatedSeconds).toBe(10)
    vi.advanceTimersByTime(20_000)
    expect(getReadingTimerState().accumulatedSeconds).toBe(30)
  })

  it('fires minute side-effect after 60s — totalStudyMinutes increments', async () => {
    start(FAM)
    expect(await readTotalStudyMinutes()).toBe(0)
    // Advance 60s of ticks (async variant flushes the async fireMinuteSideEffects).
    // NOTE: runAllTimersAsync would never terminate now that the tick interval
    // keeps running (no idle pause kills it) — use a bounded advance.
    await vi.advanceTimersByTimeAsync(60_000)
    expect(await readTotalStudyMinutes()).toBe(1)
    expect(getReadingTimerState().minutesFired).toBe(1)
  })

  it('fires two minute side-effects after 120s with zero input events', async () => {
    start(FAM)
    await vi.advanceTimersByTimeAsync(60_000)
    expect(await readTotalStudyMinutes()).toBe(1)
    // No activity events dispatched — genuine reading produces no input, and
    // the timer must keep accruing regardless.
    await vi.advanceTimersByTimeAsync(60_000)
    expect(await readTotalStudyMinutes()).toBe(2)
    expect(getReadingTimerState().minutesFired).toBe(2)
  })

  it('keeps running through a long no-input stretch — never idle-pauses (idle pause removed)', async () => {
    start(FAM)
    // Advance 5 minutes (well past the old 90s idle threshold) with NO
    // mousemove / keydown / touchstart events at all.
    await vi.advanceTimersByTimeAsync(300_000)
    expect(getReadingTimerState().status).toBe('reading')
    expect(getReadingTimerState().pauseReason).toBe(null)
    expect(getReadingTimerState().minutesFired).toBe(5)
    expect(await readTotalStudyMinutes()).toBe(5)
  })

  it('does NOT feed the DMN axis (reading decoupled from DMN draws per add-neurons-expedition-rewards)', async () => {
    start(FAM)
    await vi.advanceTimersByTimeAsync(60_000)
    // Reading still increments study minutes...
    expect(await readTotalStudyMinutes()).toBe(1)
    // ...but no longer touches the DMN expedition-axis counter (now expedition-driven).
    // (Reading's maze-energy faucet is covered by mastery-energy-faucets.test.ts.)
    expect(await db.meta.get('dmnTimeAxisMinutesAccrued')).toBeUndefined()
    expect(await db.meta.get('dmnDrawsAvailable')).toBeUndefined()
  })

  it('pause stops tick accrual', async () => {
    start(FAM)
    vi.advanceTimersByTime(30_000)
    expect(getReadingTimerState().accumulatedSeconds).toBe(30)
    pause('manual')
    expect(getReadingTimerState().status).toBe('paused')
    expect(getReadingTimerState().pauseReason).toBe('manual')
    // Advance more time while paused — should NOT accrue
    vi.advanceTimersByTime(60_000)
    expect(getReadingTimerState().accumulatedSeconds).toBe(30)
  })

  it('resume() picks up where paused left off', async () => {
    start(FAM)
    vi.advanceTimersByTime(30_000)
    pause('manual')
    expect(getReadingTimerState().accumulatedSeconds).toBe(30)
    resume()
    expect(getReadingTimerState().status).toBe('reading')
    // Crossing the minute boundary → side-effect fires (bounded async advance;
    // runAllTimersAsync would spin forever on the now-unkillable tick interval).
    await vi.advanceTimersByTimeAsync(30_000)
    expect(getReadingTimerState().accumulatedSeconds).toBe(60)
    expect(getReadingTimerState().minutesFired).toBe(1)
    expect(await readTotalStudyMinutes()).toBe(1)
  })

  it('stop() resets accumulated seconds but preserves persisted minutes', async () => {
    start(FAM)
    await vi.advanceTimersByTimeAsync(60_000)
    expect(await readTotalStudyMinutes()).toBe(1) // minute fired
    const persistedAfterFire = await readTotalStudyMinutes()
    stop()
    expect(getReadingTimerState().status).toBe('idle')
    expect(getReadingTimerState().accumulatedSeconds).toBe(0)
    expect(getReadingTimerState().minutesFired).toBe(0)
    // Persisted counter stays at whatever value was persisted before stop
    expect(await readTotalStudyMinutes()).toBe(persistedAfterFire)
    expect(persistedAfterFire).toBeGreaterThanOrEqual(1)
  })

  it('paused state does not fire side-effects on subsequent ticks', async () => {
    start(FAM)
    vi.advanceTimersByTime(30_000)
    pause('manual')
    expect(await readTotalStudyMinutes()).toBe(0)
    // Even if we advance 5 more minutes worth of fake time, no side-effects
    await vi.advanceTimersByTimeAsync(300_000)
    expect(await readTotalStudyMinutes()).toBe(0)
  })

  it('visibilitychange auto-pauses when document.hidden becomes true', () => {
    start(FAM)
    expect(getReadingTimerState().status).toBe('reading')
    // Simulate tab-hidden
    Object.defineProperty(document, 'hidden', { value: true, configurable: true })
    document.dispatchEvent(new Event('visibilitychange'))
    expect(getReadingTimerState().status).toBe('paused')
    expect(getReadingTimerState().pauseReason).toBe('visibility')
  })

  it('does NOT auto-resume when document.hidden becomes false', () => {
    start(FAM)
    Object.defineProperty(document, 'hidden', { value: true, configurable: true })
    document.dispatchEvent(new Event('visibilitychange'))
    expect(getReadingTimerState().status).toBe('paused')
    // Now simulate tab-visible
    Object.defineProperty(document, 'hidden', { value: false, configurable: true })
    document.dispatchEvent(new Event('visibilitychange'))
    // Status should still be paused — explicit resume() required
    expect(getReadingTimerState().status).toBe('paused')
    expect(getReadingTimerState().pauseReason).toBe('visibility')
  })

  // add-neurons-maze-zoom-and-focus: reading is per-subject. Switching the subject
  // ends the prior session (resets accumulated seconds + minutesFired) and rebinds the
  // active family, without double-counting the global totalStudyMinutes counter. (The
  // per-family energy routing itself is covered by maze-economy.test.ts.)
  it('switching subject ends the prior session and does not double-count study minutes', async () => {
    start(FAM)
    expect(getReadingTimerState().readingFamilyId).toBe(FAM)
    await vi.advanceTimersByTimeAsync(60_000)
    expect(await readTotalStudyMinutes()).toBe(1)

    // Switch subject — prior session ends, accumulated seconds + minutesFired reset.
    start(FAM2)
    expect(getReadingTimerState().readingFamilyId).toBe(FAM2)
    expect(getReadingTimerState().accumulatedSeconds).toBe(0)
    expect(getReadingTimerState().minutesFired).toBe(0)

    await vi.advanceTimersByTimeAsync(60_000)
    // Global counter increments once per minute regardless of subject (no double-count, no reset).
    expect(await readTotalStudyMinutes()).toBe(2)

    // stop clears the active subject.
    stop()
    expect(getReadingTimerState().readingFamilyId).toBe(null)
  })
})
