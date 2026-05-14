## Why

`packages/core/src/lib/xp.ts` 定義整個遊戲平衡的 single source of truth：XP 曲線（`xpToNext = floor(50*L^1.4) + 50`）、REWARD 表（reading +5 XP/min、quiz correct +10 XP/+1 knowledge、quiz wrong +2、boss mini +50、boss annual +200）、`addStat` / `applyXp` / `newPlayer` 等 pure 函式。

這些常數一改就 break 玩家平衡感、loot 經濟、SRS 推題節奏。**沒有 spec 守住** = 任何 PR 改一個 magic number 都不會被 review 攔。M3 發 `@study-rpg/core` npm 後，下游 fork 也沒契約可依。

本 change 把現有 code 的不變式 lock 成 spec scenario — **code 不動**，只是把實裝行為固定下來。未來改數值要先 propose `modify-engine-rewards`、寫遷移理由。

## What Changes

- 新增 capability `engine-rewards`，6 條 requirement 涵蓋：
  - XP 曲線公式
  - REWARD 表 5 個 entry 的精確值
  - `applyXp` / level-up 行為
  - `addStat` 不可變性（pure function、不 mutate 入參）
  - `newPlayer` factory 初始狀態
  - Reward 常數不可省略已存在的 entry（防止重構漏 key）
- **不動 code**

## Capabilities

### New Capabilities
- `engine-rewards`: XP / level / reward 常數 contract

## Impact

- **Files**: spec only — `openspec/specs/engine-rewards/spec.md` 新增
- **APIs**: 無
- **Dependencies**: 無
- **Tests / verify**: `openspec validate lock-engine-rewards`；無需 typecheck / build（純 spec）
- **Risk**: 0 — code 不變
