# medexam2-corpus-ingestion Specification

## Purpose
TBD - created by archiving change ingest-medexam2-tw-corpus. Update Purpose after archive.
## Requirements

### Requirement: Source corpus structure SHALL be 醫學三–六 × 14 科 markdown layout

The build script SHALL parse questions from `${MEDEXAM2_SOURCE_DIR}/醫學{三,四,五,六}/<科別>/<year>_第<n>次.md` where:

- `MEDEXAM2_SOURCE_DIR` defaults to `~/Desktop/國考/二階國考/二階國考_拆分`
- 14 subjects (科別) = 內科 / 家醫科 / 小兒科 / 皮膚科 / 神經內科 / 精神科 / 外科 / 泌尿科 / 骨科 / 婦產科 / 復健科 / 眼科 / 耳鼻喉科 / 麻醉科
- 4 paper tiers (醫學三/四/五/六) mapping to specific subject groups
- System folders (`_analysis`, `_cache`, `_explainer_cache`, `_explainer_pilot`, `_pdf`, `_scripts`) SHALL be skipped

Files matching `*.explanations.md` SHALL be treated as side-car explanation files (see Requirement: Explanation merge), NOT as question source files.

#### Scenario: System folders are excluded

- **GIVEN** `MEDEXAM2_SOURCE_DIR` contains `_analysis/`, `_cache/`, `醫學三/`
- **WHEN** the build walks the directory tree
- **THEN** `_analysis/` and `_cache/` SHALL NOT be entered
- **AND** only files under `醫學{三,四,五,六}/` SHALL be parsed

#### Scenario: Explanation side-cars are skipped during question parse

- **GIVEN** a directory containing `108_第一次.md` and `108_第一次.explanations.md`
- **WHEN** the question-parse phase runs
- **THEN** only `108_第一次.md` SHALL contribute questions
- **AND** `108_第一次.explanations.md` SHALL be deferred to the explanation-merge phase

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

### Requirement: Explanation side-car SHALL be merged per-question with graceful fallback

For each question file `<basename>.md`, the build script SHALL look for `<basename>.explanations.md`:

- If side-car exists: for each `Q<n>` in the question file, find the matching `## Q<n>` block in the side-car. If found, the `### 選項詳解` block (full markdown content) SHALL be assigned as `Question.explanation` AND `meta.explanationStatus` SHALL be `"ok"`
- If side-car exists but the specific Q<n> is not in it: `Question.explanation` SHALL be a non-empty placeholder string `"詳解生成中（pending LLM generation）。原始題目 / 答案完整可用。"` AND `meta.explanationStatus` SHALL be `"pending"`
- If side-car does not exist at all: same fallback as above

`meta.explanationModel` (if available from side-car frontmatter), `meta.oeHitRate`, and `meta.explanationConfidence` (P1–P5 label extracted from the explanation header) SHALL be carried through into `Question.meta`.

#### Scenario: Question with explanation merged from side-car

- **GIVEN** `108_第一次.md` contains Q1 and `108_第一次.explanations.md` contains a `## Q1` block with `### 選項詳解`
- **WHEN** the build runs
- **THEN** `questions.json` entry for Q1 SHALL have `explanation` = the full markdown of the `### 選項詳解` block
- **AND** `meta.explanationStatus` = `"ok"`
- **AND** `meta.explanationModel` SHALL be set from side-car frontmatter `model` field

#### Scenario: Question without side-car coverage falls back gracefully

- **GIVEN** `108_第一次.md` contains Q1 but `108_第一次.explanations.md` does NOT exist
- **WHEN** the build runs
- **THEN** `questions.json` entry for Q1 SHALL have `explanation` = `"詳解生成中（pending LLM generation）。原始題目 / 答案完整可用。"`
- **AND** `meta.explanationStatus` = `"pending"`
- **AND** Q1 SHALL still be `importedQ` (counted as imported, NOT skipped)

### Requirement: Build artifacts SHALL include questions / subjects / meta / stats JSON

The build SHALL emit four artifacts under `packages/content-medexam2-tw/dist/`:

| File | Content | Consumer |
|---|---|---|
| `questions.json` | `Question[]` — all parsed + merged questions | App runtime via `getContentPack()` |
| `subjects.json` | `Subject[]` — 14 entries with `totalQuestions` populated | App runtime + recruitment banner UI |
| `meta.json` | `ContentPackMeta` — id / displayName / locale / examMeta.stats / credits | App runtime |
| `stats.json` | Per-subject + global statistics (see structure below) | `wire-recruitment-gacha` (affinity threshold defaults), internal tooling |

`stats.json` shape:

