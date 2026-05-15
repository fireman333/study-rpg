# recruitment-gacha Specification

## Purpose
TBD - created by archiving change wire-recruitment-gacha. Update Purpose after archive.

## Requirements

### Requirement: Per-subject affinity counter SHALL increment on correct answer

The system SHALL maintain a per-subject affinity counter `affinity[subjectId]` for each of the 14 二階國考 subjects. The counter SHALL be a non-negative integer, persisted in IndexedDB, and SHALL increment by exactly 1 each time the player answers a question correctly in that subject. The counter SHALL never decrement.

#### Scenario: Affinity increments on correct answer

- **GIVEN** `affinity[外科] = 12` in IndexedDB
- **WHEN** the player answers an 外科 question correctly
- **THEN** `affinity[外科]` SHALL be `13`
- **AND** the updated value SHALL persist to IndexedDB before the next render

#### Scenario: Affinity does not change on wrong answer

- **GIVEN** `affinity[內科] = 50`
- **WHEN** the player answers an 內科 question incorrectly
- **THEN** `affinity[內科]` SHALL remain `50`

#### Scenario: Affinity initialized to zero for new save

- **GIVEN** a new player save in `apps/medexam2-hospital-tw`
- **WHEN** the IndexedDB is first read
- **THEN** `affinity[subject]` SHALL be `0` for all 14 subjects

### Requirement: Banner unlock SHALL follow binary threshold gate per subject

The system SHALL gate recruitment access per subject by binary comparison. The per-subject threshold values SHALL be locked as the following constants in `packages/content-medexam2-tw/src/recruitment.ts`:

| Subject | threshold |
|---|---|
| 內科 | 66 |
| 外科 | 58 |
| 小兒科 | 36 |
| 婦產科 | 33 |
| 精神科 | 16 |
| 復健科 | 16 |
| 神經內科 | 15 |
| 家醫科 | 11 |
| 皮膚科 | 11 |
| 麻醉科 | 10 |
| 骨科 | 10 |
| 耳鼻喉科 | 10 |
| 眼科 | 10 |
| 泌尿科 | 9 |

These values were derived from `Math.ceil(subject.totalQuestions × 0.05)` against `subjects.json` as of `ingest-medexam2-tw-corpus` archive (2026-05-15). Subsequent corpus changes SHALL NOT silently re-derive these values — the threshold table SHALL be re-locked via a follow-up change if `totalQuestions` shifts.

#### Scenario: Banner locked under threshold

- **GIVEN** `affinity[皮膚科] = 5` and `threshold[皮膚科] = 11`
- **WHEN** the player attempts to roll on the 皮膚科 banner
- **THEN** the roll SHALL be rejected
- **AND** the UI SHALL display `「再答對 6 題皮膚科可解鎖」`
- **AND** no ticket SHALL be consumed
- **AND** no doctor SHALL be added to the roster

#### Scenario: Banner unlocks at threshold cross

- **GIVEN** `affinity[泌尿科] = 8` and `threshold[泌尿科] = 9`
- **WHEN** the player answers one more 泌尿科 question correctly
- **THEN** `affinity[泌尿科]` SHALL equal `9`
- **AND** the 泌尿科 banner SHALL transition to `unlocked` state
- **AND** an in-app notification SHALL fire with text containing `泌尿科` and `解鎖`

#### Scenario: Recruitment open at and above threshold

- **GIVEN** `affinity[眼科] = 25` and `threshold[眼科] = 10`
- **WHEN** the player rolls on the 眼科 banner
- **THEN** the roll SHALL proceed
- **AND** the rarity outcome SHALL follow the P1–P5 weight distribution (this spec, separate requirement)
- **AND** further increments to `affinity[眼科]` SHALL NOT change the rarity distribution

### Requirement: Rarity weight distribution SHALL be P5/P4/P3/P2/P1 = 60/25/10/4/1

Each recruitment roll SHALL select a rarity tier with the following weights summing to 100:

| Tier | Weight |
|---|---|
| P5 拉完了 | 60 |
| P4 NPC | 25 |
| P3 人上人 | 10 |
| P2 頂級 | 4 |
| P1 夯 | 1 |

