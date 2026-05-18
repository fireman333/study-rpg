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

The `name` field SHALL be initialized as a default auto-generated value `"<subjectDisplayName> <title> #<seq>"`, where `<title>` is `DEFAULT_DOCTOR_TITLE_BY_RARITY[rarity]` from the active content pack (see `Content pack SHALL expose a default doctor title mapping per rarity tier`) and `<seq>` is a 1-indexed sequence number representing the order this doctor was recruited within this subject (e.g., the 3rd 外科 doctor obtained at rarity P2 is `外科 主任 #3`). The player MAY override this value at any time via the rename dialog on the roster page (see `Player SHALL be able to rename any doctor in the roster`).

The `spriteKey` SHALL follow the pattern `doctor-<subjectId>-<rarity>` with theme-pack fallback chain `doctor-<subjectId>-<rarity>` → `doctor-default-<rarity>` → `doctor-default`.

The `assignedRoom` field SHALL be `null` upon creation in this change; it is reserved for `wire-hospital-tycoon-engine`.

#### Scenario: Newly recruited doctor stored with all fields

- **GIVEN** the player rolls a P2 外科 doctor as the 3rd 外科 recruit
- **WHEN** the doctor is persisted
- **THEN** `doctor.id` SHALL be a non-empty unique string
- **AND** `doctor.subjectId` SHALL equal `"外科"`
- **AND** `doctor.rarity` SHALL equal `"P2"`
- **AND** `doctor.powerMultiplier` SHALL equal `3.5`
- **AND** `doctor.name` SHALL equal `"外科 主任 #3"` (the auto-generated default for P2, before any player rename)
- **AND** `doctor.spriteKey` SHALL equal `"doctor-外科-P2"`
- **AND** `doctor.obtainedAt` SHALL be set to the current epoch ms
- **AND** `doctor.assignedRoom` SHALL be `null`

#### Scenario: Newly recruited P1 doctor stored with hierarchy title

- **GIVEN** the player rolls a P1 內科 doctor as the 1st 內科 recruit
- **WHEN** the doctor is persisted
- **THEN** `doctor.name` SHALL equal `"內科 大P #1"`

#### Scenario: Newly recruited P5 doctor stored with hierarchy title

- **GIVEN** the player rolls a P5 婦產科 doctor as the 2nd 婦產科 recruit
- **WHEN** the doctor is persisted
- **THEN** `doctor.name` SHALL equal `"婦產科 R #2"`

### Requirement: Content pack SHALL expose a default doctor title mapping per rarity tier

The `@study-rpg/content-medexam2-tw` package SHALL export a constant `DEFAULT_DOCTOR_TITLE_BY_RARITY: Record<Rarity, string>` mapping each rarity tier to a hospital-hierarchy-flavored title used when generating the auto-generated default `doctor.name`. The mapping SHALL be:

| Rarity | Title |
|---|---|
| P1 | `大P` |
| P2 | `主任` |
| P3 | `Senior V` |
| P4 | `Young V` |
| P5 | `R` |

This mapping is content-pack-specific (Taiwan medical-board exam). Forks for other exam domains MAY export their own mapping using the same key shape.

#### Scenario: Mapping is exported and complete

- **WHEN** a consumer imports `DEFAULT_DOCTOR_TITLE_BY_RARITY` from `@study-rpg/content-medexam2-tw`
- **THEN** the mapping SHALL contain entries for all 5 rarity tiers (`P1`, `P2`, `P3`, `P4`, `P5`)
- **AND** `DEFAULT_DOCTOR_TITLE_BY_RARITY.P1` SHALL equal `"大P"`
- **AND** `DEFAULT_DOCTOR_TITLE_BY_RARITY.P2` SHALL equal `"主任"`
- **AND** `DEFAULT_DOCTOR_TITLE_BY_RARITY.P3` SHALL equal `"Senior V"`
- **AND** `DEFAULT_DOCTOR_TITLE_BY_RARITY.P4` SHALL equal `"Young V"`
- **AND** `DEFAULT_DOCTOR_TITLE_BY_RARITY.P5` SHALL equal `"R"`

### Requirement: Player SHALL be able to rename any doctor in the roster

The roster page (`/roster`) SHALL provide an affordance on each doctor card that opens a rename dialog. The dialog SHALL allow the player to enter a custom name for that doctor, with validation, and persist the new name to the `doctors` IndexedDB table. The dialog SHALL also provide a "restore default name" action that resets the doctor's `name` back to the auto-generated template `"<subject.displayName> <title> #<seq>"`, where:

