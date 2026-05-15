## Why

一階 M5 milestone 缺一個「完整一份歷年原卷重做」的模式 — 目前 quiz-runner 只支援隨機抽 5–N 題的 mini-quiz，無法做完整一份歷年原卷（一階 ≈100 題）、stopwatch 計時的考前演練。對 2026 H2 一階國考最有直接 utility 的功能就是這個（dogfood owner = 作者本人）。

## What Changes

- 新增 mock exam mode：使用者可挑一份歷年原卷（醫一 / 醫二 × 9 年）做完整一份原卷 ≈100 題演練
- Stopwatch 計時（**不** 倒數），visibility-change 自動暫停（同 reading-loop 紀律）
- 交卷後一頁式結果：總分 + 每題對錯 + 詳解全展開（缺詳解題顯示 placeholder）
- 個人進步曲線：同一份原卷重做時跟自己歷史成績比較（Dexie 持久化 mock attempts）
- 全卷完成 reward burst：boss-tier 屬性加成 + 1 次保底 SR loot roll（**BREAKING** 對 `engine-rewards` REWARD 表 — 新增 `mockExamPass` 項目）
- Mock 結果頁含「將錯題加入 SRS queue」一鍵 button（option，不強制）
- 題庫 build script 需 surface 每題的 `year` + `paper`（醫一 / 醫二）metadata 以支援「按原卷分組」UI（**可能 BREAKING** 對 `questions.json` schema — 視 build script 現況決定）

## Capabilities

### New Capabilities
- `mock-exam`: 歷年原卷重做模式 — 選卷 / 答題 stopwatch loop / auto-pause / 結果頁 / 進步曲線 / boss-tier reward burst hook / SRS enqueue button

### Modified Capabilities
- `engine-rewards`: REWARD 表新增 `mockExamPass` entry（boss-tier，xp / subjectXp / stat 數值待 design.md lock）
- `content-pack-contract`: `questions.json` schema 需保證 `year` 與 `paper`（`'medexam-1' | 'medexam-2'`）兩欄存在；若 build script 尚未 surface 則 add requirement
- `persistence`: 新增 `mockAttempt` Dexie table schema 要求（持久化每次 mock 的 paper id / 起訖時間 / ~100 題答案 / 分數）

## Impact

- **新 code**:
  - `packages/core/src/lib/mock-exam.ts`（純函式：計分、進步曲線計算、reward burst calculator）
  - `packages/core/src/types.ts` 加 `MockAttempt` interface
  - `apps/medexam-tw/src/screens/MockExamPicker.tsx`（選卷介面）
  - `apps/medexam-tw/src/screens/MockExamRunner.tsx`（答題介面 + stopwatch + auto-pause）
  - `apps/medexam-tw/src/screens/MockExamResult.tsx`（一頁式結果 + 詳解 + 進步曲線）
  - `apps/medexam-tw/src/db/mock-attempts.ts`（Dexie schema migration + DAO）
- **修改 code**:
  - `packages/core/src/lib/xp.ts` — 加 `mockExamPass` 進 REWARD 表
  - `packages/content-medexam-tw/scripts/build.ts` — 確認 `year` + `paper` metadata 寫入 questions.json（已存在則 noop）
  - `apps/medexam-tw/src/App.tsx` — 加 `/mock` route entry
- **不變**:
  - `quiz-runner` capability —— mock 是獨立 flow，不重用 QuizModal
  - `mini-boss` capability —— mock = ultimate boss tier 但實作獨立，不複用 mini-boss state machine
  - `srs-queue` capability —— mock 透過已存在的 `enqueueWrongAnswers()` API 呼叫；spec 無需改
- **Dexie schema bump**: v(current+1)，加 `mockAttempts` store；既有資料無需 migrate
- **無外部 API 依賴**: 純 client-side（百分位用個人歷史，不接考選部資料）
