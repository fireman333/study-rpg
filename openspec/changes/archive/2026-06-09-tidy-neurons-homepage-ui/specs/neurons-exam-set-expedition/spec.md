## MODIFIED Requirements

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

## ADDED Requirements

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

## REMOVED Requirements

### Requirement: Reward via the shared expedition-axis chain

**Reason**: 模考 / 題庫 is now **pure practice** (tidy-neurons-homepage-ui) — answering grants no game reward, so 模考 no longer credits DMN draws. The shared expedition-axis reward chain therefore no longer applies to 模考. The ⚔️ 錯題出征 wrong-question expedition remains the sole DMN expedition-axis faucet (unchanged, per `neurons-dmn-fate-cards`).

**Migration**: 模考 answers run through `QuizModal` in `practice` mode with **no** `onComplete` callback, so `onExpeditionComplete` / `creditExpeditionDraws` is never invoked for 模考. No data migration — existing DMN draw counters are unaffected; only the 模考 earning path is removed.
