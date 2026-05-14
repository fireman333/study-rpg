## Why

`packages/core/src/lib/loot.ts` 是抽卡核心：`DEFAULT_RARITY_WEIGHTS`（N:60 / R:25 / SR:10 / SSR:4 / UR:1 共 100）、`PITY_SR_THRESHOLD = 30` 連抽無 SR+ 強制 SR、`PITY_SSR_THRESHOLD = 100` 連抽無 SSR+ 強制 SSR、`rollRarity` / `rollLoot` / `instanceFromRoll` 純函式。

這些 weight 跟 pity 一改就 break 整個經濟系統。已有 `scripts/loot-smoke.mjs` 跑 10k 證實 distribution within ±2σ，但 **沒 spec 守住** = PR 改個 weight 從 25 → 30 不會有 lint / test 攔截。

本 change 把實裝行為 lock 成 spec scenario：weight 表精確值、pity 閾值、10k smoke 預期分佈（±2σ tolerance）、pity 觸發後 counter 歸零行為。**Code 不動**，未來改數值要先 propose `tune-loot-weights` 之類 modify。

## What Changes

- 新增 capability `loot-mechanics`，7 條 requirement：
  - `DEFAULT_RARITY_WEIGHTS` 精確值
  - `PITY_SR_THRESHOLD = 30`、`PITY_SSR_THRESHOLD = 100`
  - `rollRarity` pity 優先邏輯
  - `rollLoot` 純函式不變式（不 mutate 入參）
  - Pity counter 重置規則（達到該級或更高 → 該 counter 歸零）
  - 10k smoke distribution scenario（每 bucket within ±2σ）
  - `pickItemByRarity` fallback 規則（pool 空時降級）
- **不動 code**

## Capabilities

### New Capabilities
- `loot-mechanics`: rarity weights / pity / roll 函式 contract

## Impact

- **Files**: spec only — `openspec/specs/loot-mechanics/spec.md` 新增
- **APIs**: 無
- **Dependencies**: 無
- **Tests / verify**: `openspec validate lock-loot-mechanics`；`node scripts/loot-smoke.mjs` 重跑確認 spec scenario 仍 pass
- **Risk**: 0 — code 不變
