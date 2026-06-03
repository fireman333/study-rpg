## Why

neurons-tw 在 2026-05-25 / 2026-05-28 兩段衝刺後功能上 100% 到位（quiz / connectome / DMN / reading 四個 surface 全 wired，validate 60/60 全綠），但 owner 親自試玩仍覺得「看起來像半成品」。Read-only audit 對齊了這個直覺：5 個 prod-cleanliness 與 1 個 functional bug 共存於目前 `track-neurons` 上的 ship 版本，加上動畫節奏太快（≤ 600ms 的稀有卡 reveal 沒有重量感）、缺少二階風格的 family-level subject picker（玩家現在只能跨 11 family 隨機抽題），整體 polish 水準距離真正能對外推 Threads 公開貼文還差一輪。

本 change 把這一輪 polish 一次收掉：family picker（A）+ 動畫節奏 tune（B）+ prod cleanup（C）+ functional bug fix（D）+ 文案 refresh（E）+ 4 surface deep polish（F）。Owner 已給「全授權變動，Chrome MCP prod-equivalent smoke 驗完才交付」的執行授權，不再逐項 confirm。

## What Changes

- **NEW**: Overview 頁新增 family subject picker — 11-chip grid（11 個 family 對應一階國考的學科分類），點 chip 進 quiz 時 pool 限縮為該 family；「全部」chip 保留作為 default。純 filter mode，不影響 rewards / SRS / DMN trigger / mastery 等下游邏輯。
- **MODIFIED**: RarityRevealModal 5 rarity 動畫節奏 — 全 rarity baseline ≥ 1000ms（先前 P3/P4 可能 ≤ 600ms 一閃即過）；P1 鑽卡升級為 3 圈旋轉、總長 1500ms、ease-out cubic（Pokémon GO catch animation 等級）。
- **REMOVED**: `/motion-demo` route 從 prod navbar 拔除（route 自身可保留給 dev self-verify，但不在 user-facing nav 顯示）。
- **REMOVED**: `ConnectomeDebugPanel` component 整塊從 ConnectomePage 拔除（含「重設存檔」「+1 答對」「時間 +1 天」等 dev-only 按鈕）。
- **REMOVED**: `ConnectomeTreeSvg` 內「⚡ 觸發傳遞」demo 按鈕 + `fireRandomCascade` 函數（跟答題完全脫鉤的 demo-only 死路）。
- **FIX**: `neurons-leaderboard.ts` 推送的 `total_study_min` 由硬寫 `0` 改成讀 `meta['totalStudyMinutes']` — reading-timer 已 ship 但 leaderboard 漏接，排行榜「總閱讀分鐘」欄目前永遠 0。
- **MODIFIED**: OverviewPage footer 文案更新（移除 scaffold-phase 殘留的「下一步：sprite + gacha + leaderboard + achievement + deploy」）。
- **MODIFIED**: 4 surface deep polish — Overview 重排成真正 dashboard / Quiz Modal UI / Connectome 頁 layout / DMN 圖鑑頁 + reveal modal；nav 順序與命名授權重排（若必要）。

## Capabilities

### New Capabilities

無。

### Modified Capabilities

- `neurons-mode`:
  - ADD requirement: family-filter picker entry-point on overview（純 filter 模式 + 「全部」default + 點 chip 後 quiz pool 限縮）
  - ADD requirement: cross-capability rarity reveal animation timing baseline（全 5 rarity ≥ 1000ms baseline + P1 走 3 圈 1500ms ease-out cubic spin spec；適用於 `neuron-variant-gacha` 的 `VariantUnlockModal` 與 `neurons-dmn-fate-cards` 的 `DmnCardReveal` 兩條 reveal path）
  - ADD requirement: prod build SHALL NOT surface dev-only diagnostic UI（motion-demo navbar entry / ConnectomeDebugPanel / cascade demo button 全拔；本要求作為「prod cleanliness contract」）
  - ADD requirement: leaderboard SHALL push real reading minutes（`total_study_min` 由 `meta['totalStudyMinutes']` 來源，非硬寫 0）

## Impact

- **Code**:
  - `apps/neurons-tw/src/routes/OverviewPage.tsx`（family picker UI + footer 文案 + dashboard 重排）
  - `apps/neurons-tw/src/components/FamilyPicker.tsx`（新元件，11-chip grid + 「全部」default + responsive layout）
  - `apps/neurons-tw/src/lib/services/quiz-pool.ts`（新增 family-filter helper；現有 random picker 接受 optional family filter）
  - `apps/neurons-tw/src/components/QuizModal.tsx`（接收 family filter prop + UI polish）
  - `apps/neurons-tw/src/components/RarityRevealModal.tsx`（5 rarity 動畫 timing 調整 + P1 spin animation）
  - `apps/neurons-tw/src/App.tsx`（移除 motion-demo nav entry；nav 重排授權）
  - `apps/neurons-tw/src/routes/ConnectomePage.tsx`（移除 `<ConnectomeDebugPanel>`）
  - `apps/neurons-tw/src/components/connectome/ConnectomeDebugPanel.tsx`（檔案刪除）
  - `apps/neurons-tw/src/components/connectome/ConnectomeTreeSvg.tsx`（移除 `fireRandomCascade` + 「⚡ 觸發傳遞」demo button + UI polish）
  - `apps/neurons-tw/src/lib/services/neurons-leaderboard.ts`（line 107 `total_study_min` 接 `readTotalStudyMinutes()`）
  - `apps/neurons-tw/src/routes/DmnCollectionPage.tsx`（grid + locked silhouette 視覺 polish）
- **APIs**: 無新 API；quiz-pool helper 多接受一個 optional `familyId` 參數
- **Dependencies**: 無新 npm 套件
- **Data / Persistence**: 無 Dexie schema 變動
- **Sync**: 無 R2 bundle schema 變動；只是 `leaderboardProfile` 推送的 `total_study_min` 欄位由硬寫 0 變成讀真實值（D1 schema 本來就接受該欄位）
- **Backwards compat**: 純 feature add + cosmetic polish，無 breaking change
- **Bundle delta**: +~10 KB（FamilyPicker + quiz-pool helper + 動畫 keyframe），-~8 KB（ConnectomeDebugPanel + motion-demo nav + fireRandomCascade 拔除），淨變動 ~+2 KB
- **Deploy path**: 標準 `pnpm deploy:cf` + GH Actions
- **Verify gate**: Chrome MCP 跑 quiz / reading-timer / DMN draw / connectome / leaderboard 五件套 smoke + prod-equivalent F5 / 直接 URL 重新整理（如 family picker 加新 route 則檢查 GH Pages + CF Pages 兩個 deploy 都不噴 404）
