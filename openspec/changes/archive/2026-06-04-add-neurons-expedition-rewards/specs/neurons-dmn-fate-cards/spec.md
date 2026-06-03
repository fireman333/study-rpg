# neurons-dmn-fate-cards (delta)

## MODIFIED Requirements

### Requirement: DMN fate-card draw entitlement SHALL accrue via mixed time-axis and behavior-axis triggers with per-day caps

The neurons-tw mode SHALL grant DMN fate-card draws from two independent trigger axes, capped per local-TZ calendar day:

- **Expedition axis** (cap = milestone count = 2 draws/day): on each completed 出征 expedition session, let `pool` = the wrong-question count at session open (`questionHistory.lastResult === 'wrong'`, the value the session was launched against) and `cleared` = the number of those cleared this session (correct answers in the wrong-only pool — each a wrong→correct flip). For each milestone in `DMN_EXPEDITION_MILESTONES` (default `[{ pct: 0.25, min: 3, max: 15 }, { pct: 0.50, min: 6, max: 30 }]`) whose threshold `clamp(round(pct × pool), min, max)` is satisfied by `cleared`, the system SHALL grant +1 draw, up to the per-day cap (= `DMN_EXPEDITION_MILESTONES.length`) enforced via `dmnTimeAxisDrawsConsumedToday`. The clamp keeps draws reachable on large backlogs and non-trivial on tiny backlogs while preserving the proportional (percentage) feel in the mid band. Cumulative expedition clears for the current day are tracked in `dmnTimeAxisMinutesAccrued` (legacy key name retained for sync-schema stability; now stores expedition clears, NOT reading minutes) for display / telemetry only — it does NOT gate draws.
  - NOTE — legacy storage names + source change: this axis was historically the "reading-time axis" (30 min reading → +1 draw). As of `add-neurons-expedition-rewards` its input is expedition clears, NOT reading minutes; reading-timer activity SHALL NOT grant DMN draws (reading still fuels maze energy + `totalStudyMinutes`). The persisted meta counters keep their legacy names `dmnTimeAxisMinutesAccrued` / `dmnTimeAxisDrawsConsumedToday` to avoid a `SYNCED_META_KEYS` change and an R2 bundle `SCHEMA_VERSION` bump.
- **Behavior axis** (cap 3 draws/day): the system SHALL grant +1 bonus draw on each of the following events emitted by `connectome-collection`, up to a maximum of 3 behavior-axis draws per day:
  - `connectome.variantSlotUnlocked`
  - `connectome.synapseFormed` (new cross-family synapse created on N=5 same-day co-firing)
  - `connectome.synapseStrengthened` (existing synapse transitions dormant→weak or weak→strong)

These three primitives are chosen because they map naturally to "meaningful collection milestone" without requiring a daily-open streak service (which neurons-tw does not implement; correct-answer streak is per-question, not per-day).

The combined entitlement (expedition + behavior) SHALL be tracked as a single integer counter `dmnDrawsAvailable` (monotonic during the day, decremented on consume). Both axis day-counters reset at local-TZ midnight; entitled draws already accrued but unused SHALL persist across days (no expiry).

#### Scenario: Expedition session clears the first (25%) milestone → 1 draw

- **GIVEN** `dmnTimeAxisDrawsConsumedToday = 0` and a session opened against a wrong pool of 40 (so milestone thresholds are `clamp(round(0.25×40),3,15)=10` and `clamp(round(0.50×40),6,30)=20`)
- **WHEN** the player completes the session having cleared 12 wrong-questions
- **THEN** `dmnDrawsAvailable` SHALL increment by 1 (12 ≥ 10 but < 20)
- **AND** `dmnTimeAxisDrawsConsumedToday` SHALL increment by 1

#### Scenario: Clearing the second (50%) milestone in one session → 2 draws

- **GIVEN** `dmnTimeAxisDrawsConsumedToday = 0` and a session opened against a wrong pool of 40 (thresholds 10 and 20)
- **WHEN** the player completes the session having cleared 20 wrong-questions
- **THEN** `dmnDrawsAvailable` SHALL increment by 2 (both milestones met)
- **AND** `dmnTimeAxisDrawsConsumedToday` SHALL increment by 2

