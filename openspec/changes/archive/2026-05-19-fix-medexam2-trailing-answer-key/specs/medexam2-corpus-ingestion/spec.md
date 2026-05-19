## MODIFIED Requirements

### Requirement: Question parser SHALL extract YAML frontmatter + structured Markdown blocks

Each `<year>_第<n>次.md` file SHALL be parsed as:

1. YAML frontmatter (between `---` delimiters) — keys `year` / `sitting` / `paper` / `subject` / `question_count` / `source_pdf` / `parsed_date`
2. Body containing one or more question blocks matching pattern: `## Q<n> [<subspecialty> / <topic>]` followed by stem, options, answer, and Topic label
3. Each question SHALL produce one `Question` object conforming to `content-pack-contract`:
   - `id` = `<民國year>-<sitting>-<paper>-<subject>-Q<n>` (e.g., `108-1-醫學三-內科-Q1`)
   - `subject` = matches `Subject.id` (Chinese name)
   - `stem` = text content between H2 header and options list
   - `options` = `{ A: "...", B: "...", C: "...", D: "..." }` parsed from `- A. ... - B. ... ` lines
   - `answer` = single key from options parsed from `**答案**：<X>` where `<X>` is normally `[A-Z]`. Alternatively `#` (ASCII) or `＃` (fullwidth) indicates a **國考-disputed (送分題) question** — see Disputed-question handling below
   - `explanation` = merged from side-car (see Explanation merge requirement) or placeholder

**Disputed-question handling**: When `**答案**：#` (or `＃`) is encountered, the question SHALL be imported (NOT skipped). The canonical `answer` field SHALL be set to the first option key (typically `"A"`); `meta.disputed` SHALL be set to `true` so downstream UI / scoring can display a disputed badge and award credit for any option chosen. This preserves the question's stem + options + explanation while honoring `content-pack-contract`'s `answer ∈ options` invariant.

**PDF-extraction-junk sanitization**: The upstream PDF→Markdown extractor leaked three classes of non-question content into option text (which also bled into LLM-generated explanations when the LLM echoed the polluted option). The parser SHALL strip the following from every option's text body:

- (a) Q80 trailing answer-key appendix — two wording variants observed: 「測驗題標準答案更正 考試名稱：...」 and 「測驗式試題標準答案 考試名稱：...」. Strip from the marker through end-of-string.
- (b) Per-page watermark, page number, and page-header fragment: any of 「【版權所有，翻印必究】」/「--<n>--」(page number) / 「醫 護」 (page-header subject label split by whitespace). Strip from the first marker through end-of-string.
- (c) Lone trailing 「醫」 or 「護」 — when only one character of the page header leaked in, separated from option content by whitespace. Strip the whitespace + lone character.

Option strings SHALL NOT contain any of: 「測驗(式)?(試)?(題)?標準答案」/「考試名稱」/「【版權所有」/「--<digits>--」/「醫 護」(with whitespace) / a lone trailing 「醫」/「護」 preceded by whitespace. Legit Chinese phrases ending in 「醫」/「護」 without preceding whitespace (e.g. 「就醫」/「保護」/「照護」) SHALL NOT be affected.

#### Scenario: Standard question block parses to conforming Question

- **GIVEN** a question block with valid YAML frontmatter and `## Q1 [...]` body
- **WHEN** the parser processes it
- **THEN** the produced Question SHALL satisfy `content-pack-contract` (non-empty id/subject/stem/options/answer; answer is key in options; options has ≥ 2 keys)

#### Scenario: Malformed question increments skipped counter

- **GIVEN** a question block missing the `**答案**` line OR with answer not in options
- **WHEN** the parser processes it
- **THEN** the question SHALL be skipped (not produced)
- **AND** `console.warn` SHALL print filename + Q<n> + reason
- **AND** `skippedQ` counter SHALL increment by 1
- **AND** if `MEDEXAM2_ALLOW_SKIPS !== '1'`, the build SHALL exit with non-zero status at end

#### Scenario: Disputed answer (#/＃) is preserved as imported data

- **GIVEN** a question block with `**答案**：#` (or fullwidth `＃`)
- **WHEN** the parser processes it
- **THEN** the question SHALL be imported (NOT skipped — `importedQ` increments, NOT `skippedQ`)
- **AND** the resulting `Question.answer` SHALL be the first option key (e.g., `"A"`)
- **AND** `Question.meta.disputed` SHALL be set to `true`
- **AND** explanation merging from side-car SHALL proceed normally if a side-car exists

#### Scenario: Q80 trailing answer-key appendix is stripped from option text

- **GIVEN** an option line containing `- D. 不可以，雖然...妨害病人名譽 測驗題標準答案更正 考試名稱：... 第78題一律給分`
- **WHEN** the parser processes the option
- **THEN** the resulting `options.D` SHALL end after「妨害病人名譽」(trailing whitespace trimmed)
- **AND** `options.D` SHALL NOT contain the substring「測驗題標準答案」or「考試名稱」
- **AND** the question SHALL still be imported normally (not skipped)

