# Tasks — rework-neurons-connectome-expedition-driven

> 硬約束（全程遵守）：不動迷宮拓樸 / path / 二週目 / 交叉點幾何（對面 session WIP）；零 Dexie `.version()` bump；commit 一律 explicit per-file（multi-session worktree）。
> dogfood 旋鈕預設：`K=2`、`DAILY_PAIR_CAP=3`、衰退 `7` 天、有效完成門檻 `5`（pool<5 清完且 ≥2）、年份回數遠征不算、舊 synapse 標歷史不計入不傳導直到 re-validate。
> 傳導旋鈕：rate weak 6% / strong 12%；每線/日 weak 8・strong 15；每來源/日 45；每目標/日 30；`floor(<1)` 不發。
> 完整設計：`openspec/decisions/2026-06-08-connectome-conduction-roadmap.md`。

## 1. 觸發切換：移除舊 co-fire、改出征驅動 + 有效完成 gate (connectome service)

- [x] 1.1 `lib/services/connectome.ts` 移除 `recordCorrectAnswer` 內 `sameDayCorrect >= 5 → firedToday` 與「當日 ≥2 科 fired → wire」邏輯（AP monotonic 保留作 provenance；`firedToday` / `sameDayCorrect` 若無其他消費者一併移除）
- [x] 1.2 新增 connectome-credit 函式（出征結算呼叫）：讀今日各科修復計數 `connectome:dailyRepair:<date>`，對單科修復 ≥ K 的科目兩兩組 pair
- [x] 1.3 **有效完成 gate**：pair 處理只在當日達「有效出征完成」（今日修復 ≥5；pool<5 清完且 ≥2）時執行；未達 gate 仍累積 `dailyRepair` 但不形成/強化任何 pair
- [x] 1.4 實作 pair 選取：每日最多 `DAILY_PAIR_CAP`，優先序 = 新 pair > weak→strong 候選 > 久未修復(`lastCoFireDate` 最舊) > 今日修復量乘積高；已處理記 `connectome:dailyWiredPairs:<date>` 防同日重複
- [x] 1.5 `lib/services/expedition.ts` `onExpeditionComplete` 統計本場各科 wrong→correct flip 數、累加進 `connectome:dailyRepair:<date>`、判定有效完成、再呼叫 1.2 credit（在既有 `creditExpeditionDraws` 之外、不影響它）
- [x] 1.6 確認「修復只在出征 session 算」：普通隨機/科目 quiz flip **不**累加 `dailyRepair`、不 wire；年份回數遠征 v1 不納入
- [x] 1.7 全部 connectome 寫入維持單一 Dexie transaction、事件 commit 後才 emit（沿既有紀律）

## 2. 狀態機強化 / 衰退（維持 7 天，基準改 co-repair）

- [x] 2.1 升階：pair 不存在/dormant 首次有效共同修復 → weak；不同日(`> lastCoFireDate`)再次 → strong；strong 再修復只更新日期；同 pair 同天最多升一階；transition 發 `connectome.synapseStrengthened`
- [x] 2.2 衰退：daily reset 的 LTD pass 維持 `> 7` 天無共同修復才降一階（strong→weak→dormant，dormant 不再降、不移除）；降後 `lastCoFireDate = today` 防串聯；發 `connectome.synapseDecayed`（現有 `connectome.ts:77` 已是 7 天 → 確認不被改動）
- [x] 2.3 `lastCoFireDate` 欄位名保留，程式註解改為「repair date」語意

## 3. 每日完成 + streak + 本週 X/7

- [x] 3.1 定義「今日有效出征完成」= 今日修復 ≥5（pool<5 清完且 ≥2）；在出征結算判定（與 1.3 gate 同一判定）
- [x] 3.2 首次有效完成當日 `expeditionStreak += 1`（每日一次）+ 設 `expeditionLastCompleteDate = today`
- [x] 3.3 daily reset：若前一日(或多日 gap)無有效完成 → `expeditionStreak = 0`
- [x] 3.4 衍生「本週 X/7」= 當前 local-TZ 週內有效完成天數（由完成日期衍生，不另存 counter）

