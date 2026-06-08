## Context

完整設計脈絡與決策過程見 `openspec/decisions/2026-06-08-connectome-conduction-roadmap.md`（5 輪 Codex gpt-5.5 諮詢 + code-level 查證 + /grill 收斂 + owner 逐項拍板）與 `~/.claude/scratch/grilled-神經元突觸最終方案-connectome-2026-06-08.md`。

現況關鍵事實（code-verified）：
- gameplay 突觸（`db.synapses`）由 `connectome.ts` 的「同日 2 科各答對 5 題（firedToday / N=5）→ wire」觸發；狀態機 dormant→weak→strong（不同日再共同 fired 升階）；`> 7` 天衰退（`connectome.ts:77`）。
- **`economy.ts` `synapseBonus`**（`maze-constants.ts`：`SYNAPSE_BONUS_PER=0.06`、`SYNAPSE_BONUS_CAP=0.30`）：每條 strong synapse 把該家族 accrual **自乘** +6%、上限 +30%；在 `accrueMazeEnergy` 乘數鏈內（`base × mazeSpeedMultiplier × speedAccel × synapseBonus`）。這就是「又小又後置、玩家無感」的隱形數值。
- 真實經濟常數：`CORRECT_ANSWER_ENERGY=3`、`READING_MINUTE_ENERGY=3`、`nodeCost(N)=round(11×(1+0.1·min(N,20)))`（pull 成本 ~11–33，早期約 5 次答對換 1 隻變體）。energy 同時是探索燃料與抽卡成本，每 settle 觸發 1 次 `pullVariant`。
- 「出征（expedition）」= 全科 `lastResult==='wrong'` 錯題池的跨科修復；`onExpeditionComplete → creditExpeditionDraws(pool, cleared)` 給 DMN 抽（清題 milestone 25%/50%、每日 2 抽）。出征答題走同一條 `recordCorrectAnswer`。
- 迷宮 116 個 build-time 交叉點（`GridSynapse`）+ 二週目位置變體；connectome 線畫在既有 `synapseCell` 交叉點。**迷宮正被另一條 session 重做。**
- 三個東西都叫「synapse」/ 都用同一套 67 個 LTP 名（circuit-locations.ts）：GridSynapse（幾何交叉）/ db.synapses（Hebbian bond）/ 位置變體。

## Goals / Non-Goals

**Goals:**
- 把 connectome 觸發改綁到「出征共同修復」，讓 LTP 主視覺對齊最有學習價值的行為（錯題回收）。
- 把隱形 `synapseBonus` 重設計成**可見、純加分、有上限的「突觸傳導」**——讓 wire 的好處被看見也被感覺到（解決 Codex 指出的「零數值會被當裝飾噪音 / 隱形 % 沒人在乎」兩難）。
- 補上「跨日每日完成出征」留存鉤（streak + 本週 X/7 + loss-aversion）。
- connectome 成為首頁預設主視覺（敘事指標 + 儀式 + 分享卡 + 傳導 ledger）。
- 消除「synapse」語意三重載（玩家可見命名分層）。

**Non-Goals:**
- **不動迷宮拓樸 / path / 二週目 / 交叉點幾何**（對面 session 工）。
- 不做 116/116 connectome 收集分母（避免與位置變體並存的第二套圖鑑）。
- **不做 per-subject 髓鞘化第二套經濟 bonus**（會讓玩家搞不清在追 mastery 還是 connectome；conduction-only）。
- **連結神經元收藏（wire 限定家族）不在本變更**——路線圖 #3 `add-neurons-connector-neuron-family`。
- 67 個 LTP 名字三池再分層（延後，會動 circuit-locations.ts）。
- 不動 DMN 出征軸抽卡（清題 milestone、每日 2 抽不變）、neuron-variant-gacha pity。
- 無 Dexie schema bump。

## Decisions

