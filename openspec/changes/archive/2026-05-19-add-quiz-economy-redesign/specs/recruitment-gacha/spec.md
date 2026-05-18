## ADDED Requirements

### Requirement: Per-N fresh-correct ticket grant SHALL accrue from quiz answering

The system SHALL grant `+1` recruitment ticket to `tickets.global.available` for every `QUIZ_TICKET_GRANT_PER_N_CORRECT = 25` distinct "fresh correct" answers accumulated across all subjects (lifetime total, not per-session).

A "fresh correct" answer is defined as:
- `questionHistory[questionId]` did NOT exist in the table immediately before the current answer event (this is the first time the player has answered this `questionId` at all), AND
- The answer is graded correct (matches `question.answer` OR `question.disputed === true`)

Subsequent correct answers to the same `questionId` (SRS reviews, retries) SHALL NOT count as fresh and SHALL NOT contribute to the ticket-grant counter.

The counter SHALL be persisted via a monotonic field on `monotonicCounters.singleton` (new field `freshCorrectSinceLastTicket: number`, initialized to 0 on first save load if absent). Each fresh-correct answer SHALL increment this field by 1; when the field reaches `QUIZ_TICKET_GRANT_PER_N_CORRECT`, the system SHALL:

1. Grant `+1` ticket (clamped at `TICKET_CAP = 99` — if available already at cap, ticket SHALL NOT be granted but counter SHALL still reset to avoid future over-accumulation surprises)
2. Reset `freshCorrectSinceLastTicket` to 0
3. Optionally surface a toast `+1 招募券（已累積 N 題答對）` to inform the player

The constant `QUIZ_TICKET_GRANT_PER_N_CORRECT = 25` SHALL be exported from `packages/content-medexam2-tw/src/recruitment.ts` as a locked literal.

#### Scenario: 25th fresh-correct answer grants +1 ticket

- **GIVEN** `monotonicCounters.singleton.freshCorrectSinceLastTicket = 24` and `tickets.available = 5`
- **WHEN** the player answers a question whose `questionId` is not yet in `questionHistory` correctly
- **THEN** `tickets.available` SHALL become `6`
- **AND** `freshCorrectSinceLastTicket` SHALL be reset to `0`
- **AND** a toast `+1 招募券（已累積 25 題答對）` SHALL fire

#### Scenario: Repeat correct answer does not increment counter

- **GIVEN** `freshCorrectSinceLastTicket = 10` and the player previously answered `questionId = 內科-Q42` (the row exists in questionHistory)
- **WHEN** the player answers 內科-Q42 correctly again (SRS review)
- **THEN** `freshCorrectSinceLastTicket` SHALL remain `10`
- **AND** `tickets.available` SHALL not change from this grant path

#### Scenario: Wrong fresh answer does not increment counter

- **GIVEN** `freshCorrectSinceLastTicket = 15` and `questionId = X-Q99` is not in questionHistory
- **WHEN** the player answers X-Q99 incorrectly
- **THEN** `freshCorrectSinceLastTicket` SHALL remain `15`
- **AND** `questionHistory[X-Q99]` SHALL be created (existing behavior) with attempts=1 / correct=0

#### Scenario: Ticket cap reached, counter still resets

- **GIVEN** `freshCorrectSinceLastTicket = 24` and `tickets.available = 99` (cap)
- **WHEN** the player answers a fresh question correctly
- **THEN** `tickets.available` SHALL remain `99` (no over-cap grant)
- **AND** `freshCorrectSinceLastTicket` SHALL reset to `0` (counter clears regardless)
- **AND** a toast SHALL inform the player `招募券已達上限，請先消耗` (or visually equivalent)

### Requirement: Banner first-unlock SHALL grant a one-time ticket bonus

The system SHALL grant `+1` ticket to `tickets.global.available` the first time the player's `affinity[subjectId].correctCount` crosses (becomes ≥) the subject's `RECRUITMENT_THRESHOLDS[subjectId]`. The bonus SHALL fire at most once per subject across the lifetime of the save (and at most `BANNER_UNLOCK_TICKET_LIFETIME_CAP = 14` times total — equivalent to all 14 subjects each granting once).

