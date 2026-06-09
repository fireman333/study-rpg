## ADDED Requirements

### Requirement: Continuation questions surface preceding context

The neurons quiz UI SHALL detect 承上題 (continuation) questions via the
`@study-rpg/core` `isContinuationQuestion` helper and, for such a question, render its
preceding scenario chain (resolved via `resolvePrecedingChain` against the FULL question
bank, not just the current quiz pool) above the current question's stem. The chain SHALL
be ordered root-first … nearest-last and exclude the current question. For ordinary
questions, or continuation questions whose chain cannot be resolved, the UI SHALL render
nothing (no empty box, no error).

#### Scenario: Continuation question shows its preceding chain

- **WHEN** a quiz presents a question whose stem begins with `承上題` and whose preceding question(s) are present in the bank
- **THEN** a "承上題・前文情境" box renders above the current stem, showing each preceding question (root-first), and the player can read the scenario the question refers to

#### Scenario: Ordinary question renders no box

- **WHEN** a quiz presents a question whose stem does not begin with `承上題`
- **THEN** no preceding-context box is rendered and the question displays unchanged

#### Scenario: Orphan continuation degrades gracefully

- **WHEN** a 承上題 question's immediate predecessor is absent from the corpus (an upstream gap)
- **THEN** the box renders nothing (best-effort empty chain) rather than erroring or showing a partial/incorrect predecessor

### Requirement: Preceding chain resolved from the full bank, available in every quiz mode

The neurons quiz SHALL resolve the preceding chain against the full question bank (loaded
once and cached), independent of the current session pool, so that a 承上題's scenario root
appears even when the active pool excludes it (e.g. the wrong-only 出征 pool). The
preceding-context behavior SHALL apply at the single shared answer entry (`QuizModal`) so
that all quiz modes inherit it.

#### Scenario: Root shown even when not in the current pool

- **WHEN** a 承上題 is served from a pool that does not contain its non-wrong scenario root (e.g. the wrong-only expedition pool)
- **THEN** the preceding-context box still resolves and shows the root from the full bank

#### Scenario: Preceding image rendering matches the current question

- **WHEN** a preceding question carries an image
- **THEN** it is rendered with the same path resolution and missing-image fallback as the current question's figure (shared `QuestionFigure`)