- **D1 觸發點 = 出征結算，非逐題**：connectome wire 在 `onExpeditionComplete` 統計後 credit，**不在 `recordCorrectAnswer` 逐題 wire**。理由：逐題無法處理「每日 cap + pair 排序 + 每科門檻 + 有效完成 gate」；出征結算是天然的「今天修復了哪些科」彙整點。*替代（逐題 wire）已否決*。
- **D2 跨科→pairwise 映射 = 每日累積 + 門檻 + 有效完成 gate + cap**：以「今日（跨所有出征）累積各科修復題數」為準；單科修復 ≥ **K=2** 題才算今日該科 repaired；**僅在當日達「有效出征完成」時處理配對**（gate，見 D5）；今日 repaired 科目 ≥ 2 → 兩兩組 pair；**每日最多處理 3 條 pair**，優先序 = 新 pair > weak→strong 候選 > 久未修復(`lastCoFireDate` 最舊) > 今日修復量乘積高。*替代：(i) 單場 all-pair（否決：一場混 4 科瞬間爆線）；(ii) 純看單場（否決：逼玩家一場跨多科）；(iii) K=3（否決：太冷，owner grill 已定 K=2）*。
- **D3（翻轉）突觸傳導取代自乘 bonus**：**移除** `economy.ts` `synapseBonus` 自乘乘數，**改成 additive、可見、有上限的 Synaptic Conduction**——wire 的兩科，當來源科在批次 accrual（出征結算 / 閱讀 session 收尾）得到能量時，把該批 **post-multiplier** 能量的 `rate` 加到鄰科 pool，並 emit 一顆沿線 pulse。
  - 費率：dormant 0% / **weak 6% / strong 12%**（套在來源科 post-multiplier 當批能量）。
  - 批次點：出征結算 + 閱讀 session 收尾各算一次（**不逐題**——逐題 `12%×3=0.36` 取整變 0、pulse 體感死亡；**不做每日 sweep**——避免「沒看到行為卻進帳」）。
  - 取整 / 最低 pulse：`conduction = floor(batch × rate)`；`<1` 不發（無能量無 pulse，防小批洗能量）；`≥1` 給能量 + 發 pulse；UI 數字只在 `≥2` 顯示。
  - 上限（防爆 / 防 mega-hub）：每條線/日 **weak 8 / strong 15**；每來源科/日 **45**（流出）；每目標科/日 **30**（流入，固定值不用 max(20,30%) 特例）。
  - 性質：**一跳、不遞迴**（傳導能量不再觸發下一段傳導）；**不被目標科自己的倍率放大**；**不強化 wire、不算 co-repair**（bonus 不自我餵養——wire 只能靠真出征共修維持）。
  - 體感：strong 線常吃 15/日 cap ≈ 早期約 1 隻變體；完全沒讀的科被導入上限 30/日 ≈ 早期 1–2 pulls、晚期 <1 → 只保溫、養不出整科。最壞（6 條 strong 全滿）≈ 全網 90/日分散多鄰居，仍 perk 非捷徑（因不強化 wire + 7 天衰退）。**rate 管「有沒有感」、cap 管「經濟天花板」**。
  - *替代已否決*：(i) 維持隱形自乘 +6%/cap30%（Codex：沒人在乎）；(ii) lost-path 懲罰（懲罰沒錯題的新手 + 迷路解鎖變體造成「不 wire 反而 loot 多」反誘因 + 要動 maze 拓樸）；(iii) per-subject 髓鞘化經濟 bonus（混淆 mastery vs connectome）。
- **D4 狀態機保留、改 repair 驅動、衰退 7 天**：保留 dormant/weak/strong（不簡化）。首次有效共同修復 → weak；不同日(`> lastCoFireDate`)再次 → strong；strong 再修復只更新日期；同 pair 同天最多升一階。strong **> 7 天**未共同修復 → 降一階（strong→weak→dormant，dormant 不再降、不移除）；降後 `lastCoFireDate = today` 防串聯；weak 不自動消失。*衰退維持既有 7 天，不改 14/21：遊戲設計 ~2 個月玩完，7 天讓「不維護就變弱」有意義、漏 2–3 天又不致挫折（owner 拍板）*。
- **D5 每日完成 + streak（防刷 + wire gate）**：今日有效出征完成 = 今日修復 ≥ 5 題（pool < 5 → 清完且 ≥ 2）；**此門檻同時是 D2 配對處理的 gate**（wire 與 streak 共用一條每日門檻 → wire 是被賺到的、不會 K=2 太廉價）。streak 只看有效完成 + 本週 X/7。防刷靠 correctness-gated（修復需真 wrong→correct flip）；**不卡詳解秒數**（前端時間易假、且懲罰已會的人）；可做軟性 UI「本次修復 8 題、已看 5 題詳解」，非硬 gate。
- **D6 顯示 = 敘事指標、首頁預設 connectome**：今日出征 ✓/✗ · 連續 N 天 · **本週 X/7** · 穩定連線數 · 最強 pair · **今日連線額外獲得 X 能量**；**不顯示 116/116**。完成有效出征播儀式、聚焦當日 pair；完成但未達跨科 wire 條件 → 「今日已修復，尚未形成跨科連線」（不假裝有線）。**wire 好處可讀性 3 件套**：結算傳導 ledger（`藥理 → 解剖 +12`）、每條線 tooltip（來源/目標/倍率/今日 cap）、出征選科 ghost line（`再修復 X 題即可形成連線`）。
- **D7 零 schema = meta key + 既有 db.synapses**：db.synapses（pairKey/state/lastCoFireDate）沿用；新增 meta key（`connectome:dailyRepair:<date>` / `connectome:dailyWiredPairs:<date>` / `conduction:{source,target,wire}:<id>:<date>` / `expeditionStreak` / `expeditionLastCompleteDate` / `connectomeStats` cache）。需跨裝置者（streak / lastCompleteDate / stats cache）加進 `SYNCED_META_KEYS`；傳導每日 cap accumulator 為 within-day ephemeral（date-keyed、不需 sync）。不 bump Dexie。
- **D8 停用 DMN 行為軸 synapse 抽**：移除 `synapseFormed`/`synapseStrengthened` 的 +1 抽（保留 `variantSlotUnlocked`）。理由：避免同一行為三重發獎；該份本就常被變體抽吃掉=冗餘。（spec delta 已在 `neurons-dmn-fate-cards`。）
- **D9 命名分層（玩家可見）**：記憶地標（route crossing）/ Hebbian 連線（gameplay bond，首頁/收藏用「Hebbian 連線」、出征儀式用「修復連線」）/ 印痕變體（location variant）。`lastCoFireDate` 欄位名先不改但註解改成 repair date。67 名三池分層延後。
- **D10 修復只在出征 session 算**：一般隨機/科目答題的 wrong→correct flip **不** 累加 `dailyRepair`、**不** wire connectome（wire 綁出征結算）。spec 寫明 + UI 文案點出「connectome 由出征驅動」，避免玩家困惑。
- **D11 年份回數遠征 v1 不納入 connectome**：它是全範圍系統性複習、非錯題修復，語意不同；v1 只算錯題出征。（UI 入口拆分屬路線圖 #2。）
- **D12 舊 synapse = 歷史痕跡**：舊「同日共同答對」觸發留下的 synapse 保留、UI 標「早期連線」（細灰藍）、**不計入「穩定連線數」敘事指標**直到被新出征修復重新驗證（以 `lastCoFireDate` ≥ 上線 epoch 常數衍生「已驗證」，零 schema）；不 wipe、不 backfill。
- **5 個 dogfood 旋鈕（已定預設）**：K=2 / 每日 pair cap=3 / strong 衰退 7 天 / 年份回數遠征不算 / 舊 synapse 保留顯示但不給數值（標歷史、不計入穩定）。傳導旋鈕：weak 6% / strong 12% / 每線 8·15 / 每來源 45 / 每目標 30。皆 dogfood 可調。

