## Why

目前的 gameplay 突觸（Hebbian connectome）三個問題疊在一起：(1) 觸發條件「同日 2 科各答對 5 題」鼓勵的是「打卡式多科淺練」，跟「複習錯題、修補弱點」這個真正有學習價值的行為脫節；(2) 它的能量加成（`economy.ts` 的 `synapseBonus`：每條 strong synapse 自乘 +6%、上限 +30%）**又小又後置、玩家完全無感**——是個存在卻沒人在乎的隱形數值；(3) 它是這個 app 的品牌主軸（LTP / "fire together, wire together"）卻最不顯眼——只是一個可關掉、沒名字的火花 overlay。

同時，「跨科錯題修復」這件最有學習價值的事，已經由現有的**出征（expedition）**系統在做。本變更把 connectome 的觸發從「同日共同答對」改綁到「**出征共同修復**」，並把那個隱形 `synapseBonus` **重新設計成「突觸傳導（Synaptic Conduction）」**——一個**可見、純加分、有上限**的跨科能量流：wire 起來的兩科，當其中一科得到能量時，會有一顆 pulse 沿著連線飛到鄰科、鄰科能量池 +N。**玩家看到的那道電流，就是 bonus 本身**。一次解決上面三點：connectome 變成 app 最強學習資產（錯題回收）的視覺主角、敘事升級成 **「repair together, wire together」（一起修復的科目就一起連起來）**、且 wire 的好處被看見也被感覺到，並順手補上目前缺的「跨日每日完成」留存鉤。

完整設計脈絡（5 輪 Codex gpt-5.5 收斂 + owner 決策）見 `openspec/decisions/2026-06-08-connectome-conduction-roadmap.md`。本變更是 5-change 路線圖的 **#1（基礎）**。

## What Changes

- **觸發重設計**：synapse 形成/強化由「同日 2 科各答對 5 題（firedToday / N=5）」**改成出征結算驅動**——在 `onExpeditionComplete` 統計「今日各科修復題數（原 `lastResult==='wrong'` → 答對 flip）」，今日 repaired 科目（單科修復 ≥ K=2 題）兩兩 wire。逐題不再 wire。**新增「有效完成 gate」**：只有當日達成「有效出征完成」（今日修復 ≥ 5；pool < 5 則清完且 ≥ 2）才處理配對——與 streak 共用同一條每日門檻，讓 wire 是被賺到的、不會 K=2 太廉價。**BREAKING**（對既有 save 的觸發行為）：舊「同日答對多科」不再形成 synapse。
- **突觸傳導取代隱形加成**：**移除** `economy.ts` 的 `synapseBonus`（自乘式 +6%/strong、cap +30%），**改成可見的 Synaptic Conduction**——wire 起來的兩科，當來源科在「出征結算 / 閱讀 session 收尾」批次得到能量時，把該批 post-multiplier 能量的 **weak 6% / strong 12%** 以一顆**可見 pulse** 加到鄰科能量池（雙向、一跳不遞迴、純加分）。上限：每條線/日 weak 8・strong 15；每來源科/日 45；每目標科/日 30；`floor(<1)` 不發。傳導**不強化 wire、不算 co-repair、不被目標倍率放大**。
- **不做收集分母**：connectome 顯示用**敘事型指標**（今日出征 ✓/✗ · 連續 N 天 · 本週 X/7 · 穩定連線數 · 最強 pair · 今日連線額外獲得 X 能量），**不顯示 116/116** 收集條（避免與二週目位置變體並存的第二套圖鑑）。
- **首頁主視覺**：neurons-homepage 預設呈現 connectome 層 + 跨日連續天數 + 本週 X/7 + 敘事指標 strip + 結算傳導 ledger + 可分享卡（複用既有 ShareCardModal / character-card）。〔每日完成儀式動畫、每條線 tooltip、出征選科 ghost line 三項純視覺 polish **deferred 到 follow-up change `polish-neurons-connectome-visual`**〕
- **wire 好處可讀性（3 件套）**：① 結算「傳導 ledger」（`藥理 → 解剖 +12 能量｜今日連線額外獲得 +27`）；② 每條線 tooltip（來源/目標/倍率/今日 cap）；③ 出征選科時「再修復 X 題即可形成連線」的 ghost line。
- **每日完成 + streak（新留存鉤）**：定義「今日有效出征完成 = 今日修復 ≥ 5 題（pool < 5 則清完且 ≥ 2）」；跨日連續天數（loss-aversion）+ 本週 X/7。streak 只看有效完成、不給任何數值加成。
- **狀態機沿用、改 repair 驅動、衰退維持 7 天**：保留 db.synapses `dormant/weak/strong`，改由「不同日再次跨科共同修復」升階；衰退窗**維持既有 7 天**（2 個月遊戲週期，7 天讓「不維護就變弱」有意義、漏 2–3 天又不致挫折）；weak 仍不自動消失。
- **舊 synapse = 歷史痕跡**：舊「同日共同答對」觸發留下的 synapse 保留、標「早期連線」（細灰藍）、**不計入「穩定連線數」敘事指標**直到被新出征修復重新驗證（以 `lastCoFireDate` vs 上線 epoch 衍生，零 schema）；不 wipe、不 backfill。
- **停用冗餘獎勵**：移除 neurons-dmn-fate-cards 行為軸的 `synapseFormed` / `synapseStrengthened` +1 抽（避免同一行為三重發獎；保留 `variantSlotUnlocked` 那份）。
- **命名分層**：玩家可見三分「記憶地標（route crossing）/ Hebbian 連線（gameplay bond）/ 印痕變體（location variant）」，消除「synapse」一詞的三重語意載；掃掉「synapse = 自乘 bonus / 同日答對多科」舊文案，改「修復連線 / 傳導」語意。67 個 LTP 名字三池再分層**延後**（會動到位置變體用的 circuit-locations.ts，與「維持迷宮」約束衝突）。

