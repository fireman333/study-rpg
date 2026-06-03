## Context

neurons-tw 的主頁 `/`（`OverviewPage`）目前以 `ConnectomeTreeSvg`（Linnean synapse 樹）為中心；maze 腦圖在獨立 beta route `/maze-beta`。兩者各有一套「分數→進度」economy，且分別有一條收集路徑：

- **maze**（`lib/maze/economy.ts`）：per-branch **local-only float** `maze:<branch>:signal`（答題+閱讀，`SIGNAL_PER_NODE=24` 推進 frontier）→ 到節點 `reconcileSettles` 呼叫 `mintVariantSlot`（**確定性** mint 該節點特定 slot，免費）。
- **gacha / 手動抽卡**（`routes/CollectionPage.tsx` + `lib/services/variant-gacha.ts` + `currency.ts`）：`neuralEnergyEarned/Spent`（**int、synced** MAX-merge，`balance=earned−spent`）→ `/collection` 頁玩家隨時花 `PULL_COST=20` 對任一 family `pullVariant` 隨機 roll。

**已驗的平衡洞（apply 前壓力測試）**：faucet 是 `CORRECT_ANSWER_ENERGY=3`／答對、`READING_MINUTE_ENERGY=2`／分（與 maze `CORRECT_SIGNAL=3`/`READING_SIGNAL=2` 完全相同 → 印證「兩 counter 同一條能量」）。日 income ≈ 197 → `÷PULL_COST(20)` = **~10 手動抽/天** → 110 隻 catalog 幾週抽滿。任何「maze pacing gate 收集節奏」的設計被隨時手動抽卡架空。

**本 change 採 Model A（owner 2026-06-03 拍板）**：maze 節點是**唯一**抽卡閘。energy 變成 **per-branch maze 燃料**，到節點時被 consume（= pull 成本），觸發一次該節點 family 的 pull。移除隨時手動抽卡。pacing `cost(N)` 因此真正掌控收集 arc（≈3 月）。connectome 的 synapse 網絡搬到 maze 腦圖呈現（保留機制）。已驗：`MazeNode` 帶 `familyId` + 正規化 `(x,y)` 腦圖座標、4 分支共註冊解剖腦框（`lib/maze/graph.ts`）。`/connectome` route 已不存在。

## Goals / Non-Goals

**Goals**
- maze 腦圖成為唯一主頁 `/`；**maze 節點 = 唯一抽卡路徑**（一條自洽閉環：study→per-branch energy→走腦圖→到節點 consume energy→pull）。
- pacing `cost(N)` ramp 真正掌控收集 arc（~2 週 → 2-3 月）。
- synapse co-fire 機制完整保留，呈現搬 maze overlay。
- 保 4 分支 frontier，跨裝置一致（per-branch energy synced）。
- 預期零 Dexie `.version()` bump（meta kv + 既有表）；R2 bundle additive bump。

**Non-Goals**
- 出征 completion bonus（Phase 4 deferral 的 `onExpeditionComplete` no-op）。
- 二週目顯式 multiplier（先靠 pacing curve + 既有 cap）。
- synapse overlay 美術細修（先用既有 edge 樣式）。
- 改 synapse co-fire 機制本身（N=5 / 三態 / 7 天衰退 / 成就 / DMN 觸發全不動）。
- `pullVariant` roll 核心（rarity / P0 pity / instance mint）不變 —— 只改它的**觸發來源**（節點 settle，非玩家手動）。
- tier-promote/enhancement 機制（#1 dupe-fusion，吃 dupe 個體、不耗 energy）不變。

## Decisions

### D1 — maze 扶正主頁；connectome 樹 centerpiece 換成 maze 腦圖
`/` 的 centerpiece 由 `ConnectomeTreeSvg` 改為 maze 腦圖 panel（合併 `MazeBetaPage` render 進主頁）。CTA toolbar（reading toggle + 🎲 random quiz + **⚔️ 出征**）、enriched `FamilyPicker` grid、`DmnDrawProgressRing`、onboarding **保留**重新安置。`/maze-beta` redirect `/`；`/connectome` 已移除。
- **Alt rejected**: 疊圖共存（Q5 否決）；雙 route 並存（持續稀釋）。

