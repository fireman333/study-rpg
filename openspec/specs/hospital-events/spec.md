# hospital-events Specification

## Purpose

特殊事件 — 隨機觸發 7 種事件（4 modal + 3 toast），rate scaled by reputation（×0.5–×3.0 clamp）。Modal 事件等玩家解；toast 事件 tick 內直接 apply outcome。負面 reputation loss 1k–10k 隨機，組合 rate ≤ 5%。

## Requirements
### Requirement: Special events SHALL trigger probabilistically during active sessions with reputation-scaled rate

The system SHALL roll for a special event at the end of every Nth tick during an active study session (default `EVENT_TICK_INTERVAL = 60` ticks ≈ 5 minutes of session time). Event base trigger rates SHALL be scaled by current reputation via `reputationScaleFactor = clamp(reputation / 100_000, 0.5, 3.0)`. Higher reputation → more events (good and bad both more frequent).

Effective trigger rate per roll = `baseRate × reputationScaleFactor`, **capped at `0.3` (30% per roll)** to avoid event spam. A **post-resolution cooldown** SHALL prevent the event roll from firing for at least 5 minutes of active session time after any event resolves — `nextEventRollAllowedAt = lastResolvedAt + 5 minutes (session time, not wall-clock)`. Event categories:

| Event | Polarity | Base rate | Conditions |
|---|---|---|---|
| 醫療糾紛 (medical-malpractice) | Negative (-revenue OR -reputation) | 8% | tier ≥ 區域醫院, totalThroughput ≥ 50 |
| 負面新聞 (negative-news) | Negative (-reputation only) | 3% | tier ≥ 區域醫院 |
| 學會質疑 (peer-criticism) | Negative (-reputation only) | 2% | tier ≥ 醫學中心 |
| VIP 病人 (vip-patient) | Positive | 5% | tier ≥ 區域醫院 |
| 急診加開 (emergency-shift) | Positive | 3% | tier ≥ 醫學中心 |
| 醫療評鑑 (audit-event) | Mixed | 2% | tier ≥ 醫學中心 |
| 學會獎項 (research-award) | Positive | 2% | tier ≥ 醫學中心 |

At most one event SHALL be active at a time. If an event roll occurs while one is already pending resolution, the new roll SHALL be skipped. Each event SHALL persist a row in `eventLog` with `triggeredAt`, `eventType`, `resolution`, `resolvedAt`.

The combined negative-reputation event rates (`負面新聞 + 學會質疑`) SHALL NOT exceed 5% effective at any reputation level — these "random rep loss" events are intended to be a minor pressure, not a dominant mechanic. Each negative-rep event SHALL deduct between 1,000 and 10,000 reputation per occurrence (drawn uniformly).

#### Scenario: Tier 1 clinic immune to events

- **GIVEN** tier `'診所'` and active session
- **WHEN** the event tick roll fires
- **THEN** no event SHALL trigger (all event conditions require ≥ 區域醫院)

#### Scenario: Reputation scales event rate

- **GIVEN** tier `'醫學中心'`, reputation 500,000 (so `reputationScaleFactor = 3.0` capped)
- **WHEN** an event roll fires
- **THEN** the effective trigger rate of 醫療糾紛 SHALL equal `min(8% × 3.0, 30%) = 24%`
- **AND** the effective trigger rate of 學會獎項 SHALL equal `2% × 3.0 = 6%`

#### Scenario: Post-resolution cooldown blocks immediate re-trigger

- **GIVEN** an event resolved 3 minutes ago (session time)
- **WHEN** the next event tick (5 min) fires
- **THEN** the event roll SHALL be skipped (cooldown not elapsed; need ≥ 5 min since last resolve)
- **AND** the next roll SHALL be attempted 2 minutes later (at the 5-min cooldown mark)

#### Scenario: Negative news deducts random reputation

- **GIVEN** active session at tier `'區域醫院'`, reputation 100,000
- **WHEN** a 負面新聞 event triggers and resolves (auto-resolves immediately, no player choice)
- **THEN** reputation SHALL decrement by a uniform random value in `[1000, 10000]`
- **AND** the event SHALL be logged in `eventLog`

