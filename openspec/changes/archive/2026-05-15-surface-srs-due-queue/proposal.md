## Why

SRS（SuperMemo-2）engine 在 `wire-srs-queue` (b8a2...) 已完成：每次答題後 upsert `db.srs`、QuizModal 開啟時 due-biased 選題。**但玩家完全看不到 due queue 存在** — App.tsx 載入 `dueQuestionIds` 後沒任何 UI surface，沒按鈕也沒提示。結果：

- SRS 對玩家而言不存在，daily review ritual 沒入口
- 玩家不知道「自己昨天有 5 題到期、今天該複習」
- 工程上做了功夫但體感為零

本 change 把 SRS 從 invisible 變 visible，讓玩家**主動選擇**進入 review 流程，建立 daily ritual 的鉤子。

## What Changes

- 主畫面新增「📋 複習到期（N 題）」按鈕，N 動態顯示 `dueQuestionIds.length`
- N=0 時按鈕 disabled，hint 顯示「目前沒有到期複習，繼續累積中」
- N>0 點按進入 **SRS-only review mode**：QuizModal 只抽 due cards（不混 fresh）
- Review batch 上限：min(N, `REVIEW_BATCH_SIZE=20`)。N>20 時 hint 顯示「先複習 20 題，剩下 X 題下次」
- Modal 顯示「複習模式」banner（區別於正常 quiz）
- Review 答對 / 答錯走既有 `reviewCard(quality=4 / 2)` 流程；reward 沿用 `REWARD.quizCorrect / quizWrong`（review-specific XP curve 之後再 fine-tune）

## Capabilities

### New Capabilities

（無新 capability — 在現有 quiz-runner + srs-queue 加 surface 而已）

### Modified Capabilities

- `quiz-runner`: 新增 review-mode prop 與「review-only 不混 fresh」的選題行為；新增「複習模式」banner
- `srs-queue`: 新增「玩家可見的 due count UI」與 review batch size 上限規範

## Impact

- **Files**:
  - `apps/medexam-tw/src/App.tsx`（加 review 按鈕 + state「正常 quiz vs review」+ pass mode prop 給 QuizModal）
  - `apps/medexam-tw/src/components/QuizModal.tsx`（加 `mode: 'reading' | 'review'` prop + review-only selection + banner）
  - `apps/medexam-tw/src/styles.css`（review banner 樣式，與 image-placeholder banner 區隔）
  - `packages/core/src/lib/loot.ts` 或新檔（定義 `REVIEW_BATCH_SIZE` 常數）— 也可放在 host app，看 design 取捨
  - `openspec/specs/quiz-runner/spec.md`（delta：ADDED requirements）
  - `openspec/specs/srs-queue/spec.md`（delta：ADDED requirements）
- **No breaking changes**: 既有 quiz 流程不變；QuizModal 新 prop 預設 `'reading'` mode 維持向後相容
- **Engine layer**: 新增一個常數，不改 schema 不改 `reviewCard` 行為
