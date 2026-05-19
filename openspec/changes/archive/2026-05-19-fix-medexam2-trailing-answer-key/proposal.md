## Why

二階 (`medexam2-hospital-tw`) QuizModal 顯示題目時，多種上游 PDF→Markdown 轉檔殘留物洩漏進選項文字（以及 LLM 從污染選項生成的 explanation `**X. ...**` bold heading）。三大類觀察到的 junk：

1. **Q80 末尾考選部公告附錄** — 兩種 wording variant：
   - 「測驗題標準答案更正 考試名稱：... 題序 01 02 03... 第78題一律給分」
   - 「測驗式試題標準答案 考試名稱：檢驗師、醫事放射師、物理治療師考試...」
2. **每頁頁尾／浮水印／頁碼**洩漏進隨機某題選項，例如：「... 醫 護 【版權所有，翻印必究】 --12--」(『醫 護』是頁首『醫師(二)』/『護理師』被空白拆開的殘片)
3. **單獨殘留的 「醫」/「護」** — 頁首只有一個字漏進選項，例如 `109-1-醫學三-家醫科-Q71` 選項 B 結尾出現空白 + 「護」

**影響範圍**:
- Q80 trailing appendix: 跨 8 個科別 76 個 Q80 中 37+12 = **49 題**（兩個 wording variant）
- 「醫 護」full fragment: **10 題**
- 「【版權所有」watermark: **176 題**
- 「--N--」page number: **69 題**
- 單獨尾巴 「醫」: **159 題**
- 單獨尾巴 「護」: **145 題**
- 部分題同時命中多個 pattern（去重後實際受影響題目 < 上述總和）

修法只在 build-time content pipeline，不動 render code、不動 upstream source `.md`（避免重跑 PDF→MD 流程 + 重新生 explanation side-car）。

## What Changes

- `parseQuestionBlocks` (build.ts) SHALL strip 3 類 PDF extractor 殘留物 out of option text 在 assign 到 `options[optMatch[1]]` 之前
- `parseExplanationsFile` (build.ts) SHALL apply the same strip to the merged explanation `text` 字串 — 注意 explanation 把 junk 包在 `**X. ...**` bold block 內，strip lookahead 須 anchor 在 closing `**` 才不會破壞 markdown bold balance
- Strip 規則 (`stripPdfExtractionJunk` helper)：
  - Pass 1 (marker-anchored): regex 偵測 `測驗式?試?題?標準答案` / `【版權所有` / `--\d+--` / `醫\s+護` 任一即從該點 strip 到 `**` 或 EOS
  - Pass 2 (lone trailing in option ctx): `\s+[醫護](?=\s*$)` strip 單獨尾巴
  - Pass 3 (lone trailing in explanation ctx): `\s+[醫護](?=\*\*)` strip 單獨尾巴 before closing bold
- 保留合法中文結尾「就醫」/「保護」/「照護」/「就診」等（無前置空白 → 不命中）
- Rebuild content pack → `dist/{questions,meta,stats}.json` + copy 到 `apps/medexam2-hospital-tw/public/content/medexam2-tw/`

## Capabilities

### New Capabilities

（無）

### Modified Capabilities

- `medexam2-corpus-ingestion`: 「Question parser SHALL extract YAML frontmatter + structured Markdown blocks」+「Explanation side-car SHALL be merged per-question」兩項 requirement 收緊用語 — option 字串與 explanation 字串 SHALL NOT 包含「測驗題標準答案更正」起頭的考選部公告附錄

## Impact

**Code**:
- `packages/content-medexam2-tw/scripts/build.ts` — add 1 helper `stripAnswerKeyAppendix` + 2 call sites (~5 LOC)

**Generated artifacts**:
- `packages/content-medexam2-tw/dist/{questions,meta,stats}.json` 重建
- `apps/medexam2-hospital-tw/public/content/medexam2-tw/{questions,meta}.json` copy

**Not affected**:
- 一階 (`medexam-tw`) — 用獨立 ingestion pipeline、無同類問題
- Upstream source `.md` files — 不修改（dirty upstream stays dirty; ingestion is the gate）
- `QuizModal` / `ExplanationMarkdown` / `BookmarksPage` / `ERConsultDialog` render code — 純資料變化
- `content-pack-contract` core capability — 不變
- Cloud sync / SRS / mastery / bookmarks — 無 surface area 接觸（question id 不變）