The first-unlock tracking SHALL be persisted in a new local-only Dexie table `bannerUnlockBonusLog` with schema `{ subjectId: SubjectId (primary key), grantedAt: number }`. The table SHALL NOT be included in cloud sync — banner-unlock state is recoverable from `affinity` and the bonus log on each device independently (light over-grant acceptable across devices per design D4).

When affinity crosses threshold:
1. Check `bannerUnlockBonusLog.get(subjectId)` — if a row exists, NO bonus SHALL be granted
2. Otherwise, grant `+1` ticket (clamped at `TICKET_CAP = 99`)
3. Write `bannerUnlockBonusLog.put({ subjectId, grantedAt: Date.now() })`
4. Emit a toast `+1 招募券（首次解鎖 ${subjectDisplayName}）`

If the player ever drops below threshold (e.g. via dev tool or future affinity-cost mechanic) and crosses again, the bonus SHALL NOT re-fire (log row already exists).

The constants `BANNER_UNLOCK_TICKET_BONUS = 1` and `BANNER_UNLOCK_TICKET_LIFETIME_CAP = 14` SHALL be exported from `packages/content-medexam2-tw/src/recruitment.ts` as locked literals.

#### Scenario: First time crossing 內科 threshold grants +1 ticket

- **GIVEN** `affinity['內科'].correctCount = 65`, `RECRUITMENT_THRESHOLDS['內科'] = 66`, no row in `bannerUnlockBonusLog` for 內科, `tickets.available = 10`
- **WHEN** the player answers a 內科 question correctly (affinity becomes 66)
- **THEN** `tickets.available` SHALL become `11`
- **AND** `bannerUnlockBonusLog['內科']` SHALL be created with current timestamp
- **AND** a toast `+1 招募券（首次解鎖 內科）` SHALL fire

#### Scenario: Re-crossing threshold for already-bonused subject does not re-grant

- **GIVEN** `bannerUnlockBonusLog['內科']` exists (already granted), and affinity is reset by dev tool to 50
- **WHEN** the player answers 內科 questions until affinity crosses 66 again
- **THEN** `tickets.available` SHALL NOT receive an additional banner-unlock bonus from 內科
- **AND** `bannerUnlockBonusLog['內科']` SHALL keep its original `grantedAt` timestamp

#### Scenario: First unlock when at ticket cap consumes the bonus

- **GIVEN** `tickets.available = 99` (cap), no row in `bannerUnlockBonusLog` for 外科
- **WHEN** the player crosses 外科 threshold for the first time
- **THEN** `tickets.available` SHALL remain `99`
- **AND** `bannerUnlockBonusLog['外科']` SHALL still be written (one-shot semantics preserved)
- **AND** the bonus SHALL NOT re-fire when ticket cap later frees up

#### Scenario: All 14 banner unlocks each grant once, no 15th source

- **GIVEN** the player has crossed all 14 subjects' thresholds across the save lifetime
- **WHEN** `bannerUnlockBonusLog.toArray().length` is queried
- **THEN** it SHALL equal `14`
- **AND** the lifetime banner-unlock ticket grant SHALL equal `14` (subject to cap clamps)

#### Scenario: Cross-device deployment may over-grant by up to 14 tickets

- **GIVEN** device A has granted banner-unlock for all 14 subjects (`bannerUnlockBonusLog` has 14 rows on A)
- **AND** device B has just signed in with the cloud-synced affinity but the local `bannerUnlockBonusLog` is empty
- **WHEN** the player continues playing on B and answers questions that re-cross thresholds (cloud-synced affinity already ≥ threshold)
- **THEN** device B SHALL grant `+14` tickets again (one per first observed cross)
- **AND** this acceptable over-grant SHALL be capped at `BANNER_UNLOCK_TICKET_LIFETIME_CAP × N_devices` total tickets (per design D4 trade-off)

#### Scenario: Daily +1 + fate card grants are unchanged

- **GIVEN** existing daily-refresh +1 (via `refreshDailyTickets`) and fate-card grants (`grantTickets`)
- **WHEN** the new per-N-correct + banner-unlock grants are active
- **THEN** the daily +1 SHALL continue to fire once per epoch day
- **AND** fate card ticket grants SHALL continue to fire per `hospital-fate-cards` capability
- **AND** all four grant paths SHALL converge on the same `TICKET_CAP = 99` clamp
