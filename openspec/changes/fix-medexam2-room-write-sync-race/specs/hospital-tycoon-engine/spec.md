## ADDED Requirements

### Requirement: Facility upgrades, gacha rolls, ticket grants, and affinity increments SHALL propagate to cloud within the debounce window

For every mutation to the `rooms` table (manual facility upgrade via `services/facility.ts`; fate-card-triggered 全院 / 單室 / 升級券 facility upgrades via `services/fate-card.ts`), the `tickets` table (recruitment spend, quiz-reward grants, fate-card consumption, daily refills), the `gachaStats` table (pity-counter updates from recruit rolls), and the `affinity` table (per-subject `correctCount` increments from quiz correct answers), the cloud `hospital_state` row SHALL receive the updated values within the sync engine's debounce window (default 3000 ms, configured by `VITE_SYNC_DEBOUNCE_MS`).

This requirement is INDEPENDENT of the tick loop: it SHALL hold regardless of whether a study session is active. The tick loop's role in pushing `gameCounters` to cloud SHALL NOT be a prerequisite for propagating room / ticket / gachaStats / affinity changes.

#### Scenario: Manual facility upgrade with no active study session

- **GIVEN** the user is on the 醫院 page (no active study session)
- **AND** the cloud `hospital_state.data.rooms.outpatient-1.facilityLevel` equals 1
- **WHEN** the user clicks the facility upgrade button on `outpatient-1`, paying the upgrade cost
- **AND** the local `db.rooms.get('outpatient-1').facilityLevel` becomes 2
- **THEN** within 3000 ms (default debounce), a `pushNow` SHALL fire
- **AND** the cloud `hospital_state.data.rooms.outpatient-1.facilityLevel` SHALL equal 2

#### Scenario: Fate-card 全院 facility upgrade pushes all rooms

- **WHEN** the user activates a fate card whose effect is "全院設施 +1"
- **AND** `services/fate-card.ts` writes the new `facilityLevel` to every eligible room via repeated `db.rooms.put`
- **THEN** within 3000 ms of the last `db.rooms.put`, a single push SHALL fire
- **AND** the cloud `hospital_state.data.rooms` SHALL reflect the bumped levels for every eligible room
- **AND** no separate push SHALL fire per room (debounce coalesces)

#### Scenario: Recruit roll updates ticket count and pity counter cloud-side

- **GIVEN** the user has at least one recruitment ticket and cloud is in sync
- **WHEN** the user rolls a recruitment via `services/recruitment.ts`, which writes both `db.tickets` (decrement available) and `db.gachaStats` (pity counter)
- **THEN** within 3000 ms a push SHALL fire
- **AND** the cloud `hospital_state.data.tickets.available` SHALL equal the post-roll local value
- **AND** the cloud `hospital_state.data.gachaStats` SHALL equal the post-roll local pity counter

#### Scenario: Affinity increment during quiz answer pushes within debounce window

- **GIVEN** an active study session is producing `gameCounters` ticks every 5 seconds
- **WHEN** the user answers a question correctly, causing `lib/mastery.ts` to write `db.affinity.put({ subjectId, correctCount: next })`
- **AND** no `gameCounters` tick fires within 3000 ms of the affinity write
- **THEN** a push SHALL fire within 3000 ms based on the affinity write alone
- **AND** the cloud `hospital_state.data.affinity` SHALL include the new `correctCount` for `subjectId`