### D2 — synapse 機制保留、呈現搬 maze overlay
`db.synapses` / co-fire（N=5）/ 三態 / 7 天衰退 / synapse 成就 / DMN 行為軸觸發 **全不動**。`ConnectomeTreeSvg`（+ 周邊）退役為主頁 centerpiece；synapse 網絡改畫成 maze 腦圖上 **family 區域質心之間的 overlay 邊**（state→邊輝度/粗細）。`SynapseFormationToast` 保留。
- **OE-confirmed**（2026-06-03，apply Phase 0.3）：「功能連結疊結構連結腦圖」是 connectomics 標準（structure-function coupling 為獨立研究領域）；功能連結邊**可存在於無直接白質束的區域間**（polysynaptic / common input / transitivity）→ 直接支持「synapse overlay 邊在 family 質心間連、不必跟 maze tract 拓樸一致」。OE 並點名 DMN 即「無完整直接解剖連結卻功能性連結」的網絡（呼應 neurons DMN 系統）。Anchors: Fotiadis 2024 Nat Rev Neurosci `10.1038/s41583-024-00846-6`；Straathof 2018 JCBFM `10.1177/0271678x18809547`（SC-FC r=0.18–0.82）；Messé 2020 HBM `10.1002/hbm.24866`。
- **Alt rejected**: 整組退役 synapse（forced Dexie v14 + DMN/成就 rewire）。

### D3 — 節點 settle = 唯一抽卡：consume per-branch energy → 觸發該節點 family 的 `pullVariant`
走到 fogged 節點時：(1) 從該分支 energy pool **consume** `cost(N)`（見 D5）；(2) 觸發一次 `pullVariant`，**family = 該節點的 `MazeNode.familyId`**（節點半綁 family、不綁 slot —— roll 該 family 內的隨機 rarity/variant，P0 pity + instance mint 照常）；(3) bump `maze:<branch>:settles`。`mintVariantSlot`（確定性 mint）退場。
- **節點 → family（非 slot）**：`MazeNode` 已帶 `familyId`。探索某 family 的領域 → 抽該 family。給「走進 F 區域長出 F 神經元」的語感，又保留 gacha 隨機性（含 dupe，交給 #1 fusion 消化）。
- **無 always-on 手動抽卡**（D7）。settle 是唯一 pull 觸發。
- **持續節奏門（非 110-抽有限預算）**：pull 由**累積 settle 索引** `N` 驅動（per branch，不封頂於節點數）。`cost(N)` 持續線性 ramp（見 D5）。節點「點亮」只是探索進度**視覺上限**（封頂該分支節點數）；pull **不停在全節點點亮**。
  - **pre-completion**（該分支仍有 fogged 節點）：pull family = 正點亮的 `MazeNode.familyId`。
  - **post-completion**（該分支節點全亮，進入二週目）：pull family = 該分支**最少收集的 family**（加權），讓隨機長尾仍朝收滿收斂。
- **為何必須 random（連帶決策）**：deterministic 節點→特定 slot 雖能 110 節點乾淨收完，但**每抽 unique → 永遠沒 dupe → 殺掉剛 ship 的 #1 dupe-fusion**（tier-promote 吃 dupe 個體）。所以 random 是 #1 的必要燃料；而 random + 有限節點會收不完 → 必須持續節奏門。
- **Why**: 唯一閘 → pacing 真正掌控收集節奏（修掉「~10 手動抽/天架空」洞）；持續門 → 無 death loop、長期 study-reward loop 不死、最終可收滿（長尾）；自洽達成 grill F5「節點只 gate 抽卡機會」+「二週目調慢」。
- **Alt rejected**: 免費 settle + 並存手動付費 pull（Model B — 架空 pacing）；有限 110 = 110 抽（收不完 + death loop）；deterministic 節點→slot（殺 #1）；節點存 pull-token（多狀態）。

