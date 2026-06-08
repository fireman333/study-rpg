## ADDED Requirements

### Requirement: DMN daily counters SHALL merge across devices via documented monotonic semantics

The synced meta keys backing the daily entitlement model SHALL each declare an explicit cross-device merge strategy so that two devices crossing local-TZ midnight, or simultaneously earning and spending draws, can never silently swallow entitlement nor duplicate-grant draws beyond the per-day cap. The keys covered are:

- `dmnDrawsAvailable` — unspent entitlement pool
- `dmnTimeAxisDrawsConsumedToday` — expedition-axis consumed-today counter (legacy name; per the mixed-trigger requirement, the axis is expedition-completion-driven)
- `dmnBehaviorAxisDrawsConsumedToday` — behavior-axis consumed-today counter
- `dmnTimeAxisMinutesAccrued` — display / telemetry running total (legacy name; now stores cumulative expedition clears for the day)
- `dmnDailyResetDate` — the local-TZ date string (YYYY-MM-DD) for which the above counters are valid

Merge semantics, by key:

1. `dmnDailyResetDate` SHALL merge by lexicographic MAX (a later YYYY-MM-DD always wins). Whichever device first crosses local midnight stamps the new date; the other device's stale date string is overwritten on next sync.
2. `dmnTimeAxisDrawsConsumedToday`, `dmnBehaviorAxisDrawsConsumedToday`, and `dmnTimeAxisMinutesAccrued` SHALL each merge as `(date, count)` pairs gated by `dmnDailyResetDate`: when the incoming bundle's `dmnDailyResetDate` is strictly greater than local's, the local counter SHALL be reset to 0 before the incoming counter is applied; when the dates match, the merge SHALL take the numeric MAX of local and incoming. This guarantees that a same-day cap can only be tightened (never reopened) and a midnight reset on either device propagates as a one-shot zero, not as a backward race.
3. `dmnDrawsAvailable` SHALL merge as `local + (incoming - lastSyncedIncoming)` when an op-log-style delta is available, or equivalently as the monotonic MAX of `(grantsSeenTotal − consumesSeenTotal)` projections when an event log is maintained. A simple LWW write SHALL NOT be used. The intent is that grants and consumes from both devices compose without one device's stale snapshot rolling back the other's spend or grant.

A simpler implementation is permitted: maintain `dmnGrantsTotal` (monotonic-MAX) and `dmnConsumesTotal` (monotonic-MAX) and derive `dmnDrawsAvailable = dmnGrantsTotal − dmnConsumesTotal` at read time. If this projection is adopted, the projection SHALL be the canonical source-of-truth and `dmnDrawsAvailable` SHALL be treated as a derived display value rather than a synced field.

The lazy local-TZ midnight reset job SHALL run on next user interaction after `dmnDailyResetDate` differs from today and SHALL be idempotent. The reset SHALL NOT alter `dmnDrawsAvailable` (unused draws persist across days per the mixed-trigger requirement) — it SHALL only zero the per-axis consumed-today counters and the cumulative expedition-clears counter, and advance `dmnDailyResetDate`.

#### Scenario: Cross-midnight race on two devices does not reopen yesterday's cap

- **GIVEN** device A has `dmnTimeAxisDrawsConsumedToday = 2` for date 2026-06-08 (cap reached) and device B is offline with a stale snapshot showing `dmnTimeAxisDrawsConsumedToday = 0` for date 2026-06-08
- **WHEN** device A crosses local midnight to 2026-06-09 (lazy reset stamps `dmnDailyResetDate = 2026-06-09` and zeroes the counter) and pushes the bundle
- **AND** device B comes online and pulls the bundle while still local-TZ 2026-06-08
- **THEN** device B SHALL adopt `dmnDailyResetDate = 2026-06-09` and `dmnTimeAxisDrawsConsumedToday = 0`
- **AND** device B SHALL NOT grant a fresh expedition-axis draw on 2026-06-08 against the now-zeroed counter — a subsequent expedition completion on device B for the 2026-06-08 local session SHALL be evaluated as same-day with the newly current date 2026-06-09 cap

