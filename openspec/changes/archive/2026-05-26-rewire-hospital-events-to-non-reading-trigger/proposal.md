## Why

二階 hospital mode 目前的 disruption model 反直覺：特殊事件（醫療糾紛 / VIP / 急診大量班 / 醫療稽核）跟急診照會（ER consult）**只在唸書 session 跑** — modal popup 跳出來打斷專注閱讀，而使用者在非唸書時段（答考古題、看排行榜、經營醫院）卻完全不會觸發任何事件。這跟玩家直覺相反：唸書要安靜、互動時段才適合彈 popup。Root cause 是事件 roll loop 寄生在 `tick.ts` 內，而 tick 的 setInterval 只在 reading session active 時才掛上（`tick.ts:568`），形成「只在不該打擾時打擾、該打擾時靜默」的反向耦合。

## What Changes

- **BREAKING**（內部架構）：從 `apps/medexam2-hospital-tw/src/lib/tick.ts` 移除特殊事件 roll loop（lines 276–319）與 ER consult roll loop（lines 321–353）。Tick 改為純粹的營收 / 聲望 / 唸書分鐘累積。
- 新增 service `apps/medexam2-hospital-tw/src/services/non-reading-event-trigger.ts`，暴露 `maybeRollNonReadingEvent(source: 'quiz' | 'nav')` 統一入口，內部跑 mutex + cooldown + 機率邏輯。
- **新增 hook 點 1（答題）**：`QuizModal` / ER consult quiz / mentor / training 等所有 quiz answer commit 路徑在獎勵寫入後呼叫 `maybeRollNonReadingEvent('quiz')`。
- **新增 hook 點 2（route 切換）**：`App.tsx` 加 `useLocation()` effect，pathname 變化且新 pathname 在玩家內容頁 whitelist 內時呼叫 `maybeRollNonReadingEvent('nav')`。
- 機率採 `EVENT_ROLL_PROBABILITY = 0.05`、`ER_ROLL_PROBABILITY = 0.035`（同 hook 內獨立 roll，event 先 ER 後）。
- **Whitelist 玩家內容頁**：`/`（hospital home）、`/quiz`、`/leaderboard`、`/roster`、`/achievements`、`/bookmarks`、`/study`（**但僅當 `currentSessionStartedAt === null` 時**）。Blacklist：`/onboarding`、`/settings`、`/help` 等 utility 頁。
- 沿用既有 mutex（`pendingEventId !== null || erConsultActive !== null` → skip roll）。
- 新增 `gameCounters.lastInteractionEventAt`（單一欄位，event 跟 ER resolve 都更新）+ soft cooldown 3 分鐘 — 防 popup spam。
- 移除既有但用不到的 tick-counter 欄位 `eventRollTickCounter` 跟 `erConsultTicksUntilRoll`（schema cleanup；不影響存檔，舊欄位忽略即可）。

## Capabilities

### New Capabilities

無。

### Modified Capabilities

- `hospital-events`：requirement "Special events SHALL trigger probabilistically during active sessions with reputation-scaled rate" → 改為「on non-reading interaction events」 + 加入 cooldown gate
- `er-consultation`：requirement "ER consultation SHALL trigger probabilistically during active sessions with idle/cadence gates" → 改為「on non-reading interaction events」 + 共用 cooldown

## Impact

- **Affected code**:
  - `apps/medexam2-hospital-tw/src/lib/tick.ts` — 移除 event/ER roll 區塊（~80 行縮減）、`rollEvent` / `jitterTicksUntilNextERConsult` / `maybeRollAndPersistERConsult` 等 import 跟著清掉
  - `apps/medexam2-hospital-tw/src/services/non-reading-event-trigger.ts` — **新檔**
  - `apps/medexam2-hospital-tw/src/components/QuizModal.tsx` — answer submit 路徑加 hook 呼叫
  - `apps/medexam2-hospital-tw/src/services/er-consultation.ts` — ER quiz answer 路徑加 hook（注意：ER 自己的 dialog 答完後也要 roll 下一個事件 — 但要考慮 race，design 內處理）
  - `apps/medexam2-hospital-tw/src/services/mentor.ts` + `training.ts` — 同上（如果這兩個有 answer-commit 路徑）
  - `apps/medexam2-hospital-tw/src/App.tsx` — 加 `useLocation` effect + route whitelist
  - `apps/medexam2-hospital-tw/src/db/schema.ts` — 加 `lastInteractionEventAt` 欄位到 `GameCountersRow`，Dexie 版本 v19 → v20（v19 已被對面 commit `dac4eae` retirement tombstone 佔用）
  - `apps/medexam2-hospital-tw/src/services/event.ts` — 4 個 resolve handler（`resolveMalpractice` / `resolveVIP` / `resolveEmergency` / `resolveAudit`）都寫入 `lastInteractionEventAt`
- **Affected types** (`@study-rpg/core`):
  - 既有 `EVENT_TICK_INTERVAL` / `ER_CONSULT_TICK_INTERVAL_MIN` / `_MAX` constants 變成 dead code — 留著（avoid breaking npm package consumers），但加 `@deprecated` JSDoc，理由：本 monorepo 不再用，但 `@study-rpg/core@0.5.0` 已 publish 出去，外部 fork 可能仍 reference
  - 新增 `EVENT_ROLL_PROBABILITY` / `ER_ROLL_PROBABILITY` 常數到 `packages/content-medexam2-tw/src/events.ts`（content-pack 可調整）
- **No breaking changes to**:
  - Cloud sync schema（`hospital_state` table 加一個 nullable column 屬於 additive；R2 m2 bundle 加一個 optional key 屬於 forward-compatible）
  - Existing event resolve flows（4 種 event 的具體效果不變）
  - Existing ER consult resolution flow（reward / skip / expiry 邏輯不變）
  - `pendingEventId` / `erConsultActive` mutex 語意
- **Telemetry / observability**:
  - DEV-only 加 `globalThis.__events.getStats()` 暴露 roll attempt count / fire count / skip-due-to-mutex / skip-due-to-cooldown 計數（prod build strip）
  - 為了一週 dogfood 後 calibrate probability 用
- **Not affected**:
  - 一階 `apps/medexam-tw` — 完全沒這個機制，不動
  - 對面 `dac4eae` retirement tombstone 工作（已驗證 0 file overlap、0 schema field overlap）
- **Risk**:
  - Probability 5% / 3.5% 是估計值，dogfood 後可能要調 — 但是 content-pack 常數，不是 OpenSpec change 等級的調整
  - Whitelist 之外的玩家內容頁未來新增（例如 M5+ 新 mini-game）時要記得加進 whitelist，否則新頁面永遠不觸發 event — 在 `App.tsx` 的 whitelist 加 inline 註解提醒