#### Scenario: Small-backlog floor prevents trivially cheap draws

- **GIVEN** `dmnTimeAxisDrawsConsumedToday = 0` and a session opened against a wrong pool of 8 (so the first threshold is `clamp(round(0.25×8),3,15)=clamp(2,3,15)=3`)
- **WHEN** the player completes the session having cleared 2 wrong-questions
- **THEN** no expedition-axis draw SHALL be granted (2 < the floored threshold 3)

#### Scenario: Large-backlog ceiling keeps draws reachable

- **GIVEN** `dmnTimeAxisDrawsConsumedToday = 0` and a session opened against a wrong pool of 300 (so the first threshold is `clamp(round(0.25×300),3,15)=clamp(75,3,15)=15`)
- **WHEN** the player completes the session having cleared 15 wrong-questions
- **THEN** `dmnDrawsAvailable` SHALL increment by 1 (the ceiling makes the milestone attainable rather than requiring 75)

#### Scenario: Daily cap across multiple sessions

- **GIVEN** the player has already consumed 2 expedition-axis draws today (`dmnTimeAxisDrawsConsumedToday = 2`)
- **WHEN** the player completes another session that satisfies one or both milestones
- **THEN** no additional expedition-axis draw SHALL be granted
- **AND** `dmnDrawsAvailable` SHALL NOT increment from the expedition axis

#### Scenario: Behavior-axis draw on synapse formed

- **GIVEN** `dmnBehaviorAxisDrawsConsumedToday = 0`
- **WHEN** `connectome-collection` emits `connectome.synapseFormed` (player triggered cross-family same-day co-firing reaching N=5 threshold)
- **THEN** `dmnDrawsAvailable` SHALL increment by 1
- **AND** `dmnBehaviorAxisDrawsConsumedToday` SHALL increment by 1

#### Scenario: Daily reset of both axis counters at local-TZ midnight

- **GIVEN** the local time is 23:59 with `dmnTimeAxisDrawsConsumedToday = 2`, `dmnBehaviorAxisDrawsConsumedToday = 3`, cumulative expedition clears today = 22, and `dmnDrawsAvailable = 4` (4 unused)
- **WHEN** the local clock crosses midnight and the player triggers any interaction (the lazy daily-reset job runs)
- **THEN** `dmnTimeAxisDrawsConsumedToday` SHALL reset to 0
- **AND** `dmnBehaviorAxisDrawsConsumedToday` SHALL reset to 0
- **AND** the cumulative expedition-clears counter (`dmnTimeAxisMinutesAccrued`) SHALL reset to 0
- **AND** `dmnDrawsAvailable` SHALL remain at 4 (unused draws persist across days)

### Requirement: DMN trigger detector SHALL initialize at app boot as a single service

A new service `apps/neurons-tw/src/lib/services/dmn-trigger.ts` SHALL be initialized at app boot via the app's main entry point. The service SHALL:

- Register listeners on the connectome event bus for `connectome.variantSlotUnlocked`, `connectome.synapseFormed`, and `connectome.synapseStrengthened`
- Expose `creditExpeditionDraws(pool: number, cleared: number)` which the expedition completion path (`onExpeditionComplete`) SHALL invoke on each completed session: it evaluates the `DMN_EXPEDITION_MILESTONES` thresholds against `cleared`, grants the corresponding draws subject to the per-day cap, and updates the cumulative expedition-clears counter for display
- Run daily-reset lazily on the first user interaction crossing local-TZ midnight (mirrors `connectome-collection` pattern)
- Persist all state via Dexie writes wrapped in transactions; emit informational logs after commit (no external event subscriber consumes `dmn.drawsGranted` yet)

The previously-exposed `ReadingTimerSubscriber` interface (reading-minute accrual) SHALL be removed; reading-timer no longer feeds the DMN axis.

#### Scenario: Trigger detector initializes on app boot

- **GIVEN** the neurons-tw app starts up
- **WHEN** the main entry (e.g., `App.tsx` or `main.tsx`) calls `initializeDmnTrigger()`
- **THEN** connectome event bus listeners SHALL be registered exactly once (singleton; second call is no-op)
- **AND** `creditExpeditionDraws` SHALL be exported for the expedition completion path to invoke