#### Scenario: Simultaneous spends on two devices do not duplicate entitlement

- **GIVEN** both devices show `dmnDrawsAvailable = 3` after a recent sync, with `dmnGrantsTotal = 5` and `dmnConsumesTotal = 2` on both
- **WHEN** device A draws once (locally `dmnConsumesTotal = 3`, derived available = 2) and device B draws once (locally `dmnConsumesTotal = 3`, derived available = 2) before either pushes
- **AND** both push and the bundles merge
- **THEN** the merged state SHALL have `dmnConsumesTotal = MAX(3, 3) = 3` ⚠ NOTE — this is the known LWW limitation; the change covers it via op-log when supported

The above is the documented limitation of the MAX projection: two concurrent consumes can collapse into one. Apply phase MAY implement an op-log (`dmnConsumeLog` append-only with `{deviceId, dispatchedAt}` rows, merged by monotonic-union) to recover the lost consume. The simpler MAX projection is acceptable as long as the limitation is acknowledged: in practice the only failure mode is a single-spent-draw refund to the player, never an overdraft.

#### Scenario: Daily reset date acts as the gate for counter zeroing

- **GIVEN** local state has `dmnDailyResetDate = 2026-06-07`, `dmnTimeAxisDrawsConsumedToday = 1`
- **WHEN** the user opens the app on local-TZ 2026-06-08 and any interaction triggers the lazy reset
- **THEN** `dmnDailyResetDate` SHALL become 2026-06-08
- **AND** `dmnTimeAxisDrawsConsumedToday` SHALL become 0
- **AND** `dmnBehaviorAxisDrawsConsumedToday` SHALL become 0
- **AND** `dmnTimeAxisMinutesAccrued` SHALL become 0
- **AND** `dmnDrawsAvailable` SHALL be unchanged

## MODIFIED Requirements

### Requirement: DMN fate-card draw entitlement SHALL accrue via mixed time-axis and behavior-axis triggers with per-day caps

The neurons-tw mode SHALL grant DMN fate-card draws from two independent trigger axes, capped per local-TZ calendar day:

- **Expedition axis** (cap = milestone count = 2 draws/day): on each completed 出征 expedition session, let `pool` = the wrong-question count at session open (`questionHistory.lastResult === 'wrong'`, the value the session was launched against) and `cleared` = the number of those cleared this session (correct answers in the wrong-only pool — each a wrong→correct flip). For each milestone in `DMN_EXPEDITION_MILESTONES` (default `[{ pct: 0.25, min: 3, max: 15 }, { pct: 0.50, min: 6, max: 30 }]`) whose threshold `clamp(round(pct × pool), min, max)` is satisfied by `cleared`, the system SHALL grant +1 draw, up to the per-day cap (= `DMN_EXPEDITION_MILESTONES.length`) enforced via `dmnTimeAxisDrawsConsumedToday`. The clamp keeps draws reachable on large backlogs and non-trivial on tiny backlogs while preserving the proportional (percentage) feel in the mid band. Cumulative expedition clears for the current day are tracked in `dmnTimeAxisMinutesAccrued` (legacy key name retained for sync-schema stability; now stores expedition clears, NOT reading minutes) for display / telemetry only — it does NOT gate draws.
  - **Normative — reading minutes SHALL NOT grant DMN draws.** The expedition-axis input is expedition wrong-clears, NOT reading minutes. The reading-timer service (per `neurons-mode`) SHALL NOT publish to any DMN subscriber and SHALL NOT cause `dmnDrawsAvailable`, `dmnTimeAxisDrawsConsumedToday`, or `dmnTimeAxisMinutesAccrued` to change on the reading minute boundary. Reading still fuels maze energy + `totalStudyMinutes` per their respective capabilities. The persisted meta counters keep their legacy names `dmnTimeAxisMinutesAccrued` / `dmnTimeAxisDrawsConsumedToday` to avoid a `SYNCED_META_KEYS` change and an R2 bundle `SCHEMA_VERSION` bump.
