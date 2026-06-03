# 一階國考題庫 reconcile pipeline（考選部權威化）

把 **考選部官方試題 + 標準答案 + 更正答案** 當權威來源，跟陽明國考考古題小組的詳解 reconcile，產出乾淨的 `../data/medexam-reconciled/{questions,subjects,meta}.json`（content-neurons-tw build 的輸入）。

一次性權威化，2026-05-30 建立。產物已 committed；本目錄保留腳本供日後重跑 / 修題。

## 來源

- **考選部考畢試題查詢平臺**：<https://wwwq.moex.gov.tw/exam/wFrmExamQandASearch.aspx>
  - 醫師(一) 醫學(一)/(二)，106–114 年 × 2 次 = 36 卷（公開試題 / 標準答案 / 更正答案 PDF）
  - 下載座標見 `manifest.json`（每卷 `code` + `c` + `s1`(醫學一) + `s2`(醫學二)；t=Q 試題 / S 答案 / M 更正）
- **陽明詳解**：`~/Desktop/國考/一階國考/陽明國考考古/_extracted/`（CC-BY-NC，僅取詳解）

## 重跑流程

```bash
cd <this dir>
python3 download_all.py        # 依 manifest.json 下載 36 卷 ×{Q,S,M} → pdf/（需 curl -k；PDF 不入 git）
python3 finalize.py            # reconcile + 詳解清理 + 106-1 科目區塊 → out/artifacts/*.json
cp out/artifacts/*.json ../data/medexam-reconciled/
# 然後 repo root：
pnpm --filter @study-rpg/content-neurons-tw build   # 讀 ../data/medexam-reconciled → neurons dist
node apps/neurons-tw/scripts/copy-content.mjs        # dist → app public/
```

依賴：`pymupdf`(fitz)、`scikit-learn`、`numpy`、`pyyaml`。

## 腳本

| 檔 | 作用 |
|---|---|
| `manifest.json` | 36 卷的 exam code + 醫師(一) c/s 座標（考選部內部碼逐年不同，已驗證） |
| `find_cs.py` | 用 PDF header 驗證暴力找 c/s（重抓 / 補新年度時用） |
| `download_all.py` | 依 manifest curl 下載 + 驗證每卷解析出 100 題 |
| `parse_moex.py` | 解析試題 PDF（題幹/選項）+ 標準答案 PDF（全形字母 grid） |
| `reconcile.py` | qNum/內容比對 helper + **詳解清理**（砍 解題者/審稿者/校名頁尾/頁首，保留參考資料）+ 更正答案解析 |
| `reconcile_all.py` | 每卷 qNum 直配 + 內容比對 fallback + 缺題補洞 + acceptedAnswers |
| `subject_clf.py` | 106-1 舊分組科目分類器（34 現代卷訓練；現已被 `finalize.py` 的人工區塊覆寫） |
| `finalize.py` | 定稿：套 106-1 人工科目區塊 + 產 app schema artifacts |

## 重要決策（沿襲必讀）

- **id = 考選部真實座標** `{年}-{次}-{醫學幾}-{科目}-Q{題號}`。modern 年代與陽明一致 → id 不變；106-1 舊分組科目修正 → id 變（舊 SRS/書籤 orphan，已接受）。
- **106-1 是唯一舊分組**（醫二=生理/生化/藥理/病理；醫一含微免/寄生/公衛）。陽明把現代模板套上去 → 科目標籤全錯。`finalize.py` `OLD_106_1` 是人工校正的連續區塊（2026-05-30 逐題定）。
- **更正答案**：一律給分 → `disputed:true`（core 既有欄位）；多選給分 → `acceptedAnswers:[...]`（core 新欄位）。
- **詳解只取陽明、清理 furniture**；題幹/選項/答案一律以考選部為準；缺題（陽明無）補考選部題目、詳解留空。
