## ADDED Requirements

### Requirement: The build SHALL emit a separate, lazy-loaded cram bundle outside the main content pack

The content build SHALL emit a `cram.json` bundle (the 考前猜題 speed-review + prediction data, with 押題-item `sourceQuestionIds`) and the concept-tag / concept-recurrence data as build products. `cram.json` SHALL be fetched lazily by the 考前猜題 route and MUST NOT be included in the main `getContentPack()` load path, so the initial content-pack payload does not grow.

#### Scenario: cram.json is not in the initial content-pack load
- **WHEN** the app loads the main content pack via `getContentPack()`
- **THEN** `cram.json` SHALL NOT be part of that payload, and SHALL instead be fetched only when the 考前猜題 route is opened

#### Scenario: cram bundle references only real questions
- **WHEN** `cram.json` is emitted
- **THEN** every `sourceQuestionIds` value in it SHALL exist in the emitted `questions.json`, verified by a build-time validator
