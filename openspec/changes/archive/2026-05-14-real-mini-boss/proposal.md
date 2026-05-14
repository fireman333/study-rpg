## Why

`apps/medexam-tw/src/App.tsx` 第 222-234 行的 `fightMiniBoss` 是 stub：硬寫「直接通關 70%」+ `alert()` + 3 連抽。實際完全沒讓玩家答題。

project.md M1 範圍說「1 boss」、`packages/core/src/lib/boss.ts` 也已寫好 `sampleMiniBoss` / `passed` / `badgeId` 純函式 + 常數（`MINI_BOSS_QUESTIONS=30`、`MINI_BOSS_DURATION_MS=30min`、`BOSS_PASS_THRESHOLD=0.6`）。差的只是 UI 跟 wiring。

本 change 替掉 stub 做真實的 30Q × 30min boss：玩家進 modal → 倒數 timer → 30Q 連續答 → 通過 ≥60% 拿 badge + reward；超時或退出視為 fail（no badge、reduced reward）。

不在 scope：
- annual boss（80–100Q × 80min）— M2 後續
- boss-fight 視覺特效（pixel monster animation 等）— M5 樂趣升級
- multi-subject mini-boss（目前只有藥理） — depends on subject-progression

## What Changes

**Spec**（新 capability `mini-boss`）：
- 開啟條件：subject XP ≥ `MINI_BOSS_UNLOCK_SUBJECT_XP` (100)。MVP 階段藥理 subject XP 永遠 0，所以 unlock check 暫時放寬（任何時候可挑戰）— spec 載明 MVP relaxation + 未來收緊條件
- Modal：30 題 + countdown timer + 不可中途看詳解（避免邊查邊答）
- Pass：≥ 60% 拿 `boss:藥理學:mini` badge + `REWARD.bossMiniPass.xp` (50) + 3 rolls
- Fail：低於 60% 或超時 — 拿 50% XP（25） + 1 roll consolation；不發 badge
- Boss run 寫進 `db.bossRuns`（既有 schema）
- Visibility / idle pause 不適用於 boss mode（一旦開始就跑完）— 跟 reading-loop 區隔
- 已有 badge 不重複發

**Impl**：
- 新 component `apps/medexam-tw/src/components/BossModal.tsx`：
  - mount 時 sampleMiniBoss → 30 題
  - 倒數計時，每 100ms tick 更新 UI；timer 到 0 強制結束
  - 30 題 cycle（簡化版 QuizModal，不顯示詳解，no SRS write 這輪 — 走另一條 path）
  - 結束時 `passed()` 判定，回傳 `{ correctQ, totalQ, timeSpentMs, passed }`
- `App.tsx`：
  - 把 stub `fightMiniBoss` 換成 `setBossOpen(true)` 啟動 modal
  - 新 handler `onBossComplete(result)`：write `db.bossRuns` + dispatch reward / badge / rolls
  - `fightMiniBoss` 按鈕 disable 條件 = no content
- 不動 `packages/core/src/lib/boss.ts` 內部

**不 BREAKING**：UI 新增；既有 `fightMiniBoss` 行為從 stub 升級為真實，不影響 Player 序列化

## Capabilities

### New Capabilities
- `mini-boss`: 30Q timed boss-fight contract

## Impact

- **Files**: 
  - `apps/medexam-tw/src/App.tsx`（換掉 stub 函式 + 加 modal 觸發 ~30 行）
  - `apps/medexam-tw/src/components/BossModal.tsx`（新，~150 行）
  - `apps/medexam-tw/src/styles.css`（加 boss timer + summary 樣式）
  - `openspec/specs/mini-boss/spec.md`（新）
- **APIs**: 無 breaking
- **Dependencies**: 無
- **Tests / verify**: 
  - typecheck pass + build clean
  - Chrome MCP smoke：清 IDB → 點挑戰 boss → 答 1 題 → 強制設 timer = 0 → confirm summary 顯示 1/30 / failed
  - 第二次 smoke：模擬答對 ≥18 題 → pass、badge 入帳、bossRuns 表寫入
- **Risk**: 中等。Timer drift / 重新打開 app 的處理：MVP boss 重開即視為放棄，不續傳；spec 載明
