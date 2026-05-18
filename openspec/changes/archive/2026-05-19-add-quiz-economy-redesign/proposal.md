## Why

二階 medexam2-hospital-tw 目前 QuizModal grind 路徑是 reward desert——花最多時間答題的玩家拿不到 tycoon 經濟（revenue / reputation）也拿不到 gacha 經濟（ticket，只有 daily +1 + 偶發 fate card）。玩家回報兩個症狀：(1) 不想開 reading session 只想瘋狂刷題的玩家經濟停滯；(2) grind 一科時 311 correct 解鎖全 14 banner 期間賺 0 ticket，提前耗光 quota。

[grilled-mania-mode-quiz-economy-2026-05-18.md](/Users/kangweiling/.claude/scratch/grilled-mania-mode-quiz-economy-2026-05-18.md) 的 7-facet grill 結論：取消原本規劃的「mania mode toggle」概念，改成 **baseline 全面接受 quiz 進帳**，reading session 退成 ×1.5 buff，doctor specialty multiplier 從視覺裝飾變實際進帳係數。本 change 一次性 land 5 條相關變動，避免兩個獨立 change 之間出現「ticket 有了但 quiz 不發 revenue」的中間態。

新硬約束：**典型玩家 30 min/day × 30 days = 全破**（全部 tier upgrade + 全 14 banner 解鎖 + 滿足感的 doctor roster），所有 reward 常數從這個目標反推。

## What Changes

- **Quiz 答對發 revenue + reputation**（新行為）— `QuizModal` correct 分支新增寫入 `gameCounters.revenue / reputation`；公式以新常數 `QUIZ_REVENUE_PER_CORRECT_BASE` + `QUIZ_REPUTATION_PER_CORRECT_BASE` 為地基，乘上 specialty multiplier 與 reading-session buff。錯答不發 reward；送分題（`question.disputed`）比照答對發。
- **Reading session 退成 ×1.5 buff**（行為 modify）— 開啟 reading session 期間（`gameCounters.currentSessionStartedAt !== null`），quiz revenue/rep 收益 ×1.5。Reading session 期間 idle 進帳（`computeThroughput × elapsedMin`）rate 降至原 30%，讓 idle 不再是主力。**BREAKING for existing saves**: 已開了多日 reading session 的玩家進帳 rate 下降，但 quiz 補回更多。
- **Specialty multiplier 應用範圍擴展**（行為 modify）— 既有 `getSpecialtyMultiplier()` 從「只乘到 mastery.correct」擴展到「乘到 quiz 發放的 revenue + reputation」。同科 partner 的 P1 ×1.5 / P2 ×1.3 / P3 ×1.2 / P4 ×1.1 / P5 ×1.05 一致複用。
- **Per-N-correct ticket grant + banner unlock bonus**（新行為）— 每 25 個 fresh correct（distinct questionId 從未出現在 questionHistory 中）→ +1 ticket（cap at `TICKET_CAP = 99`）；每個 banner 首次跨閾值解鎖 → +1 ticket（lifetime cap 14）。既有 daily +1 + fate card 機制不動。
- **Tier upgrade threshold 重新校準**（constants modify）— `TIER_UPGRADE_THRESHOLDS` 從 48k / 192k / 2,000k 改為 **30k / 80k / 150k**，配合 30-day target 反推。Diversification gate 不動（doctor roster 仍要 P5 5 → P3 8 → P2 10+P1）。

## Capabilities

### New Capabilities

無 — 純擴展現有 capability。

### Modified Capabilities

- `hospital-quiz`: ADD「quiz correct answer SHALL grant revenue + reputation」requirement + ADD「reward formula uses specialty multiplier and reading-session buff」
- `hospital-tycoon-engine`: MODIFY「reading-session-driven revenue accrual」requirement（rate 降至 30% + 角色從「唯一進帳」改「buff overlay」）+ ADD「reading-session buff applies to quiz rewards」requirement
- `recruitment-gacha`: ADD「per-N-correct ticket grant」requirement + ADD「banner first-unlock ticket bonus」requirement
- `clinic-level-up`: MODIFY「Tier upgrade thresholds SHALL be locked literal constants」requirement — 三個 threshold 數字重新校準到 30-day target
- `hospital-specialty-bonus`: MODIFY「Mastery-only application scope」requirement → 擴展為「mastery + quiz revenue + quiz reputation」application scope

