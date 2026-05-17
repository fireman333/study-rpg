# hospital-reputation Specification

## Purpose

Defines the strategic-assignment layer atop the basic tycoon throughput from `hospital-tycoon-engine`: the 1對1 strict `SUBJECT_TO_ROOM` mapping (14 二階 subjects → 3 room types), the rarity-scaled affinity bonus that rewards "right doctor in the right room", the per-question reputation hook that ties the answering loop to the management loop, and the UI surfaces (RoomCard match marker + recruitment / roster room hint) that make the mapping visible to the player.

Lives in `@study-rpg/content-medexam2-tw` (mapping + bonus + listener factory) and `@study-rpg/core` (the content-agnostic `quizEvents` emitter that both 一階 and 二階 apps share).

## Requirements

### Requirement: Subject↔room mapping table SHALL be fixed 1對1 with 4/6/4 split

The system SHALL define `SUBJECT_TO_ROOM: Record<SubjectId, RoomType>` as a frozen constant in `@study-rpg/content-medexam2-tw`'s affinity module. The mapping SHALL cover all 14 二階國考 subjects exactly once (1對1 strict) with the following assignment:

| Room type | Subjects |
|---|---|
| `ward` | 內科, 神經內科, 小兒科, 復健科 |
| `surgery` | 外科, 骨科, 婦產科, 泌尿科, 耳鼻喉科, 眼科 |
| `outpatient` | 家醫科, 皮膚科, 精神科, 麻醉科 |

The mapping SHALL live in `@study-rpg/content-medexam2-tw` (alongside `Room` / `RoomType` / `computeThroughput` from `hospital-tycoon-engine`) — not in `@study-rpg/core` — because the keys are 二階-specific subject names (`內科`, `外科`, …) which would pollute the engine if hardcoded there. Other content forks (e.g. a future `content-medexam2-jp`) SHALL replicate the pattern by exporting their own mapping with their own subject IDs.

Total subjects covered SHALL equal 14. The set of room types SHALL match `RoomType = 'ward' | 'surgery' | 'outpatient'` exactly (the same `RoomType` declared in `hospital-management-mode` capability).

#### Scenario: Mapping covers exactly 14 subjects

- **GIVEN** the `SUBJECT_TO_ROOM` constant
- **WHEN** the test counts unique keys
- **THEN** the count SHALL equal 14
- **AND** every value SHALL be one of `'ward'`, `'surgery'`, `'outpatient'`

#### Scenario: Ward mapping is correct

- **GIVEN** `SUBJECT_TO_ROOM`
- **WHEN** lookups are performed for `'內科'`, `'神經內科'`, `'小兒科'`, `'復健科'`
- **THEN** all four SHALL return `'ward'`

#### Scenario: Surgery mapping is correct

- **GIVEN** `SUBJECT_TO_ROOM`
- **WHEN** lookups are performed for `'外科'`, `'骨科'`, `'婦產科'`, `'泌尿科'`, `'耳鼻喉科'`, `'眼科'`
- **THEN** all six SHALL return `'surgery'`

#### Scenario: Outpatient mapping is correct

- **GIVEN** `SUBJECT_TO_ROOM`
- **WHEN** lookups are performed for `'家醫科'`, `'皮膚科'`, `'精神科'`, `'麻醉科'`
- **THEN** all four SHALL return `'outpatient'`

### Requirement: Affinity bonus SHALL scale with rarity on subject↔room match

The system SHALL apply an `affinityBonus` multiplier to throughput computation based on whether the assigned doctor's subject matches the room's type (per `SUBJECT_TO_ROOM`) and the doctor's rarity tier. The bonus table SHALL be:

| Rarity | Match (`SUBJECT_TO_ROOM[doctor.subjectId] === room.type`) | Mismatch |
|---|---|---|
| P1 夯 | 1.5× | 1.0× |
| P2 頂級 | 1.4× | 1.0× |
| P3 人上人 | 1.3× | 1.0× |
| P4 NPC | 1.2× | 1.0× |
| P5 拉完了 | 1.1× | 1.0× |

A helper `getAffinityBonus(rarity: Rarity, subjectId: SubjectId, roomType: RoomType): number` SHALL be exported from `@study-rpg/content-medexam2-tw` returning the appropriate multiplier. Mismatch SHALL always return `1.0` regardless of rarity (no penalty for misassignment). The match case multipliers SHALL be strictly monotonic over rarity tier (P1 > P2 > P3 > P4 > P5).

The bonus SHALL be a pure derived value computed from current Doctor + Room state — it SHALL NOT be persisted to IndexedDB. No save migration is required.

#### Scenario: P1 match bonus is 1.5×

