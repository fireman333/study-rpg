## 1. Counter model + local mutations

- [x] 1.1 在 `dmn-trigger.ts` `META_KEYS` 加 `grantsTotal: 'dmnGrantsTotal'`；`readDmnMeta` snapshot 加讀 `dmnGrantsTotal`（型別在 `packages/content-neurons-tw/src/dmn-types.ts` `DmnMetaSnapshot` 加 `dmnGrantsTotal: number`）。
- [x] 1.2 加一個共用 helper `deriveDrawsAvailable(grants, consumes) = Math.max(grants - consumes, 0)`，並加一個 `seedGrants({drawsAvailable, consumes, grants?})` = `grants ?? (drawsAvailable + consumes)`（供 mutation / merge / migration 三處共用，single source）。
- [x] 1.3 `grantBehaviorAxisDraw`（[dmn-trigger.ts:128](apps/neurons-tw/src/lib/services/dmn-trigger.ts:128)）tx 內：自增 `dmnGrantsTotal` 並把 `dmnDrawsAvailable` 改寫為 `derive(grants, consumes)`（不再 `available + 1`）。per-day cap counter 寫入維持同 tx。
- [x] 1.4 `creditExpeditionDraws`（[dmn-trigger.ts:171](apps/neurons-tw/src/lib/services/dmn-trigger.ts:171)）tx 內：`dmnGrantsTotal += grantCount`，`dmnDrawsAvailable = derive(...)`；per-day expedition counter + clears counter 維持同 tx。
- [x] 1.5 `drawConsumable_` + `drawEquipment_`（[dmn-fate-card.ts:199](apps/neurons-tw/src/lib/services/dmn-fate-card.ts:199) / [:235](apps/neurons-tw/src/lib/services/dmn-fate-card.ts:235)）tx 內：`dmnLifetimeDrawsConsumed += 1` 後，把 `dmnDrawsAvailable` 改寫為 `derive(grants, consumes)`（不再 `available - 1`）；award row + inventory/equipment 維持同 tx。
- [x] 1.6 One-time local migration（D3）：在 `initializeDmnTrigger` boot 路徑加 lazy seed —— 若本機缺 `dmnGrantsTotal` 則 `dmnConsumesTotal := dmnLifetimeDrawsConsumed`、`dmnGrantsTotal := dmnDrawsAvailable + dmnLifetimeDrawsConsumed`（單一 `db.meta` tx，冪等：已存在則 no-op）。

## 2. Cross-device merge (pull backfill)

- [x] 2.1 `backfillDmnDailyCounters`（[dmn-daily.ts:90](apps/neurons-tw/src/lib/sync/backfill/dmn-daily.ts:90)）：移除對 `dmnDrawsAvailable` 的 raw `Math.max`；改為 D2 演算法 —— 兩側 `seedGrants` 反推 → `mergedGrants = MAX`、`mergedConsumes = MAX(local/incoming dmnLifetimeDrawsConsumed)` → 寫 `dmnGrantsTotal` / `dmnConsumesTotal`(=`dmnLifetimeDrawsConsumed`) / 衍生 `dmnDrawsAvailable`，全部同一 `db.meta` tx。
- [x] 2.2 確認 `dmnLifetimeDrawsConsumed` 在合併路徑走 monotonic-MAX（D4）——由 2.1 的 `mergedConsumes` 涵蓋；確認沒有別處（counters.ts）重複/衝突處理它。
- [x] 2.3 `SYNCED_META_KEYS` 加 `'dmnGrantsTotal'`（[tables.ts:412](apps/neurons-tw/src/lib/sync/tables.ts:412)），附註解說明它與 `dmnLifetimeDrawsConsumed` 組成衍生 `dmnDrawsAvailable`、由 dmn-daily backfill 收斂。

## 3. Schema version + reader tolerance

- [x] 3.1 R2 `SCHEMA_VERSION` 22 → 23（[bundles.ts:175](apps/neurons-tw/src/lib/sync/r2/bundles.ts:175)）+ 更新頂部 SCHEMA_VERSION history 註解（記 `dmnGrantsTotal` 新增 + 衍生語意）。
- [x] 3.2 驗證 forward-compat：v22 client 拉 v23 bundle drop 未知 `dmnGrantsTotal` 不報錯；v23 client 拉 v22 bundle（無 grants）走 D2 seeding 不清券。

## 4. Bug-report / debug surface

- [x] 4.1 Bug-report context snapshot 加 `dmnGrantsTotal`（與既有 `dmnDrawsAvailable` 並列；順手加 `dmnConsumesTotal` 方便 triage）。找到既有 DMN debug/bug payload 組裝點後加欄位。

## 5. Tests (lock the fix)

- [x] 5.1 `dmn-daily-counters-merge.test.ts`：local `available=0 / lifetimeConsumed=11`、incoming 舊 `available=11 / lifetimeConsumed=0 / 無 grants` → 合併後 `dmnDrawsAvailable` 維持 0（消耗不被還原）。
- [x] 5.2 同檔：fresh device（空 meta）拉舊 bundle `available=11 / consumed=0 / 無 grants` → grants seed=11、衍生 `available=11`（不被清 0）。
- [x] 5.3 同檔：incoming v23 `grants=11 / consumes=11 / available=0` vs 舊 local 顯示 `available=11`（local seed grants=11、consumes=0）→ 衍生 `available=0`（對方全消耗勝出）。
- [x] 5.4 同檔：migration 不跳動（`available=11 / lifetimeConsumed=4 / 無 grants` → grants=15、consumes=4、available=11）；backfill 連跑兩次冪等（grants/consumes/available 不變）。
- [x] 5.5 `dmn-draw-mechanics.test.ts`：consumable consume → `dmnLifetimeDrawsConsumed +1`、`dmnGrantsTotal` 不變、衍生 `available` 正確；equipment consume 同；all-pools-owned `drawDmnCard` return null 且 **不**增 consumes / 不動 available。
- [x] 5.6 grant 路徑測試：`grantBehaviorAxisDraw` / `creditExpeditionDraws` 各自增 `dmnGrantsTotal` 並使衍生 `available` 上升（per-day cap 行為不變）。
- [x] 5.7 schema/允許清單測試：`SCHEMA_VERSION === 23`、`SYNCED_META_KEYS` 含 `dmnGrantsTotal`、未來 bundle（schema_version > 23）reader tolerance 仍過。

## 6. Verify

- [x] 6.1 `pnpm -r typecheck` clean + `pnpm --filter @study-rpg/neurons-tw test` 全綠。
- [x] 6.2 `/verify`：Chrome MCP prod-equiv smoke —— 抽 1 張 → `dmnDrawsAvailable` 下降 → reload / 換分頁觸發 pull → 確認**不回升**；`__dmn` / debug 讀 `dmnGrantsTotal`、`dmnConsumesTotal` 一致。
- [x] 6.3 `/opsx:verify` 三維檢查（completeness / correctness / coherence）通過後再 archive。