- `<title>` is `DEFAULT_DOCTOR_TITLE_BY_RARITY[doctor.rarity]` from the active content pack
- `<seq>` is recomputed at restore time based on the doctor's current ordinal position (by `obtainedAt` ascending) among all doctors with the same `subjectId`

The rename SHALL be persisted via a whole-row write to `doctors` (Dexie `put`), which automatically marks the row dirty for cloud sync via the existing `hospital_doctors` adapter. No schema migration, no new sync table, no new field on `DoctorRow` is required.

The rename action SHALL be available at any time after a doctor enters the roster, with no in-game cost, cooldown, or limit on the number of times a single doctor can be renamed.

Doctors persisted before this change which still carry the legacy `醫師` title SHALL NOT be auto-migrated. The player triggers re-titling explicitly by clicking "還原預設名" in the rename dialog.

#### Scenario: Player renames a doctor to a custom name

- **GIVEN** the roster contains a doctor with `name = "外科 主任 #3"` and `id = "doc-001"`
- **WHEN** the player clicks the ✏️ button on that doctor's card, enters `"天才小王"` in the rename dialog, and confirms
- **THEN** the dialog SHALL close
- **AND** `db.doctors.get("doc-001").name` SHALL equal `"天才小王"`
- **AND** the doctor card SHALL re-render showing `"天才小王"`
- **AND** the row SHALL be marked dirty in `hospital_doctors` cloud sync state

#### Scenario: Player restores a renamed P3 doctor to tier-aware default name

- **GIVEN** the roster contains a P3 外科 doctor with `name = "天才小王"`, `obtainedAt = T3` (3rd 外科 doctor by `obtainedAt` ascending), and 5 total 外科 doctors in the roster
- **WHEN** the player opens the rename dialog and clicks "還原預設名" and confirms
- **THEN** `db.doctors.get(...).name` SHALL equal `"外科 Senior V #3"`
- **AND** the doctor card SHALL re-render showing the tier-aware default name

#### Scenario: Player restores a P4 doctor that previously carried legacy 醫師 title

- **GIVEN** the roster contains a P4 內科 doctor with `name = "內科 醫師 #2"` (persisted before this change shipped) and ordinal position 2 among 內科 peers
- **WHEN** the player opens the rename dialog and clicks "還原預設名" and confirms
- **THEN** `db.doctors.get(...).name` SHALL equal `"內科 Young V #2"`

#### Scenario: Rename validation rejects empty name

- **WHEN** the player opens the rename dialog and submits an empty string, a single space, or any whitespace-only input
- **THEN** the rename SHALL be rejected with a UI error message
- **AND** `db.doctors.get(...).name` SHALL remain unchanged

#### Scenario: Rename validation rejects names longer than 20 characters

- **WHEN** the player submits a name longer than 20 characters (e.g., 21 characters)
- **THEN** the rename SHALL be rejected with a UI error message
- **AND** `db.doctors.get(...).name` SHALL remain unchanged

#### Scenario: Rename trims leading and trailing whitespace

- **WHEN** the player submits `"  天才小王  "` (with surrounding whitespace)
- **THEN** the persisted `doctor.name` SHALL equal `"天才小王"` (trimmed)

#### Scenario: Rename propagates to all UI surfaces reading doctor.name

- **GIVEN** a renamed doctor is assigned to a clinic room
- **WHEN** the player navigates to the room card, the assignment modal, the quiz modal, the training page, the hospital scene sprite alt text, or the recruitment result modal
- **THEN** each surface SHALL display the custom name (not the auto-generated default), via the existing `useLiveQuery` reactivity

### Requirement: Resolved spriteKey SHALL support male / female variants

The `doctor.spriteKey` written to persistence SHALL be resolved at roll time via a `resolveSpriteKey(subjectId, rarity, themeSprites)` helper. The helper SHALL:

1. With **50% probability**, prefer the female variant key `doctor-<subjectId>-<rarity>-female` IF that key exists in the active theme pack's sprite registry
2. Otherwise (or in the remaining 50%), use the legacy key `doctor-<subjectId>-<rarity>`

The fallback chain for downstream sprite rendering SHALL remain:

```
spriteKey (as resolved above)
  → doctor-<subjectId>-<rarity>           (legacy male, always exists if subject is in roster)
  → doctor-default-<rarity>               (rarity fallback)
  → doctor-default-P3                     (terminal fallback)
```

