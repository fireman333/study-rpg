## ADDED Requirements

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
