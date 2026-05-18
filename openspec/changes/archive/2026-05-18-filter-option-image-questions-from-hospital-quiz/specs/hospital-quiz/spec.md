## ADDED Requirements

### Requirement: Random-pool picker SHALL exclude `hasOptionImages` questions

The 二階 random question picker (`pickRandomQuestion` and its callers) SHALL NOT return any question whose `hasOptionImages` is `true`. Filtering SHALL happen at content-pack load time so that:

1. `bySubject` per-subject counts reflect only playable (text-renderable) questions.
2. `pickRandomQuestion` cannot select a flagged question even with maximally-skewed re-rolls.
3. `byId` lookup SHALL retain the full pack so historical bookmark / SRS row hydration of flagged IDs still resolves to a `Question` object (downstream UI may then display a graceful fallback rather than crash on missing).

Existing scenarios for QuizModal rendering, doctor partner, mid-session subject switching, etc. SHALL continue to apply to the filtered pool — they are not behavior changes, only operate over a smaller pool of ~6056 instead of 6066 questions.

#### Scenario: Filtered pool excludes flagged questions

- **GIVEN** the 二階 content pack contains 10 questions with `hasOptionImages: true` (耳鼻喉科 Q27 of 109_第二次, etc.)
- **WHEN** `loadPack()` resolves
- **THEN** `bySubject.get('耳鼻喉科')` SHALL NOT include any flagged question
- **AND** `pickRandomQuestion('耳鼻喉科', new Set())` SHALL never return a question with `hasOptionImages === true` over any number of calls

#### Scenario: byId retains flagged questions for historical hydration

- **GIVEN** a user's `questionHistory` contains a row for `109-2-醫學六-耳鼻喉科-Q27` answered before this filter shipped
- **WHEN** `pickQuestionById('109-2-醫學六-耳鼻喉科-Q27')` is called
- **THEN** the call SHALL return the full `Question` object (not null)
- **AND** the calling UI MAY choose to display a graceful notice; the lookup itself SHALL NOT throw

#### Scenario: Subject counts after filter remain consistent with player perception

- **GIVEN** the 耳鼻喉科 pool of N total questions
- **WHEN** the filtered `bySubject.get('耳鼻喉科')` is sized
- **THEN** the size SHALL equal `N - (耳鼻喉科 questions with hasOptionImages === true)`
- **AND** UI elements that surface a "remaining unseen" count for the subject SHALL derive from this filtered size (no off-by-one between picker and counter)
