## Why

DMN 抽卡目前是 closed-cap：消耗品圖鑑抽滿 22 張後就**不能再抽消耗品**，每抽只 roll 裝備（裝備抽光則整個 no-op）。玩家回報：抽滿 22 張後抽卡顯示「抽卡失敗 — 沒有可用次數或卡池已空」，但實際上還有 8 件裝備沒抽到、而且消耗品本來就該能重複抽來補庫存。

消耗品是「補給品」（從背包啟動才生效）——抽到重複的應該**累加庫存**，而不是被排除。22 張 `dmnCards` 應該是「圖鑑（首次見到的收藏紀錄）」，庫存 `inventory` 才是可用量、且不應封頂。Codex 第二意見確認此方向，並抓到一個會變新 bug 的實作點（見 design）。

## What Changes

- **消耗品改為可重複抽**：抽到已擁有的消耗品時，**仍消耗一張抽卡券、`inventory` 庫存 +1、`dmnLifetimeDrawsConsumed` +1、重算 `dmnDrawsAvailable`**；只在「首次見到」時才寫 `dmnCards` 圖鑑列（不覆寫首見 `obtainedAt`）與 `dmnEventLog` provenance。抽卡結果加 `duplicate: boolean` 旗標供 modal 顯示「已在圖鑑 · 庫存 +1」。
- **移除 closed-cap / pool-exhaustion no-op**：消耗品永不耗盡 → 只要有抽卡券，抽卡一定產出（消耗品或裝備）。移除 `drawDmnCard` 頂部 both-pools-exhausted return-null guard 與「消耗品抽滿後強制 roll 裝備」邏輯。
- **裝備維持 owned-once、flat 5%**（owner 選定，不加 soft-pity）：`wantEquipment = rng() < EQUIPMENT_DRAW_RATE && 尚有未擁有裝備`；命中且有未擁有裝備 → 發裝備，否則發消耗品（可重複）。裝備全擁有時自然只發消耗品。
- **收藏進度顯示改為 /34**：homepage `ConnectomeStatCard`「💎 DMN X / 20」與抽卡 modal「已蒐集 X / 22」一律改為 `(dmnCards 圖鑑 + equipment) / 34`（22 消耗品面 + 12 裝備）。移除 `bothPoolsExhausted` 的「DMN 圖鑑完整」狀態；抽卡鈕只由「有無抽卡券」決定。
- **零持久化 schema 改動**：`duplicate` 是 in-memory 結果旗標，不入庫；`dmnCards` / `inventory` / `dmnEventLog` 表結構與 merge 不變。**不 bump Dexie、不 bump R2 SCHEMA_VERSION、不動 SYNCED_META_KEYS**。

## Capabilities

### New Capabilities
<!-- 無新 capability -->

### Modified Capabilities
- `neurons-dmn-fate-cards`: (1)「Drawing a DMN card SHALL roll equipment first, else deposit a consumable to the backpack」requirement — 改為消耗品可重複抽（重複只 +庫存、不重寫圖鑑/provenance）、裝備 flat 5% only-if-unowned、移除 pool-exhaustion no-op 與強制裝備 fallback；(2)「Consumable catalog SHALL be closed-cap — collection completes at 22 cards」requirement — 改為消耗品 draws 可重複、22 張 `dmnCards` 為首見圖鑑、`inventory` 庫存無上限；(3) 新增 collection-progress requirement：收藏進度以 `dmnCards + equipment` 對 34 總數計算。

## Impact

- **Code（engine）**：`apps/neurons-tw/src/lib/services/dmn-fate-card.ts`（`DrawDmnCardResult` 加 `duplicate`；`selectCardFromPool` 不再排除已擁有；`drawConsumable_` 重複只 +庫存/+consumed/derive、首見才 put 圖鑑+eventLog；`drawDmnCard` 分支與 guard 重寫）。
- **Code（hook + UI）**：`apps/neurons-tw/src/lib/hooks/useDmnStatus.ts`（加 `collectionOwned` = dmnCards+equipment / `collectionTotal` = 34；移除 `bothPoolsExhausted` 語意）；`apps/neurons-tw/src/components/ConnectomeStatCard.tsx`（`canDraw` 只看券、移除「圖鑑完整」分支、`/ 20` → `/ 34`、改用 hook 收藏值、移除 `dmnOwned` prop）；`apps/neurons-tw/src/routes/OverviewPage.tsx`（移除 `dmnOwned` 計算與 prop）；`apps/neurons-tw/src/components/DmnDrawModal.tsx`（已蒐集 → `/34`、重複消耗品 reveal 文案、錯誤訊息去掉「卡池已空」）。
- **Tests**：`apps/neurons-tw/src/__tests__/dmn-draw-mechanics.test.ts`(「never re-draws owned」→「duplicate succeeds: 圖鑑不變、庫存+1、consumed+1、duplicate=true」;「both pools complete returns null」與我先前加的 all-owned 測試 → 改成「裝備全擁有 + 圖鑑滿仍發消耗品庫存」; 加 collectionTotal=34)。
- **不影響**：抽卡券如何 earn（grants−consumes 投影不變）、`dmnCards`/`inventory`/`dmnEventLog` schema 與 merge、achievements（圖鑑仍在 22 收滿時觸發首見收集）、leaderboard。
- **已知限制（沿用、不在本次解）**：`inventory` 為 per-kind LWW（非累加 CRDT），跨裝置離線各抽/各用同 kind 庫存可能 last-write-wins；單裝置玩家不受影響。Codex 標示為未來可選的 op-log 升級。
