## Why

二階 hospital mode 玩家有偏食問題：偏好科別反覆答題 mastery 飆高，冷門科別（眼科 / 耳鼻喉科 / 復健科 / 病理科 ...）長期被忽略導致 mastery 卡 0%。現有的 mentor-daily 雖然有 weak-subject fallback layer，但一天只挑一題、且 SRS due 永遠優先，實際上很少觸發冷門科別。需要一個獨立於 mentor-daily 的隨機觸發機制，**主動**把冷門科別題目「推」到玩家面前，模擬真實急診跨科 consult 的醫院 workflow，diegetic（敘事融入）+ 解決真實 dogfood 痛點。

## What Changes

- **NEW capability `er-consultation`** — 經營 mode 內隨機觸發 ER 醫師 consult dialog，內嵌一題冷門科別考題給玩家作答
- 新增 `ERConsultDialog` UI component（modeled on existing `MentorDialog`，但 NPC 是急診醫師、dialogue 採 consult-request 口吻）
- 新增 trigger scheduler tick handler，與既有 hospital-events 並行但互斥（不在 hospital-event modal pending 時觸發、不在 ER consult 自己未解時重複觸發）
- 新增「冷門科別」selector：根據 `questionHistory` 過去 7 天 per-subject 答題數 + `mastery` percentile 加權挑出
- 新增 reward formula：答對 = `quizCorrect.xp × 1.8 × streakMultiplier`（高於 mentor 1.5×，補償強制中斷摩擦）
- 新增 telemetry log table `erConsultLog`（觸發時間 / 選中 specialty / 答題結果 / reward 數）
- 新增 settings toggle「啟用急診照會」（default ON）讓玩家自主關閉
- 新增 1 張 ER 醫師 sprite（codex CLI 生成，保持與既有 19 個 doctor sprite 同風格）
- **NO modifications to existing specs** — ER consultation 路由透過自己的 dialog，answer 流程 reuse `hospital-quiz` mastery 寫入但不需新規則

## Capabilities

### New Capabilities

- `er-consultation`: ER doctor 隨機 consult event，覆蓋「冷門 specialty detection / 觸發節奏 / dialog UI / reward formula / skip semantics / settings toggle / telemetry / 與 hospital-events 互斥規則」全範圍

### Modified Capabilities

（無）

## Impact

- **新檔案**:
  - `packages/core/src/lib/er-consultation.ts` — selector + trigger scheduler 純函式
  - `apps/medexam2-hospital-tw/src/components/ERConsultDialog.tsx`
  - `apps/medexam2-hospital-tw/src/services/er-consultation.ts` — Dexie write paths
  - `packages/theme-pixel-hospital/src/sprites/er-doctor.png`（codex CLI 生成）
- **修改**:
  - `apps/medexam2-hospital-tw/src/db/schema.ts` — Dexie 加 `erConsultLog` + `erConsultActive` singleton；version bump
  - `apps/medexam2-hospital-tw/src/services/tick.ts` — 加 ER consult roll handler（在現有 hospital-events tick 之後、互斥檢查）
  - `apps/medexam2-hospital-tw/src/components/HelpMenu.tsx` 或 `SettingsPanel.tsx` — 加 toggle
  - `apps/medexam2-hospital-tw/src/App.tsx` — 掛載 `ERConsultDialog` modal root
- **Dependencies**: 無新增 npm 套件；reuse 既有 Dexie / React / Framer Motion
- **Cloud sync**: `erConsultLog` 暫不上 cloud（純本機 telemetry），`erConsultActive` 也不上（trigger state 本機即可）。Settings toggle 寫入 `player_state` 既有 `settings` JSONB
- **Migration**: Dexie schema bump（v? → v?+1），加新 table 但不動既有 table，純加性 migration
