## Context

neurons-tw（M_3rd track）的收集是 open-collection（render-only-collected、隱藏總數、永遠可抽 dupe）。目前重複神經元只累積成 `neuronVariants.copies`（一個 slot 一 row、PK `[familyId+slotIndex]`、`copies?: number` 非索引欄位），無用途也無收集價值。`neuron-variant-context-art`（軸向B）目前 **per-row** 從 `provenance`（出生 decor field）+ `rolledAt`（腦波 band）導出——一個 slot 只有一份 art。

Owner 決定（2026-06-03 grill + 4 輪 clarification）：重複神經元改為 **Pikmin Bloom 式的獨立個體**（每隻自己的出生 context-art），玩家可**保留**（收集價值）或**選擇性融合**（吃 K 隻同階 → 升一隻高階）。

關鍵約束：
- **Dexie 不能在 upgrade 改 PK**（`dexie_pk_change_pitfall.md`）→ 不能直接把 `neuronVariants` PK 加 instance 維度。
- 任何 `.version(N)` bump 必帶 v(N−1)→v(N) fixture（`docs/DEXIE_UPGRADE_FIXTURE_RULE.md`）。
- R2 bundle 改動走 additive + reader-tolerant（v 舊 client drop 未知欄位）。
- 純行為觸發、無付費（loot-mechanics 鐵律）——promote 純吃 dupe、不耗能量、不引入新貨幣。

## Goals / Non-Goals

**Goals:**
- 重複神經元 = 獨立個體，每隻自帶出生 context-art（軸向B per-instance）→ 收集動力。
- 選擇性 tier-promote 出口：吃 K 隻同 rarity 重複個體 → mint 一隻高一階（T→T−1）。
- last-copy 鎖定：每 slot 至少留 1 隻、promote 只吃超出第一隻的個體；預設全保留。
- 不破壞既有 `neuronVariants` PK、不破壞金字塔不變式、不新增貨幣。
- 純 additive Dexie v13 + R2 additive bump；既有玩家無收集 reset。

**Non-Goals:**
- AP→family 精通度（#2）；maze 變主頁 / 遠征走速（#3）；cosmetic 能量 sink；軸向B 的純裝飾取得途徑。
- 改 `neuronVariants` PK 或 rarity↔slot 綁定 / 金字塔模型。
- 跨 family promote、付費抽卡、energy 參與 promote。

## Decisions

### D1：新增 `neuronInstances` 表承載個體（不改 `neuronVariants` PK）
新表 `neuronInstances`，PK = **device-stable 字串 `instanceId`**（如 `${familyId}:${slotIndex}:${rolledAt}:${rand}`，mint 當下生成、immutable）。**不用 `++id` auto-increment**——auto-inc 在多裝置 sync 會 ID 碰撞。每隻個體一 row：`{ instanceId, familyId, slotIndex, rarity, spriteKey, rolledAt, provenance, consumedAt? }`。
- _Alternative rejected_: 改 `neuronVariants` PK 成 `[familyId+slotIndex+instanceId]` → Dexie upgrade 禁止改 PK（pitfall），直接出局。

### D2：`neuronVariants` 保留為「slot 擁有索引」，`neuronInstances` 為個體層
最小churn：既有所有用 `neuronVariants` 的查詢（`getPullableState` / p0Owned / distinct-count 成就 / leaderboard `variant_count` / open-collection grid 的「擁有哪些 slot」）**不動**。`pullVariant` 在 tx 內：(a) upsert `neuronVariants` slot row（擁有狀態，首次建立）、(b) insert 一隻 `neuronInstances`。`neuronVariants.copies` = 該 slot 的 in­stance 數（保持同步，back-compat）。
- _Alternative rejected_: 完全從 instances 導出擁有狀態 → 要重寫所有 composite-PK 查詢，churn 大、風險高。

### D3：個體 sync 用 monotonic-union + consumed soft-delete（不用 tombstone）
個體 immutable（provenance 不變）→ sync = **by-instanceId union**（mirror `dmnEventLog` 的 monotonic-union 紀律）。promote 消耗個體 = 設 `consumedAt`（**soft-delete，monotonic-OR**：一旦 set 永不回退，mirror `everWrong`），不刪 row。收集視圖 filter `consumedAt == null`。promote 同時 union-add 新的高階個體。
- _Why_: 硬刪 row 在 union sync 下會「復活」（對面裝置還有該 row）；soft-delete + monotonic-OR 跨裝置收斂乾淨。
- _Trade-off_: consumed 個體留在 bundle → bundle 隨時間增長（dogfood 規模可接受；未來可加「只 sync 近 N 天 consumed」修剪）。

