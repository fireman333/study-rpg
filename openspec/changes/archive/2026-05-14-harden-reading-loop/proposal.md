## Why

`apps/medexam-tw/src/App.tsx` 第 73-88 的 reading timer 邏輯目前是 demo stub：`setInterval` 每秒 +1000ms 到 `readMs`，模 10000ms 觸發一次 +5 XP / +1 stamina。

問題：
1. **無 visibility 監聽** — 切到別的 tab / 鎖螢幕，計時器繼續加 XP（玩家可放著刷分）
2. **無 idle 偵測** — 開著但離桌 30 分鐘，計時器繼續加 XP
3. **無「每分鐘最多 +1 屬性」cap 的明確 spec**（雖然 mod 10000ms 等效有 cap，但沒文件化、未來人 refactor 容易拿掉）

project.md 「Failure Modes & Constraints」明寫：

> **誠信防護**: reading timer 必須抓 `visibilitychange` + idle > 90s 自動 pause；timer 不可手動編輯；每分鐘最多 +1 屬性（防刷）

本 change 把規則 spec 化 + 補 impl。

## What Changes

**Spec**（新 capability `reading-loop`）：
- Tab hidden 時自動 pause（visibilitychange listener）
- 連續 90s 無使用者互動（mousemove / keydown / touchstart）→ 自動 pause
- 一分鐘累積上限 +1 屬性 / +5 XP（cap）
- Resume 規則：tab 回前景或互動後使用者要手動點「開始閱讀」才繼續，不自動恢復
- 「tick interval = 10s demo / 60s prod」by `READING_TICK_MS` 常數
- Timer 只透過 `setReading()` boolean 控制，無外部 force-add

**Impl**（`apps/medexam-tw/src/App.tsx`）：
- 加 `document.visibilitychange` listener：`document.hidden === true` → `setReading(false)`
- 加 idle timer：mousemove / keydown / touchstart 重置 90s timeout；timeout fire → `setReading(false)` + 顯示「⏸ 自動暫停（離開太久）」hint
- 抽出 `READING_TICK_MS = 10_000` 常數（demo 用；prod 換 60_000）
- Hint text 顯示原因（手動暫停 / 自動 visibility 暫停 / idle 暫停）

**不 BREAKING**：UI 排版 / button 文字 / reward 公式都不動，只多了監聽器跟兩個內部狀態。

## Capabilities

### New Capabilities
- `reading-loop`: reading timer 防刷誠信規則

## Impact

- **Files**: 
  - `apps/medexam-tw/src/App.tsx`（加 useEffect + state，~30 行）
  - `openspec/specs/reading-loop/spec.md`（新增）
- **APIs**: 無
- **Dependencies**: 無
- **Tests / verify**: 
  - typecheck pass
  - Chrome MCP smoke：
    - 點「開始閱讀」→ 等 10s → confirm +5 XP +1 stamina
    - 切到別的 tab → 等 5s → 回來 confirm `reading === false`、hint 顯示「自動暫停」
    - 開著不動 90s → confirm 自動 pause
- **Risk**: 低；只是加 listener，原有 timer 邏輯不動
