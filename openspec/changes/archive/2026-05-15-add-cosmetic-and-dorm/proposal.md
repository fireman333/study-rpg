## Why

一階 M5 milestone 剩最後兩個 item：宿舍場景 + cosmetic unlock。Grill 過程確認兩者天然耦合（cosmetic 需要顯示空間 = dorm；dorm 沒 cosmetic 內容會空虛），合併為單一 change 一次 ship。提供 player：(1) 純行為觸發的解鎖儀式感（不靠抽卡），(2) 個性化的「家」視覺累積投資， (3) milestone 達成的可見回饋（不只屬性數字）。M5 至此結算。

## What Changes

- 新增 **cosmetic-system** capability：玩家可解鎖、裝備、預覽 cosmetic 物件（純視覺，不影響 stat）
- 新增 **dorm-view** capability：新 React Router route `/dorm` — 主角 sprite 居中、cosmetic layer overlay、宿舍背景。Home view CharCard 不顯示 cosmetic（僅 dorm 內可見）
- Cosmetic unlock 走 **milestone-only**（level / stat / streak / boss / mock attempts），**不**進抽卡 loot table
- MVP 起手 **20+ cosmetic across 5 categories**（頭飾 / 身體 / 配飾 / 持物 / 背景）
- Sprite assets via codex `$imagegen` GBA-pixel style — layer-style transparent sprites，跟 doctor / mentor 同條路徑
- Locked cosmetic 預覽用「?」剪影 + unlock 條件 caption
- `Item` interface 加 `isCosmetic?: boolean` flag + `effects: []` 必為空對 cosmetic — 0 結構改動 + 全 reuse 抽卡 / inventory UI

## Capabilities

### New Capabilities
- `cosmetic-system`: cosmetic item catalog / milestone unlock check / equip-unequip 操作 / 20+ 起手 catalog
- `dorm-view`: `/dorm` route / 主角 sprite + cosmetic layer overlay 渲染 / 裝扮間 inventory grid / 背景 cosmetic / 純展示無 mechanic

### Modified Capabilities
- `item-catalog`: 加 `isCosmetic` flag 規範（cosmetic 物件 effects MUST be empty）
- `theme-pack-contract`: cosmetic sprite key 規範（layer-style transparent，新增 `cosmetic-*` keys 系列；mock-exam-capable 同樣是 optional fallback）

### Capabilities NOT modified (intentional)
- `persistence`: cosmetic equipped state 寫進既有 `player.equipment` Record — `Equipment` interface 新增 5 個 optional cosmetic slot fields 屬於 type-level 演進，**不需要 Dexie schema bump**。Player.equipment 透過既有 `db.players.put(player)` 自動持久化。Apply 階段 verified — no v4 schema added.

## Impact

- **新 code**:
  - `packages/core/src/lib/cosmetic.ts`（純函式：`checkMilestoneUnlocks`, `unlockCosmetic`, `equipCosmetic`, `unequipCosmetic`, `getCosmeticDefinitions`）
  - `packages/core/src/types.ts` 加 `Item.isCosmetic` flag，可能加 `EquipSlot` 'cosmetic-head' / 'cosmetic-body' / 'dorm-background' etc.
  - `apps/medexam-tw/src/routes/DormRoute.tsx`（dorm view）
  - `apps/medexam-tw/src/components/CosmeticPicker.tsx`（裝扮間 inventory grid）
  - `packages/theme-pixel-medical/src/items.ts` 加 ~20 cosmetic item entries（hard-coded catalog）
  - `packages/theme-pixel-medical/sprites/cosmetic/<key>.png` × ~20（codex 生成）
- **修改 code**:
  - `packages/core/src/lib/xp.ts` 或新 `milestone.ts` — milestone check function（在 player 更新時被呼叫）
  - `packages/theme-pixel-medical/src/sprites.ts` — register cosmetic sprite keys
  - `apps/medexam-tw/src/App.tsx` — 加 `/dorm` route entry + home view 加「🏠 宿舍」button + milestone check hook（player 更新時觸發 cosmetic unlock）
  - `apps/medexam-tw/src/styles.css` — dorm + cosmetic picker CSS
- **不變**:
  - `engine-rewards` — cosmetic 不走 REWARD 表
  - `loot-mechanics` — cosmetic 不進抽卡 loot pool
  - `quiz-runner` / `srs-queue` / `mock-exam` / `mentor-daily` — cosmetic 跟現有 gameplay loops 隔離
- **No Dexie schema bump** — verified during apply: cosmetic equipped state writes through existing `player.equipment` Record (5 new optional slot fields, 0 migration required)
- **無外部 API 依賴**: 純 client-side
- **Sprite gen wall**: ~20 sprites × 3 min = 60+ min（並行 batch 可壓到 ~20 min）
- **M5 完結**: 本 change archive 後 M5 全部 4 item ✓
