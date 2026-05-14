## Why

`packages/core/src/lib/srs.ts` 已實作 SM-2 算法（`newCard` / `reviewCard` / `dueCards`），`db.srs` Dexie table 也存在，但 **quiz 完全沒呼叫**：

- 每次答題後不寫進 `db.srs`
- QuizModal 抽題用 plain `Math.random()`，不 prefer due card
- 答錯的題目沒進 retry queue

結果：玩家答錯一題 → 下次 quiz 仍可能永遠抽不到同一題（純隨機）；不到 spaced-repetition 的學習迴圈。

project.md M2 roadmap 明列「SRS due queue」要做。本 change 把 SM-2 wire 進 quiz：
1. 答完每題 → `reviewCard()` 計算新 `SrsCard` → upsert to `db.srs`
2. QuizModal 開啟時，**先抽 due card**（`db.srs` where `dueAt <= now`），不夠 5 題 fallback random
3. Wrong = quality 2 (lapse)；correct = quality 4 (good)

不在 scope：FSRS（M3 才考慮 port from Skola）、due card UI badge、自選 quality rating。

## What Changes

**Spec**（新 capability `srs-queue`）：
- Quiz 答題後自動 upsert SrsCard
- 下次 Quiz 開啟時優先抽 due card
- Quality mapping：correct → 4, wrong → 2
- Reload 後 srs queue persist
- 答對沒 lapse 的題目 dueAt 至少推 1 天後

**Impl**：
- `apps/medexam-tw/src/components/QuizModal.tsx`：
  - 新增 `dueQuestionIds?: QuestionId[]` prop（由 App 算好 due 的題目 ID 傳進來）
  - 開啟時：filter pool by subject → split into `dueInPool` + `freshInPool` → 先取 due，不足 5 題從 fresh 補
  - `handleClose` 多回傳 `quizQuestionResults: { questionId, correct }[]` 給 App
- `apps/medexam-tw/src/App.tsx`：
  - 新增 `dueQuestionIds` state，hydrate 時從 `db.srs` 算
  - QuizModal 打開前算 due
  - `onQuizComplete` 接 result list → 對每題 `getDB().srs.get(qid)` → 若無 `newCard` 否則 `reviewCard(card, correct?4:2)` → `db.srs.put`
  - 完成後刷新 `dueQuestionIds`
- 不動 srs.ts 算法

**不 BREAKING**：QuizModal `onClose` 簽名從 `(results: QuizResult[]) => void` 擴展為 `(results: QuizResult[], questionResults: QuestionResult[]) => void`，但既有呼叫 site 都是 App，一次更新。

## Capabilities

### New Capabilities
- `srs-queue`: SM-2 spaced repetition wired into quiz answer flow

### Modified Capabilities
- `quiz-runner`: extends with "due card biased selection" requirement

## Impact

- **Files**: 
  - `apps/medexam-tw/src/App.tsx`（加 srs hydrate + write effects ~20 行）
  - `apps/medexam-tw/src/components/QuizModal.tsx`（接 `dueQuestionIds` prop ~10 行）
  - `openspec/specs/srs-queue/spec.md`（新）
  - `openspec/specs/quiz-runner/spec.md` 透過 archive merge 加 1 requirement
- **APIs**: 無
- **Dependencies**: 無
- **Tests / verify**: typecheck pass + Chrome MCP smoke：清 IDB → 答 1 對 + 1 錯 → 確認 db.srs 有 2 筆 → reload → 開新 quiz → 確認那 2 題優先出現
- **Risk**: 中等。Wrong-answer 的 lapse interval 設 1 day，dogfood 後可能需要 fine-tune。先以 spec lock，後續調整走 modify
