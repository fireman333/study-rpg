## Why

考前最後幾天，考生需要「投報率最高的重點」與「最可能重考的方向」，而不是把 4600 題重新掃一遍。目前 neurons-tw 有題庫（做題）但沒有「考前速看 / 押題」的收斂視圖。

我們已用確定性挖掘 + grounded-compression 從 4600 題歷屆考題（民國 104–115）+ 每題 100% 覆蓋的逐選項簡答，產出 11 科的高頻速看重點（每一行可回溯真實考題）。本 change 把它搬進 app，並補上 owner 要的三件事：延續 pixel 主題、一鍵下載 A4 PDF、每條內容連回原始考題與詳解。

> **依賴**：本 change 依賴 `add-neurons-concept-tags`（先行 change）。押題清單的排序來自它的 concept-recurrence 資料集；來源連結分組與押題項目對應的考題來自它的 concept 標註。`add-neurons-concept-tags` 必須先 apply / ship，本 change 才能實作 Phase 1（cram 資料組裝）。

## What Changes

- **題庫變成 subtab group**：頂 nav「題庫」下開兩個 subtab —— `/bank`（現有題庫，行為不變）+ `/cram`（新「考前猜題」）。沿用 App.tsx 既有 `SUBTAB_GROUPS` / `SubTabLayout` pattern。
- **`/cram`「考前猜題」** 每科兩層內容：
  - **速看重點**（已備妥）：X-vs-Y 鑑別表、硬數字/命名速查、關鍵字→答案觸發、必中考古、醫學一骨架 / 公衛公式卡。
  - **押題清單**（消費 `add-neurons-concept-tags` 的 recurrence）：每科依概念層重現度排序的高頻概念，只顯示 raw counts（「23 次考試出現 N 次」），標 tier（常青必掃 / 穩定考點 / 近年新寵 / 經典但降溫）。
  - 版面：subject accordion 單開、醫學一（上午卷）/ 醫學二（下午卷）分區、押題-先-速看-巢狀、手機頂部 sticky 科目快跳、常駐誠實 disclaimer + ⓘ方法論 + 「統計至 115-1」版本戳。
- **來源連結（展開清單）**：每條 cram 內容帶 `sourceQuestionIds`；低彩度計數 chip 兼作證據與下鑽入口（點→年份新→舊 mini-list→點某題→開既有 QuizModal/QuestionReviewCard + 其原始詳解 PDF）。cram 內容單元永遠獨立可讀，來源為選讀。
- **一鍵下載預生成 A4 PDF**：cram 資料為單一真實來源，build 時由同一份資料重生 A4 PDF（headless Chromium 腳本），靜態 asset + 下載鈕。**完全開放、無登入門檻**（2026-07-06 owner 決定：不為 growth 擋考前口碑分享與焦慮考生；曾評估的軟登入 gate 已拿掉）。
- **Build 產物 + validators**：cram 內容 bake 成 typed source → build 生成**獨立 `cram.json`（由 `/cram` lazy-fetch，不併入主 content pack）**+ 重生 PDF；兩個 build-time validator（所有 `sourceQuestionIds` 存在於 built questions.json；PDF 內容 hash 對齊資料）。

## Capabilities

### New Capabilities
- `neurons-cram-tab`: `/cram`「考前猜題」subtab —— 速看重點 + 押題清單 + 展開清單來源連結 + 一鍵 A4 PDF 下載 + 誠實 framing，全程 pixel 主題、手機優先。

### Modified Capabilities
- `content-pack-contract`: 新增 build 產物 `cram.json`（獨立 lazy-fetch，不進主 `getContentPack` 載入路徑）。
- `neurons-deploy`: CF Pages 需把新靜態資源（`cram.json`、預生成 PDF、若有新 `public/` 子目錄）加入 `build-cf-pages-dist.mjs` 的 assetDirs allowlist，否則 prod 靜默 404。

## Impact

- **依賴**: `add-neurons-concept-tags`（concept-recurrence + concept-tags）。題庫 subtab 化的 `/bank` route 與概念搜尋分屬兩 change：概念搜尋在 `add-neurons-concept-tags`，subtab group（/bank + /cram）在本 change（因 `/cram` 才是新增 subtab 的成因）。
- **Code**: `apps/neurons-tw/src/App.tsx`（bank subtab group + `/cram` route + GroupNavLink）；新 `routes/CramPage.tsx` + 元件；復用 `components/QuestionReviewCard.tsx` + QuizModal + PdfPanel；`packages/content-neurons-tw/`（新 `cram-data` typed source + build 產 `cram.json` + `render-cram-pdf` 腳本 + validators）。
- **無 schema/sync 改動**: 純新增靜態內容 + 前端；不 bump Dexie、不動 R2 / SYNCED_META_KEYS / cloud sync。
- **Deploy**: 需驗 CF Pages assetDirs（見 modified `neurons-deploy`）；PDF 為預生成靜態檔。
- **範圍**: 首發兩冊 11 科全上。
