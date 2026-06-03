import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import 'fake-indexeddb/auto'

// Minimal DOM stub for node-env tests — service uses document.hidden + visibilitychange + window event listeners
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

/**
 * Spec Req: reading-timer accrues minutes, fires both side-effects per minute
 * crossing, auto-pauses on visibility / 90s idle, no auto-resume on focus return.
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

  it('start() transitions to reading', () => {
    start()
    expect(getReadingTimerState().status).toBe('reading')
    expect(getReadingTimerState().pauseReason).toBe(null)
  })

  it('accrues seconds via tick interval (dev = 10s/tick)', () => {
    start()
    expect(getReadingTimerState().accumulatedSeconds).toBe(0)
    vi.advanceTimersByTime(10_000)
    expect(getReadingTimerState().accumulatedSeconds).toBe(10)
    vi.advanceTimersByTime(20_000)
    expect(getReadingTimerState().accumulatedSeconds).toBe(30)
  })

  it('fires minute side-effect after 60s — totalStudyMinutes increments', async () => {
    start()
    expect(await readTotalStudyMinutes()).toBe(0)
    // Advance 60s of ticks
    vi.advanceTimersByTime(60_000)
    // Need to flush microtasks since fireMinuteSideEffects is async
    await vi.runAllTimersAsync()
    expect(await readTotalStudyMinutes()).toBe(1)
    expect(getReadingTimerState().minutesFired).toBe(1)
  })

  it('fires two minute side-effects after 120s (with activity to defeat idle pause)', async () => {
    start()
    // Need to dispatch activity events to defeat the 90s idle auto-pause
    await vi.advanceTimersByTimeAsync(60_000)
    expect(await readTotalStudyMinutes()).toBe(1)
    // Simulate user activity to reset idle timer
    ;(globalThis as unknown as { window: { dispatchEvent: (e: { type: string }) => void } }).window.dispatchEvent({ type: 'mousemove' })
    await vi.advanceTimersByTimeAsync(60_000)
    expect(await readTotalStudyMinutes()).toBe(2)
    expect(getReadingTimerState().minutesFired).toBe(2)
  })

  it('publishes minute ticks to DMN time-axis (dmnTimeAxisMinutesAccrued grows)', async () => {
    start()
    await vi.advanceTimersByTimeAsync(60_000)
    const row = await db.meta.get('dmnTimeAxisMinutesAccrued')
    expect(row?.value).toBe('1')
  })

  it('pause stops tick accrual', async () => {
    start()
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
    start()
    vi.advanceTimersByTime(30_000)
    pause('manual')
    expect(getReadingTimerState().accumulatedSeconds).toBe(30)
    resume()
    expect(getReadingTimerState().status).toBe('reading')
    vi.advanceTimersByTime(30_000)
    expect(getReadingTimerState().accumulatedSeconds).toBe(60)
    // Now we've crossed the minute boundary → side-effect should fire
    await vi.runAllTimersAsync()
    expect(getReadingTimerState().minutesFired).toBe(1)
    expect(await readTotalStudyMinutes()).toBe(1)
  })

  it('stop() resets accumulated seconds but preserves persisted minutes', async () => {
    start()
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
    start()
    vi.advanceTimersByTime(30_000)
    pause('idle')
    expect(await readTotalStudyMinutes()).toBe(0)
    // Even if we advance 5 more minutes worth of fake time, no side-effects
    await vi.advanceTimersByTimeAsync(300_000)
    expect(await readTotalStudyMinutes()).toBe(0)
  })

  it('visibilitychange auto-pauses when document.hidden becomes true', () => {
    start()
    expect(getReadingTimerState().status).toBe('reading')
    // Simulate tab-hidden
    Object.defineProperty(document, 'hidden', { value: true, configurable: true })
    document.dispatchEvent(new Event('visibilitychange'))
    expect(getReadingTimerState().status).toBe('paused')
    expect(getReadingTimerState().pauseReason).toBe('visibility')
  })

  it('does NOT auto-resume when document.hidden becomes false', () => {
    start()
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
})
