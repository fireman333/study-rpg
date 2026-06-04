## 1. Family→node 代表映射 + lit-node union（maze/graph）

- [x] 1.1 在 `lib/maze/graph.ts` 加 `representativeNode(branch, familyId)`：回傳該 family 在分支圖中 `pathLen` 最小的 node；平手以 `slotIndex` → node id tie-break（deterministic）。加單元測試覆蓋多-node family + tie-break。
- [x] 1.2 改 `litNodes`（或新 `litNodesWithStarter`）使其回傳 `frontierLit(settles) ∪ { representativeNode(branch, starterFamily) }`，以 node key set union dedup；`starterFamily` 由 meta 讀入（缺省時退化為純 frontier，行為與現況一致）。
- [x] 1.3 確認 `economy.ts` 的 settle / cost / walker 邏輯**不**因 starter-lit 改動（starter-lit 不影響 settles / walkerFraction）。加測試：settles=0 + starterFamily 設定 → litNodes 只含代表節點、walker 仍在 hub。

## 2. First-pull orchestrator service

- [x] 2.1 新增 `lib/services/first-pull.ts`：`isFirstPullDone()`（讀 `meta['firstPullDone']`）、`runFirstPull(resolveName)`。
- [x] 2.2 `runFirstPull`：對 4 branch 各均勻隨機選 1 family（用 `FAMILIES_BY_BRANCH`）→ `pullVariant(family, resolveName, { silent })`；收集 4 筆 PullResult。
- [x] 2.3 寫 starter-lit：每 branch set `meta['maze:<branch>:starterFamily'] = familyId`。
- [x] 2.4 完成後 set `meta['firstPullDone'] = 'true'`（最後一步，確保 4 抽 + starterFamily 都寫入後才標記）。
- [x] 2.5 Guard：`runFirstPull` 開頭再次檢查 `isFirstPullDone()`，已 true 直接 return（防重入 / 雙擊）；`FirstPullModal` 另有 runningRef 防雙擊。
- [x] 2.6 best-effort try/catch 包成就 finalize，確保成就失敗不破壞首抽（比照現有 hook 紀律）。

## 3. 成就 toast 抑制（reveal 期間）

- [x] 3.1 4 抽走 `pullVariant(..., { silent: true })` 跳過 per-pull `variantRolled` + inline 成就檢查；首抽自己 reveal。成就照常 unlock + 持久化（reveal 關閉後一次 `triggerAchievementCheck`）。
- [x] 3.2 reveal 關閉 → `finalizeFirstPullAchievements`（單次檢查，toast 在 reveal 後才入佇列）；navigate-away 時 boot backfill 兜底。

## 4. Sync（meta keys + bundle 版號）

- [x] 4.1 `lib/sync/tables.ts`（SYNCED_META_KEYS）加入 `firstPullDone` + `maze:<branch>:starterFamily` ×4。
- [x] 4.2 `firstPullDone` 採 **monotonic-OR**（metaAdapter write-if-missing + 永不寫 'false' → 天然收斂 true）；starterFamily first-write-wins（一次性 immutable，安全）。
- [x] 4.3 `lib/sync/r2/bundles.ts`：`SCHEMA_VERSION` 14 → **15**（additive + reader tolerance；v15 history comment）。**無** Dexie bump。
- [x] 4.4 bundle round-trip 測試：`first-pull.test.ts` 驗 firstPullDone + 4 starterFamily 進 bundle snapshot + apply 還原（fresh device）。

## 5. UI — 首抽 CTA + reveal

- [x] 5.1 `HomepageOnboarding.tsx`：`<FirstPullButton placement="onboarding">`（gate `firstPullDone`，與 dismiss 獨立）。
- [x] 5.2 CTA toolbar fallback：`<FirstPullButton placement="toolbar">`（onboarding dismissed 且 `!firstPullDone` 才顯示）；done 後全隱。
- [x] 5.3 reveal：`FirstPullModal`（framer-motion + VariantSprite，2×2 grid 一次呈現 4 隻 + 收下按鈕，respect reduced-motion）。
- [x] 5.4 點 CTA → `requestFirstPull` → `runFirstPull` → reveal → liveQuery（含 starterFamily key 追蹤）讓迷宮代表節點亮 + collection 出現 4 隻。

## 6. 測試 + 驗證

- [x] 6.1 單元：`runFirstPull` 後 4 branch 各 +1 variant（count=4）、4 個 starterFamily 已寫、`firstPullDone=true`、settles/earned 全 absent（`first-pull.test.ts`）。
- [x] 6.2 單元：idempotency — 重複 `runFirstPull` 回 null 不再發放；清空收藏後仍不重抽。
- [x] 6.3 單元：`representativeNode`（min pathLen + tie-break）+ litNodesWithStarter（null 退化純 frontier / settles=0 只亮 rep / frontier 蓋到 rep 不雙亮）（`first-pull-graph.test.ts`）。
- [x] 6.4 `pnpm --filter @study-rpg/neurons-tw test`（303→ 含 +11 first-pull 全綠）+ `typecheck`（clean）+ `lint:dexie-fixtures`（OK，無 Dexie bump 不需 fixture）。
- [x] 6.5 Chrome MCP 端到端（localhost:5175）：fresh state → `__firstPull.request()` → 4 隻（DA 公衛/5HT 組織/GABA 生化/Glu 胚胎，real rarity P4/P5）→ reveal 4 卡 → homepage「已連線 4 個腦區」+ DA/5HT/GABA/Glu·1 → settles 全 0 → 重整：CTA 消失 + 不重抽（仍 4 隻）+ 10 成就 persist → 直接 URL `/collection` ✓ + F5 ✓ + console clean。**prod 三件套待 owner CF Pages 部署後補驗。**
