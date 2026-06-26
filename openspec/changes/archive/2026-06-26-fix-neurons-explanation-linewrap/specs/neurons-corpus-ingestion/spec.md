## MODIFIED Requirements

### Requirement: Explanation whitespace SHALL be normalized at build time (safe subset)

The build SHALL normalize each question's `explanation` to remove upstream PDF→text extraction whitespace cruft, applied uniformly to every question. The normalization is a SAFE SUBSET that SHALL: strip per-line trailing whitespace; drop isolated bare 2–3-digit page-number lines (the answer-key page numbers, e.g. a line containing only `82`); drop standalone book-name footer lines (a line that is exactly `醫學一` or `醫學二`, the extraction page footer); drop 陽明 chapter/page-break footer lines injected mid-explanation by the paginated source — a line matching `陽明醫學系<NNN> 級`, `<NNN> 第N次（暑/寒）醫學一/二`, `陽明醫學系歷屆國考詳解`, or `回目錄` (the 陽明醫學系 and 回目錄 forms each optionally prefixed by a page number, e.g. `100 陽明醫學系110 級`); a 第N次 footer line is anchored to the full line so in-prose cross-references like `類似題：108 第二次（暑）醫學二` are kept; collapse runs of blank lines to a single blank line; and trim leading/trailing blank lines.

The safe subset SHALL ALSO rejoin **long hard-wrapped prose lines** — lines the paginated source broke at the PDF column width, leaving mid-sentence / mid-word breaks (e.g. `增加合\n成`, `作⽤機\n制`). This rejoin step SHALL run LAST, after footer/page-furniture removal and blank-line collapse. A line break between two adjacent non-blank lines SHALL be removed (the two lines fused with **no inserted character**) WHEN ALL of the following hold:
- the previous line's visual width (CJK-aware: full/wide/ambiguous = 2, else 1) is at or above a wrap-width threshold (the PDF column width, ~28) — a real wrap, not a short deliberate line / header / table cell; AND
- the previous line does NOT end with sentence-final punctuation (`。！？!?：:；;…`) / a closing bracket (`）)】」』]`) / a URL / a citation page token (e.g. `p.29`) / an option verdict tag (e.g. `A 對` / `B 錯`); AND
- the next line does NOT begin a new structural item — a list/enumeration marker (`(A)`/`（一）`/`A.`/`1.`/`1)`/`1、`/`1°`/`①`), a bullet (`•`/`·`/`＞`/`>`/`→`/`▶`), a section-label / reference heading (`詳解`/`簡解`/`參考資料`/`補充`/`校稿補充`/`筆者的話`/`Ref`/`圖`/`表`/`附圖`/`【`/`《`/`「`), a `Word – ` parallel sub-heading, or a URL / `<`; AND
- neither line is a separator line (≥3 box-drawing / dash / rule characters, e.g. `────────────────`); AND
- the two lines are NOT both CJK-free (a run of all-Latin/digit lines = a flattened table, figure label, or citation block — these SHALL NOT be fused, since Chinese 詳解 prose virtually never spans multiple all-Latin lines); AND
- the boundary is NOT ASCII-alphanumeric on both sides (an ASCII↔ASCII break is LEFT INTACT — a split word `topira|mate`→`topiramate` cannot be distinguished from a word boundary `suppress|appetite`→`suppress appetite`, so no space is guessed).

A question whose 詳解 is a flattened table replaced by an image-crop tier (`explanationTableImages`) SHALL skip the rejoin entirely — its text is a flattened table the crop supersedes, and rejoining table cells would mangle them.

Normalization SHALL NOT add, remove, or alter any content character — only whitespace (stripped trailing spaces, collapsed blank runs, removed wrap newlines), stray bare page-number lines, standalone book-name footer lines, and the enumerated 陽明 page-furniture footers. The whitespace-only invariant is enforced at build time: for every explanation, stripping ALL whitespace from the input equals stripping ALL whitespace from the output. Multi-character section headers (e.g. `參考資料`, `補充`, `筆者的話`, `校稿補充`) SHALL NOT be matched or removed, and (being short / structural lines) SHALL NOT be fused into adjacent prose. Bare SINGLE-digit lines SHALL NOT be dropped (they are flattened table-cell fragments, not page furniture). Vertical single-character-per-line extraction runs (e.g. `依\n栓\n塞`) SHALL be left intact and SHALL NOT be rejoined — the wrap-width threshold keeps each such short line out of scope. The long-line prose rejoin and the single-char vertical run are thus distinct: the former is in the safe subset, the latter remains excluded.

#### Scenario: Whitespace and footer cruft is removed without touching content

- **WHEN** a question explanation contains trailing whitespace, 3+ consecutive blank lines, an isolated bare page-number line, or a standalone `醫學一`/`醫學二` footer line
- **THEN** the built explanation SHALL have per-line trailing whitespace stripped, blank-line runs collapsed to a single blank line, and isolated bare 2–3-digit page-number lines and standalone book-name footer lines removed
- **AND** no content line (any line that is not blank, not an isolated bare page-number, and not a standalone book-name footer) SHALL be added, removed, or altered

#### Scenario: 陽明 chapter/page-break footers are removed mid-explanation

- **WHEN** an explanation contains a 陽明 page-furniture line such as `陽明醫學系110 級`, `108 第二次（暑）醫學二`, `陽明醫學系歷屆國考詳解`, or `回目錄` injected between content lines by the paginated PDF source
- **THEN** the build SHALL drop that line, and the blank lines that surrounded it SHALL collapse so the explanation reads continuously
- **AND** no content line SHALL be altered

#### Scenario: Long hard-wrapped prose lines are rejoined with no inserted character

- **WHEN** an explanation contains a long line (visual width ≥ the wrap-width threshold) that the PDF source broke mid-sentence or mid-word, ending without sentence-final punctuation or a closing bracket, followed by a line that does not begin a new structural item or separator (e.g. `…活化GABA 提升濃度(增加合` then `成、減少代謝酵素活性`)
- **THEN** the build SHALL remove that line break and fuse the two lines with no inserted character (`…活化GABA 提升濃度(增加合成、減少代謝酵素活性`)
- **AND** no content character SHALL be added, removed, or altered other than the removed wrap newline

#### Scenario: Structure, tables, and ambiguous boundaries are preserved across the rejoin

- **WHEN** an explanation contains 簡解/詳解 `────` separators, list/section markers (`1°`, `(A)`, `補充`, `＞`), a flattened table or figure-label run of all-Latin/digit lines, an ASCII↔ASCII line boundary, or belongs to a question with an `explanationTableImages` crop
- **THEN** the build SHALL keep those line breaks intact — no fusion across separators, before list/section markers, after sentence-final punctuation, between two all-Latin lines, across an ASCII↔ASCII boundary, or anywhere in a table-image question (whose rejoin is skipped entirely)

#### Scenario: Bare single-digit and vertical single-char runs are preserved

- **WHEN** an explanation contains a bare single-digit line (a flattened table-cell fragment) or a vertical single-character-per-line run from extraction
- **THEN** the build SHALL leave that line / run unchanged (the safe subset does not drop single digits nor auto-rejoin vertical runs)
