## ADDED Requirements

### Requirement: 模考 SHALL offer a mode choice before the run starts

The 模考 picker SHALL present a mode choice between `即時詳解` (immediate-explanation) and
`模擬考試` (mock-exam) after the player selects a (year, 次別, 冊別) paper and before the run
begins. The chosen mode SHALL be fixed for the duration of that run and SHALL be passed to the
runner together with the ordered question pool. Switching mode SHALL require starting a new run.

#### Scenario: Player picks a mode after selecting a paper

- **WHEN** the player selects a paper in the 模考 picker
- **THEN** a mode control SHALL offer `即時詳解` and `模擬考試`
- **AND** the run SHALL start in the selected mode when the player confirms

#### Scenario: 即時詳解 preserves the existing per-冊 practice flow

- **WHEN** the player chooses `即時詳解` for a paper
- **THEN** the run SHALL open the existing `QuizModal` over that 冊's **unanswered** questions in question order with `preserveOrder` (the pre-existing behavior, unchanged)
- **AND** answering SHALL reveal correctness + explanation per question and record results inline

### Requirement: 模擬考試 mode SHALL load the full paper and defer reveal with free, editable navigation

In `模擬考試` mode the run SHALL load the selected 冊's **entire** question set (all
~100 questions, including ones already answered in other modes), sorted in question
order — NOT the unanswered remainder used by `即時詳解`. The system SHALL NOT reveal any
question's answer or explanation until the run is submitted. The player SHALL be able to
navigate freely backward and forward and SHALL be able to change a previously selected
answer any number of times before submitting. No wrong-answer-book write SHALL occur
while answering in this mode.

#### Scenario: Mock loads the whole 冊 in order

- **WHEN** the player starts `模擬考試` for a (year, 次別, 冊別) paper
- **THEN** the runner SHALL present every question of that 冊 in question order, including questions already answered elsewhere
- **AND** no question from the other 冊 of the same sitting SHALL appear

#### Scenario: Answer is not revealed while answering

- **WHEN** the player selects an option for a question in `模擬考試` mode
- **THEN** the answer/explanation SHALL NOT be revealed
- **AND** the player SHALL be able to move to any other question and back, and change the selection, with no wrong-answer-book write having occurred yet

### Requirement: Submitting a mock exam SHALL reveal all explanations, lock answers, and enter review

When the player chooses 全部送出, the system SHALL reveal every question's explanation at
once, lock all answers (further answer edits SHALL have no effect), and enter a review
state in which the player can navigate freely among all questions. For each question the
review SHALL show the player's own selected option and the correct option, visually
distinguished, with the explanation; a disputed (送分) question SHALL be presented as
all-credit rather than as a wrong answer. Re-taking SHALL be offered as a separate action
(再考一次) that starts a fresh run over the same pool and SHALL NOT mutate the submitted run.

#### Scenario: Submit reveals everything and locks

- **WHEN** the player presses 全部送出
- **THEN** all explanations SHALL become viewable and the runner SHALL enter the review state
- **AND** attempting to change an answer afterward SHALL have no effect

#### Scenario: Review shows own versus correct

- **WHEN** the player views a question in the post-submit review state
- **THEN** their selected option and the correct option SHALL both be indicated, visually distinguished
- **AND** a disputed question SHALL be shown as all-credit

### Requirement: A question-jump navigator SHALL allow direct navigation across the whole paper

The 模擬考試 runner SHALL provide a navigator listing every question position 1..N, where
N is the actual pool size (`pool.length`, never a hard-coded 80). Each cell SHALL indicate,
by means other than colour alone, at minimum the answered / unanswered / flagged / current
state while answering, and the correct / wrong / unanswered / disputed / current state in the
review.

#### Scenario: Jump to an arbitrary question

- **WHEN** the player activates a cell in the navigator
- **THEN** the runner SHALL navigate directly to that question

#### Scenario: Navigator uses the actual pool length

- **WHEN** a paper has fewer than 80 answerable questions (or ~100 for a full neurons 冊)
- **THEN** the navigator, progress, and scoring SHALL use the actual `pool.length`

### Requirement: Players SHALL be able to flag questions within a mock exam

In `模擬考試` mode the player SHALL be able to flag and unflag any question. Flag state
SHALL be reflected in the navigator and SHALL be scoped to the current run — it SHALL NOT
be conflated with the persistent 收藏 / bookmarks feature.

#### Scenario: Flag is shown in the navigator

- **WHEN** the player flags a question
- **THEN** that question's navigator cell SHALL indicate the flagged state, distinct from answered/unanswered

### Requirement: Mock submission SHALL warn about unanswered questions and batch-record wrong + unanswered to the 錯題本

