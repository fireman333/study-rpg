## Why

`add-neurons-concept-tags` 上線後，考點 concept label 只出現在 **read-only review card**（`/bank` 題庫 + 收藏，經 `QuestionReviewCard`）。但玩家絕大多數時間待在**互動答題流程**（首頁單題 `QuizModal`、錯題出征 `MazeExpedition`、模考 `MockExamRunner`）——這些畫面各自 render 題幹、不經 review card，所以看不到考點 label。這是 concept-tags §5.2 的 scope 邊界，不是 bug。本 change 把 label 補進互動答題流程，讓玩家答完一題能立刻看出「這題在考哪個考點」並一鍵跳去題庫查同考點的題。

## What Changes

- **考點 label 擴到三個互動答題 surface**（皆 **post-reveal / 揭曉答案後**才顯示，答題前隱藏以防劇透）：
  - `QuizModal`（首頁單題）— 揭曉/詳解區附近顯示該題考點 label。
  - `MazeExpedition`（錯題出征）— 每題揭曉後顯示。
  - `MockExamRunner`（模考）— **只在交卷後的 review 全展開時**顯示；整回作答中（未逐題揭曉）不顯示。
- **label 點擊 → 開新分頁**到 `${import.meta.env.BASE_URL}bank?concept=<zh>`（`/bank` 已支援 `?concept=` prefill）。刻意用新分頁而非 in-app navigate：答題/出征中途 in-app 跳走會中斷 session，新分頁保留答題現場。**與題庫/收藏的 in-app 點擊行為刻意不同。**
- **抽共用元件 `ConceptLabelRow`**：新增 `src/components/ConceptLabelRow.tsx`（props：`labels` + 選填 `onConceptClick`），供三個 surface 共用；順手把 `QuestionReviewCard` 重構成也用它，消除四份重複的 chip render。
- **無 schema/sync 改動**：純前端、純加法，讀既有 `concept-tags.json` sidecar；不 bump Dexie / R2 / SYNCED_META_KEYS / cloud sync。

## Capabilities

### New Capabilities
（無）

### Modified Capabilities
- `neurons-question-bank-search`: 既有「Question cards SHALL display concept labels that act as a search shortcut」需求只涵蓋 `QuestionReviewCard` 及其 usages（題庫/收藏/考前猜題來源）。本 change **新增一條 sibling 需求**：互動答題流程（`QuizModal` / `MazeExpedition` / `MockExamRunner`）SHALL 在 **post-reveal** 顯示考點 label，點擊採 **new-tab** 開 `/bank?concept=`（保留答題現場），與 review card 的 in-app 行為刻意區分。

## Impact

- **Code**（`apps/neurons-tw/src/`）：
  - `components/QuizModal.tsx`（主要，reveal 後加 label row）
  - `components/MockExamRunner.tsx`（交卷後 review 加 label）
  - `components/MazeExpedition.tsx`（per-question reveal 後加 label）
  - 新 `components/ConceptLabelRow.tsx`（共用 chip render + 點擊 handler 介面）
  - `components/QuestionReviewCard.tsx`（重構改用 `ConceptLabelRow`，行為不變）
- **Reuse（不重造）**：`lib/concept-tags.ts` 的 `useConceptTags()` / `conceptLabelsFor(q, tags)` / `ConceptLabel`（fetch 已用 `import.meta.env.BASE_URL`）；`QuestionReviewCard` 既有 chip styles。
- **無後端/schema/sync 影響**：不動 Dexie / R2 / SYNCED_META_KEYS。
- **Data prereq 已 ready**：`concept-tags.json` + `concept-recurrence.json` 已在 prod（med-study-rpg.com/neurons/）。
- **Deploy 驗證重點**：dev base `/` 過 ≠ prod base `/neurons/` 過——concept-tags fetch 已踩過 BASE_URL 坑（見 memory `neurons-content-fetch-base-url`）；verify 必含 prod real-browser render check + 新分頁點擊實測。
