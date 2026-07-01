## Why

玩家回報圖鑑融合「數量顯示不正確、融不動」。實際查 prod IndexedDB（免疫學）確認：**計數本身沒錯**，卡點是既有的 **per-slot last-copy protection** — 融合只能消耗「每個變體槽保留一隻後的剩餘」。低階（P5/P4 各只有 2 個變體槽）在此規則下要湊到 **5 隻同階**才融得了一次（2 個槽各保留 1 + 3 隻可融），而融合鈕顯示的是 surplus（例「2/3」），卡片顯示的是總持有（例「×3」），兩者對不上 → 玩家覺得「我有 3 隻卻說 2、還融不了」。

更糟的是 mint 偏好「未擁有的槽」：融出的新神經元常落在一個新的（立刻被保護的）槽，所以融合後「可融數字」不增加 —— 玩家的「融了卻還是顯示 2」正是這條。

Owner 選定方向：**移除 per-slot 保留、任 K 隻同階即可融**（最貼近「3 隻換 1 隻」直覺）。

## What Changes

- **融合的可用池 = 該階全部 held 個體**（不再每槽保留一隻）。同一科某階持有 ≥ K（=3）即可融，不論分佈在幾個變體槽。
- **消耗順序：先抽 dupes、再動各槽唯一的一隻**（`eligibleForTier` 回傳 dupes-first 順序），在移除硬性保護的同時**盡量保住收藏廣度** —— 只有當 K 超過重複數時才會清空某個槽。
- **融合鈕數字改成「該階總持有 / K」**（`heldCountByTier`），與卡片 `×N` 徽章加總一致，消除「按鈕 2 / 卡片 3」的落差。有 pair（≥2）就顯示、≥K 才 enable。
- **圖鑑不再渲染 ghost slot**（0 held 的變體槽）：單裝置融合現在會例行清空槽位，故 CollectionPage 只渲染「至少 1 隻 held」的槽，讓卡片與 `X 隻` 種類數一致。`neuronVariants` 列仍保留於 DB 作 catalog 歷史（monotonic `copies` 不變），只是不再顯示。
- **零持久化 schema 改動**：不 bump Dexie、不 bump R2 `SCHEMA_VERSION`、不動 `SYNCED_META_KEYS`。`consumedAt` 仍 monotonic-OR、`copies` 仍 MAX-merge、`ownedSlotCount` 投影不變（本來就排除 ghost slot，計數維持正確）。

## Capabilities

### New Capabilities
<!-- 無新 capability -->

### Modified Capabilities
- `neuron-variant-fusion`：(1)「Player SHALL be able to tier-promote by consuming K same-rarity surplus individuals」requirement — 可用池改為該階全部 held、dupes-first 消耗順序、槽位可被清空；(2) 移除「Last-copy protection SHALL keep at least one individual per owned slot」requirement；(3)「Collection view SHALL render individuals with per-instance context-art」requirement — 加上 ghost slot（0 held）不渲染。
- `neuron-instance-rename`：「Tier-promote SHALL be unaffected by nicknames…」requirement 的融合機制 scenario 由 `eligibleSurplusByTier`／per-slot-protected 用語改為 `eligibleForTier`／any-K-held（意圖不變：暱稱不影響融合）。

## Impact

- **Code（engine）**：`apps/neurons-tw/src/lib/services/variant-fusion.ts` — `eligibleSurplusByTier` → `eligibleForTier`（回傳該階全部 held、dupes-first 順序）；`PromoteState.surplusCount` → `heldCount`；`getPromoteState` / `promoteTier` 改吃 `eligibleForTier`；DEV handle `surplus` → `eligible`。
- **Code（UI）**：`apps/neurons-tw/src/routes/CollectionPage.tsx` — `surplusByTier` → `heldCountByTier`（該階總持有）；融合鈕 gating 改 `>= 2` 顯示、數字用總持有；tooltip 去掉「保留每槽第一隻」；`familyRows` 過濾掉 0-held 的 ghost slot。
- **Tests**：`apps/neurons-tw/src/__tests__/variant-fusion.test.ts` 全面改寫（no-per-slot-protection eligibility、dupes-first 消耗順序、K 隻跨槽可融、below-K disabled、consume-K→mint-T−1、不動能量）。771 vitest 全綠、typecheck clean。
- **驗證**：localhost dev + Chrome MCP 端到端 — 免疫學 seed 4 P4（slot2:1 / slot7:3），融合鈕由舊「2/3 disabled」變「4/3 enabled」；點擊消耗 3（先清 slot7 兩隻 dupe + slot2 唯一一隻）、mint 1 P3；ghost 化的 slot2 卡片消失、`X 隻` 種類數與全域「已收集」保持正確。
- **不影響**：rarity rolls / P0 soft-pity / 能量 / 抽卡 / 成就 / leaderboard / 跨裝置 sync merge 規則。`ownedSlotCount` 系列投影不變（ghost slot 本來就被排除）。
