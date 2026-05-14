## Why

[DEFAULT_STAT_SCHEMA](packages/core/src/types.ts) 定義 4 個玩家屬性（`knowledge` / `reflex` / `memory` / `stamina`），CharCard UI 也已渲染 4 條 stat bar。**但 `reflex` 跟 `memory` 永遠是 0** — REWARD 表只有 `quizCorrect.stat = knowledge` 與 `readPerMinute.stat = stamina`，沒任何 action 餵養另外 2 個 stat。玩家看到 2 條永遠空的 bar，是 dogfood 一打開就會發現的破洞，也讓「4 屬性公式 fine-tune」（M2 roadmap）無從談起（沒資料怎麼 tune）。

本 change 把 4 屬性全部接上 action，讓 stat system 從「半空殼」變成 functional baseline，dogfood 1 週後才有 telemetry 跑公式 rebalance。

## What Changes

- `REWARD` 表新增 2 entries（從 5 → 7 keys）：
  - `srsReviewCorrect`: { xp: 0, subjectXp: 0, stat: { name: 'memory', delta: 1 } }（review 答對 +1 memory；XP 不重複給因為 quizCorrect 已給）
  - `quizFastAnswer`: { xp: 0, subjectXp: 0, stat: { name: 'reflex', delta: 1 } }（答題 elapsed time < `FAST_ANSWER_THRESHOLD_MS = 10000` 且答對 +1 reflex）
- **BREAKING（per engine-rewards spec 自己的 discipline 規則）**: REWARD table 從 5 entries 變 7 entries。修改既有 `Reward shape matches table` scenario。
- QuizModal 加 per-question startedAt 追蹤；onAnswer callback 多帶 `elapsedMs: number`
- App.tsx onAnswer 處理流程新增：(1) 答對 + fast → addStat reflex；(2) review-mode 答對 → addStat memory
- CharCard 4 條 stat bar 加 hover tooltip（`title` 屬性）顯示成長條件 — 不引入新元件

**Out of scope**（明確留給後續 changes）：

- 完整 Skill Tree modal / panel（per-subject XP breakdown、stat provenance log）
- knowledge / stamina 既有 reward rate rebalance（dogfood 無資料）
- Boss / level-up 加 stat reward（目前 bossMiniPass 只給 XP）
- Equipment stat multiplier / synergy
- Streak / chain bonus
- Reflex threshold tunable from settings

## Capabilities

### New Capabilities

（無）

### Modified Capabilities

- `engine-rewards`: REWARD table 加 2 entries；新增「4 stats all wired」契約 requirement
- `quiz-runner`: QuizModal 需追蹤 per-question elapsed time 並回傳給 onAnswer caller

## Impact

- **Files**:
  - `packages/core/src/lib/xp.ts`（REWARD 加 2 entries、新增 `FAST_ANSWER_THRESHOLD_MS` 常數）
  - `apps/medexam-tw/src/components/QuizModal.tsx`（per-Q startedAt state、onAnswer 傳 elapsedMs）
  - `apps/medexam-tw/src/App.tsx`（onAnswer 分流計算 fast / review reward）
  - `apps/medexam-tw/src/components/CharCard.tsx`（stat row title tooltip）
  - `openspec/project.md`（M2 roadmap「4 屬性公式 fine-tune」改成「✓ 4 屬性 wired，公式 fine-tune 待 dogfood」）
- **Backward compat**: 既有玩家 save state 不受影響（`Player.stats.reflex` / `memory` 已存在於 schema，目前都是 0；新 reward 開始累積後 stat 從 0 往上長，不需 migrate）
- **Smoke test 預期**: 玩 5 題快答全對 → reflex +5; 跑 5 題 SRS due review 全對 → memory +5
