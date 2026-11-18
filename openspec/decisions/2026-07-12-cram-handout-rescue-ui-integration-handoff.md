# Handoff — 考前 猜題/講義/救急 UI 整合（NEXT feature，尚未動工）

> 寫給 clear 後 `/spec resume` 接手。**設計諮詢已做（Fable + Codex），尚未 grill / propose / 動工。**
> Owner 指定流程：問 Fable + Codex 意見 → handoff → clear → 下次 `/spec resume`。
> **Resume 後：先跑 `/grill quick`**（plan-phase hard rule，大 scope UI 重排）把 §4 的核心分歧問清楚，再 `/opsx:propose`。

## 1. Feature intent（owner 原話）
「考前猜題、考前講義、考前救急的 UI 三者可以整合得更好」——目前太碎片化。（真機測 unit-correspondence deep-link 已 OK，這是**下一階段的 UI/IA 重排**，非 bug。）

## 2. 現況：4 個「考前」surface 分散各處
| Surface | route / 位置 | 性質 |
|---|---|---|
| 考前猜題 | `/cram`（題庫 subtab）`CramPage.tsx` | 速看 blocks + 押題 items + PDF + 入口按鈕 |
| 考前講義 | `/cram/handout`（題庫另一 subtab）`HandoutPage.tsx` | 全螢幕教學 region→topic |
| 五分鐘速看 | `/cram/5min`（**藏在 /cram 內的按鈕**）`SpeedReviewPage` | 全螢幕一頁掃 |
| 考前救急 | RescueScene overlay（入口在**首頁** header + promo banner）`OverviewPage.tsx` openRescue + `RescueScene.tsx` | device-local 單科救急 |
- Nav 定義：`App.tsx:225-226`（題庫 group subtabs = 考前猜題 + 考前講義）。
- **底層已打通**：三系統已用 canonical leafId 交叉連結（unit-correspondence，本 session 剛 ship，見 [[neurons-handout-unit-correspondence-shipped]]）。資料層統一了，UI 層還沒。

## 3. Fable + Codex 強收斂（8 點，可直接當 scope 骨架）
完整兩份意見存於 `~/coding-scratch/2026-07-12-cram-handout-rescue-ui-opinions.md`（clear 後仍在；resume 後 point owner 或自己讀該檔取細節，勿憑印象）。收斂：
1. **收成單一「考前中心」hub**：題庫 group subtab 3 → 2（題庫 + 考前中心 `/cram`）。
2. **5min 從埋藏按鈕升格為一級卡/入口**（與講義待遇一致）。
3. **救急雙入口、單一系統**：首頁 CTA **保留**（行動導向/每日 check/「該救哪科」判斷），hub **另加**一個唯讀入口/plan strip，兩者開**同一** RescueScene / 同一 plan、不 duplicate dashboard。
4. **MVP = 純導覽/IA 重排，不重寫任何工作流**：nav config + CramPage 首屏重排 + 保留**全部**既有 deep-link + 全螢幕場景照舊。零 schema、零 sync、零 RescueScene 內部改動。
5. **反 mode-switcher 當主架構**（同畫面切 診斷/講義/猜題/練題）——三種全螢幕容器統一是大重構、有 portal/AnimatePresence/basename 前科、切換丟 scroll/心流、焦慮戰情圖污染冷靜講義。可留 v2 或永不做。
6. **反「把戰情圖紅黃灰狀態視覺染進講義」**——救急 device-local vs 講義全裝置一致 → iPad「紅字不見了」必然客訴；**資料打通 ≠ 視覺打通**。
7. **leaf「單元卡」只作 context panel（第二階段）**——不當首頁主瀏覽（68+ leaf 卡牆沒人逛、粒度不一）；可在 topic/押題/chip 被點開後給小工具列（看講義/本單元猜題/對應練題/救急狀態），把「紅chip→講義→猜題」收成可辨識迴路。
8. **5min 不可做成可設定/選科**（價值 = 零決策：開→滑→出門）。

## 4. 唯一實質分歧（grill 要問 owner 的核心）
**hub 首屏的主維度**：
- **Fable = 科目為列**（zoom 為欄）：越接近考試心智是「還有 D 天、要唸 X 科」；功能維度切最上層 = 逼你選科前先選工具，順序反了。hub ≈ 現在 CramPage 重排（救急 strip → 11 科卡各帶講義/猜題 mini → 5min → PDF）。
- **Codex = 功能/目的四卡為主**（救急/猜題/講義/5min）：各模式天然科目粒度不同（救急鎖1科、猜題跨概念收斂、講義科→region→topic、5min 跨11科），科目只作「進入模式後的局部 context」。
→ 兩者**其他 7 點一致**，只差首屏 lead with 科目 vs lead with 功能。grill 問清楚 owner 心智即可定案（也可能是混合：救急 strip + 功能卡 + 科目卡分層，Fable 的 wireframe 其實已含三者）。

## 5. 不可破壞的 invariants（本 session 剛 ship，別回歸）
- **unit-correspondence deep-links**（救急chip→講義leaf、押題→講義leaf、速看→講義科目、講義topic→押題）——重排 nav/hub 時全部保留、別斷。見 [[neurons-handout-unit-correspondence-shipped]] 的 DON'T-revert 清單（含 3 個 Codex-fixed bug + mounted-gate deep-link timing）。
- **RescueScene 維持 overlay（非 route）** + 首頁 `?rescue=<familyId>` return-loop + `BASE_URL` full-nav（basename trap [[neurons-router-basename-root-query-trap]]）。整合只加入口、不 route 化 RescueScene。
- **零 sync**：R2 SCHEMA_VERSION 28、零 Dexie、零 SYNCED_META_KEYS（純導覽重排本就不該碰）。
- **講義 build**：leaf-anchor gate + region drift check（動 CramPage/nav 不影響，但別誤動 content build）。

## 6. Resume 後建議流程
1. `/grill quick`（軟體 pack）問 §4 主維度分歧 + hub scope 邊界（要不要順手做 §7 leaf context panel、promo banner 退場與否、命名「考前中心」vs 其他）。
2. `/opsx:propose add-neurons-exam-prep-hub`（或類似）—— capability 可能是新 `neurons-exam-prep-hub` + MODIFIED `neurons-cram-tab`/`neurons-homepage`；delta 描述 nav 3→2、hub 重排、救急 hub 入口、5min 升格、保留 deep-link。
3. apply → verify（**這次 verify 要含 client-side nav 場景**，別重蹈只驗直接 URL 的坑）→ archive → 停 merge=部署 gate。

## 7. 本 session 已完成（prod, med-study-rpg.com/neurons/）
- `add-neurons-handout-unit-correspondence`（三系統 leaf 級交叉對應）SHIPPED，merge `bcac4adc`；archive `2026-07-12-add-neurons-handout-unit-correspondence`。
- 真機 bug follow-up fix（救急 chip 跳講義停最前 = mounted-gate deep-link timing）SHIPPED，merge `21bef30b`。真機已驗 OK。
- Git：track-neurons 與 origin 同步（0/0）、main 同步。OpenSpec：唯一 in-progress = `eliminate-cross-device-r2-412-storm`（parked，無關）。
