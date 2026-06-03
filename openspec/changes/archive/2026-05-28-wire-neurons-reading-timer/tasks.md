## 1. Reading-timer service (30 min)

- [x] 1.1 Create `apps/neurons-tw/src/lib/services/reading-timer.ts`
- [x] 1.2 Define internal state shape: `{ status: 'idle' | 'reading' | 'paused'; pauseReason: 'manual' | 'visibility' | 'idle' | null; accumulatedSeconds: number; lastMinuteFired: number }`
- [x] 1.3 Define `TICK_MS = import.meta.env.PROD ? 60_000 : 10_000` and `IDLE_TIMEOUT_MS = 90_000`
- [x] 1.4 Implement `start()`: set status=`reading`, attach visibilitychange + idle listeners, kick off setInterval ticker
- [x] 1.5 Implement `stop()`: clear listeners, clear interval, reset accumulatedSeconds=0, status=`idle`
- [x] 1.6 Implement `pause(reason)`: clear interval, status=`paused`, store pauseReason. Does NOT detach listeners (they need to stay alive to re-trigger if needed)
- [x] 1.7 Implement `resume()`: re-attach interval (if needed), status=`reading`, clear pauseReason
- [x] 1.8 Implement tick handler: increment `accumulatedSeconds` by TICK_MS/1000; check if crossed 60s boundary since `lastMinuteFired`; if yes → fire minute side-effects (Promise.all of `incrementTotalStudyMinutes` + `dmnReadingTimerSubscriber.onMinutesAccrued(1)`) + update lastMinuteFired
- [x] 1.9 Implement `incrementTotalStudyMinutes()` helper: `db.transaction('rw', db.meta, async () => { const cur = parseIntSafe((await db.meta.get('totalStudyMinutes'))?.value); await db.meta.put({ key: 'totalStudyMinutes', value: String(cur + 1), updatedAt: Date.now() }); })`
- [x] 1.10 Implement visibilitychange listener: on `document.hidden === true && status === 'reading'` → `pause('visibility')`
- [x] 1.11 Implement idle detection: 90s setTimeout reset on mousemove / keydown / touchstart; on timeout fire → `pause('idle')`
- [x] 1.12 Implement event emitter: `onStateChange(listener: () => void): () => void` returning unsubscribe. State change events fire on every status / pauseReason / accumulatedSeconds / minute side-effect.
- [x] 1.13 Export `getReadingTimerState()` for synchronous current-state reads

## 2. React hook (10 min)

- [x] 2.1 Create `apps/neurons-tw/src/lib/hooks/useReadingTimer.ts`
- [x] 2.2 Use `useSyncExternalStore` (React 18 native) subscribing to `onStateChange` + reading from `getReadingTimerState`
- [x] 2.3 Return: `{ status, pauseReason, accumulatedSeconds, currentMinute (= floor(accumulatedSeconds / 60)), start, stop }`

## 3. Achievement-stats wire-up (5 min)

- [x] 3.1 Edit `apps/neurons-tw/src/lib/services/achievement.ts` `buildAchievementStats`: replace hardcoded `totalStudyMinutes: 0` with actual read from `db.meta.get('totalStudyMinutes')` (parseIntSafe defaults to 0 if missing)

## 4. OverviewPage UI (15 min)

- [x] 4.1 Import `useReadingTimer` hook in `OverviewPage.tsx`
- [x] 4.2 Add reading-timer toggle button next to the existing 🎯 開始答題 CTA (in same `quizCtaSection` or a sibling section)
- [x] 4.3 Button label states:
  - `idle` → 「📖 開始閱讀」
  - `reading` → 「🟢 閱讀中 · {currentMinute} min · 點擊結束」
  - `paused.manual` → impossible (manual pause = stop)
  - `paused.visibility` → 「⏸ 已自動暫停（切到別的分頁）· 點擊重新開始」
  - `paused.idle` → 「⏸ 已自動暫停（90s 無動作）· 點擊重新開始」
- [x] 4.4 Show small subtext: "今日累計 {totalStudyMinutes} min · 距下個 DMN 抽卡還剩 {30 - (totalStudyMinutes % 30)} min" (only when totalStudyMinutes value loaded)
- [x] 4.5 Click handler: if `idle` or `paused` → `start()`; if `reading` → `stop()`
- [x] 4.6 Style matches existing 開始答題 button (gold gradient pattern)

## 5. Vitest unit tests (~25 min)

- [x] 5.1 Create `apps/neurons-tw/src/__tests__/reading-timer.test.ts`
- [x] 5.2 Test: `start()` transitions state to `reading`
- [x] 5.3 Test: 60 seconds of advanceTimersByTime → minute side-effect fires once (meta increment + DMN subscriber call)
- [x] 5.4 Test: 120 seconds of advanceTimersByTime → minute side-effect fires twice
- [x] 5.5 Test: visibility change auto-pauses (mock document.hidden + dispatch event)
- [x] 5.6 Test: 90s no activity auto-pauses with reason `'idle'`
- [x] 5.7 Test: `stop()` clears state and stops accruing
- [x] 5.8 Test: paused state does NOT fire minute side-effects on tick
- [x] 5.9 Mock `dmnReadingTimerSubscriber` and `db.meta` interactions; use `vi.useFakeTimers()` for tick control

## 6. Verify (~15 min)

- [x] 6.1 `pnpm --filter @study-rpg/neurons-tw test` (Vitest, the new tests pass) ✅
- [x] 6.2 `pnpm --filter @study-rpg/neurons-tw typecheck` ✅
- [x] 6.3 `pnpm --filter @study-rpg/neurons-tw build` ✅
- [x] 6.4 Dev smoke: open `/`, click 開始閱讀, wait 10s (one tick in dev mode), verify no UI break
- [x] 6.5 Chrome MCP smoke: trigger ticks by `vi.advanceTimersByTime`-equivalent (or wait 60s real time), verify `meta['totalStudyMinutes']` increments via Dexie inspect, verify `meta['dmnTimeAxisMinutesAccrued']` increments too
- [x] 6.6 Chrome MCP visibility test: start reading → switch tab → switch back → verify state is paused with reason visibility
- [x] 6.7 `openspec validate wire-neurons-reading-timer --strict` ✅

## 7. Archive (~5 min)

- [ ] 7.1 Sync delta into main `neurons-mode/spec.md`
- [ ] 7.2 Move change to archive
- [ ] 7.3 `openspec validate --all --strict` ✅
- [ ] 7.4 Explicit file-by-file `git add`; commit + push + merge to main

**Estimated total wall time**: ~110-130 min

## Acceptance criteria

- [x] `reading-timer.ts` service created with state machine + tick loop + listeners
- [x] `useReadingTimer.ts` hook created
- [x] OverviewPage shows reading-timer toggle button next to quiz button
- [x] Achievement service reads real `meta['totalStudyMinutes']` (not hardcoded 0)
- [x] 7 Vitest tests pass for service behaviors
- [x] Dev smoke: clicking 開始閱讀 + waiting 60s shows counter increment + Dexie `totalStudyMinutes` increment
- [x] DMN time-axis accrual fires (verified via Dexie `dmnTimeAxisMinutesAccrued` increments by 1 per minute)
- [x] Visibility change auto-pauses
- [x] 90s idle auto-pauses
- [x] No auto-resume on tab focus return
- [x] typecheck + build + Vitest + openspec validate all pass
- [x] No new npm dependencies