### D4：tier-promote recipe（純吃 dupe，within-family）
- 成本 = **K 隻同 rarity 的「超出第一隻」個體**（last-copy 鎖定：每 slot 第一隻不可消耗）。K 預設 **3**（dogfood 可調）。
- 產出 = mint 一隻**同 family、高一階（T−1）**的個體：優先選**未收的 T−1 slot**；若該 family T−1 slot 全已收，仍 mint 一隻已收 T−1 slot 的新個體（open-collection 下 dupe 個體仍有收集價值）。
- promote 為 **opt-in**（UI 動作）；預設不自動消耗任何個體。
- _Alternative rejected_: 直接把某隻低階變高階（改 row 的 rarity）→ 破壞 slot↔rarity 綁定 + 金字塔，且製造 slot 破洞。

### D5：收集視圖 render 個體（per-instance 軸B art）
`neuron-variant-collection-view` 改成 family→slot 分組，每 slot 顯示其**個體列表**（每隻自己的 decor field + 腦波 band，走既有 `variantContextArt(row)` 但 row 改成 instance）。純計數 chip 語義 = **總個體數 `🧬 X 隻`**（仍無分母，對齊 open-collection）。
- _Open_: 個體多時 UI 怎麼排（全攤平 vs slot 摺疊可展開）→ 見 Open Questions。

### D6：Dexie v12→v13 = 加表 + 一次性把既有 copies 展開成個體
v13 schema 新增 `neuronInstances: 'instanceId, familyId, slotIndex, rarity, consumedAt'`（既有表索引不變）。upgrade callback：對每個既有 `neuronVariants` row（`copies = N ≥ 1`），生成 **N 隻** instance——**首隻**承襲該 row 既有 `provenance` + `rolledAt`；**其餘 N−1 隻**用合成 id + `provenance = undefined`（→ render 成 元老 / 傳承，沿用既有「provenance 缺席」處理）+ `rolledAt = row.rolledAt`。
- _Note_: 這是一個**有界 backfill**（量 = 既有 copies 總和，dogfood 規模小）——屬「個體化」必要的一次性展開，非無謂 backfill。無收集 reset、無 banner。
- v12→v13 fixture：seed v12（含一個 copies=3 的 row）→ reopen v13 → assert 生成 3 隻 instance（1 隻有 provenance、2 隻元老）+ 無 `DatabaseClosedError`。

### D7：R2 bundle additive bump
`lib/sync/r2/bundles.ts` `SCHEMA_VERSION` +1，新增 `neuronInstances` 陣列 key + adapter（union by instanceId + `consumedAt` monotonic-OR）。reader-tolerant：v 舊 client 讀新 bundle drop 未知 key；v 新 client 讀舊 bundle → 無 instances key → 由本地 v13 upgrade 已展開的個體為準（preserve-on-omission）。Worker bundle-opaque、無改動。

## Risks / Trade-offs

- **既有 copies 展開可能很多** → 有界於實際 copies 總和；dogfood 規模小；必要時加上限 + log 丟棄數（No Silent Errors）。
- **consumed 個體留存使 bundle 變大** → dogfood 可接受；未來加「修剪近 N 天前 consumed」。
- **collection view 個體數膨脹影響效能** → 預設 slot 分組摺疊 / 虛擬列表（見 Open Q）。
- **個體化是 BREAKING 資料模型** → 但**不改 PK**（新表）、**不 reset 收集**（展開保留）、走 fixture 驗 upgrade path → 風險受控。
- **achievement/leaderboard 指標若需新 D1 欄位** → 評估後若要動 Worker D1，按 0001/0002 numbered-migration 紀律新增（不改既有）。

## Migration Plan

1. Dexie v13 upgrade callback 展開既有 copies → individuals（D6），fixture 先行驗證 upgrade path（fixture-first，per 那次 pk-change prod 事故教訓）。
2. R2 bundle additive bump（D7）；先在 dual / dev 驗 reader-tolerance（v 新讀舊 bundle、v 舊讀新 bundle 都不死）。
3. 既有玩家：開 app → v13 upgrade 靜默展開個體 → 收集視圖看到自己的重複變成有 art 的個體。無 banner。
4. Rollback：個體化是 additive 表，緊急時可停用 fusion UI + collection view 退回 slot 計數視圖（neuronVariants 仍完整）；instances 表留著不影響舊路徑。

## Open Questions

1. **既有 copies 遷移**：D6 的「展開成 N 隻個體」vs「只認首隻、舊 copies 不展開（新 pull 才生個體）」——前者收集感一致但是 backfill，後者更省但新舊表現不一致。**建議前者**，待 owner 確認。
2. **promote K 值 + 目標選擇**：K=3 起手；目標 = 隨機未收 T−1 slot vs 讓玩家挑要升哪隻 slot？**建議隨機未收**（簡單），但玩家挑更有掌控感。
3. **collection view 個體排版**：slot 分組摺疊（點開看個體）vs 全攤平個體牆。影響 UX + 效能。
4. **leaderboard / achievement 指標**：納入「總個體數」/「promote 次數」/「最高 promote 階」哪些？或本 change 只做成就、leaderboard 指標延後？（Q4 你選「含榜/成就指標」，這裡定具體欄位。）
5. **純計數 chip 語義**：`🧬 X 隻` 的 X = 總個體數（含重複）vs distinct slot 數？兩者收集敘事不同。