## Risks / Trade-offs

- [pair 爆線 / 太快長滿] → K≥2 + 有效完成 gate + 每日 cap 3 + 優先序（D2/D5）。
- [傳導 snowball / mega-hub 壟斷] → 一跳不遞迴 + 三層 cap（線/來源/目標）+ 傳導不強化 wire；想推進某科仍須直接讀/答/修 → 11 科都值得讀（D3）。
- [傳導變回隱形 %] → batch-at-settlement + 可見 pulse + 結算 ledger，bonus 與視覺是同一事件（D3/D6）。
- [玩家困惑：普通模式答對錯題卻沒長線] → spec 寫明 + UI 文案「connectome 由出征驅動」（D10）。
- [新手/錯題少被懲罰] → 傳導純加分、無 wire = baseline 零扣分（D3 Codex 鐵律「unwired never worse than baseline」）。
- [跨裝置 streak / daily 不一致] → meta key 入 `SYNCED_META_KEYS`；streak 合併語意（LWW by `expeditionLastCompleteDate` + 斷天歸零）。
- [移除自乘 synapseBonus 影響能量平衡] → 影響小（原 capped +30%、少人頂到）；傳導為 additive 不影響來源科自己的曲線；dogfood 觀察。
- [舊玩家既有 synapse 語意] → 保留、標歷史、不計入穩定、向前更新；**不 backfill**（D12）。
- [跟對面 maze session 撞] → 不動拓樸；只動觸發來源 + economy 數值 + overlay 渲染；connectome 畫在既有 `synapseCell`；commit explicit per-file。

## Migration Plan

- **無 Dexie bump**：db.synapses 舊 row 保留；新 meta key 預設不存在 → 視為 0 / 空。
- **觸發切換**：移除舊 sameDayCorrect≥5→fired→wire；ship 後只由出征修復 + 有效完成 gate wire。舊 synapse 不重算、不 backfill、標歷史。
- **能量切換**：移除 `synapseBonus` 自乘 → `accrueMazeEnergy` 乘數鏈變 `base × mazeSpeedMultiplier × speedAccel`（不含 synapse 自乘）；新增獨立 additive 傳導步驟在批次點計算並寫鄰科 pool。
- **部署**：標準 CF Pages（neurons-only）；verify 跑 SPA 三件套 + connectome 首頁預設渲染 + 出征→wire + 傳導 pulse + 能量正確（有/無 wire 來源科自己 accrual 相同、鄰科有/無得到傳導）end-to-end smoke。
- **Rollback**：revert change 即可；db.synapses 不受影響，新增 meta key 被舊 code 忽略（向後相容）。

## Open Questions

- streak 跨裝置合併：傾向 LWW by `expeditionLastCompleteDate` + 斷天歸零（apply 定）。
- 傳導 pulse 視覺：複用 motion-library 既有 pulse primitive 到什麼程度（apply 視覺 pass 定）。
- 「今日修復 ≥5」是否需感知 year-filter（出征本不分年份，傾向不感知）。
- pairwise 優先序 tie-break 精確公式（「今日修復量高」= 兩科修復數乘積）。
- 「已驗證」epoch 常數的具體值（上線日期；apply 時填）。