Before finalizing, if any question is unanswered the system SHALL warn the player with the
unanswered count and offer to jump to the first unanswered question or to submit anyway. On
submission, all non-disputed questions that are wrong OR unanswered SHALL be recorded to the
錯題本 in a single batch write — `wrongOrUnansweredIndexes(pool, answers)` → loop
`recordQuestionResult(q.id, q.family, false)` — setting `everWrong` (monotonic-OR, per
`neurons-wrong-answer-list`) so they enter the ⚔️ 錯題出征 wrong-question pool. Disputed
questions SHALL be excluded from this write. The mock flow SHALL NOT credit DMN draws (no
`onExpeditionComplete` / `creditExpeditionDraws`).

#### Scenario: Warn before submitting with unanswered questions

- **WHEN** the player presses 全部送出 while questions remain unanswered
- **THEN** a confirmation SHALL state the unanswered count and offer "跳到第一題未作答" and "仍要送出"

#### Scenario: Wrong and unanswered recorded in one batch at submit

- **WHEN** a mock is submitted with wrong and/or unanswered non-disputed questions
- **THEN** those questions SHALL each get a `questionHistory` row with `everWrong` set in a single submit-time batch
- **AND** disputed questions SHALL NOT be recorded as wrong
- **AND** no DMN draw SHALL be credited by the mock flow

### Requirement: Mock scoring SHALL report accuracy, national-equivalent score, unanswered count, and per-subject breakdown

On 模擬考試 submission the summary SHALL report the accuracy percentage and the
national-equivalent score (`examSetScore`, normalized to a 100-point maximum over the actual
`pool.length`), the unanswered count, and a per-subject correct/total breakdown keyed by
`question.subject`. Disputed questions SHALL be credited as correct in all of these figures.

#### Scenario: Summary includes per-subject breakdown and national score

- **WHEN** a mock is submitted
- **THEN** the summary SHALL show overall accuracy %, the national-equivalent score (滿分 100), and the unanswered count
- **AND** it SHALL show correct/total for each subject present in the paper

### Requirement: In-progress mock exams SHALL be resumable after accidental exit

An in-progress `模擬考試` run SHALL be persisted locally (one draft per paper, in the
`mockExamDrafts` Dexie table) so that, after the modal is closed or the page is refreshed,
the launcher SHALL detect the unfinished run for the same paper and offer to continue it or
restart. The system SHALL NOT auto-resume without the player's choice. The draft SHALL store
the minimal state (paper key, frozen ordered question ids, answers, flagged positions, current
index, timestamps) and SHALL recompute derived figures on restore. If the stored question ids
no longer match the freshly rebuilt pool (corpus changed), the system SHALL treat the draft as
stale (`isDraftFresh` false) and prompt to restart rather than restore inconsistent state. The
draft SHALL be deleted on 全部送出 or explicit 重新開始, SHALL be local-only, and SHALL NOT be
synced to the cloud.

#### Scenario: Resume offered after refresh

- **WHEN** the player refreshes the page during a mock exam and returns to the launcher for the same paper
- **THEN** the launcher SHALL show the saved progress and offer 繼續 / 重新開始
- **AND** it SHALL NOT auto-resume without a choice

#### Scenario: Stale draft after corpus change

- **WHEN** a saved draft's question ids do not match the freshly rebuilt pool (`isDraftFresh` returns false)
- **THEN** the system SHALL mark the draft stale and prompt to restart instead of restoring

## MODIFIED Requirements

### Requirement: 模考 coverage derives from questionHistory; only a local-only mock draft adds persistence

Paper coverage and completion SHALL be derived from the existing `questionHistory` table — a
question counts as answered once it has any `questionHistory` row, regardless of which mode
produced it. Coverage SHALL be computed **per 冊** (a paper = one of {醫學一, 醫學二} of a
(year, 次別) sitting). The coverage-derivation mechanism itself SHALL NOT add any persistence.

The `模擬考試` mode MAY persist a single in-progress draft per paper in a new local-only Dexie
table (`mockExamDrafts`), which additively bumps the Dexie `.version()`. That draft SHALL NOT
enter R2 sync, SHALL NOT change the R2 bundle `SCHEMA_VERSION`, and SHALL NOT add a Worker
endpoint. No other expedition-scoped per-run answer state is stored, and no cloud-synced schema
changes are introduced by 模考.

#### Scenario: Cross-mode answers count toward coverage

- **WHEN** a question belonging to a (year, 次別, 冊別) paper was answered earlier in any mode (e.g. the random quiz)
- **THEN** that question SHALL count as covered for that 冊's paper and SHALL be excluded from the paper's `即時詳解` expedition pool

#### Scenario: Only the mock draft table is new persistence; sync is unchanged

- **WHEN** this change ships
- **THEN** the only new Dexie table SHALL be `mockExamDrafts` (additive, local-only)
- **AND** the R2 bundle `SCHEMA_VERSION` SHALL be unchanged and no Worker endpoint SHALL be added
