# neurons-exam-set-expedition Specification

## Purpose
TBD - created by archiving change add-neurons-exam-set-expedition. Update Purpose after archive.
## Requirements
### Requirement: Year + 次別 full-question-set expedition picker

From the **題庫 tab** (`/bank`, `QuestionBankPage`), the **模考** entry (the question-bank's prominent, enlarged exam-drill entry) SHALL open a picker that lists the available **papers**, where a paper is addressed by **(year `q.meta.year`, 次別 `q.meta.session`; 1 → 第一次, 2 → 第二次, 冊別 `q.meta.book` ∈ {醫學一, 醫學二})** derived from the question pool. A paper is a **single 冊** of ~100 questions (醫學一 OR 醫學二 — NOT both books of a sitting combined into one 200-question paper). Each selectable paper SHALL display its coverage as `已答 X / Y` (answered / total for that 冊, with Y ≈ 100), and SHALL show a completed marker when `X === Y`. Years SHALL be listed descending; within a year, 次別 ascending, then 冊別 (醫學一 before 醫學二). A (year, 次別, 冊別) combination absent from the pool SHALL NOT appear. A question lacking any of `year` / `session` / `book` SHALL be excluded from 模考 papers (the current corpus populates all three for every exam question). The 模考 entry SHALL NOT be present in the homepage CTA toolbar (per `neurons-homepage`).

#### Scenario: Picker lists per-book papers with coverage

- **WHEN** the player opens 模考 from the 題庫 tab
- **THEN** the picker SHALL list each available (year, 次別, 冊別) paper with its `已答 X / Y` coverage (Y ≈ 100) derived from `questionHistory`

#### Scenario: Book is the paper unit, not the full sitting

- **WHEN** the content has both 醫學一 and 醫學二 for a given (year, 次別)
- **THEN** they SHALL appear as TWO separate ~100-question papers, never as one combined ~200-question paper

#### Scenario: Completed paper is marked

- **WHEN** every question of a (year, 次別, 冊別) paper has a `questionHistory` row
- **THEN** that paper SHALL show a completed marker and its coverage SHALL read `已答 Y / Y`

#### Scenario: 模考 entry lives in the 題庫 tab, not the homepage
- **WHEN** the player looks for the 模考 entry
- **THEN** it SHALL appear as a prominent enlarged entry inside the 題庫 tab (`/bank`)
- **AND** it SHALL NOT appear in the homepage (`/`) CTA toolbar

### Requirement: Resumable per-session pool in question order

Selecting a (year, 次別, 冊別) paper SHALL launch `QuizModal` over that **冊's** questions **not yet answered** (no `questionHistory` row for the question id), in **question order**, with `preserveOrder` set (no shuffle). The pool SHALL be restricted to the chosen 冊 (`q.meta.book`) and SHALL NOT include the other book of the same sitting. The expedition SHALL be resumable: because the per-paper pool is the unanswered remainder, closing and re-opening the same paper continues from where coverage left off. When a paper has no unanswered questions remaining, selecting it SHALL surface a completed state rather than opening an empty drill.

#### Scenario: Drill serves unanswered questions of the chosen book in order

- **WHEN** the player launches a (year, 次別, 冊別) paper that has unanswered questions
- **THEN** `QuizModal` SHALL open on exactly that 冊's unanswered questions, sorted by question order, with order preserved
- **AND** no question from the other book of the same sitting SHALL appear

#### Scenario: Resuming continues from accumulated coverage

- **WHEN** the player answered part of a paper in a prior session and re-opens it
- **THEN** the drill SHALL serve only the still-unanswered questions of that 冊 (already-answered ones are excluded)

#### Scenario: Fully-covered paper opens no empty drill

- **WHEN** the player selects a paper whose questions are all already answered
- **THEN** a completed state SHALL be shown and no empty `QuizModal` SHALL open

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

### Requirement: 模考 / 題庫 practice answers SHALL grant no maze progression but SHALL record questionHistory

Answering within the 模考 / 題庫 practice flow SHALL be a **pure-practice mode**: a correct answer SHALL NOT accrue maze energy, SHALL NOT advance the family walker, and SHALL NOT trigger a variant settle/pull; no connectome conduction SHALL be credited (consistent with 模考 never building the connectome). The practice flow SHALL still write the question's `questionHistory` row via `recordQuestionResult` — preserving 模考 paper coverage and the `everWrong` 永久錯題庫 (monotonic-OR, per `neurons-wrong-answer-list`) — and SHALL still update the SRS schedule (per `neurons-quiz-modes`, scheduling is mode-independent). Thus a wrong answer in 題庫 still flows into the 出征 wrong-question pool and can later be repaired. The 模考 / 題庫 practice flow SHALL NOT credit DMN draws (no `onExpeditionComplete` / `creditExpeditionDraws`); the ⚔️ 錯題出征 wrong-question expedition remains the sole DMN expedition-axis faucet.

#### Scenario: Correct practice answer grants no progression reward
- **WHEN** the player answers a question correctly within the 模考 / 題庫 practice flow
- **THEN** no maze energy is accrued, the family walker does not advance, and no variant is pulled
- **AND** no connectome conduction is credited
- **AND** no DMN draw is credited

#### Scenario: Practice answers still record questionHistory, everWrong, and SRS
- **WHEN** the player answers a question (correctly or incorrectly) within the 模考 / 題庫 practice flow
- **THEN** the question's `questionHistory` row is written (counting toward 模考 paper coverage)
- **AND** a wrong answer sets `everWrong` (monotonic-OR) so it enters the 出征 wrong-question pool
- **AND** the question's SRS schedule is updated

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
`onExpeditionComplete` / `creditExpeditionDraws`). After the 錯題本 batch write, the mock flow
SHALL trigger exactly one mock-variant gacha roll, gated by the per-paper daily cap, with the
roll mechanics and persistence defined by the `neurons-mock-variant-gacha` capability; this
roll is independent of (and SHALL NOT credit) the DMN expedition axis or any maze progression.

#### Scenario: Warn before submitting with unanswered questions

- **WHEN** the player presses 全部送出 while questions remain unanswered
- **THEN** a confirmation SHALL state the unanswered count and offer "跳到第一題未作答" and "仍要送出"

#### Scenario: Wrong and unanswered recorded in one batch at submit

- **WHEN** a mock is submitted with wrong and/or unanswered non-disputed questions
- **THEN** those questions SHALL each get a `questionHistory` row with `everWrong` set in a single submit-time batch
- **AND** disputed questions SHALL NOT be recorded as wrong
- **AND** no DMN draw SHALL be credited by the mock flow

#### Scenario: Submit triggers exactly one mock-variant roll after the 錯題本 write

- **WHEN** a mock exam is submitted and the per-paper daily cap has not been spent
- **THEN** the 錯題本 batch write SHALL occur first, then exactly one mock-variant roll SHALL be triggered (per `neurons-mock-variant-gacha`)
- **AND** the roll SHALL NOT credit DMN draws nor any maze progression

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
