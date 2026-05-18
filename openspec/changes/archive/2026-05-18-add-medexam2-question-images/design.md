## Context

二階國考 6066 題裡有 76 道（1.3%）題幹明示「如附圖」「胸部 X 光檢查如附圖」「結晶物質如附圖所示」等字眼，玩家答題時應該看到對應的 X-ray / CT / 病理切片 / 顯微鏡照 / 皮膚照才能合理選答。

目前的 ingestion 走向：
- 上游 PDF 在 `~/Desktop/國考/二階國考/民國{106-115}_第{1,2}次_醫學{三,四,五,六}.pdf`（~80 個檔）
- 拆分後的 .md 在 `~/Desktop/國考/二階國考/二階國考_拆分/醫學*/<subject>/*.md`
- `.md` 內**沒有** image markdown 連結（grep 0 hits）— 拆分腳本沒抽圖
- `packages/content-medexam2-tw/scripts/build.ts` 把 .md → `questions.json`，目前 `hasImage` 用 regex `/\[圖\]|（圖）|\(圖\)|附圖/` 偵測，但**沒有任何 image 欄位輸出**
- `apps/medexam2-hospital-tw/src/components/QuizModal.tsx` 渲染 `question.stem` 後直接接 options，**沒有 image 區塊**

76 題分布：醫學三 14 / 醫學四 20 / 醫學五 33 / 醫學六 9，影響 10 個科目（外科 20 最多）。

## Goals / Non-Goals

**Goals:**

- 把 76 道二階 hasImage 題的圖從上游 PDF 抽出來、ship 進二階 app、在 QuizRunner 渲染出來
- 抽圖失敗的題不要 break 整個 quiz flow — 走 fallback copy
- 收緊 `hasImage` regex，避免「附圖」當動詞 / 片語的 false positive
- 加 `imagePath` 欄位到 `Question` interface 是 **optional + 向後相容**，不影響一階 medexam-tw

**Non-Goals:**

- 不做一階 medexam-tw 1733 張附圖（23× 規模，另開後續 change）
- 不做點圖放大 / pan / 長按下載 modal（另開 `add-medexam-image-zoom-modal`）
- 不做圖片壓縮優化 pipeline（PyMuPDF 直接 save PNG 即可，每張預估 < 500 KB；如超量再優化）
- 不做 image lazy-loading（76 張總量小，初次 load 可接受）
- 不改動既有 QuizModal 的 doctor partner / subject dropdown / continuous flow 等 requirements

## Decisions

### 1. PyMuPDF native (`fitz`) vs marker / pymupdf4llm

**選 PyMuPDF native。**

- 上游 PDF 內 image 多為 **embedded raster**（X-ray / CT 等臨床影像通常掃描後內嵌），PyMuPDF `page.get_images()` 直接 extract 即可
- marker 是給掃描影像 OCR 用的，這批不是純掃描 PDF
- pymupdf4llm 是給 LLM-friendly markdown 用的，不是 image extraction primary use case
- 完全符合 global CLAUDE.md「PDF Processing」規則：**預設用 PyMuPDF native，僅在掃描/影像 PDF 時用 marker**

**Fallback：**`page.get_images()` 回空 → `page.get_pixmap(dpi=150)` render 整頁為 PNG（適用 pure-scan PDF 或圖被 flatten 進 page background 的情況）

### 2. 圖檔放在 `apps/medexam2-hospital-tw/public/images/medexam2-tw/` vs packages

**選放在 app public/。**

- Vite static asset 標準位置，無需 import 即可走 `<img src>`
- `import.meta.env.BASE_URL` 自動加 `/study-rpg/hospital/` 前綴
- 不污染 packages/ 的 dist（content pack 走 questions.json 邏輯資料、實體圖檔屬於 app deployment artifact）
- 跟現有 `apps/medexam2-hospital-tw/public/content/medexam2-tw/` 目錄結構並列、慣例一致

### 3. `imagePath` 用 relative path vs absolute URL

**選 relative path** `"images/medexam2-tw/<qid>.png"`，渲染時 `${import.meta.env.BASE_URL}${imagePath}` 拼接。

- BASE_URL 變動時不用重 build content pack
- questions.json 內容跟 deploy URL 解耦，未來改 GH Pages → Cloudflare Pages 不影響 content
- React render 一行拼接成本可忽略

### 4. 抽圖失敗的題 — 保留 `hasImage=true` + fallback copy vs 刪 flag

**選保留 + fallback copy。**

- 保留 hasImage 讓未來重抽 / 手動補圖時 build script 能重新偵測 PNG
- Fallback copy 讓玩家知道「這題本應有圖但缺了」，比靜默裝沒事好（principle 5: No Silent Errors）
- 玩家可選擇先跳過、未來補齊後重玩

### 5. `hasImage` regex 收緊範圍

**選保守收緊：移除單獨「附圖」，保留 4 種明確片語 + 3 種 marker 變體。**

