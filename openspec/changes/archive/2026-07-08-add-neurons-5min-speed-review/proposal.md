## Why

考生在**進考場前的最後 ~5 分鐘**需要的不是練習、也不是 30 分鐘的深讀，而是把最高投報率的重點「掃過一遍」的安心感。目前 neurons-tw 已有完整的考前子系統——`/cram`（速看 + 押題深讀）、今日處方箋（自適應練習）、concept-recurrence（常青必掃）——但**缺一個「進場前純讀速看」的定位**：一個可在 5 分鐘內滑完全 11 科精華、零壓力、可分享的濃縮版。這是既有子系統的最後一塊拼圖，不是新引擎。

## What Changes

- 新增**「5 分鐘速看版考前複習」**——一個獨立路由 `/cram/5min` 的全螢幕、純讀、可滑動速看模式。
- **內容集合為靜態全科同一份**（所有人相同 ~55 條精華一行句 = 每科 5 條 × 11 科），可分享/可截圖；個人化**僅**做順序重排 + 弱科標記（沿用既有 `everWrong` / `familyMastery` / `recentAccuracyPct`），內容集合永不因人而異。
- **精華內容來源＝既有 cram fragments 的 `kernel`（🎯 高頻考古）block，補齊 6 科**：目前 11 科中只有 5 科（生理／解剖／免疫／寄生蟲／藥理）有 `kernel` 精華 block；6 科（生物化學／組織學／胚胎學／病理學／微生物學／公共衛生學）的既有 `/cram` fragments 有 kw/disc/num 內容但**缺 kernel 精華開場**。本 change **把這 6 科的 kernel 精華一行句寫回既有 fragments**（AI 依 `concept-recurrence` 常青概念草擬 + owner 逐條審核，醫學 fact 走 OpenEvidence 查證）——**順手修好既有 `/cram` 那 6 科的結構不一致**。5 分鐘速看的資料源＝**全 11 科補齊後的 kernel block**（每科抽 ≤5 條），是「抽取＋呈現」層，**不另建平行精華資料**。**此 6 科 authoring 是關鍵路徑，非程式工作。**
- **輸出格式**：全螢幕左右滑、一科一卡（11 卡 + 開場/收束卡）、11 顆圓點進度、純環境沙漏（跑完溫和提示、不打斷、零計分/壓力，沿用既有 cram honesty 鐵律）。純讀、不可點開真題。
- **順手產出一張「進場前一張紙」速看 PDF**（同 build pipeline，與現有醫一/醫二完整 A4 詳解 PDF 區分）。
- **零 Dexie / R2 schema 改動、零新資料 artifact**：純 build-time（補 fragments + 擴 `build-cram.ts` 產 PDF）；速看**複用既有 `cram.json`** 的 kernel blocks（`/cram` 已 lazy-fetch，assetDirs 已涵蓋）+ 純讀 UI。

## Capabilities

### New Capabilities
- `neurons-speed-review`: 進考場前 ~5 分鐘的全螢幕純讀速看模式——靜態全科精華集合、一科一卡滑動呈現、環境沙漏、弱科標記、獨立路由 `/cram/5min`，以及對應的一頁式速看 PDF 產出。

### Modified Capabilities
<!-- 無既有 capability 的 requirement 層級行為改變：本 change 純加性，讀取既有 cram / concept-recurrence 資料但不改其 requirement。 /cram 頁面的入口連結屬新 capability 的呈現細節。 -->

## Impact

- **內容 authoring（關鍵路徑）**：6 缺料科（生化/組織/胚胎/病理/微生物/公衛）× ≤5 條 = ~30 條 kernel 精華一行句待草擬 + owner 逐條審核（醫學 fact 走 `/oe`），**寫回既有 `packages/content-neurons-tw/src/cram/fragments/*.html`**。
- **順手修好既有 `/cram`**：那 6 科補上 `kernel`（🎯 高頻考古）block 後，既有考前猜題 tab 的結構回到 11 科一致（原本只有 5 科有精華開場）。
- **資料源複用、零新 artifact**：速看讀**既有 `cram.json`** 的 kernel blocks（補齊後含全 11 科），無新 `speed-review.json`、**無需改 CF Pages `assetDirs`**（cram.json 已在 content assetDir）。`build-cram.ts` 只多產一張一頁式速看 PDF；gate 併入既有 `verify:cram`。
- **新 UI**：`apps/neurons-tw/src` 新增速看 route/component（全螢幕卡片滑動 + 進度圓點 + 沙漏 + 弱科標記）+ `/cram` 頁入口。
- **驗證**：獨立路由 `/cram/5min` 收尾**必跑 SPA 三件套**（in-app 導航 + 直接 URL + F5，最後一輪在 prod；CF Pages static host 無 dev fallback）。
- **不受影響**：Dexie schema、R2 bundle、cloud-sync、今日處方箋、既有 `/cram` 的押題/深讀行為（本 change 只**加** 6 科 kernel 內容、不改 render 契約）。