The weight table SHALL be exported as a single named constant in `packages/content-medexam2-tw/src/recruitment.ts` so dogfood balance adjustments can be performed by editing one location.

#### Scenario: 100-roll distribution within tolerance

- **GIVEN** a fresh `GachaStats` with no pity active
- **WHEN** 10,000 rolls are simulated with a fixed PRNG seed
- **THEN** the P5 count SHALL fall within `[5800, 6200]` (60% ± 2%)
- **AND** the P1 count SHALL fall within `[80, 120]` (1% ± 0.2%)

### Requirement: Pity mechanism SHALL force P3+ at 30 and P2+ at 100 rolls

The system SHALL track rolls-since-last-tier counters and force a minimum tier when thresholds are crossed:

- After 30 consecutive rolls without a P3 or higher result, the next roll SHALL be at least P3
- After 100 consecutive rolls without a P2 or higher result, the next roll SHALL be at least P2
- P1 SHALL NOT have a pity guarantee (remains genuinely rare)

When a pity roll fires, the result `wasPity` flag SHALL be `true` to allow UI to display a 「保底」 indicator.

#### Scenario: P3 pity forces tier upgrade

- **GIVEN** `gachaStats.rollsSinceLastP3 = 30` and `gachaStats.rollsSinceLastP2 = 30`
- **WHEN** the player rolls
- **THEN** the result tier SHALL be `P3`, `P2`, or `P1` (never P4 or P5)
- **AND** `result.wasPity` SHALL be `true`
- **AND** `gachaStats.rollsSinceLastP3` SHALL reset to `0`

#### Scenario: P2 pity forces tier upgrade

- **GIVEN** `gachaStats.rollsSinceLastP2 = 100`
- **WHEN** the player rolls
- **THEN** the result tier SHALL be `P2` or `P1` (never P3, P4, or P5)
- **AND** `result.wasPity` SHALL be `true`

### Requirement: Doctor powerMultiplier SHALL be 5.0/3.5/2.0/1.0/0.5 strictly monotonic

Doctor `powerMultiplier` SHALL be assigned per rarity as:

| Tier | powerMultiplier |
|---|---|
| P1 夯 | 5.0 |
| P2 頂級 | 3.5 |
| P3 人上人 | 2.0 |
| P4 NPC | 1.0 |
| P5 拉完了 | 0.5 |

P1 = 5.0 and P5 = 0.5 are locked by `hospital-management-mode` capability. The interior values 3.5 / 2.0 / 1.0 SHALL satisfy strict monotonic ordering as required by `hospital-management-mode`.

#### Scenario: Doctor card carries correct multiplier per rarity

- **GIVEN** a roll result with rarity `P2`
- **WHEN** the doctor card is created and persisted
- **THEN** `doctor.powerMultiplier` SHALL equal `3.5`

#### Scenario: Monotonic invariant holds across all tiers

- **GIVEN** the rarity tier sequence `[P5, P4, P3, P2, P1]`
- **WHEN** the corresponding `powerMultiplier` values are inspected
- **THEN** the sequence SHALL be `[0.5, 1.0, 2.0, 3.5, 5.0]`
- **AND** each value SHALL be strictly greater than the previous

### Requirement: Doctor card schema SHALL include required identity, rarity, and assignment fields

Each recruited doctor SHALL be persisted in the `doctors` IndexedDB table with the following schema:

```typescript
interface Doctor {
  id: string                          // crypto.randomUUID() or fallback unique id
  subjectId: SubjectId                // one of 14 二階 subjects
  rarity: 'P1'|'P2'|'P3'|'P4'|'P5'
  powerMultiplier: number             // per the multiplier table
  name: string                        // auto-generated: "<subjectDisplayName> 醫師 #<seq>"
  spriteKey: string                   // key into theme.sprites with fallback chain
  obtainedAt: number                  // Date.now() at recruitment
  assignedRoom: string | null         // null until wire-hospital-tycoon-engine wires assignment
}
```

The `name` field SHALL use the subject's `displayName` and a 1-indexed sequence number representing the order this doctor was recruited within this subject (e.g., the 3rd 外科 doctor obtained is `外科 醫師 #3`).

