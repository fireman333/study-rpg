## Why

二階 (`study-rpg-2nd`) 已上線「整回挑戰」雙模式 —— **即時詳解**（逐題作答即看答案）與**模擬考試**（全部送出前不揭曉、可自由跳題改答、交卷後一次看詳解 + 各科分數 + 國考換算分）。透過 session-bus，二階請 neurons 也做同一套。neurons 目前只有「逐冊未答題」純練習一種流程（`QuestionBankPage` 的 模考），缺乏「閉卷整卷模擬、交卷後一次批改」的真實考試體驗。

二階刻意把核心邏輯寫成 UI-agnostic 純函式（`mock-exam.ts` / `exam-set.ts` / `mock-exam-draft.ts` 的 pure helpers，註解明寫「Phase 2 lifts this module as-is into `@study-rpg/core`」），但 `packages/core` 原始碼只在本 monorepo —— 所以 **lift-to-core 只能在 neurons 這邊做**，二階之後 bump npm 版本 swap 掉它的 app-local copy。本 change 同時完成 lift + neurons 接線，建立單一真實來源。

附帶解決 owner 原始訴求「每回錯題更完整」：模擬考交卷時把整卷答錯＋未作答**一次批次寫進錯題本**，比逐題作答才記更全 → ⚔️ 錯題出征的 wrong-question pool 更完整。

## What Changes

- **Core lift（additive，patch bump 0.6.1 → 0.6.2，`latest` dist-tag）**：把二階的 corpus-agnostic 純函式 lift 進 `@study-rpg/core` —— 兩個新模組 `lib/exam-set.ts`（`examSetScore` / `ExamSetScore`）+ `lib/exam-set-mock.ts`（`ExamMode` / `MockExamState` / `MockAction` / `mockExamReducer` / `createInitialMockState` / `clampIndex` / `isCorrectAnswer` / `scoreMockExam` / `MockExamScore` / `unansweredIndexes` / `firstUnanswered` / `wrongOrUnansweredIndexes` / `navigatorCellStates` / `CellState` / `ReviewCellState`）+ draft pure helpers（`paperKeyHash` / `isDraftFresh` / `MockExamDraftRow` type）。新檔名刻意避開既有 legacy `lib/mock-exam.ts`（一階 engine 的 `scoreMock` / `applyMockPassReward`，neurons 不消費，**不動**）。新增 CHANGELOG 條目。**不執行 `npm publish`**（owner-driven，per `core-npm-package`）。
- **計分 normalize**：`examSetScore` 改成 `examScore = total > 0 ? (correct / total) * 100 : 0`（取代二階寫死的 `correct × 1.25`）。一階/二階標準 80 題卷數值完全等價（1.25 = 100/80）；neurons ~100 題卷滿分剛好 100，不再破表成 125。送分（disputed）題在所有計分數字一律 credit 正確。
- **Mode 選擇器**：`QuestionBankPage` 的 模考 picker 在開跑前加「即時詳解 / 模擬考試」選擇。**即時詳解** = 沿用現有 `QuizModal preserveOrder practice` 逐冊未答題流程；**模擬考試** = 新 `MockExamRunner`，吃**整卷**（該冊全部題目、依題號排序，含已答過的）而非未答 remainder。
- **MockExamRunner UI**（port 二階 `ExamSetModal` 的 mock 分支）+ **QuestionJumpGrid**（cell 數用 `pool.length`，不寫死 80）+ **flag 標記**（run-scoped，不混 收藏）+ **交卷 review 螢幕**（own answer vs correct + 各科 correct/total + 國考換算分 + 未作答數）+ **交卷前未作答警示**（跳第一題未答 / 仍要送出）。
- **送出批次寫錯題本**：交卷時 `wrongOrUnansweredIndexes(pool, answers)` → loop `recordQuestionResult(id, family, false)`（neurons 既有 path，`everWrong` monotonic-OR）；送分題排除。
- **草稿 resume**：新 Dexie `mockExamDrafts` table 存單卷 in-progress 草稿（paper key / 凍結 questionIds / answers / flagged / index / timestamps），關 modal 或重整後 launcher 偵測未完成同卷草稿 → 提供「繼續 / 重新開始」（不 auto-resume）；題庫 drift（questionIds 不再對得上重建的 pool）視為 stale → 提示重開。草稿純 local、不進雲端 sync。
- **Dexie v18 → v19**：additive 加 `mockExamDrafts` table（store `'&paperKeyHash, updatedAt'`，無 upgrade callback）；**必帶 `db-v18-to-v19-migration.test.ts` fixture**（CI `dexie-fixture-lint` 會擋；仿既有 `db-v17-to-v18-migration.test.ts`）。
- **模擬考 = 純練習**：不給 maze 能量 / 不抽迷宮變體 / 不長 connectome / 不發 DMN（沿用 `neurons-exam-set-expedition` 既有原則）；但仍寫 `questionHistory` / `everWrong` / 更新 SRS。
- **退役 `mock-exam` spec**：`openspec/specs/mock-exam/` 是舊一階 engine 的 TBD placeholder（碼錶 / `mockAttempts` / XP-loot reward burst / SRS enqueue），neurons 無 XP/stat/loot engine、一階 app 已移除、neurons 不消費其任何 core 匯出 → 整個 capability 退役。

