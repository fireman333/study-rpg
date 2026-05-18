## MODIFIED Requirements

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
| `hasImage` | `boolean` | no | Hint that the question references an image in the stem; MVP renders `[圖]` placeholder |
| `hasOptionImages` | `boolean` | no | Hint that at least one of `options` is an un-renderable image (e.g. tympanogram curves listed as A/B/C/D figures). Host apps SHOULD exclude these from random quiz pools and SRS due surfaces until per-option image rendering is implemented |
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

#### Scenario: hasOptionImages omission is treated as false

- **WHEN** a `Question` object is parsed from a `questions.json` produced by a content pack that does not emit `hasOptionImages`
- **THEN** the field SHALL be `undefined`
- **AND** host-app filters that key off `q.hasOptionImages === true` SHALL treat the question as playable (preserves backward compatibility for older content packs / external forks)
