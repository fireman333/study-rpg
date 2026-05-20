## MODIFIED Requirements

### Requirement: Explanation side-car SHALL be merged per-question with graceful fallback

For each question file `<basename>.md`, the build script SHALL look for `<basename>.explanations.md`:

- If side-car exists: for each `Q<n>` in the question file, find the matching `## Q<n>` block in the side-car. If found, the **body of** the `### 選項詳解` block (the markdown content **below** the `### 選項詳解` header line, NOT the header line itself) SHALL be assigned as `Question.explanation` AND `meta.explanationStatus` SHALL be `"ok"`. The `### 選項詳解` header line itself SHALL be stripped because host apps (`QuizModal` / `BookmarksPage` / `ERConsultDialog` via `ExplanationMarkdown`) render their own outer section label (e.g. 「解析」) — including the header would produce a visually redundant double-heading.
- If side-car exists but the specific Q<n> is not in it: `Question.explanation` SHALL be a non-empty placeholder string `"詳解生成中（pending LLM generation）。原始題目 / 答案完整可用。"` AND `meta.explanationStatus` SHALL be `"pending"`
- If side-car does not exist at all: same fallback as above

`meta.explanationModel` (if available from side-car frontmatter), `meta.oeHitRate`, and `meta.explanationConfidence` (P1–P5 label extracted from the explanation header) SHALL be carried through into `Question.meta`.

**PDF-extraction-junk sanitization in explanations**: Because the LLM that generated explanations was fed the polluted option text (see Question-parser requirement), the LLM frequently echoed the same junk inside its `**X. ...**` bold heading blocks. The parser SHALL apply the same three-class strip described in the Question-parser requirement to explanation strings, with one anchoring difference: when the explanation is wrapped in `**X. ... **` bold blocks, the strip lookahead anchors at the next `**` (closing bold marker) instead of end-of-string, to preserve markdown bold-balance. Lone trailing 「醫」/「護」 inside a bold block SHALL be stripped if separated from preceding text by whitespace and immediately followed by `**`.

**Grading-note echo strip**: Any LLM echo of the「※第N題...給分。」directive inside an explanation `**X. ...**` bold block SHALL be stripped from that location (a separate Pass 0 in the sanitization pipeline targets the directive precisely — strips the directive only, NOT everything through closing `**`). The directive content is surfaced once at the top of the explanation via the blockquote prepended by `buildQuestion`; duplicate echoes inside per-option bold headings are visual noise and SHALL be removed.

**Per-paper audit-footer strip (NEW — Pass 4)**: The upstream Haiku-driven explainer pipeline emits a per-paper audit summary at the end of each `<basename>.explanations.md`. The audit summary header is `# # ⚠️ Conflict with official` (rendered without space — escaped here so this requirement block parses cleanly) and lists per-question Haiku-vs-official-answer disagreements detected at generation time. The summary exists for maintainer ground-truth tracking and is intentionally preserved in source side-car files. However, `parseExplanationsFile` bounds each Q-block from `## Q<n>` to either the next `## Q<n>` or `body.length`, so the audit footer is unconditionally captured into the **last question's explanation**. The merged `Question.explanation` text SHALL NOT contain the audit-footer marker line or its trailing disagreement entries; the parser SHALL strip from the preceding `---` horizontal rule through end-of-string.

**Inline per-option grading remark strip (NEW — Pass 5)**: Distinct from the `※第N題...給分。` directive Pass 0 handles, the LLM occasionally emitted a per-option grading remark embedded as a suffix in the 詳解 prose, formatted `※官方允許<letter>給分。` (where `<letter>` matches A-D or fullwidth Ａ-Ｄ). This pattern lacks the `題` digit prefix Pass 0 targets and was not previously stripped. The parser SHALL strip the pattern wherever it appears in 詳解 prose; semantically equivalent maintainer notes belong in the option-level blockquote header rather than per-option prose.

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

#### Scenario: LLM-echoed grading-note inside explanation bold block is stripped

- **GIVEN** an explanation containing `**D. 約99%病患不會成為慢性帶原 ※第17題答Ｂ、Ｄ給分。**\n  - ✗ 錯誤 [P2]`
- **WHEN** the build runs
- **THEN** the merged `explanation` SHALL contain `**D. 約99%病患不會成為慢性帶原**\n  - ✗ 錯誤 [P2]` (※ directive removed from per-option bold heading, bold balance intact)
- **AND** the final `Question.explanation` (after `buildQuestion` prepends the blockquote) SHALL contain the「※第17題答Ｂ、Ｄ給分。」directive exactly once, in the top blockquote header `> 📋 考選部給分附註：...`

#### Scenario: Per-paper audit footer is stripped from last question's explanation

- **GIVEN** a side-car ending with the per-paper audit footer (an H2 header containing `⚠️ Conflict with official` followed by `- **Q<n>**: 官方 X ↔ Haiku Y` entries)
- **WHEN** the build runs and merges the last question's (typically Q80's) explanation
- **THEN** `questions.json` entry for that paper's last Q SHALL have `explanation` ending at the end of D's 詳解 prose
- **AND** the merged `explanation` SHALL NOT contain the substring `Conflict with official` or `↔ Haiku`

#### Scenario: Inline per-option grading remark is stripped from 詳解 prose

- **GIVEN** an explanation containing `**D. Erythema multiforme**\n  - ✗ 錯誤 [P2 頂級]\n  - 詳解：多形紅斑EM major與SJS在臨床上重疊...但在藥物誘發背景下SJS更具體。※官方允許D給分。`
- **WHEN** the build runs
- **THEN** the merged `explanation` SHALL have the D-block 詳解 ending at `...更具體。` (trailing whitespace trimmed)
- **AND** the `explanation` SHALL NOT contain the substring `※官方允許D給分` (or any `※官方允許[A-D]給分。` variant)
- **AND** the grading-credit information (if applicable) SHALL only appear in the top blockquote header that `buildQuestion` prepends from `Question.meta.gradingNote`
