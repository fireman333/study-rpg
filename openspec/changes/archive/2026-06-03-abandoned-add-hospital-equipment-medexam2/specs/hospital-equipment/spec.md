## ADDED Requirements

### Requirement: Equipment catalog SHALL define exactly 10 items with locked 3-level cost ladders

The system SHALL export `EQUIPMENT_CATALOG: readonly EquipmentDef[]` from `packages/content-medexam2-tw/src/equipment-catalog.ts` containing exactly 10 entries with the following IDs and costs:

| ID | Display name (zh) | L1 cost | L2 cost | L3 cost |
|---|---|---|---|---|
| `ct` | 電腦斷層 | 800,000 | 3,000,000 | 10,000,000 |
| `mri` | 磁振造影 | 2,000,000 | 8,000,000 | 25,000,000 |
| `endoscopy` | 內視鏡系統 | 500,000 | 2,000,000 | 6,000,000 |
| `davinci` | 達文西手術機器人 | 5,000,000 | 20,000,000 | 60,000,000 |
| `cathlab` | 心導管室 | 1,500,000 | 5,000,000 | 15,000,000 |
| `petct` | 正子斷層 | 4,000,000 | 12,000,000 | 35,000,000 |
| `linac` | 直線加速器 | 3,000,000 | 10,000,000 | 30,000,000 |
| `ecmo` | 體外膜氧合 | 500,000 | 1,500,000 | 5,000,000 |
| `hybridor` | 複合式手術房 | 6,000,000 | 20,000,000 | 50,000,000 |
| `ngs` | 次世代定序儀 | 1,000,000 | 3,000,000 | 8,000,000 |

The cost literals SHALL be flagged `// TUNED 2026-05-23 — first design pass; revisit after dogfood telemetry` to mark them as subject to balance adjustment in a follow-up change. Future cost adjustments SHALL replace these literals via a new change, not silent in-place tweak.

#### Scenario: Catalog has exactly 10 items

- **GIVEN** a developer imports `EQUIPMENT_CATALOG` from `@study-rpg/content-medexam2-tw`
- **WHEN** the import resolves
- **THEN** the array SHALL have length exactly 10
- **AND** every `EquipmentId` in the union SHALL appear in `EQUIPMENT_CATALOG.map(e => e.id)` exactly once

#### Scenario: Cost ladder strictly monotonic per equipment

- **GIVEN** any entry in `EQUIPMENT_CATALOG`
- **WHEN** its `costByLevel` array is inspected
- **THEN** `costByLevel[0] < costByLevel[1] < costByLevel[2]` SHALL hold strictly (higher levels always cost more)

### Requirement: Each equipment level SHALL grant additive reputation and throughput bonuses

For each `EquipmentDef`, `reputationBonusByLevel` and `throughputBonusByLevel` SHALL be 3-tuples of additive decimal multipliers applied at L1 / L2 / L3 respectively. The L2 value REPLACES (not adds to) the L1 value when upgrading — i.e., an L2-owner's contribution to the multiplier is `reputationBonusByLevel[1]`, NOT `[0] + [1]`. All 10 equipment items SHALL share the same bonus schedule:

| Level | reputationBonusByLevel value | throughputBonusByLevel value |
|---|---|---|
| L1 | 0.01 (+1%) | 0.02 (+2%) |
| L2 | 0.03 (+3%) | 0.05 (+5%) |
| L3 | 0.07 (+7%) | 0.12 (+12%) |

Total hospital-wide reputation multiplier = `1 + Σ over owned[reputationBonusByLevel[level - 1]]`. Total throughput multiplier computed identically against the throughput bonus values.

The bonuses SHALL be additive across owned items (not multiplicative) — owning 5 L3 items yields `1 + 5 × 0.07 = 1.35` (+35%), NOT `1.07^5 ≈ 1.40`. This is intentional per design D2 to keep math predictable and bound multiplier inflation.

#### Scenario: Zero equipment yields multiplier 1.0

- **GIVEN** a player with no rows in the `hospitalEquipment` table
- **WHEN** `computeReputationMultiplier(owned)` is called
- **THEN** the return value SHALL equal `1.0`
- **AND** `computeThroughputMultiplier(owned)` SHALL also equal `1.0`

#### Scenario: Single L1 equipment yields +1% reputation / +2% throughput

- **GIVEN** a player owns CT at level 1 only
- **WHEN** the multipliers are computed
- **THEN** reputation multiplier SHALL equal `1.01` and throughput multiplier SHALL equal `1.02`

#### Scenario: Mixed levels stack additively

- **GIVEN** a player owns 5 equipment at L3 and 5 equipment at L1
- **WHEN** multipliers are computed
- **THEN** reputation multiplier SHALL equal `1 + 5 × 0.07 + 5 × 0.01 = 1.40` (+40%)
- **AND** throughput multiplier SHALL equal `1 + 5 × 0.12 + 5 × 0.02 = 1.70` (+70%)

