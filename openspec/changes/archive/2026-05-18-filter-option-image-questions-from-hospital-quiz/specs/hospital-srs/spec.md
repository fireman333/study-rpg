## ADDED Requirements

### Requirement: Due queue SHALL exclude `hasOptionImages` questions from surfacing

The 二階 SRS scheduler's due-queue read (`getDueQueueAllSubjects`) SHALL drop `questionHistory` rows whose corresponding `Question` in the loaded content pack has `hasOptionImages === true`. Filtered rows SHALL:

1. NOT contribute to the per-subject「🔴 N due」chip count.
2. NOT be returned by `getNextDueCardForSubject` for the due-first picker.
3. NOT be touched on disk — the row stays in `db.questionHistory` so the user's historical answer / mastery state is preserved (the spec's "no schema migration" promise stands).

Rows whose `questionId` cannot be resolved against the loaded pack at all (orphans from older builds) keep the existing pass-through behavior — that is a separate failure class and out of scope for this requirement.

#### Scenario: Due-count chip excludes flagged due rows

- **GIVEN** the user has 5 due rows for 耳鼻喉科 in `questionHistory`, 2 of which correspond to questions with `hasOptionImages: true`
- **WHEN** `getDueQueueAllSubjects()` is called
- **THEN** the returned Map's 耳鼻喉科 list SHALL contain 3 rows
- **AND** the「🔴 N due」chip on the 耳鼻喉科 banner SHALL display `3` (not `5`)

#### Scenario: Due-first picker skips flagged rows

- **GIVEN** the daily cap is allocated and the next due row in line for 耳鼻喉科 is for a question with `hasOptionImages: true`
- **WHEN** `getNextDueCardForSubject('耳鼻喉科', new Set())` is called
- **THEN** the function SHALL return the next non-flagged due row instead
- **AND** SHALL return `null` if all remaining due rows for the subject are flagged

#### Scenario: Flagged rows persist in storage

- **GIVEN** a user previously answered a now-flagged question and the row is in `questionHistory`
- **WHEN** the user reloads the app after this filter ships
- **THEN** `db.questionHistory.toArray()` SHALL still include the row
- **AND** the row's `lastReviewedAt` / mastery counters SHALL be unchanged
- **AND** the row simply does not surface in the due queue or due chip
