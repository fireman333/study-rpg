# hospital-events Specification — delta for fix-session-b-dogfood-findings

## MODIFIED Requirements

### Requirement: Medical malpractice event SHALL offer spend-revenue resolution

The 醫療糾紛 event SHALL present the player with two resolution choices:

- **(a) 私下和解 — spend revenue**: cost = `min(max(10_000, revenue × 10%), revenue)` — at least 10k or 10% whichever larger, but capped at current revenue (cannot drive negative). If `revenue < 10_000`, this option SHALL be disabled with a「營收不足」label and only path (b) is selectable.
- **(b) 接受懲處 — lose reputation**: no revenue cost. Reputation SHALL decrement by `MALPRACTICE_PENALTY_REP = 5,000`, floored at 0 (cannot go negative). The **eventLog row AND resolver return value SHALL report the ACTUAL reputation delta after the floor clamp**, not the intent constant. When player has rep ≥ 5,000, actual delta = -5,000; when player has rep 864, actual delta = -864.

The event SHALL auto-resolve to choice (b) if the player does not respond within 24 hours (wall-clock since `triggeredAt`). The auto-resolution SHALL follow the same actual-delta reporting rule.

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
- **AND** the outcome modal SHALL display the actual deduction amount, not the intent constant

#### Scenario: Timeout defaults to penalty with actual-delta reporting

- **GIVEN** an active 醫療糾紛 that triggered 25 hours ago without response and `reputation = 200`
- **WHEN** the next tick fires
- **THEN** the event SHALL auto-resolve as `resolution: 'penalized'`
- **AND** `reputation` SHALL equal `0`
- **AND** `eventLog.reputationDelta` SHALL equal `-200` (actual delta, NOT intent -5,000)

## ADDED Requirements

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
