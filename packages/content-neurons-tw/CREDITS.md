# Credits — 神經元 RPG Content Pack (一階國考 reskin)

## Question stems (題幹 + 選項 + 答案)
- **Source**: 中華民國考選部歷屆專門職業及技術人員高等考試醫師考試（第一階段）
- **Status**: 國家考試題目屬公資源，無著作權限制

## Explanations (詳解)
- **Source**: 陽明國考考古題小組 — https://sites.google.com/view/ymmedexam/ans
- **License**: 網站著作權聲明「網站內容均由著作權人無償提供，非經允許不得作為營利使用。」
- **Use**: 本 content pack 為**非營利**、**開源**、AGPL-3.0 distribution；保留原作者署名於首頁 credits
- **Contact / Takedown**: 若版權人不同意本 content pack 之使用，請開 GitHub Issue 或聯絡 repo 維護者，承諾 24 hr 內下架相關內容
- **License (this content pack)**: CC-BY-NC-4.0

## AI-generated explanations (115-1 詳解)
- **What**: 115-1（2026 年場次）考選部已公布試題 + 標準答案，但陽明國考考古題小組尚未發布詳解。該 200 題（醫學一/二各 100）之詳解由 **Gemini** 生成、再經跨模型對抗驗證（`reconcile/generate_115.py` + `verify_115.py`）。
- **Provenance**: 每題標 `explanationSource: 'ai-generated'` + `sourceCredit:「考選部（試題與標準答案）+ AI 生成詳解（Gemini，未經陽明審定）」`；App QuizModal 於詳解區塊顯示「🤖 此詳解由 AI 生成，未經陽明國考小組審定，僅供參考」免責標註。
- **Verification**: Gemini 獨立作答與考選部標準答案 199/199 一致（Q66 多選給分、Q95 一律給分除外）；對抗驗證 pass 修正 3 題，低信心題經 owner 審閱。
- **Caveat**: AI 詳解可能含錯誤；以考選部標準答案為準，詳解僅供學習參考。陽明日後發布官方詳解時應替換。

## Question figures (題目附圖)
- **What**: 19 張依賴附圖才能作答的題目（病理切片 / 大體標本 / 解剖示意 / 生化作圖）之圖，自上述官方考選部歷屆試題 PDF 擷取（題幹引用「如圖 / 附圖 / 圖示 / 下圖 / 圖中 / 箭頭」者）。檔案位於 `figures/<question-id>.png`，於 build 時自動對映到該題的 `imagePath`。
- **License / posture**: 比照題庫整體 — **非營利**、CC-BY-NC-4.0、署名、**24 hr takedown SLA**（開 Issue 即下架）。圖內若含第三方 atlas 來源之病理 / 組織切片，依台灣著作權法 §65 合理使用主張 + takedown 兜底。
- **Published figures**（id 即 provenance：`<年>-<場次>-<醫學一/二>-<科目>-<題號>`）:
  - 106-1-醫學二-病理學-Q92、106-2-醫學二-病理學-Q92、106-2-醫學二-病理學-Q99
  - 107-1-醫學二-病理學-Q79、107-1-醫學二-病理學-Q85、107-1-醫學二-病理學-Q94、107-2-醫學二-病理學-Q84
  - 108-1-醫學二-病理學-Q94
  - 110-1-醫學一-生物化學-Q76、110-2-醫學二-病理學-Q97、110-2-醫學二-病理學-Q100
  - 111-2-醫學一-解剖學-Q13、111-2-醫學二-病理學-Q94
  - 113-1-醫學一-組織學-Q46、113-1-醫學二-病理學-Q99、113-1-醫學二-病理學-Q100、113-2-醫學二-病理學-Q92
  - 114-2-醫學一-解剖學-Q29、114-2-醫學二-病理學-Q97
- **Known gaps**:
  - `111-1-醫學一-解剖學-Q29`（皮節示意圖）— 唯一可得來源（北醫詳解）未重現原題附圖，故未收錄；該題仍標 `hasImage: true`，於 App 顯示 `[圖]` placeholder。
  - `111-2-醫學一-生理學-Q57`（心電圖波形概念題）— 原 `**有附圖**：是` 標記為誤標（題幹未引用任何圖、純概念題），build 已改為 `hasImage: false`，不收圖也不顯 placeholder。

## Recovered 詳解 figures (詳解附圖 — 重建)
- **What**: 陽明國考考古題小組詳解內嵌的手繪圖、圖表與教科書截圖（含 Netter 等 atlas 插圖），原 PDF→`questions.json` 擷取時只保留文字、圖片整批遺失（health-check 盤點全 corpus 約 1,764 張 / 1,181 題）。本批為 **pilot 112–114**（638 題 / 935 張），自原始 PDF 以 **render-crop**（按 PDF 顯示樣態裁切，方位/框取正確）還原為 content-hash 命名的 webp，lazy-load 後渲染於詳解文字之後（additive；不更動 `id`/`answer`/`stem`/`options`/`explanation`）。
- **Method / provenance**: `reconcile/healthcheck/`（偵測器 + canonical inventory）→ `extract_figures.py`（render-crop）→ `explanation-figures/manifest.json`（每張記 `provenance{sourcePdf,page,bbox,booklet,category}`）。build 時注入 built `questions.json` 的 `explanationFigures`（source 不動）。
- **License / posture**: 比照詳解整體 — 陽明國考考古題小組詳解屬 **非營利**、CC-BY-NC-4.0、保留署名、**24 hr takedown SLA**（開 Issue 即下架）。圖內若含第三方 atlas（Netter / 教科書）之插圖，依台灣著作權法 **§65 合理使用**（非營利教育、引用必要範圍）主張 + takedown 兜底。
- **Scope note**: 餘約 1,063 題（多數 106–114 booklet）之詳解圖於 follow-up `recover-neurons-explanation-figures-full` 收錄；104–105 booklet 因 layout-parser 未涵蓋暫缺。

## Question bank packaging
- Source corpus: `data/medexam-reconciled/`（考選部-authoritative reconciled artifacts）
- Build script: `scripts/build.ts`（含 figure wiring：`figures/<id>.png` 存在 → 設 `imagePath` + `hasImage`）
- Maintainer: WLK (康瑋麟) / @fireman333

## Notes
- 若使用者於題目選擇 / 詳解內容 / 附圖發現錯誤或版權疑慮，請開 Issue 回報，24 hr 內處理。
