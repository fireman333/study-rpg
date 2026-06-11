> Device-local 行為調整。零 Dexie / R2 / SYNCED_META_KEYS / economy 改動；visibility 暫停行為一字不動。

## 1. reading-timer.ts（idle pause 移除）

- [x] 1.1 移除 `IDLE_TIMEOUT_MS` 常數、`idleTimer` 變數、`resetIdleTimer()` / `clearIdleTimer()` / `onActivity()` 與 `pause('idle')`。
- [x] 1.2 移除 `mousemove` / `keydown` / `touchstart` window listeners（只為 idle timer 存在）；`attachActivityListeners` / `detachActivityListeners` 改名 `attachVisibilityListener` / `detachVisibilityListener`（只 wire `visibilitychange`；guard 改 `typeof document`）。
- [x] 1.3 清掉 start / stop / pause / resume / `__resetForTests` 內所有 `resetIdleTimer()` / `clearIdleTimer()` callsite。
- [x] 1.4 `ReadingTimerPauseReason` → `'manual' | 'visibility' | null`；**`ReadingTimerStatus` 的 `'idle'`（停止態）不動**。
- [x] 1.5 Doc comment 移除「90s idle」/ idle threshold 敘述，註明 visibility 是唯一 auto-pause。

## 2. Downstream 文案

- [x] 2.1 `OverviewPage.tsx` `readingActiveLabel`：移除 `pauseReason === 'idle'`（`'⏸ 90s 無動作 · 點擊繼續'`）分支；`'visibility'` 分支保留。
- [x] 2.2 全 app grep `90s` / `90 秒` / `無動作` / idle：HelpMenu / GuidedTour / OnboardingHost / banners 無 idle-pause 承諾文案 → 不動（其餘 `idle` 命中皆為無關語意：sync engine state、sprite idle loop、nickname status 等）。

## 3. Tests

- [x] 3.1 移除「dispatch mousemove 打敗 idle pause」橋接（120s 雙分鐘 test 改為零 input 直接推進）。
- [x] 3.2 `pause('idle')` callsite 改 `pause('manual')`（paused-no-side-effects test）。
- [x] 3.3 新增 keep-running test：fake timers 推進 300s（遠超舊 90s 門檻）、零 input event → status 維持 `'reading'`、`minutesFired === 5`、`pauseReason === null`（永不 `'idle'`）。
- [x] 3.4 visibility-pause / no-auto-resume / minute-tick / manual-pause / subject-switch tests 全保留。

## 4. Specs

- [x] 4.1 `specs/neurons-mode/spec.md` delta：MODIFIED reading-timer requirement — 刪 90s idle 條款 + scenario、保留 visibility 條款 + scenarios、新增 no-input keep-running 條款 + scenario。
- [x] 4.2 `openspec/project.md` 誠信防護：「`visibilitychange` + idle > 90s 自動 pause」→ visibility-only。
- [x] 4.3 `openspec validate remove-neurons-reading-timer-idle-pause --strict` 通過。

## 5. Verify

- [x] 5.1 `pnpm --filter @study-rpg/neurons-tw typecheck` clean。
- [x] 5.2 `pnpm --filter @study-rpg/neurons-tw test` 全綠。