### D4 — energy 變 per-branch、consume-at-node（取代 local float signal + 全域 balance）
退役 `maze:<branch>:signal`（local float）。每分支一組 synced monotonic 計數：`maze:<branch>:earned`（faucet 累積）+ `maze:<branch>:settles`（已 settle/pull 數）。分支 B 的 frontier 進度由 `earned_B` 對照已花的 `Σcost(0..settles_B−1)` 推進（結構同既有 `reconcileSettles` 的 `floor(signal/SIGNAL_PER_NODE)`，但成本 ramped、且 settle 觸發 pull 非 mint）。答題依 `FAMILY_NT_BRANCH` 把 energy 記入該分支；reading 拆 4 份。
- **全域 `neuralEnergyEarned/Spent` 退役**：手動抽卡是它唯一的 sink（D7 移除後它沒 sink → balance 變無意義）。改用 per-branch energy 作 maze 燃料。`currency.ts` 全域 currency + `useEnergyBalance` HUD 移除（apply Phase 0 先 audit 所有 consumer）。
- **跨裝置**：per-branch earned/settles 進 `SYNCED_META_KEYS` → MAX-merge monotonic，maze 進度首次跨裝置一致（淨升級）。
- **Why**: 一條 per-branch energy 同時是「走路燃料」+「pull 成本」—— 不再有 derived-monotonic 永不扣 vs 全域 balance 的不自洽；energy 有明確 sink（consume-at-node）。
- **Alt rejected**: 保全域 balance 給手動抽（Model B）；走路 derived from 永不扣的 monotonic earned（energy 無 sink）。

### D5 — pacing：**front-loaded** 線性遞增 `cost(N) = round(BASE × (1 + K·N))`，N = 累積 settle 索引（uncapped）
第 N 次 settle（per branch，0-indexed、**不封頂於節點數**）所需 energy = `BASE × (1 + K·N)`。第一版猜值 **`BASE=24`、`K=0.10`**（front-loaded：低 base + 陡 K）。
- **為何 front-load（balance review 修正）**：若 `BASE=100`，node0 就要 100 energy ≈ 33 答對 → 廣泛唸書的新玩家**第一隻要 1-2 週**才入手（onboarding 災難）。front-loaded 下 **node0 = 24（≈ 半天首抽，good hook）**、node109 ≈ 24×(1+10.9) ≈ 285（後段慢）→ 早期爽快、後段長尾。**原則：早節點便宜（hook）、晚節點貴（拉長 arc）** —— 不是 flat-expensive。
- **同樣 ~3 月 arc**：Σ`cost(0..109)` = 2640 + 24·0.10·(109·110/2) ≈ **17,000 energy ÷ ~197/日 ≈ 86 天 ≈ 3 月**（與 BASE=100/K=0.04 同量級，只是重心前移）。
- **二週目減速 = 同一條 ramp 的自然延伸**：N 超過節點數後 `cost(N)` 繼續線性升（node110≈288、N=200≈504），不需另設 lap multiplier / lap state。配 `SPEED_BUFF_CAP (+100%)` 封住 teamspeed 正回饋。
- **arc 兩層（design 須講清，勿混）**：(1) **點亮全 110 節點** ≈ **17,000 energy ÷ ~197/日 ≈ 86 天 ≈ 3 月**；(2) **隨機收滿全 110 unique** = 長尾 ~6 月+（coupon-collector，dupe 餵 #1 fusion 是 endgame，符合 open-collection 無完成里程碑）。
- **Why**: 線性好調可預測；front-loaded 兼顧 onboarding hook + 後段長 arc；cumulative-index ramp 一條曲線同時做 pacing + 二週目減速。
- **Alt rejected**: flat-expensive base=100（onboarding 太慢）；指數（難調易爆）；固定常數（後段不變慢）；per-lap multiplier（多一個 state）。

### D6 — chip 語義 + 出征 CTA
🧠 chip 文案維持「已連線 X 個腦區」、語義 = 已到節點數（= 已抽卡次數）；🧬 = 已收集隻數（open-collection 純計數）。⚔️ 出征（全科錯題）成 maze-home 常駐 CTA。出征=input·maze=output（per `expedition-vs-maze` decision doc）；completion bonus 仍 no-op（Phase 4）。

### D7 — 移除 `/collection` 隨時手動抽卡（頁面留作 dex + fusion）
`CollectionPage` 的「🎴 抽卡（20）」per-family 按鈕 + balance HUD 移除。頁面保留作 **收集圖鑑 + tier-promote/fusion（#1）** 介面（fusion 吃 dupe 個體、不耗 energy，不受影響）。收集的唯一新增來源 = maze 節點 settle pull。
- **Why**: Model A 的核心 —— 唯一抽卡閘；移除手動抽才能讓 pacing 掌控節奏。
- **UX 取捨**: 失去「指定 family 立即抽」agency → 由「探索該 family 領域」取代（節點半綁 family，D3）。屬 Collection 2.0 的可感知 UX 變更，proposal 標明。

