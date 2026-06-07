# neurons-exam-set-expedition Specification

## Purpose
TBD - created by archiving change add-neurons-exam-set-expedition. Update Purpose after archive.
## Requirements
### Requirement: Year + 次別 full-question-set expedition picker

From the homepage 遠征選單 (per `neurons-study-squad`), selecting **年份回數遠征** SHALL open a picker that lists the available exam years (`q.meta.year`) and 次別 (`q.meta.session`; 1 → 第一次, 2 → 第二次), derived from the question pool. Each selectable (year, 次別) paper SHALL display its coverage as `已答 X / Y` (answered / total), and SHALL show a completed marker when `X === Y`. Years SHALL be listed descending; 次別 ascending. A 次別 value absent from the pool SHALL NOT appear (the picker degrades to whatever dimensions the content actually populates; if no `session` is present, papers are addressed by year alone).

#### Scenario: Picker lists papers with coverage

- **WHEN** the player opens 年份回數遠征
- **THEN** the picker SHALL list each available (year, 次別) paper with its `已答 X / Y` coverage derived from `questionHistory`

#### Scenario: Completed paper is marked

- **WHEN** every question of a (year, 次別) paper has a `questionHistory` row
- **THEN** that paper SHALL show a completed marker and its coverage SHALL read `已答 Y / Y`

### Requirement: Resumable per-session pool in question order

Selecting a (year, 次別) paper SHALL launch `QuizModal` over that paper's questions **not yet answered** (no `questionHistory` row for the question id), in **question order**, with `preserveOrder` set (no shuffle). The expedition SHALL be resumable: because the per-session pool is the unanswered remainder, closing and re-opening the same paper continues from where coverage left off. When a paper has no unanswered questions remaining, selecting it SHALL surface a completed state rather than opening an empty drill.

#### Scenario: Drill serves unanswered questions in order

- **WHEN** the player launches a (year, 次別) paper that has unanswered questions
- **THEN** `QuizModal` SHALL open on exactly that paper's unanswered questions, sorted by question order, with order preserved

#### Scenario: Resuming continues from accumulated coverage

- **WHEN** the player answered part of a paper in a prior session and re-opens it
- **THEN** the drill SHALL serve only the still-unanswered questions (already-answered ones are excluded)

#### Scenario: Fully-covered paper opens no empty drill

- **WHEN** the player selects a paper whose questions are all already answered
- **THEN** a completed state SHALL be shown and no empty `QuizModal` SHALL open

### Requirement: Coverage derives from questionHistory with no new persistence

Paper coverage and completion SHALL be derived from the existing `questionHistory` table — a question counts as answered once it has any `questionHistory` row, regardless of which mode produced it. This expedition SHALL NOT add a Dexie table, SHALL NOT bump the Dexie `.version()`, SHALL NOT change the R2 bundle `SCHEMA_VERSION`, and SHALL NOT add a Worker endpoint. No expedition-scoped per-run answer state is stored.

#### Scenario: Cross-mode answers count toward coverage

- **WHEN** a question belonging to a (year, 次別) paper was answered earlier in any mode (e.g. the random quiz)
- **THEN** that question SHALL count as covered for the paper and SHALL be excluded from the paper's expedition pool

#### Scenario: No schema or sync change

- **WHEN** this change ships
- **THEN** no new Dexie table is added, no Dexie `.version()` is incremented, and the R2 bundle `SCHEMA_VERSION` is unchanged

### Requirement: Reward via the shared expedition-axis chain

On close, the 年份回數遠征 SHALL credit DMN draws through the same path as 錯題遠征: `onExpeditionComplete({ total, correct })` → `creditExpeditionDraws(total, correct)`, where `total` = the unanswered-set size the session opened on and `correct` = the session's correct-answer count. It SHALL use the same `DMN_EXPEDITION_MILESTONES` clamp and SHALL share the single expedition-axis daily cap with 錯題遠征 (one axis; spending the cap on one expedition leaves none for the other that day). The reward path SHALL be best-effort (failures caught + logged, never breaking the close).

#### Scenario: Completing a paper session credits draws via the shared chain

- **WHEN** the player closes a 年份回數遠征 session having answered some correctly
- **THEN** `creditExpeditionDraws(total, correct)` SHALL be invoked with the session's opening pool size and correct count, granting draws per the milestone clamp under the shared daily cap

#### Scenario: No re-answer farming

- **WHEN** a player tries to re-run a paper to farm draws
- **THEN** already-answered questions are excluded from the pool (it only shrinks), and the shared per-day cap bounds total draws regardless