#### Scenario: Single event at a time

- **GIVEN** an active 醫療糾紛 event awaiting resolution
- **WHEN** the next event tick roll fires and would normally trigger VIP 病人
- **THEN** no new event SHALL be queued
- **AND** the existing 醫療糾紛 SHALL remain the only active event

### Requirement: Medical malpractice event SHALL offer spend-revenue resolution

The 醫療糾紛 event SHALL present the player with two resolution choices:

- **(a) 私下和解 — spend revenue**: cost = `min(max(10_000, revenue × 10%), revenue)` — at least 10k or 10% whichever larger, but capped at current revenue (cannot drive negative). If `revenue < 10_000`, this option SHALL be disabled with a「營收不足」label and only path (b) is selectable.
- **(b) 接受懲處 — lose reputation**: no revenue cost. Reputation SHALL decrement by `MALPRACTICE_PENALTY_REP = 5,000`, floored at 0 (cannot go negative). The **eventLog row AND resolver return value SHALL report the ACTUAL reputation delta after the floor clamp**, not the intent constant. When player has rep ≥ 5,000, actual delta = -5,000; when player has rep 864, actual delta = -864.

The event SHALL auto-resolve to choice (b) if the player does not respond within 24 hours (wall-clock since `triggeredAt`). The auto-resolution SHALL follow the same actual-delta reporting rule: the `eventLog.reputationDelta` row written by the auto-resolve branch in `tick.ts` SHALL equal `newReputation - prevReputation` (negative, magnitude ≤ prevReputation), not `-MALPRACTICE_PENALTY_REP`.

The 接受懲處 button label SHALL surface the effective deduction. When `counters.reputation >= MALPRACTICE_PENALTY_REP`, the button SHALL display 「接受懲處（−{MALPRACTICE_PENALTY_REP} 聲望）」. When `counters.reputation < MALPRACTICE_PENALTY_REP`, the button SHALL append a 「將至 0」 parenthetical clarifier (e.g., 「接受懲處（−5,000 聲望（將至 0））」) so the player can see the realized floor consequence before clicking.

#### Scenario: Player chooses settlement

- **GIVEN** an active 醫療糾紛 and `revenue = 200,000`
- **WHEN** the player selects 私下和解
- **THEN** `revenue` SHALL equal `180,000` (10% deducted)
- **AND** the event SHALL transition to `resolution: 'settled'`
- **AND** `reputation` SHALL remain unchanged

#### Scenario: Settlement disabled when revenue below 10k

- **GIVEN** an active 醫療糾紛 and `revenue = 5,000`
- **WHEN** the modal renders
- **THEN** the 私下和解 button SHALL be disabled
- **AND** the modal SHALL display `「營收不足，無法和解」`
- **AND** only the 接受懲處 path SHALL be selectable

#### Scenario: Player accepts penalty with sufficient reputation

- **GIVEN** an active 醫療糾紛 and `reputation = 100,000`
- **WHEN** the player selects 接受懲處
- **THEN** `reputation` SHALL equal `95,000`
- **AND** `eventLog.reputationDelta` SHALL equal `-5,000`
- **AND** resolver return value `reputationDelta` SHALL equal `-5,000`

#### Scenario: Player accepts penalty with reputation below penalty amount

- **GIVEN** an active 醫療糾紛 and `reputation = 864`
- **WHEN** the player selects 接受懲處
- **THEN** `reputation` SHALL equal `0` (floored)
- **AND** `eventLog.reputationDelta` SHALL equal `-864` (actual delta, NOT intent -5,000)
- **AND** resolver return value `reputationDelta` SHALL equal `-864`
- **AND** the outcome modal SHALL display the actual deduction amount

#### Scenario: Timeout defaults to penalty with actual-delta reporting

- **GIVEN** an active 醫療糾紛 that triggered 25 hours ago without response and `reputation = 200`
- **WHEN** the next tick fires
- **THEN** the event SHALL auto-resolve as `resolution: 'penalized'`
- **AND** `reputation` SHALL equal `0`
- **AND** `eventLog.reputationDelta` SHALL equal `-200` (actual delta, NOT intent -5,000)

#### Scenario: Auto-resolve partial floor reports actual delta

