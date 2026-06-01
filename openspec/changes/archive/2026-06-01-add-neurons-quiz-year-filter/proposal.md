## Why

一階考生練習時常想針對特定年份（近年題優先、或補舊年），但 neurons-tw 首頁答題目前只能選 family（科目）、無法選考試年份。二階國考已有此功能（`services/year-filter.ts` + `YearFilterBar`）；這個 change 把同樣的年份 gate mirror 到 neurons 首頁答題系統。

## What Changes

- **新增年份 filter 服務**：新 `apps/neurons-tw/src/lib/services/year-filter.ts`，mirror 二階 — `quiz.yearFilter` 持久於 Dexie `meta` 表，`ALL_YEARS = [106..114]`（9 年），`getYearFilter`/`setYearFilter`/`effectiveYearSet`（`null`/`[]` 都代表「全選」）。neurons `MetaRow.value` 是 string，故年份陣列以 `JSON.stringify`/`JSON.parse` 編解碼（比二階多一步）。
- **首頁常駐 YearFilterBar**：在 [OverviewPage](apps/neurons-tw/src/routes/OverviewPage.tsx) 的 CTA toolbar（閱讀 + 🎲 隨機答題那一區）加一條年份 chip bar，常駐顯示目前選的年份。9 年單列 chip（全部 + 106…114），不需分頁。
- **Pool gate**：`quizPool` 建構在 `filterPoolByFamily(...)` 之後，再以 `q.meta.year ∈ effectiveYearSet` 過濾。**特定 family（🎯 卡片）與跨 family 隨機（🎲，`quizEntry === null`）兩條啟動路徑都套用**。
- **空池防呆**：若所選年份 × 該 family = 0 題（現行資料觸發不到，純防呆），允許點擊啟動，QuizModal 顯示純文字空狀態 + 關閉（不附快捷鈕）。
- **預設全選、記住上次**（meta 持久）；**本機 only**（不進 `SYNCED_META_KEYS`）。
- **不影響** `/bookmarks` 的「重新作答」單題 replay；首頁年份 filter 與 `/bookmarks` 的年份 chip 是兩套獨立 state，互不干擾。

## Capabilities

### New Capabilities

- `neurons-quiz-year-filter`: 首頁答題的考試年份 gate — meta-persisted 年份選擇（預設全選 / 記住上次 / 本機）、首頁常駐 YearFilterBar、套用於特定 family + 跨 family 隨機兩條 quizPool 路徑、空池純文字空狀態。

### Modified Capabilities

<!-- 無。對 neurons-mode 的 family-picker pool-filter requirement 為 additive（年份 gate 與 family gate 正交、可組合，不推翻既有契約）。 -->

## Impact

- **新檔**：`apps/neurons-tw/src/lib/services/year-filter.ts`、`apps/neurons-tw/src/components/YearFilterBar.tsx`、`apps/neurons-tw/src/__tests__/year-filter.test.ts`（service 純函式 + effectiveYearSet 邊界 + pool gate）。
- **改檔**：
  - `apps/neurons-tw/src/routes/OverviewPage.tsx` — mount `<YearFilterBar />` 進 CTA section；`quizPool` memo 加年份過濾（依賴 persisted year filter 的 live query）。
  - `apps/neurons-tw/src/components/QuizModal.tsx` — 區分「年份篩成空（pool 一開始就空）」與「正常答完」兩種空狀態文案。
- **無新 Dexie 表**（複用既有 `meta` 表，純加一個 key；無 schema bump）。
- **無 sync / 無 Worker / 無後端**改動（本機 gameplay preference）。
- `q.meta.year` 已存在於全 3600 題（106–114），無需 content 重 build。
