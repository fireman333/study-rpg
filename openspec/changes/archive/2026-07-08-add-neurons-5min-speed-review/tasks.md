## 1. 補齊 6 科 kernel 精華（關鍵路徑 — 先行，也順手修好既有 /cram）

- [x] 1.1 盤點 5 個既有 kernel 科（生理/解剖/免疫/寄生蟲/藥理）的精華句密度與寫法，定「每科 ≤5 條」的風格範本（含 `<cite>` 考頻標註慣例）
- [x] 1.2 對 6 缺 kernel 科（生物化學／組織學／胚胎學／病理學／微生物學／公共衛生學）依 `concept-recurrence` 常青概念（`breadth`/tier 排名）派 agent 草擬每科 ≤5 條 kernel 精華一行句（草擬每科 ~8 候選供 owner 審後留 5）
- [x] 1.3 accuracy gate：主 agent 獨立醫學複核（0 error）+ **Codex adversarial review（49 OK / 8 ISSUE / 1 time-sensitive）**；shipping 集 2 修（HBV 核內複製→cccDNA、檢定選擇加 Fisher）已套用；time-sensitive 法定傳染病清單不選
- [x] 1.4 把定稿的 6 科 kernel block（各 5 條）以 `<ul class="kernel">` 寫回既有 fragments（byte-safe prepend，只 ADD kernel block、不動既有 kw/disc/num）
- [x] 1.5 `build:neurons-content` + `verify:cram` PASS（速看 80→86、kernel 5→11、既有 5 科 byte-unchanged）+ Chrome MCP /cram render 確認（病理學 kernel 5 條正確、既有 block 完好）

## 2. Build：一頁式速看 PDF

> **完成（2026-07-08）。** 對齊既有醫一/醫二 A4 PDF 的紀律 —— 那是 out-of-band、本機 render、git-committed 的 blob（`src/cram/pdf/*.pdf`），**刻意不進 CI**（CI 無 headless Chromium，render 會 404 prod 下載）。本 change 照同一 pattern：新增本機 render script，產一張 committed PDF blob，**不**把 renderer 接進 `pnpm build` / `build-cram.ts`（後者維持 CI-safe、不 import puppeteer）。
- [x] 2.1 本機 render script `scripts/render-speed-review-pdf.mjs`（讀 `dist/cram.json` 的 11 科 kernel、EXAM_PAPER_ORDER 排序、2 欄 A4 一頁；renderer = headless Chrome `--print-to-pdf`，優先用已快取的 Playwright chrome-headless-shell → Google Chrome，**零新 npm 依賴**）→ 產出 `src/cram/pdf/考前速看-5分鐘.pdf`（1 頁 A4、890 KB、55 條精華）。package script `render:speed-review-pdf`（手動跑、不進 CI/build）。
- [x] 2.2 PDF 併入 `verify:cram` gate（check #6：blob 存在 + >5KB）+ copy-content 同步（`copy-content.mjs` 已 glob 全部 `src/cram/pdf/*.pdf` → `public/content/neurons-tw/cram-pdf/`，無需改）+ CramPage / SpeedReviewPage 加下載連結。
- [x] 2.3 確認未動 Dexie schema / R2 SCHEMA_VERSION / synced meta key、未新增 `speed-review.json`、未新增 CF Pages assetDir（速看複用既有 cram.json）

## 3. App UI（獨立路由 + 純讀速看，複用 cram.json）

- [x] 3.1 新增獨立路由 `/cram/5min`（react-router，在 AnimatedRoutes 外的獨立 `<Routes>` 避開 AnimatePresence mode=wait mount-gate）；**複用既有 `cram.json` 載入**；`buildSpeedReviewCards` 抽各科 kernel items（cap ≤5）
- [x] 3.2 全螢幕 card-per-subject 滑動 component（`SpeedReviewPage`，createPortal→body 逃離 Framer transform；scroll-snap deck，11 卡 + 開場/收束 = 13 張）+ 進度圓點 + ‹›
- [x] 3.3 純環境沙漏：5 分鐘倒數、背景分頁自動暫停、走完溫和提示、不打斷、無計分/壓力（守 honesty 鐵律）
- [x] 3.4 弱科個人化：read-only `listAllMastery()` → 弱科前置排序 + 低調 ⚠ 標記；零寫入（undiagnosed 不浮上、不標記）
- [x] 3.5 精華一行句純讀不可點（無 drill-down / evidence drawer）
- [x] 3.6 `/cram` 頁加入口按鈕開 5 分鐘速看 + scene ✕ 關閉回 /cram

## 4. 部署（獨立路由 SPA fallback）

- [x] 4.1 `/cram/5min` 在 CF Pages static host SPA fallback 正確（prod 直接 URL / F5 皆 render，非 404）——**無新 assetDir**（複用既有 cram.json）

## 5. 驗證與收尾

- [x] 5.1 `build:neurons-content` + `verify:cram` 綠；typecheck clean（970 tests）
- [x] 5.2 `buildSpeedReviewCards` pure helper + Vitest 6 例（cap ≤5、弱科排序、undiagnosed 不浮不標、無 kernel 略過、color fallback）
- [x] 5.3 Chrome MCP dev smoke：`/cram/5min` scene render、13 卡、新科 kernel（cccDNA/HPV/Fisher）render、沙漏、關閉；`/cram` 入口可達；既有 5 科 /cram 不變
- [x] 5.4 **SPA 三件套 prod 全綠**：in-app 導航 ✓ + 直接 URL ✓ + F5 ✓（dev + prod `med-study-rpg.com/neurons/cram/5min` 皆過；prod 帳號實測弱科重排「胚胎學」排首 + ⚠ 標記生效）
- [x] 5.5 一頁式速看 PDF render 檢查：`render:speed-review-pdf` 產出 1 頁 A4（`pdfinfo` Pages=1、A4）、pdftoppm 預覽 11 科皆在、`verify:cram` PASS（含 PDF check #6）、typecheck clean。
- [x] 5.6 UI commit（`72237e25`）+ merge + push（`fe9862c6`）+ CF Pages deploy success + prod SPA 三件套驗 ✓。§2 PDF 於 2026-07-08 補齊（本機 render blob）。剩 `/opsx:verify` + archive。