- **GIVEN** an active 醫療糾紛 that triggered 25 hours ago without response and `reputation = 1,500`
- **WHEN** the next tick fires
- **THEN** the event SHALL auto-resolve as `resolution: 'auto-resolved-penalty'`
- **AND** `reputation` SHALL equal `0` (floored, since 1,500 < 5,000 penalty)
- **AND** `eventLog.reputationDelta` SHALL equal `-1,500` (actual delta, NOT intent -5,000)
- **AND** telemetry sums over `eventLog.reputationDelta` SHALL match the realized counter movement to the rep, not the sum of intent constants

#### Scenario: Malpractice button label reflects effective deduction when rep low

- **GIVEN** an active 醫療糾紛 modal is showing and `counters.reputation = 3,000`
- **WHEN** the modal renders
- **THEN** the 接受懲處 button label SHALL include the 「將至 0」 parenthetical (e.g., 「接受懲處（−5,000 聲望（將至 0））」)
- **AND** the player SHALL be able to predict the floored outcome before clicking

#### Scenario: Malpractice button label omits 將至 0 hint when rep sufficient

- **GIVEN** an active 醫療糾紛 modal is showing and `counters.reputation = 12,000`
- **WHEN** the modal renders
- **THEN** the 接受懲處 button label SHALL display 「接受懲處（−5,000 聲望）」 with no parenthetical clarifier
- **AND** clicking the button SHALL deduct exactly 5,000 reputation

### Requirement: Medical audit event SHALL apply pass/fail reputation change with actual-delta reporting

The 醫療評鑑 (audit-event) SHALL roll a pass/fail outcome via `Math.random() < AUDIT_PASS_PROBABILITY` (default 70%):

- **Pass** (`AUDIT_PASS_PROBABILITY`): reputation += `AUDIT_PASS_REPUTATION` (no floor concern; addition only).
- **Fail** (1 - `AUDIT_PASS_PROBABILITY`): reputation deducted by `AUDIT_FAIL_REPUTATION_LOSS`, floored at 0.

The eventLog row + resolver return value SHALL report ACTUAL reputation delta after floor, identical to malpractice accept-penalty semantics. The outcome modal copy SHALL display the actual change amount.

#### Scenario: Audit pass increments reputation

- **GIVEN** an active 醫療評鑑, `AUDIT_PASS_REPUTATION = 5,000`, current `reputation = 10,000`
- **WHEN** the audit resolves as pass
- **THEN** `reputation` SHALL equal `15,000`
- **AND** `eventLog.reputationDelta` SHALL equal `+5,000`
- **AND** the outcome modal SHALL render the success branch

#### Scenario: Audit fail with sufficient reputation

- **GIVEN** an active 醫療評鑑, `AUDIT_FAIL_REPUTATION_LOSS = 3,000`, current `reputation = 10,000`
- **WHEN** the audit resolves as fail
- **THEN** `reputation` SHALL equal `7,000`
- **AND** `eventLog.reputationDelta` SHALL equal `-3,000`

#### Scenario: Audit fail with reputation below loss amount

- **GIVEN** an active 醫療評鑑, `AUDIT_FAIL_REPUTATION_LOSS = 3,000`, current `reputation = 500`
- **WHEN** the audit resolves as fail
- **THEN** `reputation` SHALL equal `0` (floored)
- **AND** `eventLog.reputationDelta` SHALL equal `-500` (actual delta, NOT intent -3,000)
- **AND** the outcome modal SHALL display the actual deduction amount

### Requirement: VIP patient event SHALL grant temporary throughput boost

The VIP 病人 event SHALL grant `throughputMultiplier = 2.0` for the next 10 minutes of active session time (paused on session-pause; resumes on session-resume). The boost SHALL apply to all rooms equally. When the boost expires, the event SHALL transition to `resolution: 'completed'`.

#### Scenario: VIP boost doubles throughput

- **GIVEN** an active session with `totalThroughput = 100/min` and a VIP event just triggered
- **WHEN** the next minute of session elapses
- **THEN** revenue SHALL increase by approximately `200` (2× normal rate)
- **AND** reputation SHALL increase by approximately `200`