**硬約束**（前提，不是議題）：**不動迷宮拓樸 / path / 二週目 / 交叉點幾何**（對面 session 重做 maze；connectome 線仍畫在既有 `synapseCell` 交叉點）。**零 Dexie `.version()` bump**（daily / streak / 傳導 cap / cache 全走 meta key + 需跨裝置者加進 `SYNCED_META_KEYS`；db.synapses 既有表沿用）。**連結神經元收藏（wire 限定家族）不在本變更**——屬路線圖 #3 `add-neurons-connector-neuron-family`。

## Capabilities

### New Capabilities
（無——本變更是對既有能力的重新定義，不引入新 capability。）

### Modified Capabilities
- `connectome-collection`: synapse 形成/強化的觸發由「同日 N=5 共同答對」改為「出征共同修復（K=2 + 有效完成 gate）」；新增「今日各科修復計數 / 有效出征完成 / 跨日 streak + 本週 X/7」概念；**新增「突觸傳導」加成需求**（取代「零數值」描述）；衰退維持 7 天但基準改 co-repair；新增「舊 synapse = 歷史痕跡、不計入穩定連線」需求；移除 firedToday/N=5 同日 co-fire 路徑（AP monotonic counter 保留作 provenance）。
- `neurons-brain-maze`: 移除舊「strong synapse 自乘跨科能量加成」需求，**以「突觸傳導（additive 跨科能量流）」取代**；能量公式 MODIFIED（來源科自己的 accrual 不再被 synapse 自乘，但傳導步驟可額外加能量給已連線鄰科）；overlay 渲染 wire + 傳導 pulse。
- `neurons-dmn-fate-cards`: 移除行為軸 `synapseFormed` / `synapseStrengthened` 的 +1 draw（保留 `variantSlotUnlocked`）。
- `neurons-homepage`: 首頁預設呈現 connectome 層 + 敘事型指標（非 116/116，含本週 X/7 + 今日傳導能量）+ 跨日連續天數 + Hebbian 連線分享卡 + 結算傳導 ledger。（每日完成儀式 / 每條線 tooltip / 出征選科 ghost line deferred → follow-up `polish-neurons-connectome-visual`）

## Impact

- **程式**：`apps/neurons-tw/src/lib/services/connectome.ts`（移除 sameDayCorrect≥5→fired→wire；改出征 credit + K + 有效完成 gate；AP 保留）、`apps/neurons-tw/src/lib/services/expedition.ts`（`onExpeditionComplete` 加 connectome credit + 有效完成判定）、`apps/neurons-tw/src/lib/maze/economy.ts`（**移除 `synapseBonus` 自乘、改 additive `synapticConduction`**；傳導在批次 accrual 點計算 + 寫鄰科 pool + emit pulse 事件）、`apps/neurons-tw/src/lib/services/reading-timer.ts`（閱讀 session 收尾觸發傳導批次）、`apps/neurons-tw/src/lib/services/dmn-trigger.ts`（移除 synapse 行為軸抽）、`apps/neurons-tw/src/components/maze/MazeGrid.tsx`（connectome overlay 預設呈現 + 傳導 pulse 動畫；不動拓樸）、`apps/neurons-tw/src/routes/OverviewPage.tsx`（首頁預設 connectome + 指標 + 本週 X/7 + 儀式 + streak + 傳導 ledger）、wire tooltip / ghost-line UI、`SynapseFormationToast.tsx` / `ShareCardModal` / `character-card`（文案 + 分享卡）。
- **持久化**：db.synapses 既有表沿用（pairKey/state/lastCoFireDate；後者語意改 repair date）；新增 meta key（`connectome:dailyRepair:<date>`、`connectome:dailyWiredPairs:<date>`、`conduction:source:<fam>:<date>`、`conduction:target:<fam>:<date>`、`conduction:wire:<pairKey>:<date>`、`expeditionStreak`、`expeditionLastCompleteDate`、`connectomeStats` cache）+ 需跨裝置者加進 `SYNCED_META_KEYS`。**無 Dexie schema bump**（不觸發 dexie-upgrade-fixture lint）。
- **同步**：streak / lastCompleteDate / stats cache 走 LWW meta；傳導每日 cap accumulator 為 within-day ephemeral（date-keyed，不需 sync）；db.synapses 既有 sync adapter 沿用。
- **測試**：舊 same-day-co-fire 觸發測試改為 expedition-repair 觸發；新增 cross-subject→pairwise 映射 + 有效完成 gate + 每日 cap + 升階/7 天衰退 + daily-completion/streak/本週 + **突觸傳導（rate / batching / floor / 三層 cap / 不遞迴 / 不強化 wire）**測試。
- **不影響**：迷宮 grid graph / 二週目 / 位置變體 / 交叉點幾何（對面 session WIP）；DMN 出征軸抽卡（清題 milestone、每日 2 抽不變）；neuron-variant-gacha 的 P0/P1 pity；連結神經元收藏（路線圖 #3）。
