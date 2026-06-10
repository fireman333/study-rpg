## MODIFIED Requirements

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