#### Scenario: VIP boost pauses with session

- **GIVEN** a VIP event has 7 minutes remaining and the session pauses
- **WHEN** the session resumes 10 minutes later
- **THEN** the VIP event SHALL still have 7 minutes remaining
- **AND** the boost SHALL re-apply

### Requirement: Event UI SHALL distinguish actionable (modal) from passive (toast) events

The system SHALL classify events into two UI categories:

**Actionable events** (modal required — player choice impacts outcome):
- 醫療糾紛 (revenue vs reputation choice)
- VIP 病人 (acknowledge to start boost)
- 急診加開 (acknowledge to start boost)
- 醫療評鑑 (mixed outcome with choice)

For these, the system SHALL display a modal at the top of the viewport with title / description / action buttons / countdown. The modal SHALL persist across page navigation until resolved or auto-resolved.

**Passive events** (toast notification — auto-resolve, no player input):
- 負面新聞 (auto-deduct rep)
- 學會質疑 (auto-deduct rep)
- 學會獎項 (auto-add rep)

For these, the system SHALL show a toast notification at the top-right corner with title / brief description / outcome (e.g., `「負面新聞：-3,520 聲望」`). The toast SHALL auto-dismiss after 5 seconds. The event SHALL be applied to counters immediately (no waiting for player acknowledgment) and SHALL still be logged in `eventLog`.

Passive toast events with `reputation-loss` outcomes SHALL clamp reputation at floor 0 (reputation cannot go negative). The **eventLog row AND the value passed to the toast UI SHALL report the ACTUAL reputation delta after the floor clamp**, not the intent magnitude — parity with the modal-event actual-delta contract enforced by `Medical malpractice event` and `Medical audit event` requirements. When the starting reputation exceeds the loss magnitude, actual = intent; when starting reputation is below the loss magnitude, the toast SHALL display the realized (smaller) magnitude and the `eventLog.reputationDelta` SHALL be the negative of the realized magnitude. `reputation-gain` outcomes SHALL pass through unchanged (no floor concern; realized = intent).

#### Scenario: Actionable event shows modal

- **GIVEN** a 醫療糾紛 event triggers
- **WHEN** the event UI renders
- **THEN** a modal SHALL appear with 私下和解 / 接受懲處 buttons
- **AND** the player SHALL be required to choose (or wait for 24-hour auto-resolution)

#### Scenario: Passive event shows toast and auto-applies

- **GIVEN** a 負面新聞 event triggers, current reputation 100,000
- **WHEN** the event resolves
- **THEN** a toast notification SHALL appear with the rep loss amount
- **AND** `reputation` SHALL decrement immediately (no player action required)
- **AND** the toast SHALL auto-dismiss after 5 seconds
- **AND** `eventLog` SHALL record the event with `resolution: 'auto-applied'`

#### Scenario: Modal persists across navigation

- **GIVEN** a 醫療糾紛 modal is showing on `/study`
- **WHEN** the player navigates to `/hospital`
- **THEN** the modal SHALL remain visible on `/hospital`
- **AND** the player SHALL still be able to resolve from any page

#### Scenario: Toast reputation-loss reports actual delta when floor clamps

- **GIVEN** the player's current reputation is `200`
- **AND** a 負面新聞 toast event rolls with intent loss magnitude `3,520`
- **WHEN** the tick scheduler applies the outcome
- **THEN** `reputation` SHALL equal `0` (floored, not `−3,320`)
- **AND** `eventLog.reputationDelta` SHALL equal `−200` (actual delta, NOT intent `−3,520`)
- **AND** the toast UI text SHALL display the loss as `−200 聲望` (actual, NOT intent `−3,520`)

#### Scenario: Toast reputation-gain reports intent unchanged (no floor)

- **GIVEN** the player's current reputation is `42,000`
- **AND** a 學會獎項 toast event rolls with intent gain magnitude `2,500`
- **WHEN** the tick scheduler applies the outcome
- **THEN** `reputation` SHALL equal `44,500`
- **AND** `eventLog.reputationDelta` SHALL equal `+2,500`
- **AND** the toast UI text SHALL display the gain as `+2,500 聲望`