## 4. 能量經濟：移除自乘 synapseBonus、改 additive 突觸傳導

- [x] 4.1 `lib/maze/economy.ts` **移除 `synapseBonus` 自乘函式** + 從 `accrueMazeEnergy` 乘數鏈拿掉（鏈變 `base × mazeSpeedMultiplier × speedAccel`）；移除 `maze-constants.ts` 的 `SYNAPSE_BONUS_PER/CAP`（或保留常數但停用——確認無 orphan）
- [x] 4.2 新增 `synapticConduction` 步驟：傳入「來源科 + 本批 post-multiplier 能量」，對來源科每條 **eligible（lastCoFireDate ≥ ship epoch）** wire 算 `floor(batch × rate(state))`，套三層 cap（per-wire / per-source / per-target，date-keyed accumulator），寫鄰科 `maze:<neighbor>:earned` pool，`floor(<1)` 不發
- [x] 4.3 傳導觸發點接線：出征結算（4.2 對該場各科批次）+ 閱讀 session 收尾（`reading-timer.ts` session end 對該科批次）各算一次；**不逐題、不做每日 sweep**
- [x] 4.4 emit `connectome.conductionPulse { fromFamily, toFamily, amount, state }`（給 overlay 動畫 + ledger）
- [x] 4.5 防呆確認：傳導不遞迴（傳導能量不進 4.2 的來源批次）、不被目標倍率放大、不強化 wire、不算 co-repair；legacy（< epoch）wire 不傳導
- [x] 4.6 定義 ship epoch 常數（上線日期 ISO）；helper：synapse 是否 validated（`lastCoFireDate >= epoch`）

## 5. DMN 行為軸清理

- [x] 5.1 `lib/services/dmn-trigger.ts` 移除 `connectome.synapseFormed` / `connectome.synapseStrengthened` 的 +1 行為軸抽（保留 `variantSlotUnlocked`）；確認 listener 解除乾淨
- [x] 5.2 確認 DMN 出征軸（`creditExpeditionDraws` milestone、每日 2 抽）完全不動

## 6. UI：首頁指標 / 儀式 / 分享卡 / overlay+pulse / 命名 / 可讀性

- [x] 6.1 `routes/OverviewPage.tsx`：敘事指標（今日出征 ✓/✗ · 連續 N 天 · **本週 X/7** · 穩定連線數〔不含早期連線〕· 最強 pair · **今日連線額外獲得 X 能量**）；不顯示 116/116；無 synapse 誠實空狀態
- [x] 6.2 每日完成儀式 — **移出本變更 scope → follow-up `polish-neurons-connectome-visual`**（spec delta 已移除；ledger + 指標 strip + 文案已覆蓋核心 legibility）
- [x] 6.3 `MazeGrid.tsx` connectome overlay 預設可見（`synapseOverlayOn` 預設 true）+ **傳導 pulse glow**（聽 `connectome.conductionPulse`，rAF loop 1.1s 衰退 boost）+ 舊 synapse「早期連線」grey-blue 細點（`isLegacy` 由 `lastCoFireDate < epoch` 衍生）— 不動拓樸/synapseCell 幾何
- [x] 6.4 **wire 好處可讀性**：(a) 結算傳導 ledger〔DONE — OverviewPage settlement dialog〕；(b) tooltip + (c) ghost line **移出本變更 scope → follow-up `polish-neurons-connectome-visual`**（spec delta 已移除）
- [x] 6.5 Hebbian 連線分享卡：複用 `ShareCardModal` / `character-card`（今日修復 X / 連續 N 天 / 今日連起 A–B / 穩定連線 Y）— 變體/connector 分享屬路線圖 #4，本變更不做
- [x] 6.6 命名分層：記憶地標 / Hebbian 連線（首頁/收藏）·修復連線（出征儀式）/ 印痕變體；`SynapseFormationToast` 等文案改「一起修復」語意
- [x] 6.7 文案全掃：移除「synapse = 自乘 bonus / 同日答對多科形成 synapse」殘留（toast / tooltip / HelpMenu / 教學 overlay / 成就描述 / 角色卡）；改「傳導 / 修復連線」語意

