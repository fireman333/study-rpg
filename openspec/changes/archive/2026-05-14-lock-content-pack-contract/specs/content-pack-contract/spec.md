## ADDED Requirements

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