## Risks / Trade-offs

- **移除手動抽卡 = 拆 shipped Collection 2.0 UX** → owner 明確選 Model A 知情；`/collection` 仍是 dex + fusion 介面，非整頁砍。apply Phase 0 先 audit `currency.ts` / `useEnergyBalance` / CollectionPage pull 的所有 consumer 再動。
- **全域 energy currency 退役牽動既有 consumer**（reading-timer award、quiz reward、HUD、achievement stats?）→ Phase 0 grep 全 consumer；faucet 改記 per-branch；確認沒有破壞 achievement/leaderboard 對 energy 的讀取（若有）。
- **節點半綁 family → 後期某 family 抽滿仍會抽到 dupe** → 交給 #1 dupe-fusion 消化（dupe → tier-promote 材料）；open-collection 本就接受 dupe。
- **per-branch energy 分佈不均**（Glu 40 節點 vs DA 20；某分支被冷落則 frontier 幾乎只靠 reading÷4）→ 屬設計意圖（study 該科 → 進該分支）；telemetry 觀察是否過懲罰。
- **pacing BASE/K 第一版猜值** → 標 telemetry-tunable；Model A 下 arc 對 BASE/K 敏感，dogfood 第一週重點校準。
- **synapse overlay 視覺密 / RWD** → 第一版簡單 edge + 可 toggle（沿用 branch filter chip）；美術細修 follow-up。
- **OE framing 未驗即 lock** → apply 建 overlay 前先 `/oe`。
- **shared neurons worktree（corpus session）** → explicit per-file `git add` + commit 前 `git diff --cached --name-status`；watch `git reflog`。

## Migration Plan

純前端、無後端 migration。Schema 收斂：
- **Dexie**: 預期**零 `.version()` bump`** —— synapse 表保留；per-branch energy 走 generic `meta` kv；移除函式（`mintVariantSlot`）+ UI（手動 pull 按鈕）不動 schema。apply Phase 0 確認屬實；若被迫加 store/index → 必帶 v(N-1)→v(N) fixture（`enforce-dexie-upgrade-fixture-rule`）。
- **R2 bundle**: `SCHEMA_VERSION` 11→12，additive + reader-tolerant。新增 `maze:<branch>:earned` / `maze:<branch>:settles`（8 keys）進 allowlist；既有全域 `neuralEnergyEarned/Spent` keys 可留著被忽略（reader-tolerant，不主動移除以免舊 client 失據）。
- **既有玩家**: 無 backfill banner。舊全域 energy balance 失去 sink（無害，被忽略）；舊 `maze:<branch>:signal`（local）忽略。per-branch energy 從 0 起算 —— 但 **lit nodes 由 collected variants 導出**（既有 collection 不丟），所以視覺不倒退（已收集節點仍亮）。已抽滿的玩家不受影響（無新 pull 來源也只是沒新東西可收）。
- **Rollback**: `git revert` 本 change commit；maze 退回 `/maze-beta`、connectome 樹回 `/`、手動抽卡 + 全域 energy 復原。R2 v12 對 reverted v11 client = reader-tolerant。

## Open Questions

- 全域 `neuralEnergyEarned/Spent` currency 是「完全移除程式碼」還是「保留資料、停用 UI/faucet」→ apply Phase 0 audit consumer 後決定（傾向停用 faucet + 移除 HUD/手動抽，保留 meta keys 不主動刪以利 rollback）。
- 節點 settle pull 的 family 規則已定（D3）：pre-completion = `MazeNode.familyId`、post-completion(二週目) = 該分支最少收集 family 加權。剩 telemetry 項 = post-completion 的加權強度（純最少收集 vs 含 rarity 權重）。
- pacing `BASE`/`K` 確切值（第一版 100/0.04）+ per-branch income 實際分佈 → dogfood 第一週校準。
- synapse overlay 視覺編碼細節 + OE framing 驗證結果（apply 前）。
- `/collection` 移除手動抽後，是否需要任何「如何取得神經元」的 onboarding 文案調整（指向 maze 探索）。
