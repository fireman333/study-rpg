## Why

`apps/medexam-tw/src/App.tsx` 的 `doRoll` 函式把 `setInstances` + `instanceFromRoll` + `setReveal` **塞進 `setPlayer` updater 內**：

```ts
function doRoll(source) {
  setPlayer((p) => {
    const r = rollLoot(catalog, p.lootStats)
    if (!r) return p
    const inst = instanceFromRoll(r, source)  // ← side effect: creates UUID
    setInstances((prev) => [...prev, inst.instance])  // ← side effect: state mutation
    setReveal(r)  // ← side effect: state mutation
    return { ...p, lootStats: r.newStats, inventory: [...p.inventory, inst.instance.id] }
  })
}
```

React 18 StrictMode 把 updater 函式跑兩次驗證 purity → 每次抽卡實際生 **2 個 instance**，但 `player.lootStats.totalRolls` 只 +1。Prod 不 strict 看不出來，但 dev mode 每次抽卡 inventory 多 1 件（wire-persistence-mvp 的 Chrome MCP smoke 抓到：抽 3 次 → totalRolls=3 / instCount=5 不一致）。

`onQuizComplete` 跟 `fightMiniBoss` 也透過 `doRoll` 觸發，所以同一個 bug 沿著三條呼叫路徑擴散。

**Side effects 絕不可在 React state updater 內**（React 官方規則 + StrictMode 自動驗證）。修法：把 `rollLoot` + `instanceFromRoll` 抽到 updater **外面**呼叫，updater 只負責 player state 更新。

## What Changes

**Impl**（`apps/medexam-tw/src/App.tsx`）：
- 重寫 `doRoll`：先讀 `player.lootStats` snapshot、外部 `rollLoot` + `instanceFromRoll`，再用單一 `setPlayer` (純 updater) + `setInstances` + `setReveal` 平行更新
- `onQuizComplete` 內的 `for (let i = 0; i < correctCount; i++) setTimeout(() => doRoll('quiz'), i * 150)` 自動受惠
- `fightMiniBoss` 內的 3 連抽同理

**Spec**（已存在 `loot-mechanics` capability MODIFIED）：
- 新增 requirement「Roll dispatch is React-strict-safe」明確規定 caller 不可把 side effect 包進 React state updater

**不 BREAKING**：行為對 prod 用戶完全相同；只是 dev mode 不再 inflate inventory。10k loot smoke 不受影響（純函式 `rollLoot` 不變）。

## Capabilities

### Modified Capabilities
- `loot-mechanics`: 新增「React state-updater purity」requirement

## Impact

- **Files**: 
  - `apps/medexam-tw/src/App.tsx`（重寫 `doRoll` ~10 行）
  - `openspec/specs/loot-mechanics/spec.md` 透過 archive merge 加 1 個 requirement
- **APIs**: 無
- **Dependencies**: 無
- **Tests / verify**: 
  - typecheck pass
  - 10k loot smoke unchanged（pure rollLoot）
  - Chrome MCP smoke：清 IDB → reload → 抽 3 次 → confirm `totalRolls === instCount === 3`
- **Risk**: 低 — 純函式邏輯不動，只重排呼叫順序