#### Scenario: Upgrading L1 to L2 replaces, not stacks

- **GIVEN** a player owns CT at level 1 contributing `+0.01` to the reputation multiplier
- **WHEN** the player upgrades CT to level 2
- **THEN** CT's contribution SHALL become `+0.03` (replacing the prior `+0.01`)
- **AND** the total reputation multiplier SHALL equal `1.03`, NOT `1.04`

### Requirement: Throughput multiplier SHALL apply hospital-wide to every assigned doctor

The throughput multiplier SHALL be applied as a final factor in the existing tick-time throughput aggregation formula. The new effective per-doctor per-minute throughput SHALL equal:

```
baseRate × powerMultiplier × roomFacility × affinityBonus × (1 + Σ throughputBonus)
```

The multiplier SHALL apply uniformly to every assigned doctor in every room; it is hospital-wide, not per-room. Bench / unassigned doctors continue to contribute zero throughput (unaffected by equipment).

#### Scenario: Equipment multiplier integrates with existing throughput factors

- **GIVEN** a player at tier `'醫學中心'` with `roomFacility = 1.5`, 1 P3 doctor (powerMultiplier 2.0) assigned to outpatient-1, `affinityBonus = 1.2`, and 2 L1 CT scanners installed (throughput bonus +2% each)
- **WHEN** the tick fires for 1 minute
- **THEN** the throughput contribution from this doctor SHALL equal `10 × 2.0 × 1.5 × 1.2 × (1 + 0.02 + 0.02) = 10 × 2.0 × 1.5 × 1.2 × 1.04 = 37.44 patients/min`
- **AND** without equipment, the same configuration SHALL yield `36.0 patients/min` (verifying the +4% lift)

### Requirement: Reputation multiplier SHALL apply to every reputation accrual path

The reputation multiplier SHALL be applied as a final factor at every code path that awards reputation to the player. This includes:

- Quiz answer rewards (`apps/medexam2-hospital-tw/src/services/quiz-rewards.ts`)
- Reading session reputation (`apps/medexam2-hospital-tw/src/services/reading-rewards.ts` or equivalent)
- Mock exam rewards (`apps/medexam2-hospital-tw/src/services/mock-exam.ts`)
- Mentor daily rewards (`apps/medexam2-hospital-tw/src/services/mentor.ts`)
- Fate card non-reputation-deducting reward paths (currently none, but reserved for future)

The multiplier SHALL NOT apply to passive / idle / AFK reputation — there is no passive reputation accrual in the existing design, and equipment SHALL NOT introduce one. The multiplier strictly amplifies active-play reputation.

#### Scenario: Quiz reputation reward respects multiplier

- **GIVEN** a player completes a quiz question that would award 100 baseline reputation
- **AND** the player owns 1 L3 CT (reputation bonus +7%)
- **WHEN** the reward is computed and persisted
- **THEN** `gameCounters.reputation` SHALL increment by `100 × 1.07 = 107`

#### Scenario: AFK time grants no reputation regardless of equipment

- **GIVEN** a player owns 10 L3 equipment (reputation multiplier 1.70)
- **WHEN** the player is offline for 1 hour with no active sessions
- **THEN** `gameCounters.reputation` SHALL NOT increase during that hour
- **AND** the multiplier SHALL ONLY take effect on the player's next active reputation-awarding action

### Requirement: Equipment SHALL be purchasable at any hospital tier, gated only by revenue

The system SHALL allow the player to purchase or upgrade any equipment at any hospital tier (`診所` / `區域醫院` / `醫學中心` / `國家級教學醫院`). The only gate SHALL be `gameCounters.revenue >= EquipmentDef.costByLevel[targetLevel - 1]`. No tier-based unlock SHALL exist.

The UI MAY display a soft advisory `「建議：先升 區域 解鎖房間擴建」` chip on equipment cards when the player is at T1 (`診所`), but the purchase SHALL NOT be blocked.

#### Scenario: T1 player with sufficient revenue can buy CT L1

- **GIVEN** a player at `tier = '診所'` with `revenue = 1,000,000`
- **WHEN** the player taps「購買 CT (800,000)」 and confirms
- **THEN** the purchase SHALL succeed
- **AND** `revenue` SHALL equal `200,000`
- **AND** the `hospitalEquipment` table SHALL contain `{ equipmentId: 'ct', level: 1, ... }`

#### Scenario: Insufficient revenue blocks purchase

- **GIVEN** a player with `revenue = 100,000` and CT L1 costing 800,000
- **WHEN** the player taps「購買 CT」
- **THEN** the purchase SHALL be blocked
- **AND** `revenue` SHALL remain `100,000`
- **AND** the UI SHALL display an insufficient-revenue error

#### Scenario: Already-max L3 equipment shows disabled upgrade button

