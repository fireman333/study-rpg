## Context

`add-neurons-dmn-fate-card` (archived 2026-05-28) shipped the DMN time-axis accrual logic at [`dmn-trigger.ts:140 accrueReadingMinutes()`](apps/neurons-tw/src/lib/services/dmn-trigger.ts) — but no publisher exists. The `ReadingTimerSubscriber` interface at line 170 is a contract waiting for the timer.

Sibling app `medexam-tw` has a battle-tested reading-timer pattern in `App.tsx` (lines 91-474). It uses:
- `READING_TICK_MS = 10_000` (10s/tick demo cap; comment says "M2 prod can bump to 60_000")
- `READING_IDLE_TIMEOUT_MS = 90_000` (90s idle pause threshold)
- State as React `useState` directly in App.tsx
- `visibilitychange` listener for tab-hidden auto-pause
- `mousemove` + `keydown` + `touchstart` listeners for idle reset

For neurons-tw we extract the logic into a **singleton service** (not React state) so it survives route changes and runs independent of `App.tsx` re-renders. A thin `useReadingTimer` hook wraps the service for React consumption.

## Goals / Non-Goals

**Goals:**

- One service is the source of truth for "is reading active and how many seconds have accumulated"
- Service-level pause on visibility / idle (anti-cheat per CLAUDE.md "誠信防護")
- Each game-minute (60 accumulated seconds) → fires exactly one minute-side-effect (both `totalStudyMinutes++` and `dmnReadingTimerSubscriber.onMinutesAccrued(1)`)
- Tick interval configurable for dev (10s/tick demo) vs prod (60s/tick) via `import.meta.env.PROD`
- Hook returns observable state for UI rendering (current minute count, pause reason, etc.)
- Achievement service sees real `totalStudyMinutes` from `meta` instead of hardcoded 0
- Tests cover state machine + threshold crossing + auto-pause behaviors

**Non-Goals:**

- **不** sync mid-session in-flight partial minutes across devices (just sync the per-minute counter)
- **不** mock-runner/dorm-style "no game mechanics" override (neurons-tw has no such routes)
- **不** per-family reading boost
- **不** reading streak / 30-day bonus
- **不** persist `accumulatedSeconds` to Dexie (only minute-level counter persisted; sub-minute state lives in-memory and is OK to lose on tab close)
- **不** auto-resume on tab focus return (require explicit `start()` again, per medexam-tw convention)

## Decisions

### Decision 1: Singleton service vs React state in App.tsx

**Choice**: Singleton service (not React state). React hook is a thin subscription wrapper.

**Why**:

- React state in App.tsx means timer dies on route navigation (acceptable in medexam-tw because reading is a top-level mode; in neurons-tw user might navigate /connectome ↔ /dmn etc. while reading-mode is on)
- Singleton survives route changes
- Easier to unit-test (no React testing library needed)
- Easier to add additional subscribers (e.g., a status badge in nav) without prop drilling

**Alternatives considered**:

- React Context — rejected; over-engineered when the data shape is simple state machine + counter
- Zustand / Jotai — rejected; no other store usage in neurons-tw, would add new dep
- Direct React state in App.tsx (medexam-tw approach) — rejected; mixes concerns + dies on navigate

### Decision 2: Tick interval — 10s/tick in dev, 60s/tick in prod

**Choice**: `const TICK_MS = import.meta.env.PROD ? 60_000 : 10_000`

**Why**:

- Dev needs visible accrual (60s/tick = wait 1 min just to see counter update; bad DX)
- Prod prevents grinding cheats (faster ticks could be inspected and abused, though browser dev-tools is already a backdoor)
- 10s/tick is what medexam-tw ships (per their `READING_TICK_MS = 10_000` comment that "M2 prod can bump to 60_000")

**Alternative**: Per-second tick. Rejected — would fire visibilitychange checks 60× more often for no benefit; counter only updates on minute boundary anyway

### Decision 3: Minute side-effect = `Promise.all` for atomic-ish dispatch

**Choice**: Each minute fires:
```ts
await Promise.all([
  incrementTotalStudyMinutes(),  // db.meta upsert
  dmnReadingTimerSubscriber.onMinutesAccrued(1),  // already async, calls accrueReadingMinutes
])
```

**Why**:

- Both side-effects should land before next tick; parallel-await keeps them concurrent
- `Promise.all` rejection-propagation surfaces failures (per coding_principles.md "No Silent Errors")
- If `db.meta` upsert fails (e.g., quota), we know via console error rather than silently undercounting