OUT（→ 另起 change ② `add-neurons-exam-set-mock-variants`，不在本 change）：模擬考神經元變體 gacha 收藏線（catalog + 分數 tier roll + pity + 每卷每日 cap + R2 sync + sprites + collection 區）。本 change 零新收藏 schema、零 R2 `SCHEMA_VERSION` bump、零 Worker 改動。

## Capabilities

### New Capabilities

（無 —— 引擎契約掛在既有 `core-npm-package`，UI 行為掛在既有 `neurons-exam-set-expedition`，避免 spec sprawl。）

### Modified Capabilities

- `core-npm-package`: 新增「Exam-set mock 引擎匯出」requirement —— 列出 lift 的匯出符號、normalize 計分語意（`examScore = (correct/total)×100`）、disputed-credit 不變式、reducer 送出後鎖定不變式、additive patch bump（`0.6.1 → 0.6.2`）+ CHANGELOG 條目（mirror 既有 continuation-helper / shoutout 匯出 requirement 的 pattern）。
- `neurons-exam-set-expedition`: 新增 mode 選擇器 + 模擬考試模式（整卷 pool、延後揭曉、自由跳題可改答、jump grid、flag、交卷揭曉+鎖定、review own-vs-correct+各科分數+國考換算分、未作答警示+交卷批次寫錯題本、草稿 resume + stale 偵測）等 requirement；**MODIFY** 既有「Coverage derives from questionHistory with no new persistence」requirement（其「SHALL NOT add a Dexie table / bump `.version()`」約束需放寬 —— 模擬考草稿 table 是新增、與 coverage 衍生機制無關的獨立 local-only 持久化）。

### Removed Capabilities

- `mock-exam`: 退役舊一階 engine 的 TBD placeholder spec（neurons 從未實作、不適用 neurons 的無-XP/loot 模型）。delta 以 `## REMOVED Requirements` 列出其 8 條 requirement，archive 時連同 `openspec/specs/mock-exam/` 目錄一併移除。

## Impact

- **Core（`packages/core`）**：新增 `src/lib/exam-set.ts` + `src/lib/exam-set-mock.ts` + 對應 `__tests__`；`src/index.ts` 加匯出；`package.json` version `0.6.1 → 0.6.2`；`CHANGELOG.md` 加條目。Legacy `src/lib/mock-exam.ts` 不動（仍在 published 契約內）。
- **neurons app（`apps/neurons-tw`）**：新增 `MockExamRunner` + `QuestionJumpGrid` component + mode 選擇器接進 `QuestionBankPage.tsx`；`expedition.ts` 加「整卷（含已答）依題號排序」full-paper builder（既有 unanswered-remainder builder 留給即時詳解）；新增 `mock-exam-draft` Dexie ops service（消費 core 的 `paperKeyHash` / `isDraftFresh`）；`db.ts` v18 → v19 + `mockExamDrafts` table + fixture test；交卷批次寫錯題本複用 `recordQuestionResult`。
- **跨 session 協調**：lift + owner publish `@study-rpg/core@0.6.2` 後，session-bus 回二階「core 已 lift exam-set 引擎 + 發 0.6.2，可 swap app-local `mock-exam.ts` / `exam-set.ts` → core import」。
- **無影響**：R2 sync（草稿 local-only，無 bundle/`SCHEMA_VERSION` 改動）、leaderboard、Worker、其餘 Dexie table、connectome / DMN / maze 經濟。
- **CI**：`dexie-fixture-lint` 需見到 v18→v19 fixture；`pnpm -r typecheck` + neurons vitest 須綠。