```typescript
{
  perSubject: Record<SubjectId, {
    totalQuestions: number,
    explainedQuestions: number,   // count where meta.explanationStatus === "ok"
    coveragePercent: number,      // explained / total × 100
    perYearCounts: Record<string, number>  // "108-1" → count, ...
  }>,
  totalQuestions: number,
  totalSubjects: number,          // SHALL equal 14
  builtAt: string                 // ISO 8601 timestamp
}
```

Build SHALL also copy `{questions,subjects,meta}.json` (NOT `stats.json`) to `apps/medexam2-hospital-tw/public/content/medexam2-tw/` for the app to serve.

#### Scenario: All four artifacts produced

- **WHEN** `pnpm --filter @study-rpg/content-medexam2-tw build` completes successfully
- **THEN** `dist/questions.json`, `dist/subjects.json`, `dist/meta.json`, `dist/stats.json` SHALL all exist
- **AND** `apps/medexam2-hospital-tw/public/content/medexam2-tw/{questions,subjects,meta}.json` SHALL exist (stats.json NOT copied — internal only)

#### Scenario: Stats are derivable from questions + subjects

- **GIVEN** `questions.json` and `subjects.json` are loaded
- **WHEN** stats are computed offline (independent rebuild)
- **THEN** `stats.json.perSubject[subjectId].totalQuestions` SHALL match the count of questions whose `subject` matches `subjectId`
- **AND** `stats.json.totalSubjects` SHALL equal 14
- **AND** `stats.json.perSubject[subjectId].coveragePercent` SHALL equal `(explainedQuestions / totalQuestions) × 100`

### Requirement: License SHALL be locked to CC-BY 4.0 with two-source attribution

The content pack license SHALL be CC-BY 4.0. `packages/content-medexam2-tw/LICENSE.md` SHALL contain:

1. Full CC-BY 4.0 license text (or canonical URL reference)
2. Two distinct source attribution blocks:
   - **題目本文**: 中華民國考選部歷屆考題（公資源 / public exam records）
   - **詳解**: LLM-generated（Claude Haiku 4.5）supervised by 康瑋麟 (WLK), validated via OpenEvidence MCP

`packages/content-medexam2-tw/package.json` `license` field SHALL be `"CC-BY-4.0"` (SPDX identifier).

`meta.json` `credits` array SHALL contain two entries:

```typescript
[
  { name: "中華民國考選部歷屆考題", url: "https://wwwq.moex.gov.tw/...", license: "公資源" },
  { name: "LLM-generated explanations © 康瑋麟 (WLK)", license: "CC-BY-4.0" }
]
```

The license is intentionally permissive (allows commercial reuse with attribution) and distinct from 一階 `content-medexam-tw`'s CC-BY-NC-4.0 (which is restricted to non-commercial because 陽明國考小組's explanations are third-party CC-BY-NC).

#### Scenario: License files match the locked decision

- **WHEN** the build completes
- **THEN** `LICENSE.md` SHALL include CC-BY 4.0 text and both attribution blocks
- **AND** `package.json` `license` field SHALL equal `"CC-BY-4.0"`
- **AND** `meta.json` `credits` array SHALL contain at least the two entries above

### Requirement: Counter output MUST satisfy No-Silent-Errors discipline

At the end of each build, the script SHALL print on its own line:

```
imported: <N>, skipped: <N>, total: <N>
```

Followed by a per-subject summary table with columns: subject name | totalQuestions | explained% | perYear breakdown.

Followed by the gzip size of `questions.json` in bytes and MB.

If `skippedQ > 0` and `MEDEXAM2_ALLOW_SKIPS !== '1'`, the script SHALL exit with non-zero status and print remediation hint (`Re-run with MEDEXAM2_ALLOW_SKIPS=1 after auditing skip log above`).

This requirement implements `~/.claude/imports/coding_principles.md` principle 5 (No Silent Errors) — specifically the rule that "批次處理的 skip counter 一定要最後印出總數".

#### Scenario: Build aborts fail-fast on first run with skips

- **GIVEN** source corpus has 5 parse-failure cases
- **WHEN** `pnpm build` runs without `MEDEXAM2_ALLOW_SKIPS=1`
- **THEN** the script SHALL print 5 console.warn lines (one per skip) + the three-number summary
- **AND** the script SHALL exit with non-zero status
- **AND** the output SHALL include a hint pointing to `MEDEXAM2_ALLOW_SKIPS=1` rerun option

#### Scenario: Build completes clean on opt-in

- **GIVEN** the same 5-skip corpus
- **WHEN** `MEDEXAM2_ALLOW_SKIPS=1 pnpm build` runs
- **THEN** the script SHALL still print the warn lines + summary
- **AND** the script SHALL exit with status 0
- **AND** the operator SHALL document the skip count in the commit message

### Requirement: Question SHALL carry `imagePath` when extracted PNG exists

The build script SHALL set `Question.imagePath` to a relative path under the app's public image dir when a matching PNG file exists on disk, and SHALL leave it `null` (or omit it) otherwise.

