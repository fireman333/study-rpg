## Why

一階 M5 milestone 缺一個「每天一次的低阻力 hook」— 目前 player 沒有 daily-touchpoint，daily streak 純靠閱讀 / 答題達閾值，但長時間沒進度的玩家容易斷 streak。導師 NPC 每日一題提供：(1) 每日一次儀式感的開場互動、(2) 自動清 SRS due backlog 的助推、(3) 弱科目補強的引導、(4) streak check-in 的第三條輕量路徑。

## What Changes

- 新增 **mentor-daily** capability：每日 1 道由「導師 NPC」推薦的題（Hybrid 演算法：SRS due 最舊優先 → 無 due 才從弱科目隨機抽）
- 新增 **MentorDialog** UI 元件：NPC sprite portrait + 對話框 + 內嵌 question card，跟 QuizModal 不重用（沉浸感 + 單題流程）
- **獎勵**：答對 = `Math.floor(REWARD.quizCorrect.xp * 1.5 * streakMultiplier)` ≈ 22 XP base；答錯 = `REWARD.quizWrong.xp` (2 XP)
- **Streak 整合**：mentor-daily 完成視為一次普通 `quiz answered`（透過 `incrementQuestionsAnswered` +1 走既有 check-in path）— 不改 `engine-rewards` streak spec
- **跨天 / backlog**：UTC+8 day-roll-over；漏一天累積，cap 5 道（避免 hoard）
- **Skip 機制**：可 skip 但不算 streak credit，被 skip 的題不重出
- **NPC sprite**：新增 `mentor-male` + `mentor-female` 兩款白袍 GBA-pixel sprite（走 codex `$imagegen` 路徑）；放 `packages/theme-pixel-medical` 內，註冊進 ThemePack.sprites
- **Persistence**：Dexie schema v3 — 新 `mentorBacklog` singleton（pending question IDs + last assigned date）
- **Quiz events 整合**：mentor 答對也走 `quizEvents.emit('correct-answer')` — 跟 quizCorrect 一致（cross-app contract）

## Capabilities

### New Capabilities
- `mentor-daily`: 每日導師題 capability — backlog 排程 / Hybrid 題選 / MentorDialog UI / 1.5× 獎勵 / skip semantics / 跨天累積 cap 5

### Modified Capabilities
- `theme-pack-contract`: 新 sprite key 規範 — `mentor-*` 系列為可選 sprite keys（mock-exam-capable pack 同樣模式，pack 可不提供則 mentor 隱藏）
- `persistence`: 新增 `mentorBacklog` Dexie singleton schema 要求

## Impact

- **新 code**:
  - `packages/core/src/lib/mentor-daily.ts`（純函式：`pickDailyQuestion`, `enqueueBacklog`, `consumeBacklog`, `applyMentorReward`）
  - `packages/core/src/types.ts` 加 `MentorBacklog` interface
  - `apps/medexam-tw/src/components/MentorDialog.tsx`（NPC dialog 元件）
  - `apps/medexam-tw/src/db/mentor-backlog.ts` DAO
  - `packages/theme-pixel-medical/src/sprites/mentor-male.png` + `mentor-female.png`（codex 生成）
- **修改 code**:
  - `packages/core/src/lib/db.ts` — Dexie v3 加 `mentorBacklog` store
  - `packages/core/src/index.ts` — re-export mentor-daily 公開 API
  - `packages/theme-pixel-medical/src/index.ts` — 註冊新 sprite keys
  - `apps/medexam-tw/src/App.tsx` — home 加「今日導師題」button（依 backlog 長度切換 enabled/badge）
- **不變**:
  - `engine-rewards` — mentor 完成走 `incrementQuestionsAnswered` 既有 path，REWARD 表不加新 entry
  - `srs-queue` — mentor 答錯走既有 `quizCorrect/quizWrong` SRS flow（card 寫入規則跟 QuizModal 一致）
  - `quiz-runner` — QuizModal 不改，mentor 是獨立 UI
  - `mock-exam` — 跟 mentor 互不干擾
- **Dexie schema bump**: v(current=2)+1 = v3；加 `mentorBacklog` singleton；既有資料無需 migrate
- **無外部 API 依賴**: 純 client-side
- **Sprite asset 生成**: 走 codex CLI `$imagegen`，~3 min × 2 sprite = ~6 min wall time
