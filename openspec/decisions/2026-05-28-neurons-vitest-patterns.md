# 2026-05-28 — neurons-tw Vitest patterns (captured during wire-neurons-reading-timer)

## Context

Adding Vitest unit tests for a service that uses browser-only APIs (`setInterval`, `document.hidden`, `visibilitychange`, `window.addEventListener('mousemove' / 'keydown' / 'touchstart')`) hit two non-obvious gotchas. Capturing here so the next test author doesn't burn 30 min rediscovering.

## Decision 1 — vitest config is `environment: 'node'`, NOT jsdom

`apps/neurons-tw/vitest.config.ts` declares `environment: 'node'`. Any test that touches `document` / `window` will throw `ReferenceError: document is not defined`.

**Workaround used in `reading-timer.test.ts`**: minimal stubs at top of test file BEFORE importing the service-under-test:

```ts
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
```

**Alternative considered**: switch `environment` to `jsdom`. Rejected because it would affect all 6 existing test files and require dep audit. Inline stubs are surgical.

**When to use which**: surface-level browser API touch (document.hidden / visibilitychange / activity events) → inline stubs. Complex DOM rendering tests (React component render, querySelector chains) → switch the file's `// @vitest-environment jsdom` directive on a per-file basis.

## Decision 2 — `vi.useFakeTimers()` must run AFTER `db.open()`, not before

If you call `vi.useFakeTimers()` in `beforeEach` BEFORE `await db.open()`, Dexie's internal microtask scheduling gets faked too → `Hook timed out in 10000ms` failure on every test.

**Correct order in `beforeEach`**:

```ts
beforeEach(async () => {
  // 1. DB setup with REAL timers
  await db.delete()
  await db.open()
  await db.meta.put({ key: 'dmnLastDailyResetDate', value: todayISO() })
  __resetForTests()
  // 2. SWITCH to fake timers AFTER DB ready
  vi.useFakeTimers({
    toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'],
  })
})

afterEach(() => {
  vi.useRealTimers()
  __resetForTests()
})
```

**Key detail**: pass explicit `toFake` so Promise / queueMicrotask stay real (Dexie depends on them). Don't use `shouldAdvanceTime: true` — it advances real wall clock during awaits and creates non-deterministic timing.

## Decision 3 — Use `advanceTimersByTimeAsync` not `advanceTimersByTime` + `runAllTimersAsync`

For async-side-effect tests:

```ts
// ❌ Wrong — multi-minute test gets only 1 minute fire
vi.advanceTimersByTime(120_000)
await vi.runAllTimersAsync()  // can over-advance with setInterval

// ✅ Right — predictable, splits into phases
await vi.advanceTimersByTimeAsync(60_000)
// optionally dispatch activity events here to defeat idle pause
await vi.advanceTimersByTimeAsync(60_000)
```

`runAllTimersAsync()` with setInterval tries to drain the entire timer queue, which is infinite for setInterval. `advanceTimersByTimeAsync(N)` advances exactly N ms then flushes pending microtasks.

## Decision 4 — Idle auto-pause defeats multi-minute integration tests

`reading-timer` service has a 90s idle auto-pause. After 90s of fake-time advancement with no mousemove/keydown/touchstart event, the timer auto-pauses. This silently kills tests that expect 2+ minute side-effects across the 90s threshold.

**Fix**: dispatch a synthetic mousemove between phases:

```ts
await vi.advanceTimersByTimeAsync(60_000)
expect(await readTotalStudyMinutes()).toBe(1)
;(globalThis as unknown as { window: { dispatchEvent: (e: { type: string }) => void } }).window.dispatchEvent({ type: 'mousemove' })
await vi.advanceTimersByTimeAsync(60_000)
expect(await readTotalStudyMinutes()).toBe(2)
```

The activity event resets the idle 90s countdown, letting the second minute fire.

## How to apply

- Next neurons-tw service test that hits browser APIs → copy the document/window stub block from `reading-timer.test.ts` lines 4-30
- Next test using fake timers + Dexie → use the `beforeEach` ordering above
- Any test that advances > 90s of accrued reading time → dispatch periodic activity events
- Consider extracting the stubs to a shared `__tests__/setup-browser-stubs.ts` if a 3rd test needs them (not yet warranted)