Specifically, for each parsed question, after constructing the question id `<year>-<sitting>-<paper>-<subject>-Q<n>`:

1. Compute candidate image path `apps/medexam2-hospital-tw/public/images/medexam2-tw/<id>.png` (absolute path relative to monorepo root)
2. If the file exists (`existsSync`), assign `Question.imagePath = "images/medexam2-tw/<id>.png"` (relative path, app-base-URL prepended at render time)
3. If the file does NOT exist, omit `imagePath` from the question object (or set to `null`); the question is still emitted with all other fields intact

This SHALL apply uniformly to all 6066 questions; questions with `hasImage = false` will normally have no PNG on disk and therefore no `imagePath`, but the spec does not forbid manually adding PNGs for false-negative cases.

The `imagePath` value SHALL be a forward-slash path suitable for browser URL concatenation; absolute filesystem paths SHALL NOT be written into `questions.json`.

#### Scenario: hasImage question with matching PNG gets imagePath set

- **GIVEN** question `108-2-醫學三-內科-Q45` has `hasImage = true`
- **AND** the file `apps/medexam2-hospital-tw/public/images/medexam2-tw/108-2-醫學三-內科-Q45.png` exists
- **WHEN** the build script runs
- **THEN** the question's `imagePath` field SHALL equal `"images/medexam2-tw/108-2-醫學三-內科-Q45.png"`

#### Scenario: hasImage question with no PNG omits imagePath

- **GIVEN** question `109-1-醫學四-外科-Q12` has `hasImage = true`
- **AND** no matching PNG file exists at the expected path
- **WHEN** the build script runs
- **THEN** the question's `imagePath` field SHALL be absent (or `null`)
- **AND** the question SHALL still be emitted with all other fields (id, stem, options, answer, explanation, hasImage, meta) intact

#### Scenario: Plain text question (no hasImage) has no imagePath

- **GIVEN** question `111-2-醫學六-麻醉科-Q3` has `hasImage = false`
- **WHEN** the build script runs
- **THEN** the question's `imagePath` field SHALL be absent (or `null`)
- **AND** no filesystem lookup SHALL be required for plain-text questions (optimization permitted)

### Requirement: `hasImage` detection regex SHALL cover all image-reference patterns

Before applying the detection regex, the build script SHALL strip the following 7 false-positive phrases from the stem (none refer to images):

```
意圖 / 試圖 / 企圖 / 構圖 / 地圖 / 圖書 / 圖表 / 插圖
```

The script SHALL then detect `hasImage` using a whitespace-tolerant regex matching any of:

- Explicit markers: `[圖]` / `（圖）` / `(圖)`
- 附圖 / 上圖 / 下圖 / 左圖 / 右圖
- 圖一/二/三/四/五/六/七/八/九/十/甲/乙/丙/丁/A/B/C/D/E/1/2/3/4/5
- 箭頭所指 / 箭號所指
- 如圖 / 圖示 / 示意圖 / 流程圖 / 圖像 / 圖為
- 圖中 [Ａ-Ｅ / A-E / a-e / ★ / ▲ / △ / ○ / ● / ◇ / ◆ / □ / ■ / ☆ / ◎ / *]
- (心|肌|腦)電圖 + (如|為|顯示如|紀錄如|檢查如) — display verb required to exclude narrative ECG description
- 如下所示 / 如下列圖 / 兩張圖

All matches are whitespace-tolerant (e.g., `附 圖` with intervening space matches `附\s*圖`), because PDF text extraction occasionally inserts spaces mid-word.

Audit history during apply:
- Iteration 1 — original `/\[圖\]|（圖）|\(圖\)|附圖/` → 76 questions
- Iteration 2 — attempted to tighten 附圖 to specific phrasings → 13 false negatives → reverted
- Iteration 3 — broader audit added `下圖`, `如下圖`, `圖N`, `箭號所指`, `如圖` patterns → 76 → 364 (+288 verified genuine)
- Iteration 4 — second audit found whitespace artifacts (`附 圖`) + extra patterns (`心電圖如下`, `圖中Ａ`, `流程圖`, `圖像`, `圖為`, `如下所示`, `兩張圖`) + false-positive guard (`意圖`/`試圖`/...) → 364 → **394** (+30 verified genuine, 0 removed)

No question in the corpus has been observed where any of the matched patterns referred to something other than a visual aid.

#### Scenario: Stem with "如附圖" matches

- **GIVEN** a stem containing the substring `"如附圖所示，胸部 X 光檢查..."`
- **WHEN** the regex matches against the stem
- **THEN** `hasImage` SHALL be `true`

#### Scenario: Stem with "下圖" matches

