## Why

二階 disputed Q（送分題） 的 33 個案例，考選部官方給分指令（例如「※第17題答Ｂ、Ｄ給分。」「※第22題一律給分。」）被上游 PDF→Markdown extractor 錯誤地接在最後一個選項（通常是 D）的文字尾端：

- `109-2-醫學三-內科-Q8` 選項 D = `"7 ※第8題答Ｂ、Ｃ給分。"`
- `108-1-醫學五-外科-Q22` 選項 D = `"糖尿病 醫 ※第22題一律給分。"`
- `108-1-醫學三-內科-Q33` 選項 D = `"加上新型抗凝血藥物... ※第33題一律給分。"`

LLM 在生成 explanation side-car 時拿到這段污染的選項文字，因此 34 個 explanation 的 `**D. ...**` bold heading 也夾帶同樣的 ※ 指令。

「※」開頭的給分附註是有臨床／考試意義的資訊（告訴考生這題官方接受哪些選項），應該保留並出現在「解答／詳解」區塊，**不該污染選項文字**。當下 quiz UI 渲染選項 D 時會把這段附註當作選項一部分顯示，視覺上很奇怪。

修法 scope：純 build-time content pipeline；不動 render code、不動 upstream source `.md`。

## What Changes

- `parseQuestionBlocks` (build.ts) SHALL call `extractGradingNote(optionText)` per option — when matched，從選項中切除「※第N題...給分。」、把附註字串捕獲到 block-scope 變數 `gradingNote`
- 切除附註後的選項文字仍 pipeline 通過既有的 `stripPdfExtractionJunk`（這樣 `糖尿病 醫 ※...` 變 `糖尿病 醫` → 再脫尾巴 → `糖尿病`）
- `ParsedQuestion` interface 新增 optional `gradingNote?: string`
- `buildQuestion` 當 `parsed.gradingNote` 存在時：
  - Prepend「> 📋 考選部給分附註：<note>」blockquote 到 `Question.explanation` 最前面
  - 設 `meta.gradingNote = note`（供未來 UI 想用 structured field 時讀取）
- `stripPdfExtractionJunk` 擴充 Pass 0：strip 「※第N題...給分。」 pattern（與 marker-anchored strip 不同 — 這個只 strip 「※...。」本身，不會 strip 到 `**`/EOS），用來清掉 LLM echo 進 explanation 的 ※ residue
- Rebuild content pack → `dist/{questions,meta,stats}.json` + copy 到 `apps/medexam2-hospital-tw/public/content/medexam2-tw/`

**影響範圍**: 33 個 option（含 ※ leak）+ 34 個 explanation（含 ※ echo）— 跨多個科別的 disputed Q。

## Capabilities

### New Capabilities

（無）

### Modified Capabilities

- `medexam2-corpus-ingestion`: Question parser + Explanation merge 兩項 requirement 收緊用語 — option 字串 SHALL NOT 包含「※...給分」附註；explanation 字串 SHALL prepend 該附註當 blockquote header；`meta.gradingNote` 為 optional structured field

## Impact

**Code**:
- `packages/content-medexam2-tw/scripts/build.ts` — add `extractGradingNote` helper, extend `stripPdfExtractionJunk` Pass 0, extend `ParsedQuestion` + `buildQuestion`

**Generated artifacts**:
- `packages/content-medexam2-tw/dist/{questions,meta,stats}.json` 重建
- `apps/medexam2-hospital-tw/public/content/medexam2-tw/{questions,meta}.json` copy

**Not affected**:
- 一階 (`medexam-tw`) — 用獨立 ingestion pipeline、無同類問題
- Upstream source `.md` files — 不修改
- `QuizModal` / `ExplanationMarkdown` / `BookmarksPage` / `ERConsultDialog` render code — 純資料變化；既有 `⚖️ 送分題` banner 仍照舊顯示
- `content-pack-contract` core capability — 不變（`Question.meta.gradingNote` 是 optional metadata field，沒既有 consumer）
- Cloud sync / SRS / mastery / bookmarks — 無 surface area 接觸（question id 不變）