The deterministic starter pull (the first 2 free doctors granted on fresh save) SHALL NOT invoke the random picker — those continue to use the legacy `doctor-<subjectId>-<rarity>` key directly to keep starter pull behavior reproducible for testing.

#### Scenario: Roll picks female variant when available and RNG ≤ 0.5

- **GIVEN** a player rolls a 內科 P3 doctor
- **AND** the active theme pack includes both `doctor-內科-P3.png` and `doctor-內科-P3-female.png`
- **AND** the RNG provider returns `0.3` for the gender pick
- **WHEN** the gacha service writes the doctor row
- **THEN** `doctor.spriteKey` SHALL equal `"doctor-內科-P3-female"`

#### Scenario: Roll picks male variant when RNG > 0.5

- **GIVEN** a player rolls a 內科 P3 doctor
- **AND** the active theme pack includes both `doctor-內科-P3.png` and `doctor-內科-P3-female.png`
- **AND** the RNG provider returns `0.7` for the gender pick
- **WHEN** the gacha service writes the doctor row
- **THEN** `doctor.spriteKey` SHALL equal `"doctor-內科-P3"`

#### Scenario: Roll falls back to male when female variant not in theme pack

- **GIVEN** a player rolls a 麻醉科 P2 doctor
- **AND** the active theme pack includes `doctor-麻醉科-P2.png` only (no `-female` variant)
- **AND** the RNG provider returns `0.3` for the gender pick (would prefer female)
- **WHEN** the gacha service writes the doctor row
- **THEN** `doctor.spriteKey` SHALL equal `"doctor-麻醉科-P2"` (fallback because female key not in registry)

#### Scenario: Starter pull SHALL NOT invoke random picker

- **GIVEN** a fresh save with `hasUsedStarterPull = false`
- **WHEN** the player picks 內科 from the starter pull modal
- **AND** the RNG provider would return `0.3` (preference for female)
- **THEN** the granted doctor's `spriteKey` SHALL equal `"doctor-內科-P5"` (the deterministic starter key, not `"doctor-內科-P5-female"`)
- **AND** `gachaStats.totalRolls` SHALL NOT be incremented (starter pull is free, separate counter path)

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
- **A completion chip displaying `✅ X / Y` where `X` = the count of distinct `questionId` answered for that subject (via `questionHistory`) and `Y` = the playable pool size for that subject (excluding `hasOptionImages` questions). When `X === Y` the chip SHALL render in a celebratory variant (gold accent + 🏆 icon) without emitting any reward.**

The HomePage SHALL also display the current `tickets.available` value prominently.

**The completion chip and the existing `🔴 N due` chip SHALL coexist as siblings within the banner header region. The completion chip SHALL update live as `questionHistory` rows are written (via `useLiveQuery`). The completion chip SHALL be rendered for both locked and unlocked banners.**

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

#### Scenario: Completion chip renders distinct-question count

- **GIVEN** the playable pool size of `內科` is 612 (after excluding `hasOptionImages` questions)
- **AND** `questionHistory` contains 23 distinct `questionId` rows whose `subjectId = 內科` (across any number of attempts each)
- **WHEN** the HomePage renders
- **THEN** the 內科 banner SHALL render a chip displaying `✅ 23 / 612`
- **AND** the chip SHALL be visually distinct from (but rendered as a sibling of) the `🔴 N due` chip

#### Scenario: Completion chip updates live after answering

- **GIVEN** the 內科 banner shows `✅ 23 / 612`
- **WHEN** the player opens the QuizModal for 內科 and answers a question whose id is not currently in `questionHistory`
- **THEN** within one render cycle the 內科 banner chip SHALL update to `✅ 24 / 612`
- **AND** answering a repeat question (id already in `questionHistory`) SHALL NOT change the displayed numerator

#### Scenario: 100% completion renders celebratory chip

- **GIVEN** the playable pool size of `麻醉科` is 187
- **AND** `questionHistory` contains 187 distinct `questionId` rows for `麻醉科`
- **WHEN** the HomePage renders
- **THEN** the 麻醉科 banner chip SHALL render in a gold-accent variant with `🏆 187 / 187`
- **AND** no toast, modal, or reward side-effect SHALL fire from reaching 100%

#### Scenario: Completion chip renders on locked banners

- **GIVEN** the 眼科 banner is in locked state (`affinity < threshold`)
- **WHEN** the HomePage renders
- **THEN** the 眼科 banner SHALL still render its `✅ X / Y` chip with the correct distinct-question count

### Requirement: Roll result SHALL be displayed in modal with rarity indication

