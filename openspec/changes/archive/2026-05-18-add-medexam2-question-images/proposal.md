## Why

二階 hospital quiz 目前 6066 題裡有 **394 題（6.5%）** 題幹明示「如附圖」「下圖」「圖一」「箭號所指」「如圖所示」「心電圖如下」「圖中Ａ」「流程圖」等字眼，但 .md 已拆分檔內**沒有任何圖片 markdown 連結**（grep 0 hits）。玩家碰到這 394 題只能看到「如附圖」/「下圖」三字、無圖可看，等同題目殘缺。圖必須從上游國考 PDF（~80 個於 `~/Desktop/國考/二階國考/民國*.pdf`）直接抽出來。

> **Scope expansion note**：原 proposal scope 為 76 題（僅 `附圖` 標記）。apply 階段使用者要求兩輪深度 audit：
> - 第 1 輪：發現 `下圖` (79) / `如下圖` (50) / `圖一/二/A/B` (11) / `箭號所指` (23) / `如圖` 等 → 76 → 364
> - 第 2 輪：發現 PDF text extraction 把 `附圖` 拆成 `附 圖`（whitespace）漏 match + 漏 `心電圖如下` `圖中Ａ` `流程圖` `圖像` `圖為` `如下所示` `兩張圖` 等 → 364 → **394**
> 
> Extraction pipeline 100% located all 394、PNG 已 ship、bundle 透過 PIL adaptive palette quantize 壓縮從 60 MB 降到 25.73 MB（< 30 MB budget）。Negative-look 過濾 `意圖`/`試圖`/`企圖`/`構圖`/`地圖`/`圖書`/`圖表`/`插圖` 7 種 false positive，驗證 0 removed (從 364 全部仍 hit 新規則)。

一階 medexam-tw 1733 張附圖（仍待另開 change 分階段處理）。

## What Changes

- **新增** `tools/extract-medexam2-images.py` — PyMuPDF native (`fitz`) 抽圖 pipeline，從 question id 反推 PDF / page / embedded raster image，輸出 `apps/medexam2-hospital-tw/public/images/medexam2-tw/<qid>.png`。dry-run + actual extraction 兩階段；multi-image 與純掃描 PDF 的 fallback 都涵蓋
- **新增** `Question.imagePath?: string | null` 欄位於 `packages/core/src/types.ts`（optional，向後相容，一階 questions 不會塞）
- **修改** `packages/content-medexam2-tw/scripts/build.ts`：
  - `buildQuestion` 在輸出時 `existsSync` 偵測 `<qid>.png` 且 `hasImage=true` → 設 `imagePath`（hasImage=false 時即使 PNG 存在也不設，避免渲染不相關 orphan 圖）
  - `hasImage` regex 擴大為：`/\[圖\]|（圖）|\(圖\)|附圖|上圖|下圖|左圖|右圖|圖[一二三四五六七八九十甲乙丙丁ABCDE12345]|箭[頭號]所指|如圖/` 涵蓋 7 大類 image-reference pattern（apply 階段試過收緊到只認「附圖」變體 → 13 false negative；user audit 後又發現 `下圖`/`圖一`/`箭號所指`/`如圖` 等 288 個額外真附圖案例，最終擴大規則）
- **新增** `tools/compress-medexam2-images.py` — PIL adaptive palette quantize (128 colors) 對 PNG 視覺無損壓縮，省 57.6%（60 MB → 25.73 MB raw bytes）
- **新增** `tools/verify-medexam2-images.py` — 對每張 PNG 做圖題對應 cross-check：找 PDF 上 Q-marker rect、下一題 Q-marker rect，驗 image bbox 是否在範圍內。394 PNG 跑出 89.1% trustworthy（304 OK / 47 全頁 render / 3 確認錯 / 40 last-Q 邊界無法驗），3 個錯的列入 Manual Backfill TODO
- **修改** `apps/medexam2-hospital-tw/src/components/QuizModal.tsx`：題幹下方加 `<img>` 渲染（`imagePath` 存在時）+ 缺圖 fallback copy「📷 此題含附圖但尚未補齊（{qid}）」（`hasImage=true` 但 `imagePath=null` 時）
- **新增** CSS rule `.quiz-modal__image` / `.quiz-modal__image-missing`（max-width: 100% / max-height: 50vh 行動裝置 responsive）
- **新增** `packages/content-medexam2-tw/CREDITS.md` 註解：題目附圖抽取自 中華民國考選部 二階國考歷屆 PDF（公資源 / 教學使用授權）
- **新增** `docs/MEDEXAM2_IMAGES.md`：抽圖流程、false positive 清單、Manual Backfill TODO（抽圖失敗的 qid 列表給未來手動補圖）

**Out of scope**（明確不做、另開 change）：
- 一階 medexam-tw 1733 張附圖 → 後續 `add-medexam-tw-question-images`
- 玩家點圖放大 / pan / 長按下載 modal → 後續 `add-medexam-image-zoom-modal`

## Capabilities

### New Capabilities

（無）

### Modified Capabilities

- `medexam2-corpus-ingestion`: 加新 Requirement「Question SHALL carry `imagePath` field when extracted PNG exists」+ 收緊 hasImage detection regex
- `hospital-quiz`: 加新 Requirement「QuizModal SHALL render question image when `imagePath` is present, fallback copy when `hasImage` true but image missing」

## Impact

- **Code**：
  - `packages/core/src/types.ts` (+1 line: `imagePath?: string | null`)
  - `packages/content-medexam2-tw/scripts/build.ts` (~10 lines: regex tighten + imagePath detection + IMAGE_DIR constant)
  - `apps/medexam2-hospital-tw/src/components/QuizModal.tsx` (~15 lines: conditional `<img>` + fallback)
  - `apps/medexam2-hospital-tw/src/styles/quiz-modal.css` 或 inline (~10 lines CSS)
  - `tools/extract-medexam2-images.py` (new, ~100 lines)
- **Build artifacts**：
  - `apps/medexam2-hospital-tw/public/images/medexam2-tw/<qid>.png` × ~76（每張 < 500 KB 預期，總 bundle 增量 ~5–30 MB）
  - `apps/medexam2-hospital-tw/public/content/medexam2-tw/questions.json` 重 build（每個 hasImage 題多一個 `imagePath` key）
- **依賴**：
  - 開發環境需要 Python 3 + `pip install pymupdf`（已驗證 `fitz` 1.26.5 可用）
  - 不影響 runtime / production deps（純 build-time tool）
- **License**：二階 content pack license 已是 CC-BY-4.0，加圖不改變既有授權性質；CREDITS.md 加一行 source attribution 即可
- **Backwards compatibility**：`Question.imagePath` 是 optional，舊一階 medexam-tw questions.json 不會塞、現存 medexam-tw QuizRunner 完全不受影響
- **Failure modes**：
  - 部分題抽圖失敗（PDF page locate fail / multi-image disambiguation 取錯張 / corrupt embedded image）→ 保留 `hasImage=true`、`imagePath=null`，走 fallback copy；不影響其他題目可玩
  - PDF 檔名格式變體（如缺底線） → 抽圖 script 印 NO_PDF log，那題進 Manual Backfill TODO
- **Follow-ups**（不在本 change scope，但寫進 proposal 給未來 ref）：
  - `add-medexam-tw-question-images`：一階 medexam-tw 1733 張附圖（23× 規模，可能分多 change 按科別 ship）
  - `add-medexam-image-zoom-modal`：玩家點圖放大 + pan + 長按下載
