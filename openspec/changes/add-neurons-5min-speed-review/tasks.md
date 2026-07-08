## 1. 補齊 6 科 kernel 精華（關鍵路徑 — 先行，也順手修好既有 /cram）

- [x] 1.1 盤點 5 個既有 kernel 科（生理/解剖/免疫/寄生蟲/藥理）的精華句密度與寫法，定「每科 ≤5 條」的風格範本（含 `<cite>` 考頻標註慣例）
- [x] 1.2 對 6 缺 kernel 科（生物化學／組織學／胚胎學／病理學／微生物學／公共衛生學）依 `concept-recurrence` 常青概念（`breadth`/tier 排名）派 agent 草擬每科 ≤5 條 kernel 精華一行句（草擬每科 ~8 候選供 owner 審後留 5）
- [x] 1.3 accuracy gate：主 agent 獨立醫學複核（0 error）+ **Codex adversarial review（49 OK / 8 ISSUE / 1 time-sensitive）**；shipping 集 2 修（HBV 核內複製→cccDNA、檢定選擇加 Fisher）已套用；time-sensitive 法定傳染病清單不選
- [x] 1.4 把定稿的 6 科 kernel block（各 5 條）以 `<ul class="kernel">` 寫回既有 fragments（byte-safe prepend，只 ADD kernel block、不動既有 kw/disc/num）
- [x] 1.5 `build:neurons-content` + `verify:cram` PASS（速看 80→86、kernel 5→11、既有 5 科 byte-unchanged）+ Chrome MCP /cram render 確認（病理學 kernel 5 條正確、既有 block 完好）

## 2. Build：一頁式速看 PDF（零新 JSON artifact）

- [ ] 2.1 擴 `packages/content-neurons-tw/scripts/build-cram.ts` 由全 11 科 kernel blocks 產一頁式「進場前一張紙」速看 PDF（同 headless-Chromium pipeline，與現有醫一/醫二完整 A4 PDF 區分）
- [ ] 2.2 PDF 產物併入 `verify:cram` gate（存在性 + 內容 hash 對齊 cram 資料）+ `copy-content.mjs` 同步到 app `public/`
- [ ] 2.3 確認未動 Dexie schema / R2 SCHEMA_VERSION / synced meta key、未新增 `speed-review.json`、未新增 CF Pages assetDir（grep 驗證）

## 3. App UI（獨立路由 + 純讀速看，複用 cram.json）

- [ ] 3.1 新增獨立路由 `/cram/5min`（react-router）；**複用既有 `cram.json` 載入**（`/cram` 已 lazy-fetch，fetch 前綴 `import.meta.env.BASE_URL`），app 端抽各科 kernel items（每科 cap ≤5）組成速看集合
- [ ] 3.2 全螢幕 card-per-subject 滑動 component（11 卡 + 開場/收束卡）+ 11 顆圓點進度（顯示當前與已滑科目）
- [ ] 3.3 純環境沙漏：5 分鐘走完溫和提示、不打斷、無計分/倒數壓力（守 honesty 鐵律）
- [ ] 3.4 弱科個人化：read-only 讀 `everWrong`/`familyMastery`/`recentAccuracyPct` → 弱科前置排序 + 低調標記；零寫入
- [ ] 3.5 精華一行句純讀不可點（無 drill-down / evidence drawer）
- [ ] 3.6 `/cram` 頁加入口按鈕開 5 分鐘速看

## 4. 部署（獨立路由 SPA fallback）

- [ ] 4.1 確認 `/cram/5min` 在 CF Pages static host 的 SPA fallback 設定正確（直接 URL / F5 不 404）——**無新 assetDir 需加**（速看複用既有 cram.json）

## 5. 驗證與收尾

- [ ] 5.1 `pnpm run build:neurons-content` + `verify:cram` 綠；typecheck clean
- [ ] 5.2 為速看抽取/個人化 helper 加 Vitest（11 科覆蓋、每科 ≤5、弱科排序、零寫入）
- [ ] 5.3 Chrome MCP dev smoke：開 `/cram/5min`、滑完 11 卡、沙漏溫和提示、弱科標記；`/cram` 入口可達；**既有 5 科 /cram 呈現不變** + 6 科新增 kernel 正確 render
- [ ] 5.4 **SPA 三件套**：in-app 導航 + 直接 URL `/cram/5min` + F5，dev 先過，**最後一輪在 prod**
- [ ] 5.5 一頁式速看 PDF render 檢查（排版密度、與完整 A4 PDF 區分）
- [ ] 5.6 `/opsx:verify` + `/verify` 收尾 → owner 確認後 commit + merge + deploy
