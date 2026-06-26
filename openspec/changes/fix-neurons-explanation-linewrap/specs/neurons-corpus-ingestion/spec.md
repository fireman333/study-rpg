## MODIFIED Requirements

### Requirement: Explanation whitespace SHALL be normalized at build time (safe subset)

The build SHALL normalize each question's `explanation` to remove upstream PDF→text extraction whitespace cruft, applied uniformly to every question. The normalization is a SAFE SUBSET that SHALL: strip per-line trailing whitespace; drop isolated bare 2–3-digit page-number lines (the answer-key page numbers, e.g. a line containing only `82`); drop standalone book-name footer lines (a line that is exactly `醫學一` or `醫學二`, the extraction page footer); drop 陽明 chapter/page-break footer lines injected mid-explanation by the paginated source — a line matching `陽明醫學系<NNN> 級`, `<NNN> 第N次（暑/寒）醫學一/二`, `陽明醫學系歷屆國考詳解`, or `回目錄` (the 陽明醫學系 and 回目錄 forms each optionally prefixed by a page number, e.g. `100 陽明醫學系110 級`); a 第N次 footer line is anchored to the full line so in-prose cross-references like `類似題：108 第二次（暑）醫學二` are kept; collapse runs of blank lines to a single blank line; and trim leading/trailing blank lines.

The safe subset SHALL ALSO rejoin **long hard-wrapped prose lines** — lines the paginated source broke at the PDF column width, leaving mid-sentence / mid-word breaks (e.g. `增加合\n成`, `作⽤機\n制`). This rejoin step SHALL run LAST, after the footer/page-furniture removal and blank-line collapse. A line break between two adjacent non-blank lines SHALL be removed (the two lines fused) WHEN ALL of the following hold:
- the previous line's visual width (CJK-aware: full/wide/ambiguous = 2, else 1) is at or above a wrap-width threshold (the PDF column width, ~28), confirming it is a wrapped line rather than a short deliberate line, header, or table cell; AND
- the previous line does NOT end with sentence-final punctuation (`。`/`！`/`？`/`!`/`?`/`：`/`:`/`；`/`;`/`…`) or a closing bracket (`）`/`)`/`】`/`」`/`』`/`]`); AND
- the next line does NOT begin a new structural item — a list/enumeration marker (`(A)`/`（一）`/`A.`/`1.`/`1)`/`1、`/`1°`/`①`/`•`/`·`/`-`/`–`/`—`/`→`/`▶`), a reference/heading token (`Ref`/`參考`/`圖`/`表`/`附圖`/`【`/`《`/`「`), and is NOT a separator line; AND
- neither line is a separator line (a line of ≥3 box-drawing / dash / rule characters, e.g. `────────────────`).

When a break is removed, the join character SHALL be a single space iff both sides are ASCII alphanumerics (an English word split across a wrap); otherwise no character is inserted (CJK has no inter-word space).

Normalization SHALL NOT add, remove, or alter any content character — only whitespace, the join boundary between wrapped prose lines, stray bare page-number lines, standalone book-name footer lines, and the enumerated 陽明 page-furniture footers. Multi-character section headers (e.g. `參考資料`, `補充`, `筆者的話`, `校稿補充`) SHALL NOT be matched or removed, and (being short / structural lines) SHALL NOT be fused into adjacent prose. Bare SINGLE-digit lines SHALL NOT be dropped (they are flattened table-cell fragments, not page furniture). Vertical single-character-per-line extraction runs (e.g. `依\n栓\n塞`) SHALL be left intact and SHALL NOT be rejoined — they are a mix of table-column cells and word-splits, so auto-rejoining risks corrupting content; the wrap-width threshold keeps them out of scope (each such line is far below the threshold). The long-line prose rejoin and the single-char vertical run are thus distinct: the former is in the safe subset, the latter remains excluded.

#### Scenario: Whitespace and footer cruft is removed without touching content

- **WHEN** a question explanation contains trailing whitespace, 3+ consecutive blank lines, an isolated bare page-number line, or a standalone `醫學一`/`醫學二` footer line
- **THEN** the built explanation SHALL have per-line trailing whitespace stripped, blank-line runs collapsed to a single blank line, and isolated bare 2–3-digit page-number lines and standalone book-name footer lines removed
- **AND** no content line (any line that is not blank, not an isolated bare page-number, and not a standalone book-name footer) SHALL be added, removed, or altered

#### Scenario: 陽明 chapter/page-break footers are removed mid-explanation

- **WHEN** an explanation contains a 陽明 page-furniture line such as `陽明醫學系110 級`, `108 第二次（暑）醫學二`, `陽明醫學系歷屆國考詳解`, or `回目錄` injected between content lines by the paginated PDF source
- **THEN** the build SHALL drop that line, and the blank lines that surrounded it SHALL collapse so the explanation reads continuously
- **AND** no content line SHALL be altered

#### Scenario: Long hard-wrapped prose lines are rejoined

- **WHEN** an explanation contains a long line (visual width ≥ the wrap-width threshold) that the PDF source broke mid-sentence or mid-word, ending without sentence-final punctuation or a closing bracket, followed by a line that does not begin a new structural item or separator (e.g. `…活化GABA 提升濃度(增加合` then `成、減少代謝酵素活性`)
- **THEN** the build SHALL remove that line break and fuse the two lines (`…活化GABA 提升濃度(增加合成、減少代謝酵素活性`), inserting a single space only when both sides are ASCII alphanumerics and no character otherwise
- **AND** no character of the content SHALL be added, removed, or altered other than the removed line break and any single ASCII-boundary space

#### Scenario: Structure is preserved across the rejoin

- **WHEN** an explanation contains 簡解/詳解 `────` separator lines, numbered/lettered list items (`1°`, `(A)`), a standalone section header (`參考資料`, `補充`), or a previous line ending in sentence-final punctuation
- **THEN** the build SHALL keep those line breaks intact (no fusion across separators, before list/heading markers, after sentence-final punctuation, or into a short header line)

#### Scenario: Bare single-digit and vertical single-char runs are preserved

- **WHEN** an explanation contains a bare single-digit line (a flattened table-cell fragment) or a vertical single-character-per-line run from extraction (e.g. `依\n栓\n塞`)
- **THEN** the build SHALL leave that line / run unchanged — the safe subset does not drop single digits, and the wrap-width threshold keeps single-char vertical runs out of the prose-rejoin (they are not fused)
