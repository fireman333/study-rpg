## MODIFIED Requirements

### Requirement: Quiz session SHALL require a roster doctor selected as narrative partner

The `QuizModal` SHALL require the player to have selected a roster doctor before answer buttons become interactive. The selected doctor SHALL be referenced as `boundDoctor`. The `boundDoctor.subjectId` SHALL NOT affect any reward calculation — it is purely a visual / narrative element. If no doctor is bound, the option buttons SHALL be disabled and a doctor picker SHALL be displayed prominently.

The modal SHALL resolve the initial `boundDoctor` on each open using the following precedence:

1. If a persisted companion-doctor ID exists (per-device, stored in the `meta` table under key `quiz.companionDoctorId`) AND that doctor is still present in the `doctors` table, `boundDoctor` SHALL be that doctor.
2. Otherwise, `boundDoctor` SHALL be the doctor with the highest `obtainedAt` value (most recently obtained); the modal SHALL also persist that doctor's ID under the same `meta` key so the choice sticks across subsequent opens.

The player MAY change `boundDoctor` mid-session via an in-modal doctor picker. Changing `boundDoctor` SHALL immediately persist the new ID to the `meta` key. Changing `boundDoctor` SHALL NOT reset the current question or session state. Recruiting a new doctor while `QuizModal` is closed SHALL NOT change the persisted companion-doctor ID, so the player's previously chosen partner remains active on the next open.

The persisted ID SHALL be treated as a per-device UI preference (no cloud sync).

#### Scenario: No doctor bound disables answer buttons

- **GIVEN** the `doctors` table contains 0 roster doctors (impossible after onboarding, but defensive)
- **WHEN** the `QuizModal` opens
- **THEN** the option buttons (A/B/C/D) SHALL be disabled
- **AND** a message SHALL display: `「請先招募醫師才能學習」`

#### Scenario: First-ever open with no persisted ID defaults to most recent

- **GIVEN** the `doctors` table contains 5 doctors with various `obtainedAt` timestamps
- **AND** `meta['quiz.companionDoctorId']` does not exist (e.g. fresh player or first open after upgrade)
- **WHEN** the `QuizModal` opens
- **THEN** `boundDoctor` SHALL be the doctor with the highest `obtainedAt` value
- **AND** the modal header SHALL display that doctor's name and sprite
- **AND** the modal SHALL write that doctor's ID to `meta['quiz.companionDoctorId']`

#### Scenario: Recruiting new doctor does not displace persisted companion

- **GIVEN** `meta['quiz.companionDoctorId']` is set to doctor A's ID
- **AND** doctor A is present in the `doctors` table
- **WHEN** the player recruits doctor B (now the most recently obtained)
- **AND** the player closes and reopens the `QuizModal`
- **THEN** `boundDoctor` SHALL be doctor A (NOT doctor B)
- **AND** `meta['quiz.companionDoctorId']` SHALL still be doctor A's ID

#### Scenario: Persisted companion no longer in roster falls back to most recent

- **GIVEN** `meta['quiz.companionDoctorId']` is set to doctor A's ID
- **AND** doctor A has been retired and is no longer in the `doctors` table
- **AND** the `doctors` table contains doctors B, C, D with various `obtainedAt` timestamps
- **WHEN** the `QuizModal` opens
- **THEN** `boundDoctor` SHALL be the doctor with the highest `obtainedAt` value among the remaining roster
- **AND** the modal SHALL overwrite `meta['quiz.companionDoctorId']` to that new doctor's ID

#### Scenario: Changing doctor mid-session does not reset question and persists choice

- **GIVEN** the player is viewing question Q1 in `QuizModal` and has not yet answered
- **AND** `meta['quiz.companionDoctorId']` is doctor A's ID
- **WHEN** the player changes `boundDoctor` from doctor A to doctor B via the in-modal picker
- **THEN** the modal SHALL update the displayed doctor sprite + name to doctor B
- **AND** the question stem and option buttons SHALL remain Q1's content
- **AND** `meta['quiz.companionDoctorId']` SHALL be updated to doctor B's ID

#### Scenario: boundDoctor.subjectId does not affect affinity gain

- **GIVEN** `boundDoctor.subjectId = 內科` and the current quiz subject is `外科`
- **WHEN** the player answers an 外科 question correctly
- **THEN** `affinity[外科]` SHALL increment by exactly 1 (per `recruitment-gacha` spec)
- **AND** `affinity[內科]` SHALL be unchanged
- **AND** no multiplier or bonus SHALL apply based on doctor-subject mismatch
