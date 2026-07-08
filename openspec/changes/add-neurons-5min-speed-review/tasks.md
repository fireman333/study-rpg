## 1. 補齊 6 科 kernel 精華（關鍵路徑 — 先行，也順手修好既有 /cram）

- [x] 1.1 盤點 5 個既有 kernel 科（生理/解剖/免疫/寄生蟲/藥理）的精華句密度與寫法，定「每科 ≤5 條」的風格範本（含 `<cite>` 考頻標註慣例）
- [x] 1.2 對 6 缺 kernel 科（生物化學／組織學／胚胎學／病理學／微生物學／公共衛生學）依 `concept-recurrence` 常青概念（`breadth`/tier 排名）派 agent 草擬每科 ≤5 條 kernel 精華一行句（草擬每科 ~8 候選供 owner 審後留 5）
- [x] 1.3 accuracy gate：主 agent 獨立醫學複核（0 error）+ **Codex adversarial review（49 OK / 8 ISSUE / 1 time-sensitive）**；shipping 集 2 修（HBV 核內複製→cccDNA、檢定選擇加 Fisher）已套用；time-sensitive 法定傳染病清單不選
- [x] 1.4 把定稿的 6 科 kernel block（各 5 條）以 `<ul class="kernel">` 寫回既有 fragments（byte-safe prepend，只 ADD kernel block、不動既有 kw/disc/num）
- [x] 1.5 `build:neurons-content` + `verify:cram` PASS（速看 80→86、kernel 5→11、既有 5 科 byte-unchanged）+ Chrome MCP /cram render 確認（病理學 kernel 5 條正確、既有 block 完好）

## 2. Build：一頁式速看 PDF（⏸ DEFERRED — owner 決定 2026-07-08）

> **Deferred to a follow-up change.** 整合掃描發現 task 2.1 假設的「headless-Chromium PDF pipeline」**不存在**：現有醫一/醫二 A4 PDF 是 out-of-band 手工 committed 的 blob（`src/cram/pdf/*.pdf`），`build-cram.ts` 只產 cram.json、不 render PDF。要「同 pipeline」＝從零建 puppeteer/playwright（新重依賴 + render script），scope 超出本 change 核心價值（UI）。owner 選擇先出 UI、PDF 另開 follow-up。
- [ ] 2.1 (deferred) 建 headless-renderer pipeline 產一頁式速看 PDF
- [ ] 2.2 (deferred) PDF 併入 `verify:cram` gate + copy-content 同步
- [x] 2.3 確認未動 Dexie schema / R2 SCHEMA_VERSION / synced meta key、未新增 `speed-review.json`、未新增 CF Pages assetDir（速看複用既有 cram.json）

## 3. App UI（獨立路由 + 純讀速看，複用 cram.json）

- [x] 3.1 新增獨立路由 `/cram/5min`（react-router，在 AnimatedRoutes 外的獨立 `<Routes>` 避開 AnimatePresence mode=wait mount-gate）；**複用既有 `cram.json` 載入**；`buildSpeedReviewCards` 抽各科 kernel items（cap ≤5）
- [x] 3.2 全螢幕 card-per-subject 滑動 component（`SpeedReviewPage`，createPortal→body 逃離 Framer transform；scroll-snap deck，11 卡 + 開場/收束 = 13 張）+ 進度圓點 + ‹›
- [x] 3.3 純環境沙漏：5 分鐘倒數、背景分頁自動暫停、走完溫和提示、不打斷、無計分/壓力（守 honesty 鐵律）
- [x] 3.4 弱科個人化：read-only `listAllMastery()` → 弱科前置排序 + 低調 ⚠ 標記；零寫入（undiagnosed 不浮上、不標記）
- [x] 3.5 精華一行句純讀不可點（無 drill-down / evidence drawer）
- [x] 3.6 `/cram` 頁加入口按鈕開 5 分鐘速看 + scene ✕ 關閉回 /cram

## 4. 部署（獨立路由 SPA fallback）

- [ ] 4.1 確認 `/cram/5min` 在 CF Pages static host 的 SPA fallback 正確（直接 URL / F5 不 404）——prod 驗（**無新 assetDir**，速看複用既有 cram.json）

## 5. 驗證與收尾

- [x] 5.1 `build:neurons-content` + `verify:cram` 綠；typecheck clean（970 tests）
- [x] 5.2 `buildSpeedReviewCards` pure helper + Vitest 6 例（cap ≤5、弱科排序、undiagnosed 不浮不標、無 kernel 略過、color fallback）
- [x] 5.3 Chrome MCP dev smoke：`/cram/5min` scene render、13 卡、新科 kernel（cccDNA/HPV/Fisher）render、沙漏、關閉；`/cram` 入口可達；既有 5 科 /cram 不變
- [ ] 5.4 **SPA 三件套**：in-app 導航 ✓ + 直接 URL ✓ + F5 ✓（dev 全過；**prod 最後一輪待部署後驗**）
- [x] ~~5.5 一頁式速看 PDF render 檢查~~ → 隨 §2 deferred
- [ ] 5.6 commit + merge + deploy + prod 驗