- **GIVEN** a P1 doctor with `subjectId = '外科'` (mapped to `'surgery'`)
- **WHEN** `getAffinityBonus('P1', '外科', 'surgery')` is called
- **THEN** the return SHALL equal `1.5`

#### Scenario: P5 match bonus is 1.1×

- **GIVEN** a P5 doctor with `subjectId = '皮膚科'` (mapped to `'outpatient'`)
- **WHEN** `getAffinityBonus('P5', '皮膚科', 'outpatient')` is called
- **THEN** the return SHALL equal `1.1`

#### Scenario: Mismatch returns 1.0 regardless of rarity

- **GIVEN** a P1 外科 doctor (mapped to `'surgery'`) assigned to a `ward` room
- **WHEN** `getAffinityBonus('P1', '外科', 'ward')` is called
- **THEN** the return SHALL equal `1.0`
- **AND** a P5 外科 doctor in the same setup SHALL also return `1.0`

#### Scenario: Mid-rarity bonuses are strictly monotonic

- **GIVEN** P2/P3/P4 match bonuses
- **WHEN** the values are compared
- **THEN** `bonus(P2) > bonus(P3) > bonus(P4)` SHALL hold
- **AND** the values SHALL be exactly `1.4`, `1.3`, `1.2` respectively

### Requirement: RoomCard SHALL display affinity bonus marker when assigned

The `RoomCard` component on the `/hospital` page SHALL surface the affinity bonus state visually:

- When assigned doctor matches the room type (`SUBJECT_TO_ROOM[doctor.subjectId] === room.type`): RoomCard SHALL display a sparkle marker (visual indicator, e.g., `✨` glyph or styled badge) plus the bonus multiplier text (e.g., `「✨1.5×」`)
- When assigned doctor mismatches: NO marker SHALL be displayed (or a neutral `1.0×` indicator)
- When room is unassigned: NO marker SHALL be displayed

The throughput indicator SHALL reflect the post-affinity value. For example, P1 外科 doctor (`powerMultiplier = 5.0`) in a `surgery` room with `baseRate = 10`, `roomFacility = 1.0` SHALL display `75 患者/分` (= 10 × 5.0 × 1.0 × 1.5). The same doctor in a `ward` room SHALL display `50 患者/分` (= 10 × 5.0 × 1.0 × 1.0).

#### Scenario: Match case shows sparkle marker and boosted throughput

- **GIVEN** `room-surgery-1` has assigned a P1 外科 doctor (subject maps to surgery)
- **WHEN** the `/hospital` page renders
- **THEN** the corresponding RoomCard SHALL display the sparkle marker (`✨` or equivalent badge)
- **AND** the bonus multiplier text SHALL include `1.5`
- **AND** the throughput indicator SHALL show `75 患者/分`

#### Scenario: Mismatch case shows no marker, lower throughput

- **GIVEN** `room-ward-1` has assigned the same P1 外科 doctor (subject maps to surgery, room is ward → mismatch)
- **WHEN** the `/hospital` page renders
- **THEN** the RoomCard SHALL NOT display the sparkle marker
- **AND** the throughput indicator SHALL show `50 患者/分`

#### Scenario: Unassigned room shows no marker

- **GIVEN** `room-outpatient-1.assignedDoctorId = null`
- **WHEN** the `/hospital` page renders
- **THEN** the RoomCard SHALL NOT display any affinity marker
- **AND** the throughput indicator SHALL show `0 患者/分`

### Requirement: Recruitment doctor card SHALL hint suitable room type

The recruitment result modal (post-roll) and any doctor roster display in the hospital app SHALL include a hint indicating the doctor's suitable room type derived from `SUBJECT_TO_ROOM[doctor.subjectId]`. The hint SHALL be human-readable Chinese (e.g., `「適合：手術房」` for a surgery-mapped subject).

This hint SHALL guide the player toward affinity-match assignment without revealing the exact bonus number (the bonus is shown post-assignment on RoomCard).

#### Scenario: 外科 doctor card shows surgery hint

- **GIVEN** a freshly recruited 外科 doctor card is displayed
- **WHEN** the player views the card
- **THEN** the card SHALL include text containing `「手術」` or equivalent surgery-room label

#### Scenario: 家醫科 doctor card shows outpatient hint

- **GIVEN** a freshly recruited 家醫科 doctor card is displayed
- **WHEN** the player views the card
- **THEN** the card SHALL include text containing `「門診」` or equivalent outpatient-room label

#### Scenario: 內科 doctor card shows ward hint

- **GIVEN** a freshly recruited 內科 doctor card is displayed
- **WHEN** the player views the card
- **THEN** the card SHALL include text containing `「病房」` or equivalent ward-room label
