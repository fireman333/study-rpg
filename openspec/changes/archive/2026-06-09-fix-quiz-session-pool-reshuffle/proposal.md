## Why

開啟答題後「題目一直亂跳」: 每次答題都會把當前題目換成另一題, 阻擋核心答題 loop。根因是一條 reactivity 鏈 —— `useQuestionHistory()` 是 Dexie `liveQuery`, 每次 `db.questionHistory` 變動就 emit 新陣列; 答題寫 questionHistory (`recordQuestionResult`) → OverviewPage 的 `quizPool` useMemo (dep 含 `questionHistory`) 重算 → 新 `pool` 陣列 ref → QuizModal 的 `sessionPool` useMemo (dep `[pool]`) 重算 → `shuffle()` 重新洗牌 → `sessionPool[idx]` 變成另一題。

## What Changes

- **FIX**: QuizModal 的 `sessionPool` 由 `useMemo([pool, preserveOrder])` 改為 **mount 時凍結的 lazy `useState` initializer**。一場 quiz session 是不可變的固定順序, 不該因上游 `pool` prop ref 變動 (questionHistory liveQuery 每次答題 emit 新陣列) 而重算/重洗。QuizModal 本就每場 session 條件重掛載 (由 `quizEntry`/`expeditionOpen`), 所以新 session 仍正確重洗、session 內固定不動 —— 包含 `錯題` review 的 oldest-due-first 預排序池 (`preserveOrder`)。

## Capabilities

### Modified Capabilities
- `quiz-runner`: 新增一條 normative requirement —— quiz session 的題目池在 session 開始時固定, session 進行中 SHALL NOT 重新洗牌/重新衍生 (即使上游 pool 輸入 ref 改變)。記錄此既有但未明文的 invariant, 防 regression。

## Impact

- `apps/neurons-tw/src/components/QuizModal.tsx` (single seam: `sessionPool` 的 `useMemo` → frozen `useState`).
- 行為影響: 答題、抽卡、SRS 寫入 (皆會動 questionHistory) 不再洗亂當前 session 的題序。養成 quiz / 出征 / 純練習 / 錯題 review 全部受惠。
- 零 schema / 零 sync / 零後端改動。L1 hotfix (阻擋核心 loop)。
