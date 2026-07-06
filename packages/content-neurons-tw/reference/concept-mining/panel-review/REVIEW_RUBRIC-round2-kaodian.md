# 考點分析 + 問題盤查 rubric（add-neurons-concept-tags §3.4 二輪 panel）

第一輪 panel（Codex+Fable）審過**詞彙骨架**、owner 已拍板拆桶。現在**標註 + 押題資料集已產出**，要你們審**實際考點輸出**、找還有什麼問題，再決定往下做 UI。

## 背景（已知，不用重查）

- 4600 題、23 次考試（104-1…115-1）、11 科、**545 個封閉概念 leaf**。
- 標註 = agy(Gemini flash) 批次分類 + keyword pre-pass；**100% 覆蓋**、跨模型 inter-rater **overlap 92.6%**（各科 ≥80%）。
- 押題主鍵 = **sitting-breadth**（相異考試次數 / 23，multi-label 各概念各計、cap 23）；送分/disputed（138 題）已排除。
- tier 邏輯：`常青必掃`(breadth≥15 且 近3有) / `穩定考點`(其餘 eligible) / `近年新寵`(breadth≤7 且 近3≥2) / `經典但降溫`(breadth≥8 且 **近3=0**) / `low-yield`(breadth<5)。「近3」= 最後 3 次考試(114-1/114-2/115-1)。

## 檔案（本目錄）

- `concept-recurrence.json` — 完整押題資料集。`concepts[]` 每個 = `{subjectId,leafId,zh,en,chapterId,breadth,questionCount,recencyWeightedBreadth,recent3Count,disputedExcluded,tier,testedSittings[]}`；已依 breadth 排序。
- `tag-accuracy-sample.json` — 99 題抽樣，每筆 `{id,subject,stem,ans(正解文字),tags(概念中文名)}`，用來**核標註對不對**。
- `cooling-flags.json` — 50 個 `經典但降溫` 概念（含最後 3 個 tested sittings），要你們判斷是真降溫還是切窗假象。

## 已知一個 tier-window 疑點（請評估）

`opioid-analgesics`(鴉片類止痛藥) breadth 11/23 但被標 `經典但降溫`(近3=0)。查證：它最後一次被考是 **113-2**（第 20 次），只差 1 次落在「近3」窗外 → 被判降溫。這暴露 **「近3」硬切窗** 會把「其實近期有考、只差一格」的概念誤標降溫。請評估：窗要不要放寬到近 4–5 次？或 `經典但降溫` 要求連續空窗更久？

## 你要回答 / 挑的問題（依 lens）

**Codex（資料正確性 / tier 邏輯 / 系統性錯誤 lens）**：
1. **標註準確度**：`tag-accuracy-sample.json` 裡有沒有**標錯**的（tag 與正解考點不符）？點名 qid。估個錯誤率。
2. **tier 邏輯瑕疵**：上述 window 問題外，tier 判準有無其他洞（例 breadth 8 剛好卡邊界、近年新寵門檻 breadth≤7&近3≥2 會不會漏掉/誤收）？
3. **資料完整性**：multi-label 有沒有讓某些概念 breadth 灌水？questionCount vs breadth 有無異常項？
4. **系統性標註偏誤**：有沒有整類概念被系統性標到鄰近 leaf（例某科某章）？

**Fable（考點 pedagogy / 押題可辯護度 / 學生風險 lens）**：
1. **tier 可辯護度**：以醫學生 + 國考現實，`常青必掃`/`經典但降溫`/`近年新寵` 名單站得住腳嗎？點名**明顯錯位**的（該必掃卻沒進、或標降溫但其實還很熱的高頻考點）。
2. **cooling-flags 真假**：50 個降溫概念裡，哪些是真降溫（可標）、哪些是切窗假象或標註漏抓（危險——會叫學生跳過其實還在考的重點）？
3. **押題 readiness**：這份資料集拿去對醫學生喊「這些概念常考」，最大的 credibility 風險在哪？上 UI 前**必修**的是哪幾項？
4. **breadth 頂端**（都 17–19/23）夠不夠銳；有沒有該再拆或該合併的。

## 輸出（**寫檔** + 回摘要）

Codex → `codex-kaodian.json`；Fable → `fable-kaodian.json`。schema：
```json
{ "reviewer":"", "verdict":"ship-to-ui | fix-first | needs-rework",
  "blocking":[{"issue":"","evidence":"qid/concept","fix":""}],
  "recommendations":[{"issue":"","fix":"","severity":"P2|P3|P4"}],
  "tierWindowVerdict":"你對 近3 硬切窗問題的建議",
  "taggingErrorRate":"你在 sample 裡估的錯誤率 + 點名錯的 qid",
  "notes":"" }
```
`blocking` 只放「不修上 UI 會誤導學生 / 押題失真」的。點名具體 qid/concept，精簡，繁體中文。
