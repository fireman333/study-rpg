## Why

二階 (`medexam2-hospital-tw`) QuizModal 渲染題目 explanation 時，畫面上「解析」section label 緊接著一行 `### 選項詳解` markdown header — 兩個語意重複的標題堆在一起，視覺冗餘且擠掉了寶貴的閱讀空間。

User 測試實機（live GitHub Pages）回報這個版面問題；fix 僅限 build-time content pipeline、不動 render code。

## What Changes

- `parseExplanationsFile` (build.ts) 找到 `### 選項詳解` header 後 SHALL slice 從**header 之後的下一行**起、不再把 header 本身寫進 `Question.explanation` 字串
- Rebuild content pack → `dist/{questions,meta,stats}.json` + copy 到 `apps/medexam2-hospital-tw/public/content/medexam2-tw/`
- 全部 6080 題 explanation 開頭都從 `### 選項詳解\n\n**A. ...**` 變成 `**A. ...**`

## Capabilities

### New Capabilities

（無）

### Modified Capabilities

- `medexam2-corpus-ingestion`: 「Explanation side-car SHALL be merged per-question」requirement 收緊用語 — explanation 字串 SHALL 不含 `### 選項詳解` header 行本身（host app 已有自己的 section label）

## Impact

**Code**:
- `packages/content-medexam2-tw/scripts/build.ts` — 1 line surgical change in `parseExplanationsFile`

**Generated artifacts**:
- `packages/content-medexam2-tw/dist/{questions,meta,stats}.json` 重建
- `apps/medexam2-hospital-tw/public/content/medexam2-tw/{questions,meta}.json` copy

**Not affected**:
- 一階 (`medexam-tw`) — uses different schema (`### 詳解` not `### 選項詳解`); build pipeline 分離
- `QuizModal` / `ExplanationMarkdown` / `BookmarksPage` / `ERConsultDialog` 顯示 code — 純資料變化
- `content-pack-contract` core capability — 不變（核心 `explanation` field 仍是 markdown string，只是 medexam2 source format 的 quirk 不再洩漏到 string 開頭）
- Cloud sync schema / SRS / mastery — 無 surface area 接觸
