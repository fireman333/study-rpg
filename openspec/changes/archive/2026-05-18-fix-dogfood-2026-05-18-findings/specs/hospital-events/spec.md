## MODIFIED Requirements

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