- **GIVEN** a stem containing the substring `"心電圖顯示如下圖"` or `"血液抹片如下圖所示"`
- **WHEN** the regex matches against the stem
- **THEN** `hasImage` SHALL be `true`

#### Scenario: Stem with "箭號所指" matches

- **GIVEN** a stem containing `"電腦斷層檢查呈現如圖，箭號所指之異常..."`
- **WHEN** the regex matches against the stem
- **THEN** `hasImage` SHALL be `true`

#### Scenario: Stem with numbered figure marker matches

- **GIVEN** a stem containing `"靜態核醫心肌灌流（圖一）及 F-18 FDG 正子掃描（圖二）"`
- **WHEN** the regex matches against the stem
- **THEN** `hasImage` SHALL be `true`

#### Scenario: Marker variants match independently

- **GIVEN** a stem containing `"[圖]"` or `"（圖）"` or `"(圖)"`
- **WHEN** the regex matches
- **THEN** `hasImage` SHALL be `true`

#### Scenario: Whitespace-split "附 圖" still matches

- **GIVEN** a stem from PDF extraction artifacts contains `"如附 圖左、右"` or `"檢查影像如附 圖"`
- **WHEN** the regex matches
- **THEN** `hasImage` SHALL be `true`

#### Scenario: ECG with display verb matches

- **GIVEN** a stem containing `"心電圖如下"` or `"心電圖檢查如下"` or `"心電圖如下所示"`
- **WHEN** the regex matches
- **THEN** `hasImage` SHALL be `true`

#### Scenario: Narrative ECG description does NOT match

- **GIVEN** a stem containing `"心電圖呈現心房顫動"` or `"心電圖出現窄波"` (descriptive only, no display verb)
- **AND** no other matching pattern in the stem
- **WHEN** the regex matches
- **THEN** `hasImage` SHALL be `false`

#### Scenario: False-positive guard excludes 意圖 / 試圖

- **GIVEN** a stem containing `"曾經有自殺意圖"` or `"試圖阻擋對手"`
- **AND** no other matching pattern in the stem
- **WHEN** the regex matches (after stripping the guarded phrase)
- **THEN** `hasImage` SHALL be `false`

### Requirement: Build script SHALL detect option-image markers and emit `hasOptionImages`

The 二階 build script SHALL inspect each parsed question's `options` map. When any option value matches the marker pattern `/_\(圖片或缺失\)_/`, the emitted `Question.hasOptionImages` SHALL be `true`. Otherwise, `hasOptionImages` SHALL be `false`.

The marker `_(圖片或缺失)_` is the upstream PDF-extractor's placeholder for an option whose body is a graphic (not text). Questions with this marker in any option are un-renderable in a text-only UI and SHALL be marked so host apps can exclude them from quiz pools.

Detection SHALL run after the existing option-parser loop and SHALL NOT affect the existing skip rules (questions whose entire options block was replaced with the standalone marker `_(選項缺失或為圖片題；參見原 PDF)_` are still dropped by the existing `< 2 options` guard — those produce no parseable `- A. ...` lines).

#### Scenario: Option containing image-marker flags the question

- **GIVEN** a parsed question with `options = { A: "_(圖片或缺失)_", B: "_(圖片或缺失)_", C: "點", D: "_(圖片或缺失)_" }` (e.g. `109-2-醫學六-耳鼻喉科-Q27`)
- **WHEN** the build script emits the `Question`
- **THEN** the emitted object SHALL include `hasOptionImages: true`

#### Scenario: Option set with no marker yields false

- **GIVEN** a parsed question whose every `options` value is plain medical text
- **WHEN** the build script emits the `Question`
- **THEN** the emitted object SHALL include `hasOptionImages: false`

#### Scenario: Whole-options-block missing pattern is still skipped by existing guard

- **GIVEN** a question body whose `### 選項` region is the literal `_(選項缺失或為圖片題；參見原 PDF)_` standalone line with no `- A. ...` items
- **WHEN** the build script parses the block
- **THEN** zero options SHALL be extracted
- **AND** the existing `< 2 options` skip path SHALL drop the question (no new behavior needed; `hasOptionImages` detection does NOT need to handle this case)

#### Scenario: Built corpus count of flagged questions is stable

- **GIVEN** the 二階 corpus snapshot at `~/Desktop/國考/二階國考/二階國考_拆分/` as of 2026-05-18
- **WHEN** `pnpm --filter @study-rpg/content-medexam2-tw build` runs to completion
- **THEN** exactly 10 questions across 9 papers and 7 subjects (內科 / 外科 / 婦產科 / 家醫科 / 小兒科 / 神經內科 / 耳鼻喉科) SHALL have `hasOptionImages: true` in `dist/questions.json`
- **AND** `imported / skipped / total` counters SHALL match the prior-baseline values (this change is detection-only at build time; questions are not dropped from the pack)
