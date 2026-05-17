## MODIFIED Requirements

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
