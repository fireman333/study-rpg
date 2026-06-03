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

## Question bank packaging
- Source corpus: `data/medexam-reconciled/`（考選部-authoritative reconciled artifacts）
- Build script: `scripts/build.ts`（含 figure wiring：`figures/<id>.png` 存在 → 設 `imagePath` + `hasImage`）
- Maintainer: WLK (康瑋麟) / @fireman333

## Notes
- 若使用者於題目選擇 / 詳解內容 / 附圖發現錯誤或版權疑慮，請開 Issue 回報，24 hr 內處理。