The `spriteKey` SHALL follow the pattern `doctor-<subjectId>-<rarity>` with theme-pack fallback chain `doctor-<subjectId>-<rarity>` → `doctor-default-<rarity>` → `doctor-default`.

The `assignedRoom` field SHALL be `null` upon creation in this change; it is reserved for `wire-hospital-tycoon-engine`.

#### Scenario: Newly recruited doctor stored with all fields

- **GIVEN** the player rolls a P2 外科 doctor as the 3rd 外科 recruit
- **WHEN** the doctor is persisted
- **THEN** `doctor.id` SHALL be a non-empty unique string
- **AND** `doctor.subjectId` SHALL equal `"外科"`
- **AND** `doctor.rarity` SHALL equal `"P2"`
- **AND** `doctor.powerMultiplier` SHALL equal `3.5`
- **AND** `doctor.name` SHALL equal `"外科 醫師 #3"`
- **AND** `doctor.spriteKey` SHALL equal `"doctor-外科-P2"`
- **AND** `doctor.obtainedAt` SHALL be set to the current epoch ms
- **AND** `doctor.assignedRoom` SHALL be `null`

### Requirement: Recruitment ticket SHALL be the sole gating resource for rolls

The system SHALL maintain a `tickets.available` integer in IndexedDB. Each successful roll SHALL consume exactly 1 ticket. A roll SHALL fail and consume zero tickets if `tickets.available < 1` or if the target banner is locked.

The ticket counter SHALL initialize to `10` on new save creation. The ticket counter SHALL be capped at `99` (additional grant attempts SHALL be silently clamped).

The system SHALL grant +1 ticket per UTC-day-equivalent elapsed since `tickets.lastRefreshDay`. On app boot, the system SHALL compute `Math.floor(Date.now() / 86400000)` as the current day, compare to `lastRefreshDay`, and grant `min(daysDelta, 99 - available)` tickets, then update `lastRefreshDay` to the current day.

#### Scenario: Successful roll consumes one ticket

- **GIVEN** `tickets.available = 5` and target banner unlocked
- **WHEN** the player completes a roll
- **THEN** `tickets.available` SHALL be `4`
- **AND** a doctor SHALL be added to the roster

#### Scenario: Roll blocked when no tickets

- **GIVEN** `tickets.available = 0` and target banner unlocked
- **WHEN** the player attempts a roll
- **THEN** the roll SHALL be rejected
- **AND** the UI SHALL display a message indicating no tickets available
- **AND** `tickets.available` SHALL remain `0`
- **AND** no doctor SHALL be added

#### Scenario: New save initializes with 10 tickets

- **GIVEN** a new save in `apps/medexam2-hospital-tw`
- **WHEN** the tickets table is first read
- **THEN** `tickets.available` SHALL equal `10`
- **AND** `tickets.lastRefreshDay` SHALL equal `Math.floor(Date.now() / 86400000)`

#### Scenario: Daily refresh grants one ticket per elapsed day

- **GIVEN** `tickets.available = 7` and `tickets.lastRefreshDay` represents 3 days ago
- **WHEN** the app boots
- **THEN** `tickets.available` SHALL be `10`
- **AND** `tickets.lastRefreshDay` SHALL equal the current day

#### Scenario: Ticket grant clamps at cap

- **GIVEN** `tickets.available = 97` and 10 days have elapsed since `lastRefreshDay`
- **WHEN** the app boots
- **THEN** `tickets.available` SHALL equal `99` (clamped from 107)

### Requirement: Generic gacha API in core SHALL replace internal loot implementation without breaking loot API

`packages/core/src/lib/gacha.ts` SHALL be added with a generic `rollGacha(config, stats, rng?)` function accepting arbitrary tier identifier strings and pity rule arrays. The existing `packages/core/src/lib/loot.ts` exports (`rollLoot`, `rollRarity`, `DEFAULT_RARITY_WEIGHTS`, `PITY_SR_THRESHOLD`, `PITY_SSR_THRESHOLD`, `initialLootStats`) SHALL remain unchanged in signature; their internal implementation MAY delegate to `rollGacha` but MUST preserve identical behavior.

#### Scenario: loot.ts public API unchanged

