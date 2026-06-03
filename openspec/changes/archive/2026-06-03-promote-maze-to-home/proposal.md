## Why

neurons-tw 現在有兩個並存的「主畫面」：`/`（OverviewPage 的 connectome 樹）與 `/maze-beta`（腦圖探索），餵了三條重疊的神經分數來源（答題 / 閱讀 / maze settle），用途互相稀釋 —— maze settle 免費 mint 特定 variant 跟花能量抽卡互搶收集動機、走路進度（local float signal）跟收集貨幣（synced 神經能量）是兩個概念上重複的 counter。3-change 計畫的 #1 dupe-fusion + #2 mastery 已收斂出「能量軸 + 精通軸」兩軸模型；#3 把 maze 扶正成唯一主頁，讓「賺能量 → 走腦圖 → 到節點解鎖抽卡 → 收集神經元」成一條清晰閉環，並把 connectome 的 synapse 網絡搬到 maze 腦圖上呈現（保留招牌 Hebbian 機制、換畫面家）。

## What Changes

- **maze 腦圖扶正成主頁 `/`**：`OverviewPage`（現 connectome 主頁）與 `MazeBetaPage`（`/maze-beta`）合併成單一 maze-home；舊 `/maze-beta`、`/connectome` route 改 redirect 到 `/`。
- **connectome tree 視覺下架、synapse 機制搬上 maze**（**非退役**）：`db.synapses` 表 / co-fire 形成 / 7 天衰退 / state 機（dormant·weak·strong）/ synapse 成就 / DMN 行為軸觸發**全部保留不動**；只把 synapse 網絡的**呈現**從 `ConnectomeTreeSvg` 改成 maze 腦圖上 family 區域之間的 overlay 邊（state → 邊輝度）。功能連結（synapse）疊在結構連結（白質束 tract）腦圖上 = 標準 connectomics 表示法。
- **maze 節點 = 唯一抽卡閘（Model A）**：走到 fogged 節點時 (1) 從該分支 energy pool **consume** 該節點的 `cost(N)`、(2) 觸發一次 `pullVariant`（family = `MazeNode.familyId`，隨機 rarity/variant + P0 pity）、(3) bump settle 數。`mintVariantSlot`（確定性 mint）退場。節點半綁 family（非 slot）。
- **移除 `/collection` 隨時手動抽卡 + 退役全域 energy currency**：`CollectionPage` 的「🎴 抽卡（20）」per-family 按鈕 + balance HUD 移除；頁面保留作收集圖鑑 + tier-promote/fusion（#1，吃 dupe 不耗 energy）。全域 `neuralEnergyEarned/Spent`（手動抽是其唯一 sink）退役為 per-branch maze 燃料。**這是 maze 成為唯一抽卡閘的必要條件 —— 否則 ~10 手動抽/天會架空 maze pacing。**
- **走路 = per-branch energy consume-at-node**：退役 local float `maze:<branch>:signal`；每分支 synced monotonic `maze:<branch>:earned`（faucet）+ `maze:<branch>:settles`（pull 數）；frontier 由 `earned` 對照已花 `Σcost` 推進。答題依 `FAMILY_NT_BRANCH` 記入該分支、reading 拆 4 份。保 4 NT 分支 frontier、跨裝置一致。
- **pacing 重校**：`SIGNAL_PER_NODE` 24 → ~100-120 起跳並後段線性遞增（`base×(1+k·N)`），讓收集 arc 從 ~2 週拉到 2-3 月；二週目減速靠 pacing curve + 既有 `SPEED_BUFF_CAP`，不另加機制。
- **出征 + chip 語義**：⚔️ 出征（全科錯題）成 maze-home 常駐 CTA；進度 chip 改 🧠 = 已到節點數（= 累積抽卡機會）/ 🧬 = 已收集隻數。

## Capabilities

### New Capabilities
<!-- 無新增 capability — 本 change 是既有 4 個能力的重構，不引入新的契約。 -->

### Modified Capabilities
- `neurons-brain-maze`: maze 由 `/maze-beta` beta route 扶正為主頁 `/`；settle 行為由「確定性 mint 特定 slot（`mintVariantSlot`）」改為「consume 該分支 `cost(N)` energy + 觸發一次該節點 family 的 `pullVariant`」；走路來源由 local per-branch float signal 改為 per-branch synced energy（consume-at-node）；pacing 由固定 `SIGNAL_PER_NODE` 改為線性遞增 `cost(N)`；新增 synapse 網絡 overlay 於腦圖（呈現層）。
- `neuron-variant-gacha`: pull 觸發來源由「玩家在 `/collection` 隨時花 `PULL_COST` 主動抽」改為「maze 節點 settle（consume per-branch energy）」—— 移除 always-on 手動抽卡 requirement；「study 鑄造全域 neural-energy pull currency」requirement 改為 per-branch maze energy。`pullVariant` 的 roll / P0 pity / instance mint 核心不變。
- `connectome-collection`: connectome 樹退役為主頁/主要收集視覺；synapse co-fire 機制（形成 / 強化 / 衰退 / state / 成就 / DMN 觸發）requirement 不變，但其**視覺化呈現**由 connectome 樹移至 maze 腦圖 overlay。
- `neurons-homepage`: 主頁中心由 connectome 互動樹改為 maze 腦圖；進度 chip 重新賦語義（🧠 節點數 / 🧬 收集數）；既有主頁元件（CTA toolbar 的 reading timer + 🎲 random quiz + ⚔️ 出征、enriched FamilyPicker grid、DmnDrawProgressRing、first-visit onboarding）重新安置於 maze-home。

## Impact

- **App code（apps/neurons-tw）**: `lib/maze/{economy,useMaze,graph}.ts`（settle→consume energy + pull、per-branch energy、pacing）；`lib/services/variant-gacha.ts`（`mintVariantSlot` 退場；`pullVariant` 觸發源改 maze）；`lib/services/currency.ts`（全域 energy currency 退役 → per-branch maze 燃料；`useEnergyBalance` HUD 移除）；`routes/{OverviewPage,MazeBetaPage,CollectionPage}.tsx` + `App.tsx`（合併主頁 + route redirect + 移除手動抽卡按鈕/HUD，CollectionPage 留作 dex + fusion）；`components/connectome/*`（tree 下架 + synapse overlay 重畫於 maze）；`components/MazeExpedition.tsx`、`VariantCollectionChip`（chip 語義）。
- **Sync**: `lib/sync` 新增 per-branch `maze:<branch>:earned` / `:settles` synced meta keys（`SYNCED_META_KEYS`）；R2 bundle `SCHEMA_VERSION` 11→12（additive + reader-tolerant，舊全域 energy keys 留著被忽略）。預期 **不需 Dexie `.version()` bump**（synapse 表保留、per-branch energy 走 generic meta kv、不加表）—— apply Phase 0 確認。
- **保留不變式**: `neuronVariants` PK `[familyId+slotIndex]`；`neuronInstances` union + `consumedAt` monotonic-OR；synapse 機制完整保留；`pullVariant` roll/P0-pity/instance-mint 核心 + tier-promote/fusion（#1，吃 dupe）不變。
- **可感知 UX 變更**: 移除 `/collection` 隨時手動抽卡 —— 收集唯一新增來源變成 maze 節點探索。owner 知情選 Model A。
- **Out of scope**: 出征 completion bonus（Phase 4 deferral 的 `onExpeditionComplete` no-op）；二週目顯式 multiplier（先靠 pacing curve）；synapse overlay 的 pixel-art 美術細修。
