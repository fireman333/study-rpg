## ADDED Requirements

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
