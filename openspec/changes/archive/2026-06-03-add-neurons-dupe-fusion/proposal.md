## Why

neurons-tw 的 open-collection + 永遠可抽 dupe 機制產生大量重複神經元，目前只累積成 `neuronVariants.copies` 計數、**無任何用途也無收集價值**（「dupe 黑洞」— memory 標第一優先）。本 change 把重複神經元變成**有收集價值的獨立個體**（Pikmin Bloom 式，每隻有自己的出生 context-art），並提供一個**選擇性的 tier-promote 出口**（吃 K 隻同階重複 → 升一隻未收的高階），給能量軸尾端一個有意義的去處——玩家可選擇「保留收集」或「融合升階」。

## What Changes

- **重複神經元從「`copies` 計數」改為「獨立個體」**：每次 pull（不論新或重複）產生一隻有自己 `rolledAt` + `provenance`（→ 出生軸B context-art：腦波 band / decor field）的個體。每隻都不同 = Pikmin Bloom 式收集動力。**BREAKING**（資料模型變更：新增 instances 表）。
- **新增 tier-promote**：玩家**選擇性**消耗 K 隻同 rarity 的重複個體 → mint 一隻**未收的高一階**（rarity T → T−1）variant。**不改既有神經元、不破金字塔、保留既有 PK**。
- **last-copy 鎖定**：每個 slot 至少保留 1 隻個體；promote 只能吃「超出第一隻」的重複。預設保留全部，promote 為 opt-in。
- **收集視圖 render 個體**：每隻顯示自己的 context-art（保留 open-collection 純計數精神，無分母）。
- **leaderboard / achievement** 納入重複 / promote 相關指標。
- **不新增貨幣**：維持神經能量為單一收集貨幣；promote 純吃 dupe、**不耗能量**。（砍掉先前提議的 BDNF shard 中間貨幣。）
- **Dexie v12→v13**（新增 instances 表，additive，不 reset）+ v12→v13 upgrade fixture；R2 bundle `SCHEMA_VERSION` additive bump（reader-tolerant）。

**不在本 change**（範圍邊界）：AP→family 精通度（#2）；maze 變主頁 / 遠征走速校準（#3）；cosmetic 能量 sink；軸向B 的非 promote 取得途徑（純裝飾層另議）；「解題速度」（不存在，已澄清——只有遠征速度 = 能量獲取速度）。

## Capabilities

### New Capabilities
- `neuron-variant-fusion`: 重複神經元的個體化（每隻獨立、自帶出生 context-art、寫新 `neuronInstances` 表）+ tier-promote 出口（吃 K 隻同階 → mint 高一階）+ last-copy 鎖定 + keep/promote 玩家選擇語義 + 個體層的收集視圖 / sync / 成就 · 榜指標。本 capability 自帶其所有新行為的 requirements（含個體渲染、R2 sync、指標）。

### Modified Capabilities
（無）— 本 change **純 additive**。關鍵設計選擇讓既有 capability 的 requirements 全部仍成立、不需 delta：
- `neuron-variant-gacha`：`neuronVariants` 維持一 slot 一 row、`copies` 維持「終身 mint 計數」語義（MAX-merge sync 不變）；pull **額外**寫一隻 `neuronInstances`（新行為在 fusion spec ADDED）。既有 copies / chip / provenance requirements 不變。
- `neuron-variant-collection-view` / `neuron-variant-context-art` / `cloud-sync` / `neurons-leaderboard` / `neurons-achievements`：既有 requirements 不變；個體層的新行為由 `neuron-variant-fusion` ADD（current-owned 由 instances 導出、`🧬 X 隻` chip 維持 distinct-slot 語義）。
- _Note_: 若 `/opsx:verify` 階段判定某個既有 capability 行為實質改變需 delta，再補對應 MODIFIED；目前判定為 additive。

## Impact

- **Code**: `apps/neurons-tw/src/lib/db.ts`（v13 + instances 表）、`lib/services/variant-gacha.ts`（mint 個體 + promote）、collection view 元件（`routes/CollectionPage.tsx` + `components/VariantSprite.tsx`）、`lib/variant-decor.ts`（context-art per instance）、`lib/sync/`（instances adapter + R2 bundle `bundles.ts`）、leaderboard / achievement 服務。
- **Data**: Dexie v12→v13（additive instances 表）；R2 bundle `SCHEMA_VERSION` additive bump（reader-tolerant，舊 client drop 未知欄位）。
- **既有玩家**：⚠️ 既有 `neuronVariants.copies = N` 需要遷移策略（展開成 N 隻個體 vs 只認首隻、新 pull 才生個體）——design.md 定案。無收集 reset、無 migration banner。
- **Worker**: bundle-opaque，無 Worker 改動（除非 leaderboard 指標需新 D1 欄位 → design 評估）。
