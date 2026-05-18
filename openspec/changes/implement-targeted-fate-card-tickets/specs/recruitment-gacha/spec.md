## ADDED Requirements

### Requirement: Targeted ticket consumption SHALL roll target banner with rarity-floor enforcement

When a player consumes a targeted ticket (a row in `targetedTickets` with `status = 'assigned'` and a non-null `subjectId`), the system SHALL execute a recruitment roll on the ticket's `subjectId` banner with rarity-floor enforcement. The floor SHALL be `ticket.minRarity` (`P3` for epic-sourced tickets, `P2` for legendary-sourced).

Enforcement strategy: deterministic reroll. The system SHALL roll the standard `recruitment-gacha` weight table for the banner up to `TARGETED_REROLL_CAP = 5` times. If any roll produces a rarity `>= minRarity` (per rarity ordering `P1 > P2 > P3 > P4 > P5`), the result SHALL be accepted. If all 5 rerolls produce rarities below the floor, the system SHALL force a roll at the floor rarity itself by sampling uniformly from the banner's pool of doctors at exactly `minRarity` (the floor result is guaranteed, never falls back further).

On successful consumption, the system SHALL:

1. Create the resulting doctor row in `doctors` table per existing `recruitment-gacha` Req「Doctor card schema SHALL include required identity, rarity, and assignment fields」
2. Update the targeted ticket row: `status = 'consumed'`, `consumedAt = Date.now()`, `resultDoctorId = <doctor.id>`
3. Append a `targetedTicketHistory` row with `event = 'consumed'` and `meta = { doctorId, rarity }`

Consumption SHALL NOT consume any row from `tickets.available` and SHALL NOT increment the global pity counter described by Req「Pity mechanism SHALL force P3+ at 30 and P2+ at 100 rolls」.

#### Scenario: Epic ticket consume returns P3 or above

- **GIVEN** a targeted ticket with `subjectId = '外科'`, `minRarity = 'P3'`, `status = 'assigned'`
- **WHEN** the player consumes it
- **THEN** the resulting doctor's `rarity` SHALL satisfy `rarityIsAtLeast(rarity, 'P3')` (i.e., P3 / P2 / P1)
- **AND** the ticket row SHALL update to `status = 'consumed'` with `resultDoctorId` set
- **AND** `tickets.available` SHALL NOT change

#### Scenario: Legendary ticket consume returns P2 or P1

- **GIVEN** a targeted ticket with `minRarity = 'P2'`, `status = 'assigned'`, `subjectId = '內科'`
- **WHEN** the player consumes it
- **THEN** the resulting doctor's `rarity` SHALL be either `P2` or `P1`

#### Scenario: All 5 rerolls below floor forces floor-tier doctor

- **GIVEN** a targeted ticket with `minRarity = 'P2'`, and the random generator deterministically produces 5 consecutive rolls of P3 or lower
- **WHEN** consume executes
- **THEN** after exhausting the 5-reroll budget, the system SHALL sample uniformly from the 外科 pool of P2 doctors
- **AND** the resulting doctor SHALL have `rarity = 'P2'`

#### Scenario: Consume does not increment global pity

- **GIVEN** `pityCounter = 25` (from prior global ticket rolls) and a targeted ticket with `minRarity = 'P3'`
- **WHEN** the player consumes the targeted ticket and the reroll resolves to P4 → P3 (accepted on attempt 2)
- **THEN** `pityCounter` SHALL remain `25` (unchanged)
- **AND** the resulting doctor SHALL have `rarity = 'P3'`

### Requirement: Targeted ticket consume UI SHALL be a distinct section on the recruitment page

The recruitment page SHALL render targeted tickets (`status = 'assigned'`, `subjectId != null`) in a distinct section above or alongside the existing banner grid, visually marked to distinguish from global ticket consumption flow. Each entry SHALL display the assigned `subjectId`, `minRarity` floor, and source tier (epic / legendary). A consume action on each row SHALL trigger a confirmation step before executing the roll.

The section SHALL NOT be visible if the player has no `status = 'assigned'` targeted tickets (it MAY still show a pending chip if `status = 'pending'` rows exist).

#### Scenario: Recruitment page shows assigned targeted tickets

- **GIVEN** the player has 2 `assigned` targeted tickets (one epic / 內科, one legendary / 外科) and 0 `pending`
- **WHEN** the player opens the recruitment page
- **THEN** a "targeted tickets" section SHALL be visible
- **AND** the section SHALL list 2 rows: 內科 (P3+ floor, epic-sourced) and 外科 (P2+ floor, legendary-sourced)
- **AND** each row SHALL have a consume action

#### Scenario: No targeted tickets hides the section

- **GIVEN** the player has 0 targeted tickets (none `pending` or `assigned`)
- **WHEN** the player opens the recruitment page
- **THEN** the targeted tickets section SHALL NOT be rendered
- **AND** only the existing banner grid SHALL be visible
