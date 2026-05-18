# hospital-finances Specification

## Purpose

財務系統 — 整合醫師薪水（全員制，proportional `powerMultiplier × 4 / min`）+ 設施升級（roomFacility 1.0 → 3.0 over 5 levels）+ 房間擴建（區域醫院以上）。診所 0% salary grace；區域以上 100% rate。

## Requirements
### Requirement: Salary SHALL drain revenue per-minute proportional to doctor powerMultiplier, all owned

The system SHALL deduct salary from `gameCounters.revenue` for **every owned doctor** (regardless of `assignedRoomId`). Bench (unassigned) doctors SHALL also contribute. Salary per doctor per minute = `doctor.powerMultiplier × SALARY_BASE` where `SALARY_BASE = 4`. Derived rates:

| Rarity | powerMultiplier | Salary per minute |
|---|---|---|
| P1 | 5.0 | 20 |
| P2 | 3.5 | 14 |
| P3 | 2.0 | 8 |
| P4 | 1.0 | 4 |
| P5 | 0.5 | 2 |

Salary rate SHALL be multiplied by a tier-staged activation factor:

| Tier | Salary rate multiplier |
|---|---|
| 診所 | 0% (grace period — salary not yet active) |
| 區域醫院 | 100% |
| 醫學中心 | 100% |
| 國家級教學醫院 | 100% |

Effective per-doctor salary per minute = `doctor.powerMultiplier × SALARY_BASE × TIER_SALARY_RATE[currentTier]`. The deduction SHALL occur within the same study session tick that accumulates revenue. When no study session is active, salary SHALL NOT be deducted.

