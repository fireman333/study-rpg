## MODIFIED Requirements

### Requirement: Year + 次別 full-question-set expedition picker

From the homepage, selecting the **模考** entry (the secondary exam-mode CTA, per `neurons-study-squad`) SHALL open a picker that lists the available **papers**, where a paper is addressed by **(year `q.meta.year`, 次別 `q.meta.session`; 1 → 第一次, 2 → 第二次, 冊別 `q.meta.book` ∈ {醫學一, 醫學二})** derived from the question pool. A paper is a **single 冊** of ~100 questions (醫學一 OR 醫學二 — NOT both books of a sitting combined into one 200-question paper). Each selectable paper SHALL display its coverage as `已答 X / Y` (answered / total for that 冊, with Y ≈ 100), and SHALL show a completed marker when `X === Y`. Years SHALL be listed descending; within a year, 次別 ascending, then 冊別 (醫學一 before 醫學二). A (year, 次別, 冊別) combination absent from the pool SHALL NOT appear. A question lacking any of `year` / `session` / `book` SHALL be excluded from 模考 papers (the current corpus populates all three for every exam question).

#### Scenario: Picker lists per-book papers with coverage

- **WHEN** the player opens 模考
- **THEN** the picker SHALL list each available (year, 次別, 冊別) paper with its `已答 X / Y` coverage (Y ≈ 100) derived from `questionHistory`

#### Scenario: Book is the paper unit, not the full sitting

- **WHEN** the content has both 醫學一 and 醫學二 for a given (year, 次別)
- **THEN** they SHALL appear as TWO separate ~100-question papers, never as one combined ~200-question paper

#### Scenario: Completed paper is marked

- **WHEN** every question of a (year, 次別, 冊別) paper has a `questionHistory` row
- **THEN** that paper SHALL show a completed marker and its coverage SHALL read `已答 Y / Y`

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

### Requirement: Coverage derives from questionHistory with no new persistence

Paper coverage and completion SHALL be derived from the existing `questionHistory` table — a question counts as answered once it has any `questionHistory` row, regardless of which mode produced it. Coverage SHALL be computed **per 冊** (a paper = one of {醫學一, 醫學二} of a (year, 次別) sitting). This expedition SHALL NOT add a Dexie table, SHALL NOT bump the Dexie `.version()`, SHALL NOT change the R2 bundle `SCHEMA_VERSION`, and SHALL NOT add a Worker endpoint. No expedition-scoped per-run answer state is stored.

#### Scenario: Cross-mode answers count toward coverage

- **WHEN** a question belonging to a (year, 次別, 冊別) paper was answered earlier in any mode (e.g. the random quiz)
- **THEN** that question SHALL count as covered for that 冊's paper and SHALL be excluded from the paper's expedition pool

#### Scenario: No schema or sync change

- **WHEN** this change ships
- **THEN** no new Dexie table is added, no Dexie `.version()` is incremented, and the R2 bundle `SCHEMA_VERSION` is unchanged
