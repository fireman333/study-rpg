## Why

二階國考已有「錯題」收藏分頁（`wrong-answer-list` capability：目前未答對 + 歷史曾錯），但 neurons-tw **完全沒有每題作答結果追蹤** — `recordCorrectAnswer` / `recordIncorrectAnswer` 只吃 `familyId`、不吃 `questionId`，沒有 `questionHistory` 表，所以玩家無法回顧自己答錯過哪些題。要比照二階做「錯題」分頁，必須先補上這層地基。

## What Changes

- **新增每題作答結果追蹤地基**：新 Dexie 表 `questionHistory`（schema v9），每次在 `QuizModal` 作答時寫入 `{ questionId, family, lastResult, everWrong, lastAnsweredAt, updatedAt }`。`recordCorrectAnswer` / `recordIncorrectAnswer` 的呼叫點（目前唯一入口 [QuizModal.tsx:53-55](apps/neurons-tw/src/components/QuizModal.tsx)）改為同時記錄 questionId 層級結果。
- **`/bookmarks` 改三段式分頁 UI**：手動收藏 ⭐（現況）/ 目前未答對（`lastResult === 'wrong'`）/ 歷史曾錯（`everWrong === true`，答對後也不離開）。錯題兩段是 `questionHistory` 的 live derived view，不另建表。
- **共用篩選列加 year chip**：現有 family + 標記（✨太簡單 / 🤔亂猜）chip 之外，新增「年份」chip（民國年，自 question id 前綴解析，如 `106-1-醫學一-解剖學-Q1` → 106）。三個分頁共用同一組篩選（比照二階）。
- **R2 雲端同步**：新增 `questionHistory` TableAdapter，bundle `SCHEMA_VERSION` 4 → 5（reader tolerance 已存在）。`lastResult` 走 LWW、**`everWrong` 走 monotonic-OR merge（非 LWW）**，比照二階 `everWrong` 與 neurons `dmnEventLog` 紀律，避免跨裝置 race 把曾錯狀態蓋回 false。
- **Dexie 升級 fixture**：依專案 hard rule（`docs/DEXIE_UPGRADE_FIXTURE_RULE.md` + `pnpm lint:dexie-fixtures`）補 v8 → v9 upgrade fixture，否則 CI 擋。
- 錯題列**只顯示、無行內操作按鈕**（無重新作答 / 無收藏）；既有玩家**無 backfill、無說明 banner**（錯題庫從升級後開始累積）；**不做 grace toast**（永久錯題庫，答對也留在歷史曾錯，grace toast 失去意義）。

## Capabilities

### New Capabilities

- `neurons-wrong-answer-list`: 每題作答結果追蹤（`questionHistory` Dexie 表 + QuizModal 寫入 + R2 sync adapter，`everWrong` monotonic-OR）與 `/bookmarks` 上的「目前未答對 / 歷史曾錯」derived view 三段分頁、共用 family/year/flag 篩選。

### Modified Capabilities

<!-- 無。新 capability 對既有答題流程為 additive（新增 questionHistory 寫入 side-effect，不改變 neurons-mode 既有 requirement 的契約）；/bookmarks 既有收藏行為不變，只是被包進分頁容器。 -->

## Impact

- **新檔**：`apps/neurons-tw/src/lib/services/question-history.ts`（record + live query hooks）、`apps/neurons-tw/src/__tests__/db-v9-migration.test.ts`（v8→v9 fixture）、`apps/neurons-tw/src/__tests__/question-history-merge.test.ts`（everWrong monotonic-OR lock test）、`apps/neurons-tw/src/lib/wrong-answer-filter.ts`（pure filter helper + year 解析）。
- **改檔**：
  - `apps/neurons-tw/src/lib/db.ts` — 加 `QuestionHistoryRow` interface + `.version(9)`。
  - `apps/neurons-tw/src/components/QuizModal.tsx` — 作答時呼叫 `recordQuestionResult(q.id, q.subject, isCorrect)`。
  - `apps/neurons-tw/src/lib/sync/tables.ts` — 加 `questionHistoryAdapter`（everWrong monotonic-OR）並註冊進 `NEURONS_ADAPTERS`。
  - `apps/neurons-tw/src/lib/sync/r2/bundles.ts` — `SCHEMA_VERSION` 4 → 5 + history 註解。
  - `apps/neurons-tw/src/routes/BookmarksPage.tsx` — 重構為三段分頁容器 + 共用篩選列加 year chip。
- **無後端改動**：Worker 對 bundle 不透明（純 presigned-URL 傳輸），schema bump 不需動 Worker。無 Supabase / D1 migration。
- **資料安全**：純 additive Dexie 升級（不改任何既有表 PK，遵守 `dexie_pk_change_pitfall.md`）；既有 v8 玩家升級不丟資料。