## Impact

- **改動檔案**：
  - `apps/medexam2-hospital-tw/src/services/quiz-rewards.ts`（新檔, ~80 行）— `applyQuizReward({ subjectId, doctorId, questionId, isCorrect, isDisputed, isFresh })` 純函式 + Dexie transaction wrapper
  - `apps/medexam2-hospital-tw/src/components/QuizModal.tsx`（`handlePickOption` correct 分支呼叫 `applyQuizReward`；`handleNext` 之前對 fresh-correct 累計 ticket grant counter）
  - `apps/medexam2-hospital-tw/src/lib/mastery.ts`（不動 — `recordCorrectAnswer` 已負責 mastery；驗證 reward 不雙寫）
  - `apps/medexam2-hospital-tw/src/lib/tick.ts`（reading session idle rate 套 `READING_IDLE_RATE_REDUCTION`，但 quiz rewards 不在 tick loop 內處理）
  - `apps/medexam2-hospital-tw/src/services/recruitment.ts`（banner 解鎖偵測新增 ticket bonus grant；既有 affinity 跨閾值偵測邏輯加 hook）
  - `apps/medexam2-hospital-tw/src/db/schema.ts`（新增 `grantTicketsForCorrect(count)` helper + `grantBannerUnlockBonus(subjectId)` helper；新增 `bannerUnlockBonusLog` 記錄哪些 banner 已發過 bonus，避免重複 — 用 `playerPreferences` table 或新單列 table 看實作）
  - `packages/content-medexam2-tw/src/recruitment.ts`（新增 7 個常數）
  - `packages/content-medexam2-tw/src/clinic-tiers.ts`（`TIER_UPGRADE_THRESHOLDS` 數字更新）
  - `packages/content-medexam2-tw/src/index.ts`（export 新常數 + 新 helper）
- **新常數（packages/content-medexam2-tw/src/recruitment.ts）**：
  - `QUIZ_REVENUE_PER_CORRECT_BASE = 80`
  - `QUIZ_REPUTATION_PER_CORRECT_BASE = 80`
  - `QUIZ_TICKET_GRANT_PER_N_CORRECT = 25`
  - `BANNER_UNLOCK_TICKET_BONUS = 1`
  - `BANNER_UNLOCK_TICKET_LIFETIME_CAP = 14`
  - `READING_SESSION_BUFF_MULTIPLIER = 1.5`
  - `READING_IDLE_RATE_REDUCTION = 0.3`
- **Schema 變動**：新增 1 個 Dexie table `bannerUnlockBonusLog`（記錄已發 bonus 的 subjectId 集合）— 純 append-only，無 cloud sync 需求（local-only state，因為 affinity 跨閾值偵測已透過 cloud sync 達一致性）
- **Cloud sync**：`gameCounters.revenue / reputation` + `tickets.available` 已在 LWW sync 範圍內，公式改動透過已答 questionHistory 累積在跨裝置可重建
- **Out of scope（明確留給未來 change）**：
  - Mania mode toggle UI（grill 結論已收掉概念）
  - Cosmetic milestone 公式變動（M5 totalStudyMinutes 條件保留）
  - Dexie cloud-sync schema 變動（純 local state 增量）
  - Phase 1 `add-medexam2-completion-tracker` 的 chip / toggle / exhausted toast（正交、可並行）
- **驗證面**：`pnpm -r typecheck` 全綠；Chrome MCP live smoke — 答 5 題 → revenue/rep chip 立即 +N；答 25 題 → ticket +1；開 reading session → 同題 quiz revenue +50%；首次解鎖某 banner → ticket +1（第二次跨閾值不再發）
