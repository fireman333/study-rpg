## 1. Engine — repeatable consumable draw

- [x] 1.1 `DrawDmnCardResult` consumable 變體加 `duplicate: boolean`（[dmn-fate-card.ts:148](apps/neurons-tw/src/lib/services/dmn-fate-card.ts:148)）。
- [x] 1.2 `selectCardFromPool`：移除「排除已擁有」邏輯，對全 22 張依 rarity 權重選一張、永遠回非 null；移除 `ownedCardIds` 參數（D2）。
- [x] 1.3 `drawConsumable_`（[dmn-fate-card.ts:235](apps/neurons-tw/src/lib/services/dmn-fate-card.ts:235)）tx 內：`isNew = (await db.dmnCards.get(cardId)) === undefined`；移除舊的 `if dmnCards.get !== undefined return` early-null；`isNew` 才 `dmnCards.put`；一律 `inventory +1` / `dmnLifetimeDrawsConsumed +1` / materialize `dmnGrantsTotal` / derive `dmnDrawsAvailable`；post-commit `dmnEventLog.put` 僅 `isNew`；回傳 `{ kind:'consumable', card, catalog, duplicate: !isNew }`（D1）。
- [x] 1.4 `drawDmnCard`（[dmn-fate-card.ts:157](apps/neurons-tw/src/lib/services/dmn-fate-card.ts:157)）：`wantEquipment = rng() < EQUIPMENT_DRAW_RATE && unownedEquipCount > 0`；`drawEquipment = wantEquipment`（移除 `|| unownedCardCount===0`）；移除頂部 both-pools-exhausted return-null guard（D3）。`drawConsumable_` 呼叫端配合 1.2 參數變更。

## 2. Hook + UI — 34 total, ticket-only gating

- [x] 2.1 `useDmnStatus`（[useDmnStatus.ts](apps/neurons-tw/src/lib/hooks/useDmnStatus.ts)）：加 `collectionOwned`（`dmnCards.count + equipment.count`）+ `collectionTotal`（`DMN_CARD_CATALOG.length + EQUIPMENT_CATALOG.length` = 34）；移除 `bothPoolsExhausted`（D4）。
- [x] 2.2 `ConnectomeStatCard`（[ConnectomeStatCard.tsx](apps/neurons-tw/src/components/ConnectomeStatCard.tsx)）：`canDraw = dmn.drawsAvailable >= 1`（移除 `&& !bothPoolsExhausted`）；移除「DMN 圖鑑完整」exhausted 分支（line ~128–132）；`💎 DMN {…} / 20` → `{dmn.collectionOwned} / {dmn.collectionTotal}`；移除 `dmnOwned` prop。
- [x] 2.3 `OverviewPage`（[OverviewPage.tsx](apps/neurons-tw/src/routes/OverviewPage.tsx)）：移除 `dmnOwned` 的 `ProgressStats` 欄位、`db.dmnCards.count()` 餵入與 `dmnOwned={…}` prop 傳遞（改由 hook 提供）。
- [x] 2.4 `DmnDrawModal`（[DmnDrawModal.tsx](apps/neurons-tw/src/components/DmnDrawModal.tsx)）：「已蒐集 {ownedCount}/{catalogSize}」→ `collectionOwned/collectionTotal`（/34）；重複消耗品 reveal 顯示「已在圖鑑 · 庫存 +1」（用 `result.duplicate`）；錯誤訊息 `抽卡失敗 — 沒有可用次數或卡池已空` → `抽卡失敗 — 沒有可用次數`。

## 3. Tests

- [x] 3.1 `dmn-draw-mechanics.test.ts`「never re-draws an already-owned consumable, 22 unique」→ 改成「duplicate consumable succeeds」：先抽滿/種入一張卡，再抽到同卡 → 圖鑑 count 不變、該卡 `obtainedAt` 不變、`inventory` +1、`dmnLifetimeDrawsConsumed` +1、`result.duplicate === true`、無新 `dmnEventLog` 列。
- [x] 3.2 同檔：「both pools complete returns null」+ 我先前加的「all-pools-owned null draw does NOT increment consumes」→ 改成「裝備全擁有 + 圖鑑滿，抽卡仍發消耗品庫存」：所有 equipment + 22 cards 種入 → `drawDmnCard()` 非 null、`inventory` +1、`consumed` +1、圖鑑仍 22。
- [x] 3.3 同檔：新增「repeatable past dex」：available 充足、22 cards 全擁有、equipment 全擁有 → 連抽多次都成功、每次 `inventory` 對應 kind +1、圖鑑維持 22。
- [x] 3.4 hook 測試（或 mechanics 內）：`collectionTotal === 34`；`collectionOwned === dmnCards + equipment`。

## 4. Verify

- [x] 4.1 `pnpm -r typecheck` clean + `pnpm --filter @study-rpg/neurons-tw test` 全綠。
- [x] 4.2 `/verify`：Chrome MCP dev smoke —— 種入 22 cards + 部分 equipment + 給券 → 抽卡：(a) 抽到重複消耗品時成功 + 庫存 +1 + 「已在圖鑑」文案 + 券 −1；(b) homepage chip 與 modal 都顯示 `/ 34`；(c) 無 console error。完後還原注入的 dev 資料。
- [x] 4.3 `/opsx:verify` 三維檢查通過後再 archive。
