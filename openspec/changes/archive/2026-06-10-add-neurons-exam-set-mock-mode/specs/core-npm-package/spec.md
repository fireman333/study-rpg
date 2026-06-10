## ADDED Requirements

### Requirement: Exam-set mock engine exports

The published `@study-rpg/core` package SHALL export a content-agnostic exam-set
「整回挑戰」mock-exam engine consumable by any app/theme, lifted from the 二階
reference implementation. The exports SHALL operate only on `Question` data plus
plain state — no React, Dexie, fetch, or domain-specific (medical / neuron)
vocabulary. Two new modules SHALL provide them, kept distinct from the legacy
`lib/mock-exam.ts` (一階 `scoreMock` / `applyMockPassReward`), which SHALL remain
unchanged:

- **Scoring** (`lib/exam-set.ts`): `examSetScore`, `ExamSetScore`, `POINTS_PER_QUESTION`.
- **Mock engine** (`lib/exam-set-mock.ts`): `ExamMode`, `MockExamState`, `MockAction`,
  `mockExamReducer`, `createInitialMockState`, `clampIndex`, `isCorrectAnswer`,
  `scoreMockExam`, `MockExamScore`, `unansweredIndexes`, `firstUnanswered`,
  `wrongOrUnansweredIndexes`, `navigatorCellStates`, `CellState`, `ReviewCellState`,
  and the draft pure helpers `paperKeyHash`, `isDraftFresh`, `MockExamDraftRow`.

The national-equivalent score SHALL be normalized: `examScore = total > 0 ? (correct / total) * 100 : 0`,
replacing the 二階 hard-coded `correct × 1.25`. For a standard 80-question paper the
two are numerically identical (`1.25 = 100/80`); for a ~100-question paper the maximum
is exactly 100 (never 125). A disputed (送分) question SHALL be credited correct in
every scoring figure. `mockExamReducer` SHALL lock answers after `submit` (an `answer`
action post-submit SHALL be a no-op) while still allowing `goTo` navigation of the
review state. Introducing these exports SHALL be accompanied by a `CHANGELOG.md` entry
and a patch version bump (additive, per the pre-1.0 semver policy).

#### Scenario: App consumes the exam-set engine from the root import

- **WHEN** an app imports `{ mockExamReducer, scoreMockExam, examSetScore, paperKeyHash, isDraftFresh }` from `@study-rpg/core`
- **THEN** every symbol SHALL be defined (not `undefined`) at runtime
- **AND** it can run a mock exam's state + scoring without reimplementing the engine

#### Scenario: National-equivalent score is normalized over pool length

- **WHEN** `scoreMockExam` is called on a 100-question pool with 80 credited correct
- **THEN** `examScore` SHALL equal `80` (not `100`)
- **AND** for an 80-question pool with 64 credited correct `examScore` SHALL equal `80` (identical to the legacy `64 × 1.25`)

#### Scenario: Disputed question is credited in all figures

- **WHEN** a pool contains a `disputed === true` question left 未作答
- **THEN** `scoreMockExam` SHALL count it as correct in `correctCount`, `accuracyPct`, `examScore`, and its subject tally
- **AND** `wrongOrUnansweredIndexes` SHALL NOT include that question's position

#### Scenario: Answers lock after submit

- **WHEN** `mockExamReducer` has processed a `submit` action and then receives an `answer` action
- **THEN** the returned state's `answers` SHALL be unchanged
- **AND** a subsequent `goTo` action SHALL still move `index`

#### Scenario: Additive export bumps patch and records CHANGELOG

- **WHEN** these exports are added to the package
- **THEN** `packages/core/package.json` `version` SHALL bump by a patch increment (`0.6.1` → `0.6.2`)
- **AND** `packages/core/CHANGELOG.md` SHALL gain an entry for that version documenting the new exam-set engine exports
- **AND** the legacy `lib/mock-exam.ts` exports (`scoreMock`, `applyMockPassReward`, `paperIdOf`, `decodePaperId`) SHALL remain exported and unchanged