```ts
const hasImage = /\[圖\]|（圖）|\(圖\)|如附圖|附圖如|附圖所示|影像如附圖/.test(stem)
```

- 跑 dry-run 對 76 題抽樣，每一題的 stem 都應 match 新 regex（不能漏）
- 跑 dry-run 對全 6066 題，舊 regex match 但新 regex 不 match 的「附圖」字串應為 false positive（手動 sample 5–10 個確認）
- 若發現某些真有圖的題只用單獨「附圖」字（罕見），加入第 8 個 alternative 字串而非還原舊 regex

### 6. dry-run + actual extraction 兩階段 vs 一次跑

**選兩階段。**

- 第一輪 dry-run：log 每題對應 PDF page + image count，**不寫檔**
- 人工 review log，找：
  - PDF 找不到 → 列 NO_PDF 清單給 user 確認檔名格式變體
  - Stem grep 不到 page → 列 STEM_NOT_FOUND 清單
  - 同 page 多張圖 → 列 MULTI_IMG 清單給 user 決定取哪張（或預設取第一張）
- 第二輪 actual extraction：寫 PNG + 印 stats

兩階段成本（~80 PDFs × ~76 questions × open/close）約 2-5 分鐘，不貴。一次跑跑壞了沒得 review。

## Risks / Trade-offs

| Risk | Mitigation |
|---|---|
| 部分題 stem 短 60 字 grep 抓不到 PDF page | Fallback：縮短 excerpt → 20-30 字；仍失敗 → log STEM_NOT_FOUND 進 Manual Backfill TODO |
| 同頁多張圖取錯 — e.g. 取到該 page 的 logo / header 而非實際題目附圖 | 第一輪 dry-run log MULTI_IMG 清單；sample 抽 5 題人工 spot-check；可加「最大尺寸圖優先」heuristic |
| PDF 是純掃描（無 embedded image） | Fallback：`page.get_pixmap(dpi=150)` render 整頁；缺點：題幹文字也會 render 進圖，玩家看會冗餘但仍可用 |
| Bundle 增量過大 → GH Pages deploy 變慢 / quota | 預估 76 × ~200 KB = ~15 MB；若超量用 pillow / pngquant 壓 quality 85（每張 < 100 KB） |
| Image extraction 取到 CMYK colorspace → save PNG corrupt | PyMuPDF code handle：`if pix.n - pix.alpha >= 4: pix2 = fitz.Pixmap(fitz.csRGB, pix); pix2.save()` |
| QuizModal 渲染圖造成 mobile viewport 排版崩壞 | CSS `max-width: 100%; max-height: 50vh; object-fit: contain`；Chrome MCP smoke 在 mobile viewport 驗 |
| 著作權問題（X-ray 影像著作權歸誰） | 國考用途已隱含教學使用授權；CREDITS.md 加 source attribution；CC-BY-NC-4.0 license 涵蓋；萬一被投訴 24h takedown SLA |
| 抽圖過程中 hospital-quiz 渲染 imagePath 但圖檔還沒 ship → 404 | 抽圖完成、PNG 確實落地後才 rebuild questions.json；確認 imagePath 跟 PNG 一對一存在再 build app |
| Dev server 啟動撞已 occupied port (5180-5184 被 dogfood / bug-report) | 用 port 5185 per handoff specification |

## Migration Plan

無 schema migration（`imagePath` 是 optional 新欄位，舊客戶端讀到也不會掛）。

部署順序：

1. PyMuPDF 抽圖 → 76 PNG ship 進 `apps/medexam2-hospital-tw/public/images/medexam2-tw/`
2. build.ts 加 imagePath detection + regex tighten → rebuild questions.json
3. types.ts 加 imagePath optional field
4. QuizModal.tsx 加 conditional render
5. CSS 加 .quiz-modal__image / .quiz-modal__image-missing
6. typecheck + build + Chrome MCP smoke
7. archive

**Rollback**：因為純增加（無 destructive），rollback = revert commit；舊 client 對新欄位 ignore，無 break。

## Open Questions

- **單個 PDF page 多張 embedded image 的 disambiguation 策略**：目前 design 預設「取第一張」+ log review。實際 dry-run 後若發現 > 50% MULTI_IMG 案例都選錯第一張，可能要加 heuristic（取最大尺寸 / 取靠近題幹文字的圖 / 跑視覺 OCR confirm）。先跑 dry-run 看分布再決定。
- **抽圖失敗率上限**：若 > 20% 題目（> 15/76）抽圖失敗，是否該延後 ship 直到先解決根因？目前 design 預設「容許部分失敗、走 fallback copy ship」，但若失敗率高代表 pipeline 設計有誤，需要重新調整。
- **Manual Backfill 流程**：抽圖失敗的題列在 `docs/MEDEXAM2_IMAGES.md` ## Manual Backfill TODO，user 手動丟 PNG 進 `public/images/medexam2-tw/` 後**需要重 build questions.json** 才會被偵測。是否要加 watch script 自動 rebuild？先 manual，等 user 真的常補才優化。
