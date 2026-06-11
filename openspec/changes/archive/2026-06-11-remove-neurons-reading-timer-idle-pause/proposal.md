## Why

Reading-timer 目前在 90 秒沒有 `mousemove` / `keydown` / `touchstart` 時自動暫停（`pauseReason: 'idle'`）。這個設計是錯的：**真實閱讀本來就不產生 input event** — 玩家認真讀講義時 timer 反而被暫停，懲罰到正常使用者；而對 AFK 刷分的嚇阻力又很弱（掛個 mouse jiggler 就破）。Owner 決定：**整個移除 90s idle pause**。留下的防刷層是 (a) 既有的 tab-visibility 暫停（切到別的分頁立即 pause、回來不自動 resume）+ (b) 每分鐘最多 +1 的屬性上限（在別處實作，本 change 不碰）。

## What Changes

- **`apps/neurons-tw/src/lib/services/reading-timer.ts`**：移除 `IDLE_TIMEOUT_MS` / `idleTimer` / `resetIdleTimer()` / `clearIdleTimer()` / `onActivity()` / `pause('idle')`，以及 `mousemove` / `keydown` / `touchstart` 三個 window listener（它們只為餵 idle timer 而存在）。`ReadingTimerPauseReason` union `'manual' | 'visibility' | 'idle' | null` → `'manual' | 'visibility' | null`。`attachActivityListeners` / `detachActivityListeners` 移除 activity wiring 後只剩 `visibilitychange` → 改名 `attachVisibilityListener` / `detachVisibilityListener`（visibility 行為一字不動：tab-hidden 即 pause、回 tab 不 auto-resume）。
  - ⚠️ 命名陷阱已守住：`ReadingTimerStatus` 的 `'idle'`（= 停止 / 未閱讀）**完全不動**；移除的是 pause **reason** 的 `'idle'`。
- **`apps/neurons-tw/src/routes/OverviewPage.tsx`**：`readingActiveLabel` 移除 `pauseReason === 'idle'` 分支（`'⏸ 90s 無動作 · 點擊繼續'`）；`'visibility'` 分支（`'⏸ 切到別的分頁 · 點擊繼續'`）保留。
- **Tests（`apps/neurons-tw/src/__tests__/reading-timer.test.ts`）**：移除「dispatch activity 以打敗 idle pause」的橋接；`pause('idle')` callsite 改 `pause('manual')`；**新增**長時間無 input 的 keep-running test（fake timers 推進 300s 遠超舊 90s 門檻、零 input event → status 維持 `'reading'`、分鐘照常累積、`pauseReason` 永不為 `'idle'`）。visibility-pause / minute-tick / manual-pause tests 全保留。
- **使用者文案稽核**：grep 全 app `90s` / `無動作` / idle — HelpMenu / onboarding / guided tour 均無 idle-pause 承諾，唯一文案在 OverviewPage（已移除）。
- **`openspec/project.md`** 誠信防護條目：「`visibilitychange` + idle > 90s 自動 pause」→ visibility-only。

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `neurons-mode`：reading-timer requirement 移除「90s idle 自動暫停」條款（含其 scenario），保留 visibility 自動暫停 + no-auto-resume；新增「長時間無 input 不暫停」normative 條款與 scenario；pause-reason domain 明文為 `'manual' | 'visibility' | null`。

## Impact

- **Code**: `apps/neurons-tw/src/lib/services/reading-timer.ts`、`apps/neurons-tw/src/routes/OverviewPage.tsx`、`apps/neurons-tw/src/__tests__/reading-timer.test.ts`。
- **Specs**: `openspec/specs/neurons-mode/spec.md`（reading-timer requirement MODIFIED）；`openspec/project.md` 誠信防護一行。
- **零** Dexie / R2 / `SYNCED_META_KEYS` / economy / schema 改動 — device-local 行為調整。`totalStudyMinutes` 累積語意不變（仍是每 60s 真實 tick +1，只是不再被 idle 誤暫停打斷）。
- 不碰：每分鐘屬性上限（別處）、maze 能量 faucet、DMN（reading 已 decoupled）、legacy `reading-loop` spec（一階遺留、app 已移除）。