- **Behavior axis** (cap 3 draws/day): the system SHALL grant +1 bonus draw on the following event emitted by `connectome-collection`, up to a maximum of 3 behavior-axis draws per day:
  - `connectome.variantSlotUnlocked`

  The synapse events (`connectome.synapseFormed` / `connectome.synapseStrengthened`) SHALL NOT grant DMN draws (removed in `rework-neurons-connectome-expedition-driven`): synapse forming/strengthening is now an expedition-repair side effect that already underlies the expedition-axis draw, so granting an additional behavior-axis draw would triple-reward the same activity; in practice the synapse draw was also redundant (usually absorbed by `variantSlotUnlocked` draws against the same daily cap).

`variantSlotUnlocked` is chosen because it maps naturally to "meaningful collection milestone" without requiring a daily-open streak service (which neurons-tw does not implement; correct-answer streak is per-question, not per-day).

The combined entitlement (expedition + behavior) SHALL be tracked as a single integer counter `dmnDrawsAvailable` (monotonic during the day, decremented on consume). Both axis day-counters reset at local-TZ midnight; entitled draws already accrued but unused SHALL persist across days (no expiry). Cross-device merge of all five daily-meta keys SHALL follow the rules in the daily-counter sync requirement of this capability.

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

#### Scenario: Behavior-axis draw on variant slot unlocked

- **GIVEN** `dmnBehaviorAxisDrawsConsumedToday = 0`
- **WHEN** `connectome-collection` emits `connectome.variantSlotUnlocked`
- **THEN** `dmnDrawsAvailable` SHALL increment by 1
- **AND** `dmnBehaviorAxisDrawsConsumedToday` SHALL increment by 1

#### Scenario: Synapse events do NOT grant a behavior-axis draw

- **GIVEN** `dmnBehaviorAxisDrawsConsumedToday = 0`
- **WHEN** `connectome-collection` emits `connectome.synapseFormed` or `connectome.synapseStrengthened`
- **THEN** `dmnDrawsAvailable` SHALL NOT increment
- **AND** `dmnBehaviorAxisDrawsConsumedToday` SHALL remain 0

#### Scenario: Reading minute boundary does NOT grant a draw

- **GIVEN** `dmnDrawsAvailable = 0`, `dmnTimeAxisDrawsConsumedToday = 0`, `dmnTimeAxisMinutesAccrued = 29`, and the player has the reading-timer running
- **WHEN** the timer crosses a 60-second boundary and increments `meta['totalStudyMinutes']`
- **THEN** `dmnDrawsAvailable` SHALL remain 0
- **AND** `dmnTimeAxisDrawsConsumedToday` SHALL remain 0
- **AND** `dmnTimeAxisMinutesAccrued` SHALL remain 29 (the counter only advances on expedition completion, never on reading minutes)

#### Scenario: Daily reset of both axis counters at local-TZ midnight

- **GIVEN** the local time is 23:59 with `dmnTimeAxisDrawsConsumedToday = 2`, `dmnBehaviorAxisDrawsConsumedToday = 3`, cumulative expedition clears today = 22, and `dmnDrawsAvailable = 4` (4 unused)
- **WHEN** the local clock crosses midnight and the player triggers any interaction (the lazy daily-reset job runs)
- **THEN** `dmnTimeAxisDrawsConsumedToday` SHALL reset to 0
- **AND** `dmnBehaviorAxisDrawsConsumedToday` SHALL reset to 0
- **AND** the cumulative expedition-clears counter (`dmnTimeAxisMinutesAccrued`) SHALL reset to 0
- **AND** `dmnDrawsAvailable` SHALL remain at 4 (unused draws persist across days)

