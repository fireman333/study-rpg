# 一階國考題庫 reconcile pipeline（考選部權威化）

把 **考選部官方試題 + 標準答案 + 更正答案** 當權威來源，跟陽明國考考古題小組的詳解 reconcile，產出乾淨的 `../data/medexam-reconciled/{questions,subjects,meta}.json`（content-neurons-tw build 的輸入）。

一次性權威化 2026-05-30 建立；2026-06-03 擴充 104 / 105 / 115（`expand-neurons-corpus-104-105-115`）。產物已 committed；本目錄保留腳本供日後重跑 / 修題。

## 來源

- **考選部考畢試題查詢平臺**：<https://wwwq.moex.gov.tw/exam/wFrmExamQandASearch.aspx>
  - 醫師(一) 醫學(一)/(二)，104 / 105 / 106–114 / 115-1 = **23 卷次 / 46 書卷 / 4600 題**（公開試題 / 標準答案 / 更正答案 PDF）
  - 下載座標見 `manifest.json`（每卷 `code` + `c` + `s1`(醫學一) + `s2`(醫學二)；t=Q 試題 / S 答案 / M 更正）
  - **104-1 = 例外**：西醫師一階綁在「醫師中醫師分階段」合卷裡，碼 `104030` **c=101**（非 301，圓號探測全 302）。試題用 1101 內嵌字型（題號獨立成行 + PUA 選項符號 ``–`` + 答案 column-major grid）→ 專用 `parse_moex_1101.py`（fitz 取題幹 + PUA 對映選項；`pdftotext -layout` 取答案 grid）。
  - **115-1 = AI 詳解路徑**：考選部有試題 + 答案、陽明尚無詳解。試題由 owner 下載於 `~/Downloads/115020_{1301,2301}.pdf`，詳解由 Gemini 生成 + 跨模型對抗驗證（`generate_115.py` / `verify_115.py` → `out/115/115_explanations.json`），標 `explanationSource:'ai-generated'` + 專屬 sourceCredit（「未經陽明審定」），app QuizModal 顯示 AI 免責標註。
- **陽明詳解**：`~/Desktop/國考/一階國考/陽明國考考古/_extracted/`（CC-BY-NC，僅取詳解）。104/105 為舊分組，extraction 把醫一 bucket 進 `解剖學/`、醫二進 `生理學/` placeholder 資料夾（真科目改由人工區塊定）。

## 重跑流程

```bash
cd <this dir>
python3 download_all.py        # 依 manifest.json 下載全部卷 ×{Q,S,M} → pdf/（需 curl -k；PDF 不入 git）
python3 finalize.py            # reconcile + 詳解清理 + 舊分組科目區塊 + 115 AI 詳解合併 → out/artifacts/*.json
cp out/artifacts/*.json ../data/medexam-reconciled/
# 然後 repo root：
pnpm --filter @study-rpg/content-neurons-tw build   # 讀 ../data/medexam-reconciled → neurons dist
node apps/neurons-tw/scripts/copy-content.mjs        # dist → app public/
```

115 詳解 (`out/115/115_explanations.json`) 是預生成產物；重跑 `finalize.py` 直接讀它，不會重打 Gemini。要重生 115 詳解才跑 `generate_115.py` + `verify_115.py`（需 `~/Downloads/115020_*.pdf`）。

依賴：`pymupdf`(fitz)、`pdftotext`(poppler)、`scikit-learn`、`numpy`、`pyyaml`。

## 腳本

| 檔 | 作用 |
|---|---|
| `manifest.json` | 23 卷次的 exam code + 醫師(一) c/s 座標（考選部內部碼逐年不同，已驗證） |
| `find_cs.py` / `find_104_105.py` | 用 PDF header 驗證暴力找 code/c/s（補新年度時用；104/105 透過考選部搜尋平臺 ASP.NET postback enum 找到合卷碼） |
| `download_all.py` | 依 manifest curl 下載 + 驗證每卷解析出 100 題 |
| `parse_moex.py` | 標準解析：試題 PDF（題幹/選項，`N.`+`A.`）+ 標準答案 PDF（全形字母 grid） |
| `parse_moex_layout.py` | `pdftotext -layout` 解析；修 PyMuPDF 在特定版面 detach 換行 2nd-line 的截斷（115 + 112-2 Q62-64） |
| `parse_moex_1101.py` | 104-1 專用 1101 格式（題號獨立行 + PUA 選項 + column-major 答案 grid） |
| `reconcile.py` | qNum/內容比對 helper + **詳解清理**（砍 解題者/審稿者/校名頁尾/頁首，保留參考資料）+ 更正答案解析 |
| `reconcile_all.py` | 每卷 qNum 直配 + 內容比對 fallback + 缺題補洞 + acceptedAnswers；`SPECIAL_PARSERS`(104-1→1101) + `LAYOUT_FIX`(112-2 Q62-64) + `EXTRA_YM_BUCKETS`(104/105 醫二 placeholder bucket) |
| `subject_clf.py` | 舊分組科目分類器（現代卷訓練）；104-1/105-1 草擬區塊用，邊界再以人工 stem 檢查校正 |
| `generate_115.py` / `verify_115.py` | 115 AI 詳解生成（Gemini 3-model fallback，無 -y）+ 跨模型對抗驗證 |
| `audit_106_114.py` | 掃 106-114 既存截斷題（找到唯一 3 題：112-2 醫一 Q62-64） |
| `finalize.py` | 定稿：套各舊分組人工科目區塊（`OLD_BLOCKS`）+ 合併 115 AI 詳解（`load_115_records`）+ 產 app schema artifacts |

## 重要決策（沿襲必讀）

- **id = 考選部真實座標** `{年}-{次}-{醫學幾}-{科目}-Q{題號}`。modern 年代與陽明一致 → id 不變；舊分組科目修正 → id 由人工區塊定。
- **舊分組卷**（104 / 105 / 106-1）：醫一含微免/寄生/公衛、醫二=生理/生化/藥理/病理。陽明把現代模板套上去 → 科目標籤全錯。`finalize.py` `OLD_BLOCKS` 是人工校正的連續區塊（owner 確認；104/105 醫一 uniform 解剖1-28/胚胎29-32/組織33-41/微免42-74/寄生75-82/公衛83-100，醫二 ±1 邊界視卷）。
- **更正答案**：一律給分 → `disputed:true`（core 既有欄位）；多選給分 → `acceptedAnswers:[...]`（core 新欄位）。
- **詳解來源分兩路**：(a) 104/105/106-114 取陽明、清理 furniture；(b) 115 取 AI 生成（標 provenance）。題幹/選項/答案一律以考選部為準；缺題（陽明無）補考選部題目、詳解留空。
- **112-2 Q62-64**：標準 parser 截斷，用 `LAYOUT_FIX` 逐題以 layout parser 覆寫（不全域換 parser — layout 對乾淨題反而有空白劣化）。regen diff 須確認 106-114 僅這 3 題變動。
