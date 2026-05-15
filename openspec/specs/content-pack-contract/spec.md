# content-pack-contract Specification

## Purpose
TBD - created by archiving change lock-content-pack-contract. Update Purpose after archive.
## Requirements
### Requirement: Question interface shape is fixed

The exported `Question` type from `@study-rpg/core` SHALL contain exactly these fields with these semantics:

| Field | Type | Required | Semantics |
|---|---|---|---|
| `id` | `string` (`QuestionId` alias) | yes | Stable unique identifier across builds; format SHOULD be `<year>-<session>-<book>-<subject>-Q<n>` |
| `subject` | `string` (`SubjectId` alias) | yes | Must match a `Subject.id` in the same content pack |
| `stem` | `string` | yes | Question text; markdown allowed |
| `options` | `Record<string, string>` | yes | E.g. `{ A: "...", B: "...", C: "...", D: "..." }`; keys MUST match `answer` |
| `answer` | `string` | yes | Single key from `options` (no multi-answer in MVP) |
| `explanation` | `string` | yes | Plain-text or markdown; SHALL render with `white-space: pre-wrap` if no renderer |
| `hasImage` | `boolean` | no | Hint that the question references an image; MVP renders `[圖]` placeholder |
| `meta` | `Record<string, unknown>` | no | Exam-specific extras (year / session / paper / 作者) |
| `sourceCredit` | `string` | no | Per-question attribution if differs from pack-level credit |

#### Scenario: All built questions conform to shape

- **WHEN** any content pack's `dist/questions.json` is parsed
- **THEN** every element SHALL have non-empty `id`, `subject`, `stem`, `options`, `answer`, `explanation`
- **AND** `answer` SHALL be a key present in `options`
- **AND** `options` SHALL contain at least 2 keys (no single-option MCQ)

#### Scenario: Field rename is a breaking change

- **WHEN** a PR renames any required field (e.g. `stem` → `text`)
- **THEN** the PR SHALL include a delta proposal modifying this requirement
- **AND** the delta SHALL document migration path for `dist/questions.json` (build script must emit both names during deprecation window)

### Requirement: Subject interface shape is fixed

The exported `Subject` type SHALL contain exactly these fields:

| Field | Type | Required | Semantics |
|---|---|---|---|
| `id` | `string` | yes | Stable ID; referenced by `Question.subject` |
| `displayName` | `string` | yes | Localized display name (zh-TW for medexam-tw) |
| `group` | `string` | no | Logical grouping (e.g. "醫學一" / "醫學二" / "core" / "elective") |
| `color` | `string` | yes | CSS color value; SHOULD match a theme palette token |
| `iconKey` | `string` | no | Sprite key into theme.sprites for subject icon |
| `totalQuestions` | `number` | yes | Pre-computed count of questions referencing this subject |

#### Scenario: subjects.json conforms

- **WHEN** any content pack's `dist/subjects.json` is parsed
- **THEN** every element SHALL have non-empty `id`, `displayName`, `color`, and a non-negative `totalQuestions` integer

### Requirement: ContentPack root shape is fixed

The exported `ContentPack` type SHALL be exactly `{ meta: ContentPackMeta, subjects: Subject[], questions: Question[] }`.

#### Scenario: getContentPack returns conforming shape

- **WHEN** `getContentPack(baseUrl)` from `@study-rpg/content-medexam-tw` resolves
- **THEN** the returned object SHALL have exactly the three top-level keys: `meta`, `subjects`, `questions`
- **AND** `meta` SHALL satisfy `ContentPackMeta` (next requirement)
- **AND** `subjects` SHALL be an array conforming to the Subject contract
- **AND** `questions` SHALL be an array conforming to the Question contract

### Requirement: ContentPackMeta has required fields

`ContentPackMeta` SHALL contain at minimum:

| Field | Type | Required |
|---|---|---|
| `id` | `string` | yes (e.g. `"medexam-tw"`) |
| `displayName` | `string` | yes (e.g. `"台灣一階醫師國考"`) |
| `locale` | `string` | yes (BCP-47, e.g. `"zh-TW"`) |
| `credits` | `Array<{ name: string; url?: string; license: string }>` | yes (≥ 1 entry) |
| `examMeta` | `Record<string, unknown>` | no |
| `statSchema` | `StatSchema` | no (override default 4-stat schema) |
| `lootTriggers` | object | no |

#### Scenario: Missing credits is rejected

- **WHEN** a content pack's `meta.credits` is empty array `[]` or missing
- **THEN** the pack SHALL be considered invalid
- **AND** build scripts SHOULD fail with an explicit error