### Requirement: Drawing a DMN card SHALL roll equipment first, else deposit a consumable to the backpack

When `dmnDrawsAvailable >= 1` and the player triggers a draw, the system SHALL:

1. Check pool-exhaustion preconditions. If `dmnCards.length === 22` AND every equipment id in the catalog is owned, the draw SHALL be a no-op: `dmnDrawsAvailable` SHALL NOT decrement, no `dmnCards` / `inventory` / `equipment` / `dmnEventLog` row SHALL be written, and the engine SHALL return a `pools_exhausted` result. The UI SHALL prevent the draw from being invoked in this state by disabling the draw button (see exhausted-state scenario below); this engine guard exists only as a defensive layer for stale clients.
2. Otherwise decrement `dmnDrawsAvailable` by 1.
3. Roll `EQUIPMENT_DRAW_RATE` against the unowned equipment pool (`neurons-acceleration-system`). On a hit with a non-empty pool → award one unowned equipment (rarity-rolled) and STOP (no consumable for this draw).
4. Otherwise (equipment roll missed OR equipment pool empty) select one consumable card by remaining rarity weights from the **unowned** consumable subset (rerolling within-tier if needed, falling through tiers if the tier is exhausted). Insert a `dmnCards` row (collection record) and increment the matching `inventory` backpack count.
   - If the consumable subset is empty (all 22 owned) AND the equipment pool is non-empty, the draw SHALL re-roll on the equipment pool until it lands (a guaranteed equipment grant, since by precondition not both pools are exhausted).
5. Append `(cardId | equipmentId, dispatchedAt)` to `dmnEventLog`.
6. Display the reveal UI (equipment vs consumable form).

If `dmnDrawsAvailable === 0`, the draw button SHALL be disabled with a tooltip explaining how to earn draws.

#### Scenario: Consumable draw records collection + backpack stock

- **GIVEN** `dmnDrawsAvailable = 3` and the equipment roll misses
- **WHEN** the player draws and a consumable is rolled
- **THEN** `dmnDrawsAvailable` SHALL become 2
- **AND** the `dmnCards` table SHALL gain exactly 1 new collection row
- **AND** the matching `inventory` count SHALL increment by 1
- **AND** the consumable's effect SHALL NOT fire automatically

#### Scenario: Equipment draw awards a permanent and skips the consumable

- **GIVEN** the equipment roll hits with a non-empty unowned pool
- **WHEN** the draw resolves
- **THEN** exactly one new `equipment` row SHALL be inserted
- **AND** no `dmnCards` or `inventory` change SHALL occur for that draw

#### Scenario: Both pools exhausted disables the draw button and the engine refuses to decrement

- **GIVEN** the player has `dmnCards.length === 22` (consumable dex complete) AND every equipment id in the catalog is owned
- **WHEN** the player opens the DMN draw modal with `dmnDrawsAvailable = 4`
- **THEN** the draw button SHALL be disabled with a tooltip explaining that both collections are complete
- **AND** if a stale client somehow invokes `drawDmnCard()` directly, the engine SHALL return a `pools_exhausted` no-op result
- **AND** `dmnDrawsAvailable` SHALL remain at 4
- **AND** no `dmnCards` / `inventory` / `equipment` / `dmnEventLog` row SHALL be written

#### Scenario: Consumable dex full but equipment unowned guarantees equipment grant

- **GIVEN** `dmnCards.length === 22` (consumable dex complete) AND at least one equipment id is unowned AND `dmnDrawsAvailable = 1`
- **WHEN** the player draws
- **THEN** `dmnDrawsAvailable` SHALL become 0
- **AND** exactly one new `equipment` row SHALL be inserted (the equipment roll is repeated until a hit since the consumable fallback is unavailable)
- **AND** no `dmnCards` or `inventory` change SHALL occur
