## Why

~3,277 / 4,600 神經元詳解有「句中/詞中硬換行」——原始 陽明 PDF 按欄寬硬斷行，`_extracted` 原樣保留了那些 `\n`（例 `增加合\n成`、`作⽤機\n制`）。Explanation 以 `white-space: pre-wrap` 渲染，這些硬換行就顯示成「跑版」，是 owner 回報「純文字很多換行不美觀」的主因。現有 `normalizeExplanation` 已清掉頁眉頁腳/行尾空白/連續空行，但**刻意未重接硬換行**（既有 spec 因 table-corruption 風險排除了 auto-rejoin）。本 change 在不碰內容、不碰 table 的前提下補上 prose 硬換行重接。

## What Changes

- 在 `packages/content-neurons-tw/scripts/build.ts` 的 `normalizeExplanation` 末尾新增一個 **width-guarded 硬換行重接** 步驟（接在現有去頁眉頁腳 / 去行尾空白 / 收斂連續空行之後）。
- 重接規則（deterministic、whitespace-only，**絕不增刪改任何字元，絕不碰 `id` / `answer` / `stem` / `options`**）：當「前一行不以句末標點（。！？：；…）、收尾括號（）」』]）結尾」**且**「下一行不是新結構項（list marker `(A)` / `1.` / `1°` / `①` / `•` / `→` / `Ref` / `圖` / `表` / `──` 分隔線）」**且**「前一行視覺寬度 ≥ wrap 門檻（~28，確認是 PDF 換行而非短標題/表格欄）」→ 移除該換行重接（CJK 直接接、ASCII 兩側補空格）。
- **保留**：簡解／詳解 `────` 分隔線、編號清單、合法 section header（`參考資料`/`補充` 等）、被打平的表格（短行天生低於寬度門檻，不被碰；表格另由 `neurons-explanation-table-images` 的 crop 處理）、single-char 垂直 run（維持既有排除）。
- 實作後派 audit agents 掃描重接後輸出，回報殘餘誤接 / 結構崩壞 / 疑似 table 受損的題，據此補 guard 規則或手修少數歧義題（agents 為**稽核**角色，不逐題編輯）。
- 不 bump Dexie / R2 schema、不改 runtime 程式、不改 source `questions.json`；純 build-time 文字正規化。

## Capabilities

### New Capabilities
（無）

### Modified Capabilities
- `neurons-corpus-ingestion`: 「Explanation whitespace SHALL be normalized at build time (safe subset)」這條 requirement 擴充 safe subset，加入「重接 width-guarded 長行 prose 硬換行」；同時**保留**既有「不 auto-rejoin single-char 垂直 run（table/word-split 風險）」的排除。即把「長行 wrap 重接」與「single-char 垂直 run」明確區分：前者納入 safe subset、後者仍排除。

## Impact

- **程式**：`packages/content-neurons-tw/scripts/build.ts`（`normalizeExplanation` 一個函式）+ 對應 unit test。
- **內容**：rebuild 後 `apps/neurons-tw/public/content/neurons-tw/questions.json` 的 `explanation` 欄位（~4,065 題 whitespace 改善）。**不改 source** `data/medexam-reconciled/questions.json`。
- **協調風險**：工作樹現有別 session 未提交工作（`public/questions.json` 已改、未追蹤 `explanation-figures/*.webp`）。本 change 只動 `build.ts` + test，**rebuild / archive / commit 等工作樹乾淨或與對方對齊後再做**；git add 一律 explicit per-file，不 `git add -A`。
- **無 schema / runtime / API 影響**；無 breaking change。