### Requirement: Attribution is non-removable

The `credits` array in `ContentPackMeta` and any `sourceCredit` field on `Question` SHALL be surfaced in player-facing UI at least once during normal use.

For `@study-rpg/content-medexam-tw`, this is satisfied by:
- App footer displays pack-level credits (chest 中華民國考選部 + 陽明國考考古題小組)
- QuizModal footer displays 陽明 attribution on every question

#### Scenario: Removing UI attribution requires explicit approval

- **WHEN** a PR removes the credits display from the app footer or quiz modal footer
- **THEN** the PR SHALL be rejected unless the content pack's `meta.credits[].license` permits removal
- **AND** for CC-BY-NC licensed content (current 陽明 detail solutions), attribution removal is NEVER permitted

### Requirement: Build pipeline emits dist/ JSON triplet

Every content pack SHALL ship three files (or equivalent JSON-fetchable endpoints) named:

- `meta.json` — serialized `ContentPackMeta` plus a `stats` block (`totalQuestions`, `parsedFiles`, etc.) and `builtAt` timestamp
- `subjects.json` — serialized `Subject[]`
- `questions.json` — serialized `Question[]`

The default loader `getContentPack(baseUrl)` SHALL fetch these three files in parallel.

#### Scenario: medexam-tw build produces the triplet

- **WHEN** `pnpm --filter @study-rpg/content-medexam-tw build` completes
- **THEN** `packages/content-medexam-tw/dist/` SHALL contain `meta.json`, `subjects.json`, `questions.json`
- **AND** all three SHALL parse as valid JSON
- **AND** `meta.stats.totalQuestions` SHALL equal `questions.length`

#### Scenario: Build logs visible imported/skipped counters

- **WHEN** the build script processes source `.md` files
- **THEN** the script SHALL print `imported: N / skipped: M / total: K` to stdout before exit
- **AND** silent skip (e.g. `skipped += 1; continue` without printout) SHALL be considered a build-script bug


### Requirement: Mock-exam-capable content packs surface year, session, and paper metadata

Any content pack that participates in `mock-exam` mode (i.e. ships historical full-paper question sets the user can re-attempt as a unit) SHALL ensure every `Question.meta` object contains:

- `year: number` — the original exam year (e.g. `114` for 民國 114 / 2025 calendar year)
- `session: number` — the exam session within that year (typically `1` or `2` for 一階國考)
- `paper: string` — the paper identifier as a kebab-case string the picker can group by. For `medexam-tw`, this SHALL be exactly one of `'medexam-1'` or `'medexam-2'`.

These three fields are MANDATORY for mock-exam discoverability. Without them, the mock picker cannot group questions into "year × session × paper" cells. The combined tuple `(year, session, paper)` corresponds to exactly one real-world exam paper (~100 Q for 一階).

For content packs that do NOT participate in mock-exam (e.g. a `content-toefl-mini` demo pack), these fields MAY be absent.

#### Scenario: medexam-tw build emits year + session + paper for every question

- **WHEN** `pnpm --filter @study-rpg/content-medexam-tw build` runs and produces `dist/questions.json`
- **THEN** every question element's `meta` field SHALL contain a numeric `year`, a numeric `session`, and a `paper` value of either `'medexam-1'` or `'medexam-2'`
- **AND** build script SHALL log a summary of imported / skipped / total counts AND distinct `(year, session, paper)` triples found

#### Scenario: Missing year/paper aborts build for medexam-tw

- **WHEN** the medexam-tw build script encounters a source `.md` file path it cannot decode into `(year, session, paper)` (e.g. unexpected file naming)
- **THEN** the build SHALL log an error naming the offending file
- **AND** the question SHALL be skipped (added to the existing skip counter, not silently dropped)
- **AND** the build SHALL succeed only if at least 1 complete `(year, session, paper)` set of questions imports successfully

#### Scenario: Mock picker reads year + session + paper from meta

- **WHEN** the `mock-exam` picker queries the content pack for available papers
- **THEN** it SHALL read `question.meta.year` and `question.meta.paper` from every question
- **AND** SHALL group by the tuple `(year, session, paper)` to produce picker cells
- **AND** SHALL NOT require any additional fields outside the existing `Question` interface

#### Scenario: Non-mock content packs are exempt

- **WHEN** a content pack's `meta.examMeta` (top-level) does NOT declare `supportsMockExam: true` (or the pack is rendered in an app that does not surface mock mode)
- **THEN** missing `year` / `paper` in question `meta` SHALL NOT cause build errors
- **AND** the mock picker route SHALL be hidden in such apps
