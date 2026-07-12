## Why

考前的四個核心 surface（考前猜題 `/cram`、考前講義 `/cram/handout`、五分鐘速看 `/cram/5min`、考前救急 RescueScene overlay）分散在題庫 group 的兩個 subtab、一個埋藏按鈕、與首頁 header／promo banner，玩家要「臨考前把該做的事做一輪」得在四處來回，碎片感重。底層三系統剛以 canonical leafId 打通交叉連結（`add-neurons-handout-unit-correspondence`），資料層統一了、UI 層還沒 —— 現在正是把入口收斂成單一「考前中心」的時機。

## What Changes

- **題庫 group subtab 3 → 2**：`考前猜題` + `考前講義` 兩個 subtab 收成單一 `考前中心`（route 仍為 `/cram`）；子項去「考前」前綴消 label soup。
- **`/cram` 重排成 subject-led 考前中心 hub**，首屏由上到下：
  1. **救急狀態條**（顯示各科今日佇列 / 該救哪科；可點進場，開**同一** RescueScene / 同一 plan，不 duplicate dashboard）
  2. **11 科目卡**（每張就地帶 講義／猜題 mini 入口）
  3. **五分鐘速看**升格為**獨立一級入口卡**（置科目卡群下方，跨 11 科、不綁單科、零決策）
  4. **PDF 下載**沉底
- **leaf context 小工具列**（本次做）：topic／押題／紅 chip 被點開後浮一條工具列（看講義｜本單元猜題｜對應練題｜救急狀態），把「紅 chip → 講義 → 本單元猜題」收成可辨識迴路。架在既有 canonical leafId 交叉連結上，零 schema。
- **RescuePromoBanner repurpose**：不移除，改成指向考前中心 hub 的 banner。
- **保留全部既有 deep-link**：救急 chip→講義 leaf、押題→講義 leaf、速看→講義科目、講義 topic→押題 —— 一個都不斷。

**非目標（明確排除）**：不做同畫面 mode-switcher（切診斷/講義/猜題/練題）作主架構；不把救急戰情圖的紅黃灰狀態視覺染進講義（device-local vs 全裝置一致，會造成 iPad「紅字不見了」客訴）；不把 leaf 單元卡做成首頁主瀏覽（68+ leaf 卡牆）；5min 不可做成可選科/可設定。

## Capabilities

### New Capabilities
- `neurons-exam-prep-hub`: 考前中心 hub 的資訊架構 —— 題庫 group subtab 收斂、`/cram` subject-led 首屏版局（救急狀態條 → 科目卡 → 5min 一級卡 → PDF）、救急狀態條的顯示與點擊進場、跨 surface 的 leaf context 小工具列。

### Modified Capabilities
- `neurons-cram-tab`: `/cram` 從「考前猜題」單頁改為「考前中心」hub —— 題庫 group subtab 更名（考前猜題 → 考前中心）、既有「單選 subject filter-chip + 單科 panel」的科目呈現改為 subject-card grid（每卡帶 講義／猜題 mini，選卡展開既有速看/押題 content，content 語意不變）。
- `neurons-anatomy-handout`: 「題庫分頁的考前講義入口」（第三 subtab）REMOVED —— 3→2 subtab 收合後 `考前講義` 不再是獨立 subtab，改由考前中心 hub 的每張科目卡 講義 mini 進入；`/cram` 上的既有 講義 入口按鈕從「動作排單一按鈕」MODIFIED 為 subject-card 內的 per-subject 講義(beta) mini（仍解剖綠系、仍開 `/cram/handout`；label 去「考前」前綴）。
- `neurons-homepage`: 只 scope 一句 —— FamilyPicker header 的「single top-level entry point for rescue」限定為「on the homepage」，讓考前中心 hub 的救急狀態條（驅動同一 global plan store）不與之矛盾。首頁救急 CTA / header 入口 / `?rescue=` return-loop 行為不變（RescuePromoBanner 無 spec requirement，repurpose 屬 implementation-only、不進 delta）。

（`neurons-speed-review` 不列入：其「entry point from /cram」為 generic 要求，升格一級卡仍滿足。`neurons-single-subject-rescue` / `neurons-unit-correspondence` 的 deep-link 為 invariant，全保留、無 delta。）

## Impact

- **App shell / nav**：`apps/neurons-tw/src/App.tsx`（`SUBTAB_GROUPS.bank`、SubTabLayout / GroupNavLink）。
- **Hub 頁**：`apps/neurons-tw/src/routes/CramPage.tsx`（重排成 hub）+ 既有 sub-component（速看/押題 blocks、`CramCalmView.tsx`）。
- **救急整合**：重用 `useRescuePlans` / 抽共用 rescue-chip selector / `openRescue`（來自 `OverviewPage.tsx` / RescueScene 系統）在 hub 呈現狀態條 + 就地 mount RescueScene，**不改** RescueScene 內部、不 route 化 overlay。
- **leaf context 工具列**：full toolbar（看講義｜練題｜救急狀態）在 CramPage 的押題 item；handout 端沿用既有「本單元猜題」reverse-link 當 gateway（`HandoutPage.tsx` **不改** — 迴路已閉合）。**不改** RescueScene 戰情圖 chip 的 handler。
- **Banner**：`RescuePromoBanner.tsx`（repurpose 導向 hub）。
- **不觸及**：R2 SCHEMA_VERSION（維持 28）、Dexie schema、SYNCED_META_KEYS —— 零 sync、零持久化改動。講義 build 的 leaf-anchor gate + region drift check 不動。
- **不破壞**：`neurons-unit-correspondence` 全部 deep-link；RescueScene overlay 形態 + `BASE_URL` full-nav（basename trap）；`neurons-speed-review` 的零決策不變（僅入口位置移動，requirements 不變）。