When a roll succeeds, the system SHALL display a `RecruitmentResultModal` showing the recruited doctor's resolved sprite image (per the theme pack sprite registry with fallback chain), name, rarity tier label (P1–P5 with Chinese label), subject affiliation, and powerMultiplier. The modal SHALL indicate when the result was pity-triggered.

The sprite image SHALL be resolved by looking up `doctor.spriteKey` in the active theme pack's sprite registry, with a 3-tier fallback chain: `doctor-<subjectId>-<rarity>` → `doctor-default-<rarity>` → `doctor-default-P3`. The resolved sprite SHALL be rendered as an `<img>` element with `image-rendering: pixelated` for nearest-neighbor scaling.

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

#### Scenario: Modal renders resolved sprite image with fallback chain

- **GIVEN** a successful roll yields a P2 外科 doctor
- **AND** the theme pack registers `doctor-default-P2` but NOT `doctor-外科-P2`
- **WHEN** the modal is rendered
- **THEN** the modal SHALL display an `<img>` element whose `src` resolves to the `doctor-default-P2` sprite URL
- **AND** the `<img>` SHALL apply `image-rendering: pixelated` per the GBA pixel convention
- **AND** the modal SHALL NOT display the 🩺 emoji placeholder

#### Scenario: Modal fallback to per-subject sprite when available

- **GIVEN** a successful roll yields a P3 內科 doctor
- **AND** the theme pack registers `doctor-內科-P3`
- **WHEN** the modal is rendered
- **THEN** the modal SHALL display an `<img>` whose `src` resolves to the `doctor-內科-P3` sprite URL (not the default-rarity fallback)

### Requirement: Doctor roster page SHALL list all recruited doctors

The `apps/medexam2-hospital-tw` SHALL provide a `/roster` route displaying all entries from the `doctors` IndexedDB table. The roster SHALL be sortable or filterable by subject and by rarity.

Each doctor card on the roster SHALL display the resolved sprite image (using the same fallback chain as the modal: `doctor-<subjectId>-<rarity>` → `doctor-default-<rarity>` → `doctor-default-P3`), alongside the doctor's name, subject, rarity label, and powerMultiplier.

#### Scenario: Roster page lists recruited doctors

- **GIVEN** the `doctors` table contains 5 entries
- **WHEN** the player navigates to `/roster`
- **THEN** the page SHALL display 5 doctor cards
- **AND** each card SHALL show the doctor's name, subject, rarity label, and powerMultiplier
- **AND** each card SHALL show the resolved sprite image (not the 🩺 emoji placeholder)

#### Scenario: Empty roster shows guidance

- **GIVEN** the `doctors` table is empty
- **WHEN** the player navigates to `/roster`
- **THEN** the page SHALL display guidance text directing the player back to the recruitment banners

### Requirement: Theme pack sprite registry SHALL provide doctor sprites covering the fallback chain

The active theme pack's `sprites` map SHALL include, at minimum, entries for the 5 default-rarity keys to support the `recruitment-gacha` fallback chain:

- `doctor-default-P5`
- `doctor-default-P4`
- `doctor-default-P3`
- `doctor-default-P2`
- `doctor-default-P1`

Each entry SHALL resolve to a URL pointing at a 384×384 PNG with transparent background and GBA-era pixel art style consistent with the theme pack's visual identity.

A theme pack MAY additionally include per-subject entries `doctor-<subjectId>-<rarity>` for any subset of the 14 二階 subjects and 5 rarity tiers; the lookup helper SHALL prefer those over the default-rarity fallback when registered.

#### Scenario: Theme pack with only default-rarity sprites is valid

- **GIVEN** a theme pack `T` whose `sprites` map contains exactly the 5 `doctor-default-<rarity>` keys
- **WHEN** a roll resolves `doctor.spriteKey = "doctor-內科-P5"`
- **AND** the lookup helper is invoked with `T.sprites`
- **THEN** the helper SHALL return the URL for `doctor-default-P5`
- **AND** the modal SHALL render the resolved sprite without error

#### Scenario: Theme pack with per-subject baseline coverage

- **GIVEN** a theme pack `T` registering all 5 `doctor-default-<rarity>` keys plus the 14 `doctor-<subjectId>-P3` keys
- **WHEN** a roll resolves `doctor.spriteKey = "doctor-外科-P3"`
- **THEN** the helper SHALL return the URL for `doctor-外科-P3` (per-subject win)
- **WHEN** a roll resolves `doctor.spriteKey = "doctor-外科-P1"`
- **THEN** the helper SHALL return the URL for `doctor-default-P1` (per-subject not registered at P1, falls back to default-rarity)