- **GIVEN** any caller of `rollLoot(catalog, stats)` from `apps/medexam-tw/` or third-party consumers
- **WHEN** the gacha refactor is applied
- **THEN** the function signature SHALL be unchanged
- **AND** the return shape `{ item, rarity, wasPity, newStats }` SHALL be unchanged
- **AND** the rarity distribution for `DEFAULT_RARITY_WEIGHTS` SHALL be statistically identical (chi-square comparison over 10k rolls, p > 0.05)

#### Scenario: gacha.ts handles arbitrary tier labels

- **GIVEN** a `GachaConfig` with tiers `[{id:'P5',weight:60},{id:'P4',weight:25},{id:'P3',weight:10},{id:'P2',weight:4},{id:'P1',weight:1}]`
- **WHEN** `rollGacha(config, stats)` is called
- **THEN** the returned `tier` SHALL be one of `'P5'|'P4'|'P3'|'P2'|'P1'`
- **AND** the function SHALL NOT reference any hard-coded `N|R|SR|SSR|UR` string

### Requirement: Banner UI SHALL display per-subject state and progress

The `apps/medexam2-hospital-tw` HomePage SHALL render a grid of 14 banners, one per subject. Each banner SHALL visually convey:

- Subject `displayName`
- Current `affinity[subjectId]` and `threshold[subjectId]` (e.g., `5 / 11`)
- Locked state visual treatment when `affinity < threshold` (e.g., greyed out + lock icon)
- Unlocked state with active roll button when `affinity >= threshold`

The HomePage SHALL also display the current `tickets.available` value prominently.

#### Scenario: Locked banner renders progress

- **GIVEN** `affinity[眼科] = 4` and `threshold[眼科] = 10`
- **WHEN** the HomePage renders
- **THEN** the 眼科 banner SHALL show `4 / 10`
- **AND** the banner SHALL have visual locked treatment
- **AND** the roll button SHALL be disabled or replaced with `「再答對 6 題眼科可解鎖」`

#### Scenario: Unlocked banner shows active roll

- **GIVEN** `affinity[外科] >= threshold[外科]` and `tickets.available >= 1`
- **WHEN** the HomePage renders
- **THEN** the 外科 banner SHALL have visual unlocked treatment
- **AND** the roll button SHALL be enabled and clickable

### Requirement: Roll result SHALL be displayed in modal with rarity indication

When a roll succeeds, the system SHALL display a `RecruitmentResultModal` showing the recruited doctor's name, rarity tier label (P1–P5 with Chinese label), subject affiliation, and powerMultiplier. The modal SHALL indicate when the result was pity-triggered.

#### Scenario: Modal displays standard roll

- **GIVEN** a successful roll yields a P3 外科 doctor named `外科 醫師 #1`
- **WHEN** the result modal is rendered
- **THEN** the modal SHALL display the doctor's name
- **AND** the modal SHALL display the rarity label including `P3` and `人上人`
- **AND** the modal SHALL display the subject `外科`
- **AND** the modal SHALL display `powerMultiplier: 2.0` (or formatted equivalent)
- **AND** the modal SHALL NOT display any 保底 indicator

#### Scenario: Modal indicates pity result

- **GIVEN** a roll where `result.wasPity === true`
- **WHEN** the modal is rendered
- **THEN** the modal SHALL display a 保底 indicator (text, badge, or visual marker)

### Requirement: Doctor roster page SHALL list all recruited doctors

The `apps/medexam2-hospital-tw` SHALL provide a `/roster` route displaying all entries from the `doctors` IndexedDB table. The roster SHALL be sortable or filterable by subject and by rarity.

#### Scenario: Roster page lists recruited doctors

- **GIVEN** the `doctors` table contains 5 entries
- **WHEN** the player navigates to `/roster`
- **THEN** the page SHALL display 5 doctor cards
- **AND** each card SHALL show the doctor's name, subject, rarity label, and powerMultiplier

#### Scenario: Empty roster shows guidance

- **GIVEN** the `doctors` table is empty
- **WHEN** the player navigates to `/roster`
- **THEN** the page SHALL display guidance text directing the player back to the recruitment banners