The system SHALL include a defensive 0-floor clamp — if `revenue + deltaRevenueGross - deltaSalary < 0`, `revenue` SHALL be set to 0. However, the design invariant is that the 0-floor clamp MUST NOT trigger under default play (per design D5 math check: every tier's default config yields net positive revenue). The clamp is a safety net for edge cases (e.g., manual save manipulation) not a primary mechanic.

#### Scenario: Tier 1 診所 has zero salary drain

- **GIVEN** 5 doctors owned (3 assigned, 2 bench), tier `'診所'`, 1 minute of active session
- **WHEN** the tick fires
- **THEN** salary drain SHALL equal 0
- **AND** `revenue` SHALL increase by the full throughput amount

#### Scenario: Tier 2 區域醫院 applies proportional salary to all owned doctors

- **GIVEN** 8 P3 doctors owned (5 assigned, 3 bench), tier `'區域醫院'`, throughput 100/min, 1 minute elapsed
- **WHEN** the tick fires
- **THEN** salary drain SHALL equal `8 × 2.0 × 4 × 1.0 = 64/min`
- **AND** `revenue` SHALL change by approximately `100 - 64 = +36` per minute (always net positive at default config)

#### Scenario: Bench doctor contributes salary proportional to powerMultiplier

- **GIVEN** 5 P1 doctors owned (3 assigned, 2 bench), tier `'醫學中心'`, throughput 150/min, 1 minute elapsed
- **WHEN** the tick fires
- **THEN** salary drain SHALL equal `5 × 5.0 × 4 × 1.0 = 100/min` (all 5 owned, including 2 bench)
- **AND** `revenue` SHALL change by approximately `150 - 100 = +50` per minute

#### Scenario: Default-config endgame remains net positive

- **GIVEN** 15 doctors owned (12 P2 + 3 P1), 10 assigned (7 P2 + 3 P1), tier `'國家級教學醫院'`, default facility 1.0
- **WHEN** the tick fires for 1 minute
- **THEN** assigned throughput SHALL equal `7 × 10 × 3.5 × 1.0 + 3 × 10 × 5.0 × 1.0 = 245 + 150 = 395/min`
- **AND** salary drain SHALL equal `12 × 3.5 × 4 + 3 × 5.0 × 4 = 168 + 60 = 228/min`
- **AND** `revenue` SHALL change by approximately `+167` per minute

#### Scenario: 0-floor clamp triggers only in edge case

- **GIVEN** `revenue = 50`, throughput 100/min, salary drain 200/min (only possible if player manually manipulated state)
- **WHEN** the tick fires
- **THEN** `revenue` SHALL equal `0` (clamped from `-50`)
- **AND** no doctor SHALL be auto-fired

#### Scenario: No tick no salary

- **GIVEN** 13 owned doctors and no active study session
- **WHEN** 60 minutes of wall-clock time pass
- **THEN** `revenue` SHALL remain unchanged

### Requirement: Facility upgrade SHALL increase room.roomFacility via revenue spend

The system SHALL provide a facility upgrade action per room. Each upgrade level SHALL increment `room.roomFacility` by a fixed step, with cost scaling:

| Level | roomFacility value | Revenue cost to reach this level |
|---|---|---|
| 1 (default) | 1.0 | — (free seed) |
| 2 | 1.5 | 10,000 |
| 3 | 2.0 | 50,000 |
| 4 | 2.5 | 200,000 |
| 5 | 3.0 (max) | 1,000,000 |

Once a room reaches level 5, the upgrade button SHALL be disabled. Throughput formula remains `baseRate × powerMultiplier × roomFacility × affinityBonus` — increased `roomFacility` lifts all assigned doctors' output proportionally.

#### Scenario: Upgrade outpatient-1 from level 1 to level 2

- **GIVEN** `room.roomFacility = 1.0` and `revenue = 15,000`
- **WHEN** the player upgrades the room
- **THEN** `roomFacility` SHALL equal `1.5`
- **AND** `revenue` SHALL equal `5,000`

#### Scenario: Upgrade blocked when revenue insufficient

- **GIVEN** `room.roomFacility = 1.0` and `revenue = 5,000` (cost is 10,000)
- **WHEN** the player attempts the upgrade
- **THEN** `roomFacility` SHALL remain `1.0`
- **AND** `revenue` SHALL remain `5,000`
- **AND** the UI SHALL display an insufficient-funds error

#### Scenario: Max-level room shows disabled upgrade

- **GIVEN** `room.roomFacility = 3.0` (level 5)
- **WHEN** the upgrade UI renders
- **THEN** the upgrade button SHALL be disabled
- **AND** a label SHALL state「已達最高設施等級」or equivalent

### Requirement: Room extension SHALL allow adding extra rooms within current tier

The system SHALL allow the player to purchase additional rooms beyond the tier-default roster. Available room types and costs:

| Room type | Cost per additional unit | Max per tier |
|---|---|---|
| outpatient | 20,000 | tier default + 3 |
| surgery | 100,000 | tier default + 2 |
| ward | 300,000 | tier default + 2 |

Room extension SHALL only be available when current tier ≥ 區域醫院 (locked at 診所). Extended room ids SHALL follow `${type}-${slot}` pattern; `slot` SHALL be the next available integer. The cost calibration targets ~17 hr of saving for outpatient payback (default-config 區域醫院 +36/min net × ~17 hr ≈ 36,000 revenue → 20k cost recouped quickly and remaining revenue accelerates further expansion).

#### Scenario: Buy extra outpatient at 區域醫院 tier

- **GIVEN** tier `'區域醫院'`, 4 existing outpatient rooms (slots 1-4), and `revenue = 30,000`
- **WHEN** the player purchases 1 extra outpatient
- **THEN** `db.rooms` SHALL contain 5 outpatient rooms (slot 5 added)
- **AND** the new room SHALL have `roomFacility = 1.0` and `assignedDoctorId = null`
- **AND** `revenue` SHALL equal `10,000`

#### Scenario: Room extension blocked at 診所 tier

- **GIVEN** tier `'診所'` and `revenue = 100,000`
- **WHEN** the player opens room extension UI
- **THEN** the extension actions SHALL be disabled
- **AND** a label SHALL state「需升級至 區域醫院 以上才能擴建」or equivalent

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

### Requirement: Finance dashboard SHALL display revenue breakdown

The HomePage finance panel SHALL display:

- Current `revenue` (large number)
- Net rate per minute (revenue gain - salary drain at current throughput)
- Salary breakdown (count × rate per rarity tier)
- Last-minute delta (visible during active session)

The display SHALL be reactive to counter updates via `liveQuery`.

#### Scenario: Finance panel shows net rate

- **GIVEN** active session, throughput 100/min, salary drain 60/min
- **WHEN** the HomePage renders
- **THEN** the finance panel SHALL display a net rate of `+40/min`
