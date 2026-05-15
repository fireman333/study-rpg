## MODIFIED Requirements

### Requirement: Fresh save SHALL seed 3 outpatient rooms at 診所 tier baseline

The system SHALL detect empty `rooms` table on app boot and seed it with `TIER_ROOMS['診所']` from the `clinic-level-up` capability — exactly 3 entries:

| id | type | baseRate | roomFacility | assignedDoctorId | slot |
|---|---|---|---|---|---|
| `outpatient-1` | outpatient | 10 | 1.0 | null | 1 |
| `outpatient-2` | outpatient | 10 | 1.0 | null | 2 |
| `outpatient-3` | outpatient | 10 | 1.0 | null | 3 |

These constants represent 診所 tier defaults. The `clinic-level-up` capability extends the seeding to higher tiers (區域醫院, 醫學中心) via the same `TIER_ROOMS` table; tier upgrade logic appends new rooms when reputation crosses thresholds. The seeding logic SHALL be idempotent — re-running it on a non-empty table SHALL NOT duplicate or modify existing rooms.

The `INITIAL_ROOMS` named constant from `wire-hospital-tycoon-engine` is REMOVED in favor of `TIER_ROOMS['診所']` to enforce a single source of truth for the 診所 roster across both seeding and tier-upgrade code paths.

#### Scenario: New save seeds 3 outpatient rooms

- **GIVEN** a fresh IndexedDB with no `rooms` table entries
- **WHEN** the hospital app boots
- **THEN** the `rooms` table SHALL contain exactly 3 entries with `type = 'outpatient'`
- **AND** each room's `assignedDoctorId` SHALL equal `null`
- **AND** each room's `baseRate` SHALL equal `10`
- **AND** the source of the seed SHALL be `TIER_ROOMS['診所']` (not a separate `INITIAL_ROOMS` constant)

#### Scenario: Re-seeding is idempotent

- **GIVEN** the `rooms` table already contains 3 entries with `slot = 1, 2, 3`
- **AND** one room has been modified (`roomFacility = 1.5`)
- **WHEN** the seeding logic runs again on app boot
- **THEN** the `rooms` table SHALL still contain exactly 3 entries
- **AND** the modified room's `roomFacility` SHALL remain `1.5` (not reset to `1.0`)
