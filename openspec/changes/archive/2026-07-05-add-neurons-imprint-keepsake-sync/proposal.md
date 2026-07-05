## Why

`add-neurons-ng0717-lineage-imprints` 刻意把分支印記存成 local-only（考前出貨速度優先），並在 spec 明列「a future migration MAY promote imprints to a synced keepsake」。玩家換裝置 / 清 IndexedDB 就會失去逐科長出的芽。Codex 後續建議把它列為**考後**的紀念性擴充。本 change 執行該 migration：把 NG-0717 分支印記升級為**跨裝置 keepsake**，換手機也保留你整個衝刺期長出的分支。

分支印記是 **write-once presence keys**（`prescription:v1:ng0717:imprint:<subjectId>:<date>` = `'1'`，永不刪），與既有 `mazeSecondLapCelebrated:<family>` set-once 同型——所以正確合併＝**first-write-wins UNION**（兩裝置各自長的芽並集，跨裝置 touches 自然累加），零 backfill post-pass、零資料遺失風險。唯一難點：imprint key 是**動態**（subject×date 無法列舉），不能塞進固定 `SYNCED_META_KEYS` allowlist → 改用 **prefix-based 同步**。

## What Changes

- **Prefix-based meta 同步**：`metaAdapter` 的 `snapshot` / `apply` filter 由「`SYNCED_META_KEYS.has(key)`」擴為「allowlist **或** 命中 imprint prefix `prescription:v1:ng0717:imprint:`」。此 prefix 精確只匹配 imprint keys（不含 plan/wrong/breadth/completed/reward/localSeed 等其他 local-only `prescription:v1:*`）。合併走既有 first-write-wins（= write-once presence keys 的 UNION），**無 backfill、無新 adapter**。
- **SCHEMA_VERSION 23 → 24**（additive）+ history 條目。Reader-tolerant：v23 client 讀 v24 bundle 時，imprint keys 不在其 allowlist/prefix → 照既有邏輯 skip（drop）；v24 client 讀 v23 bundle（無 imprint keys）→ 本地 imprints 以 first-write-wins 保留（incoming 缺 key 不刪本地）。
- **Account-switch wipe 補 imprint prefix**：`clearLocalSyncedData` 除 `anyOf([...SYNCED_META_KEYS])` 外，加 `startsWith(imprint prefix).delete()`，讓切帳號時前一帳號的芽也一併清除（keepsake 屬於帳號）。
- **無 Dexie 版本 bump**（rides 既有 `meta` table；imprint keys 本就存在本地）；**無新 R2 adapter**；merge 語意 = write-once UNION。
- **Out of scope**：把「哪些科已跨裝置」視覺化、任何分母/完成度 UI、accent 美術、per-subject bespoke sprite。純資料層 keepsake，UI 不變。

## Capabilities

### New Capabilities
<!-- 無新 capability。 -->

### Modified Capabilities
- `neurons-daily-prescription`: MODIFIED「Lineage imprint state SHALL persist in local-only meta keys with no schema or sync change」——改為透過 imprint prefix 進 `SYNCED_META_KEYS` 同步集、first-write-wins UNION 合併、SCHEMA_VERSION additive bump、reader-tolerant，成為跨裝置 keepsake（仍 write-once、仍 monotonic、仍無 Dexie bump）。
- `neurons-cloud-sync`: MODIFIED「Account-switch wipe covers all synced surfaces plus local drafts」——synced meta 的清除範圍由「exactly the keys in `SYNCED_META_KEYS`」擴為「`SYNCED_META_KEYS` 加上 imprint prefix 命中的 keys」，並 ADD 一條 requirement 描述 imprint prefix 為同步集的一部分、UNION 合併、additive schema/reader-tolerance。

## Impact

- **Code**：`apps/neurons-tw/src/lib/sync/tables.ts`（metaAdapter snapshot/apply 的 prefix 接受 + `IMPRINT_SYNC_PREFIX` 常數 + `isSyncedMetaKey` helper）、`apps/neurons-tw/src/lib/sync/r2/bundles.ts`（`SCHEMA_VERSION` 23→24 + history）、`apps/neurons-tw/src/lib/sync/account-guard.ts`（wipe 補 prefix delete）。UI / prescription service 邏輯不變。
- **Data / schema**：**無 Dexie `.version()` bump**（rides 既有 meta table）。R2 `SCHEMA_VERSION` additive 24。synced meta 集合新增 imprint prefix（動態）。
- **Tests**：Vitest 覆蓋 metaAdapter snapshot 含 imprint keys、apply first-write-wins UNION（local 缺→寫、local 有→留）、prefix 精確性（不誤收其他 `prescription:v1:*`）、reader-tolerance（未知 key skip）、account-guard 清 imprint prefix。
- **相容 / 風險**：Web app 全 client 隨 deploy 收斂 v24；transient 風險僅「stale v23 分頁 push 會 drop imprint keys」——與既有 v8/v12 等 additive meta 升級同型、可接受（keepsake 可重長）。UNION + write-once → 無 cross-device 打架、無 resurrection（imprints 無刪除語意）。
