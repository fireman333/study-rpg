## Why

`packages/core/src/lib/db.ts` 已定義 11-table Dexie schema（players / questions / itemInstances / drops / srs / attempts / readSessions / bossRuns / items / subjects / meta），但 `apps/medexam-tw/src/App.tsx` **完全沒呼叫** — Player + ItemInstance 純活在 React state，重整網頁 wipe 一切。

project.md M1 roadmap 寫進去「IndexedDB 存檔」，但實際 state 不存。再加：「MVP 不解跨裝置；提供 export/import JSON button」也沒做。

Demo killer 等級的問題：玩家辛苦抽到 SSR、養到 Lv.5、Refresh → 回到 Lv.1 新角色。dogfood 玩兩天就放棄。

本 change：
1. Hydrate on mount（read DB → setPlayer / setInstances）
2. Persist on mutation（player change → `db.players.put`；instances change → bulk replace `db.itemInstances`）
3. Export full state → JSON 檔下載
4. Import JSON → 取代現有 state（含確認 prompt）

## What Changes

**Spec**（新 capability `persistence`）：
- Reload survival：page reload 後 player.level / .xp / .stats / .equipment / .inventory + instances 全部 restore
- Write-on-mutation：每次 setPlayer / setInstances 後 ≤ 500ms 內 DB 寫入
- 首次載入無存檔 → 用 `newPlayer` 初始；之後第一次 mutation 自動 persist
- Export JSON：完整 `{ player, instances, schemaVersion }` 下載為 `study-rpg-save-<timestamp>.json`
- Import JSON：解析後跳 confirm prompt → setPlayer / setInstances；shape 驗證失敗 reject

**Impl**（`apps/medexam-tw/src/App.tsx`）：
- 新增 `PLAYER_ID = 'p1'` 常數
- `useEffect` on mount：`db.players.get(PLAYER_ID)` 載入；若有 → setPlayer + `db.itemInstances.toArray()` 載入 instances；無 → 維持 `newPlayer` initial
- `useEffect` on `[player]`：`db.players.put(player)` 自動 persist
- `useEffect` on `[instances]`：transaction clear + bulkAdd（MVP 簡單做法；instances 量小）
- 新增 export button：序列化 → blob → `URL.createObjectURL` → 觸發下載
- 新增 import button：`<input type="file">` → FileReader → JSON.parse → 驗證 shape → confirm → setState

**不 BREAKING**：UI 新增 2 個 button（💾 Export / 📂 Import）；db.ts schema 不動

## Capabilities

### New Capabilities
- `persistence`: IndexedDB-backed save / load / export / import 規格

## Impact

- **Files**: 
  - `apps/medexam-tw/src/App.tsx`（加 hydrate / persist useEffect + 2 button + import file input）
  - `apps/medexam-tw/src/components/PersistenceButtons.tsx`（新；export/import UI 抽出）
  - `openspec/specs/persistence/spec.md`（新增）
- **APIs**: 無 breaking — `getDB()` 是既有 export
- **Dependencies**: 無新增（Dexie 已在 core deps）
- **Tests / verify**: 
  - typecheck pass
  - Chrome MCP smoke：
    - 抽卡 3 次 → reload → confirm instances 仍在
    - level up → reload → confirm level 保留
    - export → check downloaded JSON shape
    - import 一份 mock save → confirm state 替換
- **Risk**: 中等。IndexedDB write 非同步、若失敗目前無 UI feedback（fallback 是 `console.error`）。M2 加 toast notification
