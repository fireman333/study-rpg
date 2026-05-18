## MODIFIED Requirements

### Requirement: Voluntary doctor retirement SHALL allow payroll relief with 24-hour diversification grace

The system SHALL allow the player to manually retire (fire) an owned doctor at any time via a「退休醫師」button on the doctor detail panel. The retired doctor SHALL:

- Be removed from `db.doctors` (record deleted)
- If currently assigned to a room, the room's `assignedDoctorId` SHALL be set to `null` in the same transaction
- A `retirementLog` row SHALL be appended with `{retiredAt, doctorId, rarity, subjectId}`
- Refund: `retirement_refund = doctor.powerMultiplier × 1000` revenue (e.g., P1 → 5,000, P5 → 500)

**24-hour diversification grace**: For 24 wall-clock hours after retirement, the retired doctor's `subjectId + rarity` SHALL still count toward the diversification gate as if the doctor still existed. After 24 hours, the credit expires and the player may fall back below the gate threshold (no tier regression — tier stays, but next-tier upgrade is blocked).

**P1-anchor exception (no grace)**: The `requireP1` sub-requirement at the 醫學中心 → 國家級教學醫院 tier-upgrade gate (see `clinic-level-up` spec) SHALL NOT honor retirement grace. Only live (non-retired) doctors with rarity P1 SHALL count toward `requireP1`. A player who retires their only P1 doctor SHALL immediately lose `requireP1` satisfaction at the tier-upgrade gate, even within the 24-hour grace window. This closes the double-dip exploit where a player retires their P1 for the 5,000 refund and still satisfies the P1 anchor for the next upgrade — the 24h grace exists to absorb mid-build reshuffling churn, not to subsidize the top-tier anchor requirement.

The retirement button SHALL be guarded by a confirmation modal showing:
- Refund amount
- Diversification impact (which gate this doctor contributes to, when the 24-hour credit expires)
- If retiring the player's only P1: an explicit warning that `requireP1` will be lost immediately at the 國家級 upgrade gate
- "Cannot be undone" warning

#### Scenario: Retire P3 doctor refunds revenue and frees room

- **GIVEN** a P3 doctor with `assignedRoomId = 'outpatient-2'` and `revenue = 1,000`
- **WHEN** the player retires this doctor via confirmation
- **THEN** `db.doctors` SHALL no longer contain this doctor
- **AND** room `outpatient-2.assignedDoctorId` SHALL equal `null`
- **AND** `revenue` SHALL equal `3,000` (1,000 + P3 refund 2,000)
- **AND** `retirementLog` SHALL contain a new row with the retired doctor's data

#### Scenario: 24-hour grace preserves diversification credit

- **GIVEN** the player has exactly 8 distinct P3+ subjects (meeting 區域 → 醫學中心 gate)
- **WHEN** the player retires one of those P3 doctors
- **THEN** for the next 24 hours, the diversification count SHALL still report `8 distinct P3+ subjects`
- **AND** after 24 hours, the count SHALL drop to `7` (if no new P3+ in that subject was recruited)

#### Scenario: Grace doesn't cause tier regression

- **GIVEN** the player is at tier `'醫學中心'` (already upgraded with 8 P3+ subjects)
- **WHEN** the player retires a P3 doctor and 24 hours pass without replacement
- **THEN** `gameCounters.tier` SHALL still equal `'醫學中心'` (no regression per `clinic-level-up` monotonicity)
- **AND** the diversification count SHALL drop to 7
- **AND** the player SHALL NOT be eligible to upgrade to `'國家級教學醫院'` until they re-collect that subject at P2+

#### Scenario: Retiring only P1 immediately fails requireP1 despite 24h grace

- **GIVEN** the player is at tier `'醫學中心'`, has 10 distinct P2+ subjects, exactly 1 P1 doctor, and `reputation = 2,500,000` (above the 國家級 threshold)
- **WHEN** the player retires that sole P1 doctor (refund 5,000 credited to revenue)
- **AND** the next tick fires within the 24-hour grace window
- **THEN** the tier-upgrade gate SHALL evaluate `requireP1 = false` (live-only count = 0)
- **AND** `gameCounters.tier` SHALL still equal `'醫學中心'` (upgrade blocked)
- **AND** the player SHALL be required to recruit or train another live P1 before 國家級 unlocks

#### Scenario: Retiring one of multiple P1 doctors preserves requireP1

- **GIVEN** the player has 2 live P1 doctors (same or different subjects), 10 distinct P2+ subjects, and `reputation = 2,500,000`
- **WHEN** the player retires one of the P1 doctors
- **AND** the next tick fires within the 24-hour grace window
- **THEN** the tier-upgrade gate SHALL evaluate `requireP1 = true` (live-only count = 1, still ≥ 1)
- **AND** if all other gate conditions are met the tier SHALL upgrade to `'國家級教學醫院'`
