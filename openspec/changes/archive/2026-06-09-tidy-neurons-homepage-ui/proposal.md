## Why

首頁 CTA toolbar 把 📋 模考跟核心養成 loop（🎲 隨機答題 / ⚔️ 錯題出征）並列，但模考定位上是「純測驗、不長 connectome」——它不屬於養成循環，放在首頁稀釋了主 CTA 的視覺焦點。同時，首頁 maze 區有一顆常駐「🚀 顯示/隱藏遠征動畫」chip：遠征動畫本來就在出征 + 閱讀時自動播，這顆 explicit「顯示」開關是多餘的 UI 噪音（隱藏需求其實已由帶子自帶的 × 滿足）。本次把模考移出首頁、收進題庫 tab 並賦予「純練習」語意，並清理遠征動畫 toggle，讓首頁聚焦核心 loop。

（DMN / 能量 / 裝備 / consumable 機制經兩輪 codex + grill 三方結論「不 redesign」，**明確不在本次 scope**。）

## What Changes

- **模考移出首頁 CTA toolbar → 收進題庫 tab（`/bank`, `QuestionBankPage`）**，作為題庫頁內的主要入口、按鈕放大。首頁 CTA toolbar 收斂為 🎲 隨機答題 + ⚔️ 錯題出征 兩顆。
- **模考/題庫作答賦予「純練習」語意**（owner 決策）：作答 SHALL NOT 給 maze 能量 / 推進 walker / 抽 variant（不是刷養成的後門）；但 SHALL 保留 `questionHistory` 寫入（`everWrong` 錯題池 + 模考 coverage 都不變 → 在題庫寫錯的題之後仍能拿去出征修復）。
- **移除首頁 maze 區常駐「🚀 顯示/隱藏遠征動畫」toggle chip**。遠征動畫的自動顯示時機**不變**（出征時 QuizModal 背景帶 + 閱讀時首頁帶）。隱藏改由帶子自帶的 × 快速隱藏（已存在）承擔；「重新顯示」入口移進 HelpMenu，避免 × 關掉後無法復原。閱讀時的帶子文案對齊「探索迷宮」敘事。
- **（optional, minor）走迷宮可見度**：確認現況為 walker 連續前進、抵達 node 觸發 settle + 抽 variant（非離散「累積才播」）；視情況加一個輕量「正在前進」micro-cue。不立 hard requirement。

## Capabilities

### New Capabilities

（無新 capability。）

### Modified Capabilities

- `neurons-homepage`: CTA toolbar 不再含 📋 模考 secondary entry（收斂為 🎲 + ⚔️）；移除 maze 區常駐遠征動畫 toggle chip。
- `neurons-exam-set-expedition`: 模考入口從首頁 secondary CTA 改為**題庫 tab（`/bank`）內的主要入口**；模考/純練習作答 SHALL NOT 給 maze 能量/variant 進度，但 SHALL 保留 `questionHistory`（coverage + `everWrong` 不變）。
- `neurons-maze-expedition`: 移除首頁常駐「顯示/隱藏遠征動畫」toggle；隱藏由帶子 × 承擔、復原入口移進 HelpMenu；自動顯示時機（出征 / 閱讀）不變。

## Impact

- **Code**:
  - `apps/neurons-tw/src/routes/OverviewPage.tsx` — 移除 `examModeButton` + `expeditionMenu==='exam'` picker 區塊。
  - `apps/neurons-tw/src/routes/QuestionBankPage.tsx` — 新增放大的模考入口 + exam-paper picker（複用既有 `listExamPapersWithCoverage` / `chooseExamPaper` 邏輯）。
  - `apps/neurons-tw/src/components/QuizModal.tsx` — 加 practice/exam mode flag，suppress `recordCorrectAnswer` 的能量/walker/variant 效果、保留 `recordQuestionResult`。
  - `apps/neurons-tw/src/components/maze/MazeGrid.tsx` — 移除常駐遠征動畫 toggle chip（line ~847-851）。
  - `apps/neurons-tw/src/components/HelpMenu.tsx` — 加「重新顯示遠征動畫」控制。
  - `apps/neurons-tw/src/components/MazeExpedition.tsx` — × 快速隱藏保留（已存在）；閱讀帶文案對齊「探索迷宮」。
- **無 schema 變更**：不 bump Dexie `.version()`、不動 R2 `SCHEMA_VERSION`、不加 Worker endpoint、不動 sync。
- **無經濟數值變更**：2026-06-07 rebalance 後的 maze pacing 不動（純練習只是 gate 掉能量入帳，不改 faucet 係數）。
- **DMN 機制零改動**（明確排除）。
