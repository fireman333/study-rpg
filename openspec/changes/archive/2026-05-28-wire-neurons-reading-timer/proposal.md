## Why

Three loose ends documented in the `polish-neurons-pre-ship` roadmap entry all converge on a missing reading-timer service:

1. **DMN time-axis is inactive** — `add-neurons-dmn-fate-card` shipped a `ReadingTimerSubscriber` interface at [`dmn-trigger.ts:170`](apps/neurons-tw/src/lib/services/dmn-trigger.ts) but nothing publishes minute ticks to it. DMN draws are stuck on behavior-axis only (every variant slot unlock / synapse form), missing the time-axis bonus that gives reading 30 min → +1 draw value.
2. **`study` category achievement triggers are always-0** — `achievement.ts:137` hardcodes `totalStudyMinutes: 0` so the 4 `study-*` achievements (`study-warmup`, `study-hours-5`, `study-hours-20`, `study-marathon`) can never unlock no matter how long the user reads.
3. **No user-side reading mode** — the new `wire-neurons-quiz-modal-mvp` (shipped earlier today) lets users answer questions, but there's still no "I'm now reading study material" mode that accrues time-based rewards while the user studies passively (textbook reading, watching lectures, etc.).

Sibling app `medexam-tw` has a battle-tested reading-timer pattern in `App.tsx` (lines 91-474): tick interval + visibilitychange pause + idle pause via mousemove/keydown/touchstart listeners. Porting this pattern to neurons-tw with the DMN subscriber wire-up + `totalStudyMinutes` accrual closes all three gaps at once.

This is the largest of the three "polish-neurons-pre-ship" pieces (per session-2 roadmap). With this shipped, neurons-tw is genuinely "完整上線" — all four user-facing surfaces (quiz / connectome / DMN / reading) are wired and functional, ready for the Threads public intro post.

## What Changes

- **New service** `apps/neurons-tw/src/lib/services/reading-timer.ts`:
  - Singleton state machine: `idle | reading | paused`
  - `start()` / `stop()` / `pause(reason)` / `resume()` methods
  - Tick loop using `setInterval` (10s/tick in dev for visible accrual; 60s/tick in prod via `import.meta.env.PROD` check)
  - Each tick increments an in-memory `accumulatedSeconds` counter
  - On every 60-second threshold crossing (1 game minute):
    - Increment `meta['totalStudyMinutes']` (synced via SYNCED_META_KEYS — already in allowlist)
    - Call `dmnReadingTimerSubscriber.onMinutesAccrued(1)` to activate DMN time-axis accrual
  - Internal `visibilitychange` listener: auto-pauses with reason `'visibility'` when `document.hidden`
  - Internal idle listener: 90s without mousemove/keydown/touchstart → auto-pause with reason `'idle'`
  - Event emitter `onStateChange(listener)` so UI can react
- **New hook** `apps/neurons-tw/src/lib/hooks/useReadingTimer.ts`:
  - Subscribes to the service's state changes
  - Returns `{ state, accumulatedSeconds, currentMinute, pauseReason, start, stop }`
  - Cleanup on unmount
- **OverviewPage UI**: add 「📖 開始閱讀」 / 「⏸ 暫停中」 / 「🟢 閱讀中」 toggle button next to the existing 「🎯 開始答題」 CTA. Show accumulated time below (e.g. "今日累計 12 min · 距下個 DMN 抽卡還剩 18 min")
- **Wire achievement stats**: update `buildAchievementStats` in [`apps/neurons-tw/src/lib/services/achievement.ts`](apps/neurons-tw/src/lib/services/achievement.ts) to read `meta['totalStudyMinutes']` instead of hardcoded 0. Activates the 4 study-* achievements.
- **Vitest unit tests**: `apps/neurons-tw/src/__tests__/reading-timer.test.ts` covering: minute threshold crossing → both side-effects fire (meta increment + DMN subscriber call); visibilitychange pause; idle pause; stop clears state; resume re-resumes from saved accumulated seconds.

**不做 (MVP scope cuts)**：

- 不 ship reading-timer cross-device sync across `accumulatedSeconds` mid-session state — only the per-minute `totalStudyMinutes` counter is synced (LWW via existing meta adapter). If you switch device mid-reading, you lose the in-flight partial minute. Acceptable trade-off.
- 不 ship explicit per-family reading boost (e.g., "reading 30 min while 病理學 mastery active gives 病理學 AP +1") — keep timer family-agnostic for MVP
- 不 ship reading streak bonus (e.g., 30-day reading streak grants extra bonus) — straightforward follow-up but out of scope
- 不 ship dorm-style "no game mechanics" override route — neurons-tw has no dorm route
- 不 ship per-content-type counters (textbook vs lecture vs review) — single counter for MVP
- 不 ship reading-timer-launched quiz flow (e.g., "after 10 min reading, popup quiz") — defer
- 不 ship 「太簡單 / 我亂猜的」 SRS quality modifiers in quiz (already excluded from quiz-modal-mvp; cross-reference)
- 不 ship streak break-day toast — pre-existing behavior in `streak.resetCurrentStreak` fires unchanged

## Capabilities

### New Capabilities

- 無

### Modified Capabilities

- `neurons-mode`: add one ADDED requirement (`### Requirement: neurons-tw SHALL provide a reading-timer that accrues study minutes and publishes ticks to the DMN time-axis subscriber`). Locks the contract that:
  - Reading-mode toggle is reachable from a main route
  - Each accrued minute increments `meta['totalStudyMinutes']` (used by `study-*` achievements)
  - Each accrued minute publishes `onMinutesAccrued(1)` to the DMN time-axis chain
  - Timer auto-pauses on tab-hidden / 90s idle (anti-cheat per CLAUDE.md "誠信防護")

## Impact

- **Code**:
  - `apps/neurons-tw/src/lib/services/reading-timer.ts` (new, ~180 lines)
  - `apps/neurons-tw/src/lib/hooks/useReadingTimer.ts` (new, ~50 lines)
  - `apps/neurons-tw/src/routes/OverviewPage.tsx` (modified: add reading-timer button + status display ~50 lines)
  - `apps/neurons-tw/src/lib/services/achievement.ts` (modified: 1 line — read `totalStudyMinutes` from meta instead of hardcoded 0)
  - `apps/neurons-tw/src/__tests__/reading-timer.test.ts` (new, ~150 lines covering 6-8 test cases)
- **APIs**: none new (uses existing `dmnReadingTimerSubscriber` interface)
- **Dependencies**: no new npm packages (uses browser `setInterval` / `visibilitychange` / event listeners)
- **Data**: no Dexie schema bump; `meta['totalStudyMinutes']` already exists (counter created lazily on first increment)
- **Backwards compat**: pure feature addition; pre-existing users get a new button + can now unlock study-* achievements retroactively if they happen to read going forward
- **Sync**: `totalStudyMinutes` already in SYNCED_META_KEYS allowlist; no sync schema change needed. New behavior: counter starts incrementing instead of staying at 0
- **Spec touched**: one ADDED requirement to `neurons-mode`
- **Bundle delta**: ~5-8 KB additional JS (service + hook + UI; reading-timer service is more complex than quiz modal because of listener management)
- **Deploy path**: standard `pnpm deploy:cf` + GH Actions
