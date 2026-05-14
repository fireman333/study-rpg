## Why

題庫 196/418 題（≈47%）的 frontmatter 標 `hasImage: true`，但 .md 本身沒附圖（陽明國考考古題小組原始抓題就沒附圖）。目前 QuizModal / BossModal 完全不處理這個 flag，玩家讀到這類題目會困惑「題幹好像缺東西」、甚至誤以為是 bug。

雖然 M2 後可能會手動或 OCR 補圖，但當前 MVP 階段必須先讓玩家看得懂、給 reading-mode 一條 skip 通道，不然 dogfood 體驗會被這 47% 題目持續打斷。

## What Changes

- QuizModal / BossModal 偵測 `question.hasImage === true` 時，在題幹上方顯示明顯 banner：「📷 此題原有附圖（題庫尚未匯入）」
- **Reading-mode quiz（非 boss）**：banner 旁邊提供「跳過此題」按鈕；按下後該題不計入正確/錯誤、不寫 SRS card、抽下一題
- **Boss mode**：banner 顯示但 **不允許 skip**（boss 是 fixed 30Q 池 + 倒數計時 + ≥60% pass threshold 契約，skip 會破壞 sample / scoring 邏輯）。玩家仍可正常作答（多數附圖題仍可從文字推測），或留白送出當錯
- Spec 顯式定義 future-state：未來若 image asset 補上（例：`question.imageUrl` 欄位有值），banner 應該被圖片取代；contract 保留可擴充
- 不改動 question schema / build script（`hasImage` 已存在於 ParsedQuestion），純 UI 層

## Capabilities

### New Capabilities

（無）

### Modified Capabilities

- `quiz-runner`: 新增 reading-mode 對 `hasImage` 題目的 banner + skip 行為
- `mini-boss`: 新增 boss-mode 對 `hasImage` 題目的 banner 行為（無 skip）

## Impact

- **Files**:
  - `apps/medexam-tw/src/components/QuizModal.tsx`（加 banner + skip 按鈕 + skip handler）
  - `apps/medexam-tw/src/components/BossModal.tsx`（加 banner，no skip）
  - `apps/medexam-tw/src/styles.css`（banner 樣式）
  - `openspec/specs/quiz-runner/spec.md`（delta：MODIFIED requirement on question rendering）
  - `openspec/specs/mini-boss/spec.md`（delta：MODIFIED requirement on question rendering）
- **No breaking changes**：question schema 不變；既有 quiz / boss 流程不變
- **Engine layer (packages/core)**：不動 — 純 host app 層的 UI 改動