- **GIVEN** the player owns CT at level 3
- **WHEN** the CT card renders
- **THEN** the upgrade button SHALL be disabled
- **AND** the card SHALL display a label「已達最高等級」

### Requirement: Owned equipment SHALL persist in Dexie + sync via R2 bundle

The system SHALL persist owned equipment in the Dexie table `hospitalEquipment` (one row per owned equipment ID, schema bumped to v16). Each row SHALL carry `{ equipmentId, level, purchasedAt, upgradedAt, updatedAt }`. The `updatedAt` field SHALL be Unix milliseconds and SHALL update on every level change for last-write-wins sync resolution.

The R2 sync bundle `m2-snapshot.json.gz` SHALL include the `hospitalEquipment` array under schema_version 2. Old clients reading new bundles SHALL ignore the unknown key; new clients reading old bundles (schema_version 1) SHALL default the array to empty.

#### Scenario: Dexie persistence survives reload

- **GIVEN** the player has purchased CT at L1 and MRI at L2
- **WHEN** the app reloads
- **THEN** `db.hospitalEquipment.toArray()` SHALL return 2 rows with the persisted levels
- **AND** the multiplier helpers SHALL recompute the same values as before reload

#### Scenario: R2 bundle includes equipment array

- **GIVEN** the player has 3 owned equipment rows
- **WHEN** the sync engine builds the `m2Bundle` for upload
- **THEN** the bundle JSON SHALL include `hospitalEquipment: OwnedEquipmentRow[]` of length 3
- **AND** `schema_version` SHALL be 2

#### Scenario: New client reads old bundle gracefully

- **GIVEN** an existing player's R2 bundle was written by a pre-equipment client (schema_version 1, no `hospitalEquipment` key)
- **WHEN** a new client pulls this bundle
- **THEN** the apply logic SHALL treat the missing key as an empty `hospitalEquipment` array
- **AND** no error SHALL surface to the user

### Requirement: Equipment UI SHALL render as a panel on the Hospital page

The `apps/medexam2-hospital-tw/src/pages/Hospital.tsx` page SHALL render a new section titled「設備」below the existing room roster and room extension UI. The section SHALL contain a responsive grid (5-column desktop ≥ 1024px, 2-column mobile) rendering all 10 equipment items as cards. The section header SHALL include a collapse toggle. Default state SHALL be expanded for players at tier `'區域醫院'` or higher, collapsed for `'診所'` players.

Each card SHALL display:
- Equipment sprite (48×48 pixel art, 16-color, transparent background)
- Display name (Cubic 11 font)
- Current level chip rendering one of `L0` (not owned) / `L1` / `L2` / `L3`
- Bonus breakdown line: `+X% 聲望增益 / +Y% 病患吞吐`
- Next-level cost button labelled `「購買 (cost)」` or `「升級 L{n} → L{n+1} (cost)」`, or `「已達最高等級」` when L3

Tapping the cost button SHALL open `EquipmentUpgradeModal` with confirmation.

#### Scenario: Panel renders all 10 cards

- **WHEN** the player opens the Hospital page
- **THEN** the「設備」section SHALL render exactly 10 cards
- **AND** each card SHALL correspond to one of the 10 catalog items in catalog declaration order

#### Scenario: L0 card shows initial purchase button

- **GIVEN** the player has not purchased CT
- **WHEN** the CT card renders
- **THEN** the level chip SHALL show `L0`
- **AND** the cost button SHALL show `「購買 (800,000)」`
- **AND** the bonus breakdown SHALL show `+0% / +0%`

#### Scenario: Mobile viewport collapses to 2-column grid

- **WHEN** the Hospital page is rendered at viewport width < 768px
- **THEN** the equipment grid SHALL be 2 columns
- **AND** the bonus breakdown line MAY wrap to 2 lines if needed

### Requirement: Existing T4 players SHALL be grandfathered

Players whose `gameCounters.tier === '國家級教學醫院'` BEFORE this change ships SHALL retain their tier indefinitely, regardless of how many equipment they own (could be 0). This follows from the existing tier monotonicity rule in `clinic-level-up` Requirement 1 (tier never regresses).

The equipment gate (per the `clinic-level-up` modified requirement in this change) applies ONLY to fresh tier upgrades evaluated at tick time. Saves that have already passed through the T3 → T4 transition before this code ships are unaffected by the new condition.

#### Scenario: Pre-existing T4 save with 0 equipment retains tier

- **GIVEN** a player save was at `tier = '國家級教學醫院'` before this change ships
- **AND** the player has 0 rows in `hospitalEquipment`
- **WHEN** the new code runs the tick
- **THEN** the tier SHALL remain `'國家級教學醫院'`
- **AND** no tier downgrade SHALL occur
- **AND** the player MAY purchase equipment to unlock the throughput / reputation bonuses, but is not obligated