## 7. 持久化 / 同步

- [x] 7.1 新增 meta key：`connectome:dailyRepair:<date>` / `connectome:dailyWiredPairs:<date>` / `conduction:{source,target,wire}:<id>:<date>` / `expeditionStreak` / `expeditionLastCompleteDate` / `connectomeStats`(cache) — 全走 meta、**不 bump Dexie**
- [x] 7.2 把需跨裝置一致的 key 加進 `SYNCED_META_KEYS`（streak / lastCompleteDate / stats cache）；傳導每日 cap accumulator 為 within-day ephemeral（date-keyed、不 sync）；streak 合併語意（LWW by `expeditionLastCompleteDate`，斷天歸零）在 sync adapter 處理
- [x] 7.3 確認 db.synapses 既有 sync adapter 沿用、舊 row 保留不 backfill

## 8. 測試

- [x] 8.1 觸發：出征修復 K=2×2 科 + 有效完成 → 形成 dormant；單科 <K 不配對；未達有效完成 gate 不配對；>cap 只處理 3 條（依優先序）；普通 quiz flip 不 wire；年份回數遠征不 wire
- [x] 8.2 狀態機：跨日共同修復升階（dormant→weak→strong）、同天不雙升、strong 再修復只更新日期
- [x] 8.3 衰退：8 天無共同修復 strong→weak；weak 不消失；降後日期更新（驗證 7 天窗）
- [x] 8.4 streak：有效完成 +1/日、同日不重複、斷天歸零；本週 X/7 衍生正確
- [x] 8.5 **傳導**：weak 6%/strong 12% 套 post-multiplier 批次；`floor(<1)` 不發；三層 cap（線 8/15、來源 45、目標 30）正確夾；不遞迴；不被目標倍率放大；不強化 wire；不算 co-repair；legacy(<epoch) 不傳導；unwired 來源科自己 accrual 不變
- [x] 8.6 能量：移除自乘 synapseBonus 後來源科自己 accrual 與「零 synapse」相同
- [x] 8.7 DMN：synapse 事件不再給抽、variantSlotUnlocked 仍給；出征軸不變
- [x] 8.8 確認無 Dexie bump（`pnpm lint:dexie-fixtures` 不被觸發 / 通過）

## 9. 驗證收尾

- [x] 9.1 `pnpm -r typecheck` + `pnpm --filter @study-rpg/neurons-tw test` 全綠
- [x] 9.2 Chrome MCP smoke：app boot clean + 指標 strip（空狀態 + seeded 狀態皆正確：validated 計入 / legacy 排除 / streak / 本週 X/7 / 今日傳導 +27）+ maze overlay render + SPA 三件套（/dmn 直接 URL + F5 不 404）+ console clean。〔深層 expedition→wire→conduction 由 423 unit tests + seeded read-path 驗證；pulse glow rAF-confirmed〕
- [x] 9.3 確認對面 maze session 的檔全程未被本變更觸碰（`git status`：17 檔全是本變更；maze topology graph.ts/grid-graph.json/circuit-locations/build-tilemap 0 觸碰；commit 時 explicit per-file add）

## Deferred follow-ups → 另開 change `polish-neurons-connectome-visual`（純視覺 polish，非阻塞；spec deltas 已自本變更移除以保 archive 真實；建議照 design-iteration-loop 跟 owner live 調）

- 6.2 每日完成儀式（ritual overlay）— 核心 legibility 已由結算 ledger + 首頁指標 strip + HelpMenu 文案覆蓋
- 6.4(b) 每條線 tooltip（canvas hit-test 較麻煩）
- 6.4(c) 出征選科 ghost line「再修復 X 題即可形成連線」