#### Scenario: Sprite resolution failure falls back to P3 default

- **GIVEN** a theme pack `T` whose `sprites` map is missing one default-rarity entry (e.g. `doctor-default-P2` is absent due to a generation failure)
- **WHEN** a roll resolves `doctor.spriteKey = "doctor-麻醉科-P2"`
- **AND** `doctor-麻醉科-P2` is also absent
- **THEN** the helper SHALL return the URL for `doctor-default-P3` as ultimate fallback
- **AND** the UI SHALL render this fallback rather than throwing or showing a broken-image icon

### Requirement: Per-N fresh-correct ticket grant SHALL accrue from quiz answering

The system SHALL grant `+1` recruitment ticket to `tickets.global.available` for every `QUIZ_TICKET_GRANT_PER_N_CORRECT = 25` distinct "fresh correct" answers accumulated across all subjects (lifetime total, not per-session).

A "fresh correct" answer is defined as:
- `questionHistory[questionId]` did NOT exist in the table immediately before the current answer event (this is the first time the player has answered this `questionId` at all), AND
- The answer is graded correct (matches `question.answer` OR `question.disputed === true`)

Subsequent correct answers to the same `questionId` (SRS reviews, retries) SHALL NOT count as fresh and SHALL NOT contribute to the ticket-grant counter.

The counter SHALL be persisted via a monotonic field on `monotonicCounters.singleton` (new field `freshCorrectSinceLastTicket: number`, initialized to 0 on first save load if absent). Each fresh-correct answer SHALL increment this field by 1; when the field reaches `QUIZ_TICKET_GRANT_PER_N_CORRECT`, the system SHALL:

1. Grant `+1` ticket (clamped at `TICKET_CAP = 99` — if available already at cap, ticket SHALL NOT be granted but counter SHALL still reset to avoid future over-accumulation surprises)
2. Reset `freshCorrectSinceLastTicket` to 0
3. Optionally surface a toast `+1 招募券（已累積 N 題答對）` to inform the player

The constant `QUIZ_TICKET_GRANT_PER_N_CORRECT = 25` SHALL be exported from `packages/content-medexam2-tw/src/recruitment.ts` as a locked literal.

#### Scenario: 25th fresh-correct answer grants +1 ticket

- **GIVEN** `monotonicCounters.singleton.freshCorrectSinceLastTicket = 24` and `tickets.available = 5`
- **WHEN** the player answers a question whose `questionId` is not yet in `questionHistory` correctly
- **THEN** `tickets.available` SHALL become `6`
- **AND** `freshCorrectSinceLastTicket` SHALL be reset to `0`
- **AND** a toast `+1 招募券（已累積 25 題答對）` SHALL fire

#### Scenario: Repeat correct answer does not increment counter

- **GIVEN** `freshCorrectSinceLastTicket = 10` and the player previously answered `questionId = 內科-Q42` (the row exists in questionHistory)
- **WHEN** the player answers 內科-Q42 correctly again (SRS review)
- **THEN** `freshCorrectSinceLastTicket` SHALL remain `10`
- **AND** `tickets.available` SHALL not change from this grant path

#### Scenario: Wrong fresh answer does not increment counter

- **GIVEN** `freshCorrectSinceLastTicket = 15` and `questionId = X-Q99` is not in questionHistory
- **WHEN** the player answers X-Q99 incorrectly
- **THEN** `freshCorrectSinceLastTicket` SHALL remain `15`
- **AND** `questionHistory[X-Q99]` SHALL be created (existing behavior) with attempts=1 / correct=0

#### Scenario: Ticket cap reached, counter still resets

- **GIVEN** `freshCorrectSinceLastTicket = 24` and `tickets.available = 99` (cap)
- **WHEN** the player answers a fresh question correctly
- **THEN** `tickets.available` SHALL remain `99` (no over-cap grant)
- **AND** `freshCorrectSinceLastTicket` SHALL reset to `0` (counter clears regardless)
- **AND** a toast SHALL inform the player `招募券已達上限，請先消耗` (or visually equivalent)

### Requirement: Banner first-unlock SHALL grant a one-time ticket bonus

The system SHALL grant `+1` ticket to `tickets.global.available` the first time the player's `affinity[subjectId].correctCount` crosses (becomes ≥) the subject's `RECRUITMENT_THRESHOLDS[subjectId]`. The bonus SHALL fire at most once per subject across the lifetime of the save (and at most `BANNER_UNLOCK_TICKET_LIFETIME_CAP = 14` times total — equivalent to all 14 subjects each granting once).

