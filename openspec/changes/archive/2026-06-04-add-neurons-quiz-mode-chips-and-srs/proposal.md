## Why

neurons-tw 的答題目前是「整個科目洗牌依序出」——新題與答過的題混在一起，且**完全沒有 SRS**（`@study-rpg/core` 的 spaced-repetition 引擎在 neurons 從未被呼叫；`neurons-mode` spec 第 347 行明示 SRS due-bias 與 quality modifier「deferred to follow-up changes」）。玩家無法「只練沒看過的新題」，也無法針對答錯的題做有間隔的複習。本 change 補上這層學習迴圈，並把每個 family 的單一答題入口拆成意圖清楚的兩個 chip。

## What Changes

- **每張 family 卡片的單一「🎯 答題」按鈕 → 兩個 chip**：
  - **🆕 新題** — 只出該 family **從未作答過**的題（`questionHistory` 無該題 row）；badge 顯示未作答數；全部答過則 disable。
  - **🔄 錯題** — 走 **SRS 到期佇列**複習該 family 的題；badge 顯示今日到期數；無到期則 disable。
- **把 `@study-rpg/core` 的 SRS 引擎接進 neurons**（移植二階做法）：每次作答（**不分 mode**）都用 `reviewCardBinary` 更新該題的 SRS 排程；`錯題` mode 依 `nextDueAt` 到期先出（`dueCards` + 每日上限 `SRS_DAILY_CAP`）。**mode 只決定「出哪些題」，不決定是否排程** —— 新題 mode 答錯的題一樣排程，之後自然在錯題 mode 到期出現（二階 `skipSrs` 語意）。
- **資料模型**：擴充既有 `questionHistory` row（**不**新開 store），加 `interval` / `easeFactor` / `nextDueAt` / `attempts` / `correctCount`，並加 `nextDueAt` 索引。Dexie **v14 → v15**（additive）。
- **（可選，可於 GATE 1 砍掉）quality modifier 接線**：neurons 已有 `questionFlags` 服務（easyMarked / guessedMarked）但無人消費、且 QuizModal 目前未渲染 ✨/🤔 按鈕。本 change 順手讓 ✨「太簡單」→ `reviewCardBinaryEasy`、🤔「我亂猜的」→ `reviewCardBinaryGuessed`（含在 QuizModal 補上按鈕）。
- **同步**：`questionHistory` 既有 R2 TableAdapter（per-row LWW + `everWrong` monotonic-OR）；新 SRS 欄位隨同一 row 走 LWW。R2 bundle `SCHEMA_VERSION` **13 → 14**，維持 forward-compat reader tolerance。Worker bundle-opaque，**無 Worker 改動**。

## Capabilities

### New Capabilities
- `neurons-quiz-modes`: 每個 family 的兩段式答題入口（新題 fresh-only / 錯題 SRS-review）、每次作答的 SRS 排程（`reviewCardBinary`）、到期佇列複習池（`dueCards` + daily cap）、以及 quality modifier（✨/🤔）對排程的調整。

### Modified Capabilities
- `neurons-homepage`: `FamilyPicker` family 卡片的答題入口從單一「🎯 答題」改為兩個 chip（🆕 新題 / 🔄 錯題）。涉及「Homepage SHALL compose as a CTA toolbar over … the family-detail grid」與「Homepage SHALL preserve manual reading-timer start and the non-collapsed quiz CTA」兩條對單一 答題 入口的描述。全域 🎲 隨機跨 family 與 ⚔️ 出征 CTA 不變。

## Impact

- **程式**（apps/neurons-tw）：`lib/db.ts`（v15 + `questionHistory` 加 SRS 欄位 + 索引）、新 `lib/services/srs-scheduler.ts`、`lib/services/quiz-pool.ts`（加 `filterPoolByNewOnly`）、`components/QuizModal.tsx`（作答後排程 + mode prop + ✨/🤔 按鈕）、`components/FamilyPicker.tsx`（兩 chip + 計數 badge）、`routes/OverviewPage.tsx`（`quizEntry` state 帶 mode）、`lib/sync/r2/bundles.ts`（SCHEMA_VERSION 14）。
- **既有引擎複用**：`@study-rpg/core` 的 `reviewCardBinary` / `reviewCardBinaryEasy` / `reviewCardBinaryGuessed` / `dueCards` / `SRS_DAILY_CAP`（皆已 export，無 core 改動）。
- **CI / 紀律**：v14→v15 **必帶 upgrade fixture**（`dexie-fixture-lint.yml` + `docs/DEXIE_UPGRADE_FIXTURE_RULE.md`）。R2 bundle cross-version tolerance 需測。
- **與既有 spec 的關係**：`quiz-runner` 既有「reading-mode / review-mode」requirement——新的 fresh/review 為其延伸（additive，不抵觸）；`neurons-quiz-year-filter` 的年份過濾仍套用於兩個新 mode 的題池（composition，不改其 spec）；`neurons-wrong-answer-list` 的 `questionHistory` row 多了 SRS 欄位但 /bookmarks 行為不變。
- **Out of scope**：⚔️ 出征（全科錯題）維持現狀（不改為 SRS-driven，可日後 follow-up）；🎲 隨機跨 family 答題不變；reading-timer / study-category trigger 無關。
