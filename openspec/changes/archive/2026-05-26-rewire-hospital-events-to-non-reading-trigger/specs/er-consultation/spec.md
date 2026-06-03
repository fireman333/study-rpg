## MODIFIED Requirements

### Requirement: ER consultation SHALL trigger probabilistically during active sessions with idle/cadence gates

The system SHALL roll for an ER consultation event on each **non-reading interaction event** (quiz answer commit, or route change into a player-content page) rather than on a session-time tick. Rolls SHALL happen inside `maybeRollNonReadingEvent` (see `hospital-events` spec for shared gate / hook architecture), as the **second roll** after the event roll within the same function call. Trigger rate SHALL NOT scale by reputation (this remains a teaching mechanism, not a penalty surface).

The roll probability SHALL be `ER_ROLL_PROBABILITY = 0.035` (3.5%) by default, defined in `packages/content-medexam2-tw/src/events.ts` for content-pack-level tuning. ER probability is intentionally lower than `EVENT_ROLL_PROBABILITY` (5%) to preserve the legacy "ER feels rarer than other events" cadence.

**Hard-mutex pre-conditions** — ALL of the following SHALL be checked before triggering, and ANY one being true SHALL skip the current roll without queueing:

1. **Reading session active** — `gameCounters.currentSessionStartedAt !== null` (this is the new primary gate replacing the old tick-only mechanism; reading is sacred)
2. **Cooldown** — `Date.now() - (gameCounters.lastInteractionEventAt ?? 0) < 180_000` (3 minutes wall-clock; shared with `hospital-events`)
3. `hospital-events.currentEvent` is pending resolution (`pendingEventId !== null`)
4. `erConsultActive` singleton is non-null (a prior consult is still pending)
5. `MentorDialog` is open (any state) — checked via `services/er-consultation.ts` `canTriggerERConsult` helper
6. A quiz session is active (`QuizModal` open) — same helper
7. Player has turned off the feature via `player_state.settings.erConsultEnabled = false`

Gates 1, 2, 3 are evaluated **once at the top** of `maybeRollNonReadingEvent` (shared with event roll); gates 4-7 are evaluated **inside** `maybeRollAndPersistERConsult` (preserving its existing internal logic). When skipped due to mutex, no retry is scheduled — the next hook event (next quiz answer or page nav) is the next opportunity to roll.

#### Scenario: Reading session blocks ER consult roll

- **GIVEN** `gameCounters.currentSessionStartedAt = 1716000000000` (reading session active)
- **WHEN** the player answers a quiz question or navigates to a player-content page
- **THEN** `maybeRollNonReadingEvent` SHALL skip at the reading session gate
- **AND** no ER consult SHALL be triggered
- **AND** the player can complete an entire reading session without ER consult interruption

#### Scenario: Roll skipped when hospital event pending

- **GIVEN** an active 醫療糾紛 event awaiting resolution (`pendingEventId !== null`)
- **WHEN** the player navigates to `/leaderboard` (Hook B fires)
- **THEN** `maybeRollNonReadingEvent` SHALL skip at the mutex gate (gate 3)
- **AND** no ER consult SHALL be triggered

#### Scenario: Roll skipped when quiz session active

- **GIVEN** the player has `QuizModal` open answering a question
- **WHEN** the player commits an answer (Hook A fires from inside QuizModal)
- **THEN** `maybeRollAndPersistERConsult`'s internal gate detects `quizSessionActive = true`
- **AND** SHALL skip the ER roll
- **AND** the event roll within the same `maybeRollNonReadingEvent` call may still fire (since `quizSessionActive` is an ER-specific gate, not event-specific)

(Implementation note: "quiz session active" means the QuizModal is mid-render, before answer commit + reward write. The Hook A fires AFTER answer commit, so by the time `maybeRollAndPersistERConsult` checks `quizSessionActive`, the modal is typically already closing. Treat this gate as defense-in-depth for race conditions.)

#### Scenario: Roll skipped when feature disabled

- **GIVEN** `player_state.settings.erConsultEnabled === false`
- **WHEN** `maybeRollNonReadingEvent` fires `ER_ROLL_PROBABILITY` succeeds
- **THEN** `maybeRollAndPersistERConsult` SHALL detect the setting flag and skip
- **AND** no ER consult SHALL be triggered
- **AND** no tick handler overhead beyond the flag check SHALL execute

#### Scenario: Cooldown blocks ER consult re-trigger

- **GIVEN** an ER consult resolved 60 seconds ago (`lastInteractionEventAt = Date.now() - 60_000`)
- **WHEN** the player navigates to `/achievements`
- **THEN** `maybeRollNonReadingEvent` SHALL skip at the cooldown gate (gate 2)
- **AND** no ER consult SHALL trigger
- **AND** the cooldown SHALL be shared with hospital-events (no separate ER-only timestamp)

#### Scenario: Successful trigger creates erConsultActive row

- **GIVEN** no gate condition fails AND `erConsultEnabled === true`
- **WHEN** the player navigates to a player-content page and the 3.5% probability roll succeeds
- **THEN** the under-utilized subject selector SHALL run (see selector requirement, unchanged)
- **AND** a question SHALL be picked from that subject (see picker requirement, unchanged)
- **AND** `erConsultActive` SHALL be set to `{questionId, subjectId, triggeredAt: now, doctorSpriteKey: 'er-doctor'}`
- **AND** `ERConsultDialog` SHALL render

#### Scenario: ER consult resolve updates shared cooldown timestamp

- **GIVEN** an active ER consult (`erConsultActive !== null`)
- **WHEN** the player answers (correct or wrong) OR skips OR the consult auto-expires
- **THEN** the resolve handler (`answerERConsult` / `skipERConsult` / expiry path in tick.ts) SHALL set `gameCounters.lastInteractionEventAt = Date.now()`
- **AND** `gameCounters.erConsultActive` SHALL be cleared
- **AND** the next 3 minutes SHALL block all event/ER rolls via the shared cooldown gate

(Migration note: previously the resolve handlers did not write any cooldown timestamp because ER-cadence was tick-based via `erConsultTicksUntilRoll`. The new code path adds the write. The pre-existing 30-day picker exclusion and recency selector logic remain unchanged.)

## REMOVED Requirements

None — the core ER consult mechanics (subject selector, question picker, dialog UI, answer/skip/expiry resolution, telemetry log, settings toggle, sprite parity, 30-day picker exclusion, schema migration history) all remain unchanged. Only the **trigger mechanism** is rewired from tick-based to interaction-based.