### Decision 4: Visibility / idle pause reasons captured in service state

**Choice**: Service state is `{ status: 'idle' | 'reading' | 'paused'; pauseReason: 'manual' | 'visibility' | 'idle' | null }`. UI reads both.

**Why**:

- Lets UI display "🔴 閱讀中" vs "⏸ 暫停（離開頁面）" vs "⏸ 暫停（閒置）" with appropriate copy
- `pause('visibility')` vs `pause('idle')` vs `pause('manual')` lets resume logic distinguish (visibility resumes auto on focus return; idle requires user activity; manual requires button press)

### Decision 5: Idle reset = mousemove + keydown + touchstart, NOT scroll

**Choice**: Listen on `mousemove`, `keydown`, `touchstart` events. Do NOT use `scroll` events.

**Why**:

- Matches medexam-tw convention exactly (battle-tested)
- `scroll` events fire automatically on touch devices from natural movement → spoils idle detection
- These three events cover keyboard study + mouse-based browsing + mobile touch interaction

### Decision 6: No auto-resume on tab focus return

**Choice**: When `visibilitychange` fires with `document.hidden === false`, do NOT auto-resume. User must click 「📖 開始閱讀」 again.

**Why**:

- Matches medexam-tw convention (explicit user action restarts)
- Prevents accidental tab-switch from continuing to accrue while user is doing something else
- Slight UX friction is worth the anti-cheat property

### Decision 7: Tests use fake timers + manual visibility event dispatch

**Choice**: Vitest tests use `vi.useFakeTimers()` and manually dispatch `visibilitychange` events via `document.dispatchEvent(new Event('visibilitychange'))`.

**Why**:

- Real `setInterval` would make tests slow + flaky
- Vitest's `vi.advanceTimersByTime(60_000)` deterministically triggers ticks
- Manual `visibilitychange` dispatch is the standard pattern (jsdom supports it)

### Decision 8: Counter init = "0 if absent" semantics

**Choice**: `getTotalStudyMinutes()` returns `parseInt(meta.get('totalStudyMinutes')?.value, 10)` or 0 if missing/NaN.

**Why**:

- Existing meta-key idiom in neurons-tw (see `dmn-trigger.ts` `parseIntSafe()`)
- New users have no row → start at 0
- LWW sync naturally upgrades when device with higher value pushes
- No "init on first read" needed — increment-then-read is fine

## Risks / Trade-offs

| Risk | Mitigation |
|---|---|
| User loses in-flight sub-minute progress on tab close | Acceptable — granularity is 1 game minute; losing < 60s is trivial. Counter increment is atomic per minute. |
| Two tabs open → double-counting (each tab has its own service singleton) | Same risk as medexam-tw — accept for MVP. Future: BroadcastChannel for cross-tab coordination. |
| `visibilitychange` doesn't fire on some browsers / private mode | Modern browsers support it; private mode still works. If it doesn't, idle timer (90s) catches the user anyway. |
| Idle timer fires while user is reading slowly (passive reading without mouse moves) | 90s threshold is generous; user typically scrolls or moves mouse within 90s of active reading. If they're truly stationary > 90s, they're not "actively reading" by our definition. |
| Tests rely on fake timers — real browser behavior might diverge | Cover with one Chrome MCP smoke verifying actual minute accrual in dev mode. |
| Switching devices mid-session loses in-flight partial minute | Documented as accepted trade-off. Sync covers per-minute granularity only. |
| Bundle bloat from service + hook + UI | ~5-8 KB est; negligible. |
| Hook re-render thrash if state updates every tick | State updates only on minute-boundary (not every tick); React renders ~1×/min during reading mode. |

## Migration Plan

**Deploy path**: standard `pnpm deploy:cf` + GH Actions on `main`. No env vars / Worker / D1 / Supabase change.

**Rollback**: revert `OverviewPage.tsx` button + delete the new service / hook / test files. Revert `achievement.ts` totalStudyMinutes reading back to hardcoded 0.

**Cross-track impact**: zero — modifications scoped to `apps/neurons-tw/`. Does NOT modify the `ReadingTimerSubscriber` interface or `accrueReadingMinutes` in `dmn-trigger.ts` (those are already shipped).

## Open Questions

None at design time. Implementation details (exact button copy, styling alignment) resolve inline during apply.