The first-unlock tracking SHALL be persisted in a new local-only Dexie table `bannerUnlockBonusLog` with schema `{ subjectId: SubjectId (primary key), grantedAt: number }`. The table SHALL NOT be included in cloud sync — banner-unlock state is recoverable from `affinity` and the bonus log on each device independently (light over-grant acceptable across devices per design D4).

When affinity crosses threshold:
1. Check `bannerUnlockBonusLog.get(subjectId)` — if a row exists, NO bonus SHALL be granted
2. Otherwise, grant `+1` ticket (clamped at `TICKET_CAP = 99`)
3. Write `bannerUnlockBonusLog.put({ subjectId, grantedAt: Date.now() })`
4. Emit a toast `+1 招募券（首次解鎖 ${subjectDisplayName}）`

If the player ever drops below threshold (e.g. via dev tool or future affinity-cost mechanic) and crosses again, the bonus SHALL NOT re-fire (log row already exists).

The constants `BANNER_UNLOCK_TICKET_BONUS = 1` and `BANNER_UNLOCK_TICKET_LIFETIME_CAP = 14` SHALL be exported from `packages/content-medexam2-tw/src/recruitment.ts` as locked literals.

#### Scenario: First time crossing 內科 threshold grants +1 ticket

- **GIVEN** `affinity['內科'].correctCount = 65`, `RECRUITMENT_THRESHOLDS['內科'] = 66`, no row in `bannerUnlockBonusLog` for 內科, `tickets.available = 10`
- **WHEN** the player answers a 內科 question correctly (affinity becomes 66)
- **THEN** `tickets.available` SHALL become `11`
- **AND** `bannerUnlockBonusLog['內科']` SHALL be created with current timestamp
- **AND** a toast `+1 招募券（首次解鎖 內科）` SHALL fire

#### Scenario: Re-crossing threshold for already-bonused subject does not re-grant

- **GIVEN** `bannerUnlockBonusLog['內科']` exists (already granted), and affinity is reset by dev tool to 50
- **WHEN** the player answers 內科 questions until affinity crosses 66 again
- **THEN** `tickets.available` SHALL NOT receive an additional banner-unlock bonus from 內科
- **AND** `bannerUnlockBonusLog['內科']` SHALL keep its original `grantedAt` timestamp

#### Scenario: First unlock when at ticket cap consumes the bonus

- **GIVEN** `tickets.available = 99` (cap), no row in `bannerUnlockBonusLog` for 外科
- **WHEN** the player crosses 外科 threshold for the first time
- **THEN** `tickets.available` SHALL remain `99`
- **AND** `bannerUnlockBonusLog['外科']` SHALL still be written (one-shot semantics preserved)
- **AND** the bonus SHALL NOT re-fire when ticket cap later frees up

#### Scenario: All 14 banner unlocks each grant once, no 15th source

- **GIVEN** the player has crossed all 14 subjects' thresholds across the save lifetime
- **WHEN** `bannerUnlockBonusLog.toArray().length` is queried
- **THEN** it SHALL equal `14`
- **AND** the lifetime banner-unlock ticket grant SHALL equal `14` (subject to cap clamps)

#### Scenario: Cross-device deployment may over-grant by up to 14 tickets

- **GIVEN** device A has granted banner-unlock for all 14 subjects (`bannerUnlockBonusLog` has 14 rows on A)
- **AND** device B has just signed in with the cloud-synced affinity but the local `bannerUnlockBonusLog` is empty
- **WHEN** the player continues playing on B and answers questions that re-cross thresholds (cloud-synced affinity already ≥ threshold)
- **THEN** device B SHALL grant `+14` tickets again (one per first observed cross)
- **AND** this acceptable over-grant SHALL be capped at `BANNER_UNLOCK_TICKET_LIFETIME_CAP × N_devices` total tickets (per design D4 trade-off)

#### Scenario: Daily +1 + fate card grants are unchanged

- **GIVEN** existing daily-refresh +1 (via `refreshDailyTickets`) and fate-card grants (`grantTickets`)
- **WHEN** the new per-N-correct + banner-unlock grants are active
- **THEN** the daily +1 SHALL continue to fire once per epoch day
- **AND** fate card ticket grants SHALL continue to fire per `hospital-fate-cards` capability
- **AND** all four grant paths SHALL converge on the same `TICKET_CAP = 99` clamp