#### Scenario: Page-footer junk is stripped from option text

- **GIVEN** an option line containing `- D. 依醫院規定，決定是否對到院前死亡的病人急救 醫 護 【版權所有，翻印必究】 --13--`
- **WHEN** the parser processes the option
- **THEN** the resulting `options.D` SHALL end after「對到院前死亡的病人急救」
- **AND** `options.D` SHALL NOT contain「醫 護」/「【版權所有」/「--13--」

#### Scenario: Lone trailing 醫 or 護 fragment is stripped

- **GIVEN** an option line containing `- B. 確認群體→確認問題→策略規劃→介入實施→評估成效 護`
- **WHEN** the parser processes the option
- **THEN** the resulting `options.B` SHALL end after「評估成效」(no trailing space + 護)

#### Scenario: Legit option ending in 醫 or 護 is preserved

- **GIVEN** an option line containing `- C. 提供機械性保護` (no whitespace before the trailing 護)
- **WHEN** the parser processes the option
- **THEN** the resulting `options.C` SHALL retain the full text「提供機械性保護」unchanged

### Requirement: Explanation side-car SHALL be merged per-question with graceful fallback

For each question file `<basename>.md`, the build script SHALL look for `<basename>.explanations.md`:

- If side-car exists: for each `Q<n>` in the question file, find the matching `## Q<n>` block in the side-car. If found, the **body of** the `### 選項詳解` block (the markdown content **below** the `### 選項詳解` header line, NOT the header line itself) SHALL be assigned as `Question.explanation` AND `meta.explanationStatus` SHALL be `"ok"`. The `### 選項詳解` header line itself SHALL be stripped because host apps (`QuizModal` / `BookmarksPage` / `ERConsultDialog` via `ExplanationMarkdown`) render their own outer section label (e.g. 「解析」) — including the header would produce a visually redundant double-heading.
- If side-car exists but the specific Q<n> is not in it: `Question.explanation` SHALL be a non-empty placeholder string `"詳解生成中（pending LLM generation）。原始題目 / 答案完整可用。"` AND `meta.explanationStatus` SHALL be `"pending"`
- If side-car does not exist at all: same fallback as above

`meta.explanationModel` (if available from side-car frontmatter), `meta.oeHitRate`, and `meta.explanationConfidence` (P1–P5 label extracted from the explanation header) SHALL be carried through into `Question.meta`.

**PDF-extraction-junk sanitization in explanations**: Because the LLM that generated explanations was fed the polluted option text (see Question-parser requirement), the LLM frequently echoed the same junk inside its `**X. ...**` bold heading blocks. The parser SHALL apply the same three-class strip described in the Question-parser requirement to explanation strings, with one anchoring difference: when the explanation is wrapped in `**X. ... **` bold blocks, the strip lookahead anchors at the next `**` (closing bold marker) instead of end-of-string, to preserve markdown bold-balance. Lone trailing 「醫」/「護」 inside a bold block SHALL be stripped if separated from preceding text by whitespace and immediately followed by `**`.

#### Scenario: Question with explanation merged from side-car

- **GIVEN** `108_第一次.md` contains Q1 and `108_第一次.explanations.md` contains a `## Q1` block with `### 選項詳解`
- **WHEN** the build runs
- **THEN** `questions.json` entry for Q1 SHALL have `explanation` = the markdown content **below** the `### 選項詳解` header line (typically starting with `**A. ...**`)
- **AND** `explanation` SHALL NOT start with `### 選項詳解`
- **AND** `meta.explanationStatus` = `"ok"`
- **AND** `meta.explanationModel` SHALL be set from side-car frontmatter `model` field

#### Scenario: Question without side-car coverage falls back gracefully

- **GIVEN** `108_第一次.md` contains Q1 but `108_第一次.explanations.md` does NOT exist
- **WHEN** the build runs
- **THEN** `questions.json` entry for Q1 SHALL have `explanation` = `"詳解生成中（pending LLM generation）。原始題目 / 答案完整可用。"`
- **AND** `meta.explanationStatus` = `"pending"`
- **AND** Q1 SHALL still be `importedQ` (counted as imported, NOT skipped)

#### Scenario: PDF-extraction junk is stripped from explanation bold block

- **GIVEN** an explanation containing `**D. 不可以，雖然...妨害病人名譽 測驗題標準答案更正 考試名稱：... 第78題一律給分**\n  - ✗ 錯誤 [P4 NPC]`
- **WHEN** the build runs
- **THEN** the merged `explanation` SHALL contain `**D. 不可以，雖然...妨害病人名譽**\n  - ✗ 錯誤 [P4 NPC]` (closing `**` preserved, markdown bold balance intact)
- **AND** the `explanation` SHALL NOT contain the substring「測驗題標準答案」or「醫 護」or「【版權所有」
