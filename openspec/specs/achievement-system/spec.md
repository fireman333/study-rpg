# achievement-system Specification

## Purpose

Defines a milestone-recognition system for 二階 `apps/medexam2-hospital-tw`. Players unlock 像素勳章 (pixel badges) for crossing meaningful thresholds across 7 categories (學習 / 答題 / 招募 / 經營 / 事件 / 隱藏 / 科別精通) at 4 difficulty tiers (P1 鑽石 / P2 金 / P3 銀 / P4 銅, aligned with PSN Trophy). Catalog is pure data (mirror existing `cosmetic.ts` predicate pattern) — new achievement = one JSON entry, zero engine code. Reward dispatcher routes unlocks to three channels: leaderboard 勳章 (displayed in nickname row), cosmetic (existing dorm pipeline), 稱號 (text chip). No new currency, no equipment integration.

## Requirements

### Requirement: Achievement catalog entry shape

The system SHALL define each achievement as a declarative record with predicate-based unlock condition. Each entry MUST have: unique id, name (zh-TW), description, tier (one of `P1`/`P2`/`P3`/`P4`), category (one of `study`/`quiz`/`recruit`/`hospital`/`fortune`/`hidden`/`subject`), hidden flag, predicate function taking (`Player`, `Stats`) and returning boolean, reward descriptor. Catalog SHALL live in `packages/content-medexam2-tw/src/achievements.ts` and be exported as a readonly array.

#### Scenario: Adding a new achievement requires no engine code

- **WHEN** a developer wants to add a new milestone「累積唸書 200 hr」
- **THEN** they SHALL only need to append one entry to the catalog array; no changes to `packages/core/src/lib/achievement.ts` or any service file are required

#### Scenario: Catalog includes 7 categories at launch

- **WHEN** the system loads the achievement catalog
- **THEN** the catalog SHALL contain entries spanning all 7 categories: study (學習里程碑) / quiz (答題大師 — 累計 + streak sub-ladder) / recruit (招募達人) / hospital (醫院經營) / fortune (時運與意外) / hidden (隱藏彩蛋) / subject (14 科精通 + 1 全科 capstone)

### Requirement: Diff-based unlock detection

The system SHALL provide `checkAchievementUnlocks(prev: Player, next: Player, stats: Stats, catalog: readonly Achievement[]): Achievement[]` that returns achievements whose predicate transitions from false (prev state) to true (next state). Already-unlocked achievements MUST NOT be re-emitted. Implementation MUST mirror existing [`checkMilestoneUnlocks`](../../../../packages/core/src/lib/cosmetic.ts) shape.

#### Scenario: Newly-crossed predicate returns unlock

- **WHEN** prev state has `totalQuestionsAnswered = 99` and next state has `totalQuestionsAnswered = 100`, and a P4 achievement requires `totalQuestionsAnswered >= 100`
- **THEN** `checkAchievementUnlocks` SHALL return that achievement in its result array

#### Scenario: Already-unlocked predicate does not re-emit

- **WHEN** both prev and next states satisfy a predicate (already unlocked at prev)
- **THEN** the achievement SHALL NOT appear in the returned array

### Requirement: buildAchievementStats transaction scope covers every read

The `buildAchievementStats()` helper (二階 only — `apps/medexam2-hospital-tw/src/lib/achievement-stats.ts`) SHALL declare every Dexie table it reads in its `'r'` transaction scope tuple. Adding a new read to the function body without extending the scope is a forbidden pattern, because Dexie throws `Table <name> not part of transaction` the first time the unreachable branch fires for a player with the matching state.

Callers that wrap `buildAchievementStats()` inside their own outer `'rw'` transaction (e.g. `QuizModal`'s answer-reward block) SHALL include `buildAchievementStats`'s full read set in their outer scope. Sub-transactions in Dexie must be a scope subset of the parent — omissions surface as `SubTransactionError` aborting every write of the outer transaction.

#### Scenario: Player with P1 doctor fully assigned to a room can still recruit, retire, draw fate cards, train, tick, and earn quiz rewards

- **GIVEN** a player has at least one P1-rarity doctor AND every P1-rarity doctor has a non-null `assignedRoom`
- **WHEN** they trigger any caller of `buildAchievementStats()` — recruit (`attemptRoll`), retire (`retireDoctor`), fate card draw, training attempt, idle tick, or quiz reward
- **THEN** `buildAchievementStats()` SHALL resolve without throwing `Table rooms not part of transaction`, AND the caller's primary mutation (ticket consume + doctor insert / doctor delete + refund / fate card cost + reward / training success + rarity bump / revenue accrual / mastery + affinity increment) SHALL commit normally

#### Scenario: Adding a new Dexie read to buildAchievementStats requires updating the scope tuple

- **WHEN** a future change adds a new Dexie `await db.<table>.foo()` read inside `buildAchievementStats`'s callback
- **THEN** the contributor SHALL also extend the `'r'` transaction's scope tuple to include `db.<table>`, AND extend `QuizModal`'s outer `'rw'` scope (and any other outer-tx caller of `buildAchievementStats` that exists at that time) to include `db.<table>` so the sub-tx remains a subset of the parent

### Requirement: P1 鑽石 composite condition enforcement

Every achievement with `tier: 'P1'` SHALL have a composite predicate combining at least two of: (量, 質, 持續, 廣度). Single-threshold P1 entries SHALL fail the build-time validator. The validator MUST run during `packages/content-medexam2-tw` build.

#### Scenario: Pure-grind P1 rejected at build

- **WHEN** a developer adds a P1 entry「累積唸書 100 hr」 without any AND clause
- **THEN** the build of `@study-rpg/content-medexam2-tw` SHALL fail with a validator error indicating the entry violates the composite-condition rule

#### Scenario: Composite P1 accepted

- **WHEN** a developer adds a P1 entry「累積唸書 100 hr **且** 連續登入 ≥ 30 天」 (量 × 持續)
- **THEN** the build SHALL succeed and the entry SHALL appear in the catalog

### Requirement: 4-tier system (P1 鑽石 / P2 金 / P3 銀 / P4 銅)

The system SHALL classify achievements at exactly 4 tiers. Tier values `'P1' | 'P2' | 'P3' | 'P4'` are the only valid options for the `tier` field. Type system SHALL reject other values.

#### Scenario: TypeScript prevents tier outside the 4-tier set

- **WHEN** a developer attempts to assign `tier: 'P5'` or `tier: 'platinum'` to an achievement entry
- **THEN** the TypeScript compiler SHALL emit a type error

### Requirement: Unlock toast and full-screen modal UI

The system SHALL display an `AchievementUnlockToast` component when achievements unlock at tiers P4/P3/P2 (8s auto-dismiss, celebratory polarity, mirror `EventToast` pattern, includes 64px BadgeSprite + name + reward chip). Tier P1 unlocks SHALL trigger a full-screen reveal modal instead (mirror `RecruitmentResultModal` pattern but with badge display).

#### Scenario: P4 banner appears non-blocking

- **WHEN** a player unlocks a P4 銅 achievement
- **THEN** the system displays a toast in the corner that auto-dismisses after 8 seconds, does NOT block other interactions

#### Scenario: P1 鑽石 triggers full-screen reveal

- **WHEN** a player unlocks a P1 鑽石 achievement
- **THEN** the system displays a full-screen modal with the badge prominent center, the achievement name, and the reward; player must dismiss to continue

### Requirement: Hidden achievement strict UI filtering

Achievements with `hidden: true` SHALL be excluded from all `/achievements` page renders until unlocked. They MUST NOT appear in tooltips, search results, locked-card silhouettes, filter dropdowns, or any other UI surface prior to unlock.

#### Scenario: Locked hidden achievement is invisible

- **WHEN** a hidden achievement is locked (predicate not satisfied) and a player visits `/achievements`
- **THEN** there SHALL be no card, silhouette, count, or text reference to that achievement anywhere on the page

#### Scenario: Unlocked hidden achievement displays normally

- **WHEN** a hidden achievement is unlocked
- **THEN** it SHALL appear on `/achievements` with full art, name, description, and unlock date — same treatment as non-hidden achievements

### Requirement: Achievement table persistence (Dexie v15)

The system SHALL introduce a Dexie v15 table `achievements` keyed by achievement id with shape `{ id: string, unlockedAt: number, notificationShown: boolean }`. The schema upgrade SHALL handle both fresh-start and upgrade-from-v14 paths, mirror the v14 `leaderboardProfile` migration pattern.

#### Scenario: Fresh install initializes empty table

- **WHEN** a new player loads the app for the first time
- **THEN** the `achievements` Dexie table SHALL exist and be empty; no errors

#### Scenario: Upgrade from v14 preserves existing tables

- **WHEN** an existing player loads the app with Dexie v14 IndexedDB
- **THEN** the schema SHALL upgrade to v15, the new `achievements` table SHALL be created empty, and all existing tables (hospital_state, doctors, mastery, question_history, leaderboard_profile, etc.) SHALL remain intact

### Requirement: Achievement state syncs via R2 m2 bundle only

The achievements table SHALL be wrapped in a `TableAdapter` registered in `M2_ADAPTERS` only. It MUST NOT be added to `HOSPITAL_ADAPTERS`. No Supabase migration shall be authored for this table. Mirror `LEADERBOARD_PROFILE` precedent (commit `cfaaa32`).

#### Scenario: New table is R2 passenger

- **WHEN** the sync engine pushes the m2 bundle to R2
- **THEN** the gzipped snapshot data SHALL include the achievements table contents (via the adapter's `snapshotAll`)

#### Scenario: New table is not pushed to Supabase

- **WHEN** the sync engine runs its Supabase per-row push path during dual-write window
- **THEN** no Supabase write SHALL be issued for the achievements table; no row appears in any Supabase table for achievements

### Requirement: Reward dispatcher — three channels, no new currency

The system SHALL define exactly three reward channels: leaderboard 勳章 (badges_csv update + subject_mastery_count update), cosmetic (call existing `instanceFromCosmetic`), 稱號 (set `leaderboardProfile.selectedTitle`). The reward type field MUST be a discriminated union over these three. The dispatcher SHALL NOT grant equipment, tickets, pity progress, or any new currency.

#### Scenario: Cosmetic reward routes to existing pipeline

- **WHEN** an achievement with `reward: { kind: 'cosmetic', cosmeticId: 'achievement-white-coat' }` unlocks
- **THEN** the dispatcher SHALL call `instanceFromCosmetic(catalog.get('achievement-white-coat'))` and add the resulting `ItemInstance` to inventory

#### Scenario: Title reward updates profile

- **WHEN** an achievement with `reward: { kind: 'title', title: '畢業生' }` unlocks
- **THEN** the dispatcher SHALL surface the new title in SettingsPanel's selectable list (player chooses whether to display it)

#### Scenario: Equipment reward type rejected at build

- **WHEN** a developer attempts to add `reward: { kind: 'equipment', ... }` to an achievement entry
- **THEN** the TypeScript compiler SHALL emit a type error indicating that `equipment` is not a valid reward kind

### Requirement: Anti-grind composite enforcement for cumulative achievements

Achievements whose primary predicate is a pure cumulative count or time threshold (e.g., `totalStudyMinutes >= N`, `totalQuestionsAnswered >= N`) MUST include an additional dimension constraint (accuracy threshold, streak requirement, or recency requirement) at tier P1 鑽石. The validator SHALL inspect predicate function source / metadata and reject single-dimension P1 grind achievements.

#### Scenario: Pure cumulative time at P3 銀 allowed

- **WHEN** a developer adds「累積唸書 30 hr」at tier P3
- **THEN** the validator SHALL accept it (P3 is not subject to anti-grind rule)

#### Scenario: Pure cumulative count at P1 鑽石 rejected

- **WHEN** a developer adds「答對 3000 題」at tier P1 with no other dimension
- **THEN** the validator SHALL reject the entry; the developer must add accuracy or streak clause

### Requirement: Main badge atlas (6×4 grid)

The system SHALL render category × tier badges from a single sprite atlas at `apps/medexam2-hospital-tw/src/assets/achievements/badge-atlas.png` of dimensions 512×768 px with 6 rows × 4 columns × 128×128 px cells. Row index maps to category (study=0, quiz=1, recruit=2, hospital=3, fortune=4, hidden=5). Column index maps to tier (P4=0, P3=1, P2=2, P1=3). Atlas MUST use 16-color GBA-style palette with transparent background.

#### Scenario: BadgeSprite component shows correct cell

- **WHEN** `<BadgeSprite category="quiz" tier="P1" size={24} />` is rendered
- **THEN** the component SHALL show the cell at row 1 (quiz), column 3 (P1) — the「鑽石十字」 design

#### Scenario: Atlas missing fails Vite build

- **WHEN** the developer removes `badge-atlas.png` and tries to build
- **THEN** Vite SHALL fail the build with an unresolved import error

### Requirement: Subject mastery atlas (7×2 grid)

The system SHALL render per-subject mastery badges from a separate atlas `subject-atlas.png` of dimensions 896×256 px with 7 columns × 2 rows × 128×128 px cells. All cells SHALL share the P2 金 base styling with a distinct medical specialty icon overlay per cell. Mapping (col, row): 內科 (0,0) / 家醫科 (1,0) / 小兒科 (2,0) / 皮膚科 (3,0) / 神經內科 (4,0) / 精神科 (5,0) / 麻醉科 (6,0) / 外科 (0,1) / 泌尿科 (1,1) / 骨科 (2,1) / 婦產科 (3,1) / 復健科 (4,1) / 眼科 (5,1) / 耳鼻喉科 (6,1).

#### Scenario: SubjectBadgeSprite shows correct subject

- **WHEN** `<SubjectBadgeSprite subjectId="外科" size={48} />` is rendered
- **THEN** the component SHALL show the cell at column 0, row 1 — the「外科達人」 design with scalpel/suture icon and P2 金 base

### Requirement: Subject icon recognizability at small sizes

Subject mastery icons SHALL remain visually distinguishable at 24px, 48px, and 64px rendered sizes. Verification SHALL occur via side-by-side rendering review during atlas generation. If recognizability fails at 24px, the atlas MUST be regenerated with fallback strategy (e.g., add 1-2 Chinese character overlay in corner).

#### Scenario: 24px atlas verification

- **WHEN** the atlas is generated and the team reviews at 24px size
- **THEN** all 14 subject icons MUST be distinguishable by visual inspection; ambiguous icons (e.g., eye-icon vs glasses-icon collision) require regeneration

### Requirement: Five service hook points

The system SHALL trigger achievement evaluation at exactly five service call sites in `apps/medexam2-hospital-tw/src/`:

1. `services/quiz-rewards.ts` (after quiz answer reward applied)
2. `lib/tick.ts` (after tier upgrade or event resolution)
3. `services/recruitment.ts` (after gacha pull resolved)
4. `services/fate-card.ts` (after fate card drawn)
5. `services/training.ts` (after training success, retire, or pity trigger)

Each hook SHALL call `checkAchievementUnlocks(prev, next, stats, catalog)` and emit `AchievementUnlockToast` (or full-screen modal for P1) for each returned achievement.

#### Scenario: Quiz answer triggers achievement check

- **WHEN** a player answers a quiz question correctly and `applyQuizReward` completes
- **THEN** the system SHALL call `checkAchievementUnlocks` with the pre/post state and surface any newly-unlocked achievements via the appropriate UI component

#### Scenario: Equipment service NOT hooked

- **WHEN** the player opens an equipment supply box (post-PR-merge, if equipment system exists)
- **THEN** NO achievement evaluation hook fires for equipment-related events; achievements remain decoupled from equipment

### Requirement: Streak counter integration

The system SHALL maintain a streak counter for consecutive correct quiz answers. The counter SHALL be persisted at `gameCounters.currentQuizCorrectStreak` (LWW, can decrease) and `monotonicCounters.maxQuizCorrectStreak` (MAX-merge, monotonic). Reset rules:

- Correct answer (fresh or non-fresh) → `currentQuizCorrectStreak += 1`; if it exceeds max, also update `maxQuizCorrectStreak`
- Wrong answer → `currentQuizCorrectStreak = 0`; max preserved
- Skipped question (送分題退費) → no change to current or max
- `isDisputed` 送分題 (always-grants-reward) → treated as correct, `currentQuizCorrectStreak += 1`
- Session end / page refresh / day boundary → no change (streak persists across sessions)

#### Scenario: Wrong answer resets current but preserves max

- **WHEN** a player has `currentQuizCorrectStreak = 15`, `maxQuizCorrectStreak = 20`, and answers wrong
- **THEN** `currentQuizCorrectStreak` becomes 0; `maxQuizCorrectStreak` stays 20

#### Scenario: New max triggers streak achievement

- **WHEN** a player's current streak reaches 5 (first time) and a P4 achievement requires `maxQuizCorrectStreak >= 5`
- **THEN** the achievement unlocks immediately on that correct answer

### Requirement: Silent backfill of pre-existing achievement state on every sync pull cycle

When the sync engine's `onPullComplete` callback fires (after every successful pull cycle, including cold-start force-pull and visibility-change incremental pull), the client SHALL evaluate all entries in the `ACHIEVEMENTS` catalog against the current Dexie state via `listUnlockedAchievements(player, stats, ACHIEVEMENTS)`, diff the result against IDs currently present in the local `achievements` table, and `bulkPut()` any unlocked-but-missing rows with `notificationShown: true`. The backfill SHALL NOT dispatch any reward (cosmetic intent log, title append, badge no-op), SHALL NOT push to the achievement toast queue, and SHALL NOT trigger the full-screen unlock modal for P1 tier rows. The complementary unlock-detection flow at `services/achievement-reward.ts` (diff-based, transition-driven) remains unchanged and continues to fire toasts + reward dispatch for **new** transitions during gameplay.

**Rationale**: The diff-based unlock detection at `services/achievement-reward.ts:104` only writes a Dexie row when `checkAchievementUnlocks` detects a transition from `false → true` between two consecutive `buildAchievementStats()` snapshots. Players whose stats already satisfy a predicate before the catalog ships (e.g., past 5 hours of reading or 50 quiz correct) never experience that transition — both snapshots evaluate to `true` — so no row is ever written, and `deriveAchievementSnapshot()` returns empty `badges_csv` for them. Verified live 2026-05-24: 9 of 10 leaderboard rows had `badges_csv: ""` despite players clearly past multiple thresholds. The silent backfill closes this gap retroactively without spamming users with toasts for accomplishments they don't remember earning.

#### Scenario: First pull after deploy backfills missing rows for pre-existing player

- **GIVEN** a player whose Dexie state shows `totalStudyMinutes: 1004`, `totalDoctorsRecruited: 48`, `currentHospitalTier: '醫學中心'`
- **AND** the local `achievements` table is empty (player was active before achievement system shipped)
- **WHEN** the sync engine completes a successful pull cycle and fires `onPullComplete`
- **THEN** the backfill service SHALL call `listUnlockedAchievements(player, stats, ACHIEVEMENTS)` and identify all entries whose predicate returns `true` given the current state
- **AND** the service SHALL `bulkPut()` each matching entry as `{id, unlockedAt: Date.now(), notificationShown: true}` into the `achievements` table
- **AND** no `dispatchReward` call SHALL fire for any backfilled row
- **AND** no `achievementToastQueue.push` call SHALL fire for any backfilled row
- **AND** the next debounced sync push SHALL include the new rows via the existing `ACHIEVEMENTS` table adapter, and the subsequent `onPushComplete` leaderboard upsert SHALL upload the now-populated `badges_csv`

#### Scenario: Subsequent pull cycles short-circuit when nothing to backfill

- **GIVEN** the backfill has already populated the `achievements` table on a previous pull cycle
- **AND** no new achievements have become eligible since the last backfill
- **WHEN** a subsequent `onPullComplete` callback fires
- **THEN** the backfill service SHALL compute `missing = unlockedNow.filter(a => !existingIds.has(a.id))` and find `missing.length === 0`
- **AND** the service SHALL return `0` without invoking `bulkPut`
- **AND** total per-call overhead SHALL be bounded by one transactional Dexie read in `buildAchievementStats()` plus a 49-entry catalog scan (< 500ms typical)

#### Scenario: Backfill never overwrites a row that has notificationShown: false

- **GIVEN** the diff-based unlock-detection flow at `services/achievement-reward.ts` has already written a row for achievement `study-hours-5` with `notificationShown: false` (pending toast queue display)
- **WHEN** the backfill service runs and sees `study-hours-5` in `listUnlockedAchievements`
- **THEN** the backfill SHALL detect `existingIds.has('study-hours-5') === true` and skip it
- **AND** the row's `notificationShown` flag SHALL remain `false` so the pending toast display proceeds normally on next consumer pump

#### Scenario: Backfill error does not break the pull cycle

- **GIVEN** the `onPullComplete` callback chain in `useSync.ts` runs `checkAssignmentInvariants()` followed by `backfillAchievementsFromCurrentStats()`
- **WHEN** the backfill call throws (e.g., transient Dexie transaction failure during `buildAchievementStats`)
- **THEN** the error SHALL be caught at the call site and logged via `console.warn` with the `[achievement-backfill]` channel prefix
- **AND** the pull cycle SHALL be considered complete; sync status SHALL transition to `idle` normally
- **AND** no error toast SHALL surface to the user
- **AND** the next pull cycle SHALL retry the backfill

#### Scenario: Backfill covers subject-master entries for subject_mastery_count derivation

- **GIVEN** a player whose `questionHistory` table shows that all 1306 內科 questions have at least one attempt, all 710 小兒科 questions also fully attempted, but 婦產科 only 200 / 644 attempted
- **AND** the `achievements` table contains no `subject-master-*` rows
- **WHEN** `onPullComplete` fires and backfill runs
- **THEN** the backfill SHALL add `subject-master-內科` and `subject-master-小兒科` rows (predicate true for both, false for 婦產科)
- **AND** the subsequent `deriveAchievementSnapshot()` call SHALL return `subject_mastery_count: 2`
- **AND** the next leaderboard upsert SHALL push `subject_mastery_count: 2` to the Worker, surfacing as `🩺 2/14` chip on the public LeaderboardPage

#### Scenario: Backfill timestamps reflect backfill time, not original threshold-crossing time

- **GIVEN** a player who first crossed the `totalStudyMinutes >= 300` threshold on 2026-04-01 (before the achievement system shipped)
- **WHEN** the backfill runs on 2026-05-25
- **THEN** the inserted `achievements` row SHALL have `unlockedAt: <Date.now()>` reflecting the backfill moment, NOT the historical 2026-04-01 timestamp
- **AND** this is an acceptable trade-off — the original crossing event was not recorded; the system has no way to reconstruct it. The AchievementsPage MAY display the backfill timestamp as the unlock date without further qualification.

### Requirement: Monotonic counter backfill for pre-existing players via derivation from existing tables

When the sync engine's `onPullComplete` callback fires, the client SHALL run a monotonic-counter backfill pass via `backfillMonotonicCounters()` BEFORE the existing achievement-row backfill pass. The counter backfill SHALL derive values for the 3 recoverable fields (`totalDoctorsRecruited`, `totalP1DoctorsRecruited`, `tierUpgradeCount`) from existing Dexie tables and patch the `monotonicCounters` singleton row using MAX-merge semantics — only writing when the derived value is strictly greater than the existing value (or the existing value is `undefined`). The 3 unrecoverable fields (`totalStudyMinutes`, `maxDailyStreak`, `maxQuizCorrectStreak`) SHALL NOT be touched by this backfill; they remain at their existing value or `undefined` and re-accumulate naturally via the existing trigger-hook code paths on subsequent gameplay events.

**Rationale**: The Dexie v15 schema migration that shipped with `add-achievement-system` (2026-05-24) added 5 new MAX-merge fields to `MonotonicCountersRow` but did not write default values to the existing singleton row for players whose row pre-dated the migration. Reading `mono.totalDoctorsRecruited` returns `undefined → ?? 0` in `buildAchievementStats()`, so achievement predicates like `recruit-first-doctor` (`stats.totalDoctorsRecruited >= 1`) evaluate to false for pre-existing players even when they have 12 actual doctors in the `doctors` table. The `backfill-achievements-on-sign-in` change correctly evaluates predicates against current state, but with bad inputs from the un-backfilled counter row. This counter backfill closes the gap for the 3 derivable counters; the 3 unrecoverable counters stay at 0 (accepted trade-off — see design D6).

#### Scenario: First pull derives totalDoctorsRecruited from doctors + retirementLog

- **GIVEN** a player whose Dexie state shows `doctors.count() === 12`, `retirementLog.count() === 3`
- **AND** `monotonicCounters.singleton.totalDoctorsRecruited === undefined` (or `0`)
- **WHEN** the sync engine completes a successful pull cycle and fires `onPullComplete`
- **THEN** the counter backfill SHALL compute `derivedTotalDoctorsRecruited = 12 + 3 = 15`
- **AND** the service SHALL patch the `monotonicCounters` singleton row to set `totalDoctorsRecruited = 15`
- **AND** the subsequent achievement-backfill pass on the same callback chain SHALL see `stats.totalDoctorsRecruited === 15` and unlock all `recruit-*` predicates whose threshold ≤ 15

#### Scenario: First pull derives totalP1DoctorsRecruited with rarity filter

- **GIVEN** a player whose Dexie state shows 2 P1 doctors currently in `doctors` table and 1 P1 doctor in `retirementLog`
- **AND** `monotonicCounters.singleton.totalP1DoctorsRecruited === undefined`
- **WHEN** counter backfill runs
- **THEN** the service SHALL compute `derivedTotalP1DoctorsRecruited = 2 + 1 = 3`
- **AND** patch the singleton row to set `totalP1DoctorsRecruited = 3`

#### Scenario: tierUpgradeCount derived from current tier via static map

- **GIVEN** a player whose `gameCounters.singleton.tier === '醫學中心'`
- **AND** `monotonicCounters.singleton.tierUpgradeCount === undefined`
- **WHEN** counter backfill runs
- **THEN** the service SHALL look up `TIER_TO_UPGRADE_COUNT['醫學中心'] === 2` in the static derivation map (where `{診所: 0, 區域醫院: 1, 醫學中心: 2, 國家級教學醫院: 3}`)
- **AND** patch the singleton row to set `tierUpgradeCount = 2`

#### Scenario: MAX-merge — derived value never regresses an existing higher value

- **GIVEN** a player whose `monotonicCounters.singleton.totalDoctorsRecruited === 50` (set by a previous trigger-hook firing)
- **AND** current `doctors.count() + retirementLog.count() === 48` (slight discrepancy because the trigger fired before some doctors were dismissed via a code path that didn't write to retirementLog)
- **WHEN** counter backfill runs
- **THEN** the service SHALL compute `48 < 50` is false
- **AND** the service SHALL NOT patch `totalDoctorsRecruited`
- **AND** the existing value of `50` SHALL be preserved

#### Scenario: Idempotent — subsequent pulls short-circuit when no field needs updating

- **GIVEN** a previous pull cycle already patched the counter row with derived values
- **AND** no new doctor recruitment / tier upgrade has fired since that pull
- **WHEN** a subsequent `onPullComplete` callback fires and counter backfill runs again
- **THEN** the service SHALL detect that no field requires patching (`changed === 0`)
- **AND** the service SHALL NOT call `monotonicCounters.put`
- **AND** the function SHALL return `0`

#### Scenario: Unrecoverable counters stay at their existing value

- **GIVEN** a player whose `monotonicCounters.singleton.totalStudyMinutes === undefined` (pre-existing row)
- **WHEN** counter backfill runs
- **THEN** the service SHALL NOT attempt to derive a value for `totalStudyMinutes`
- **AND** the field SHALL remain `undefined` after the backfill completes
- **AND** the next gameplay reading session SHALL accumulate via the existing trigger hook in `lib/tick.ts` and set the field to its first positive value
- **AND** subsequent backfill calls SHALL continue to NOT touch this field

#### Scenario: Counter backfill chains BEFORE achievement backfill within onPullComplete

- **GIVEN** the `onPullComplete` callback in `useSync.ts` is configured to chain `checkAssignmentInvariants → backfillMonotonicCounters → backfillAchievementsFromCurrentStats`
- **WHEN** a successful pull cycle completes
- **THEN** the engine SHALL await `checkAssignmentInvariants()` first
- **AND** await `backfillMonotonicCounters()` second
- **AND** await `backfillAchievementsFromCurrentStats()` third (LAST)
- **AND** the ordering SHALL ensure achievement-backfill's `buildAchievementStats()` call reads the freshly-patched counter values

#### Scenario: Counter backfill failure does not break the pull cycle

- **GIVEN** the existing try/catch around the achievement-backfill chain in `useSync.ts` is extended to also cover counter backfill
- **WHEN** `backfillMonotonicCounters()` throws (e.g., transient Dexie write failure)
- **THEN** the error SHALL be caught and logged via `console.warn` with the `[achievement-backfill]` channel prefix (sharing the channel with achievement-row backfill — both are part of the same retroactive-population workflow)
- **AND** the subsequent achievement-backfill call SHALL be skipped for this cycle (cannot proceed with stale counter inputs anyway)
- **AND** the pull cycle SHALL transition to `idle` normally
- **AND** the next pull cycle SHALL retry both backfills

The AchievementsPage hosts a third sub-tab named 統計 (Stats) that surfaces time-series learning analytics — daily study minutes and daily correct answers. Added by `tidy-tabs-add-study-stats-medexam2` (2026-05-26).

### Requirement: AchievementsPage SHALL host a third sub-tab named 統計

The achievements page (`apps/medexam2-hospital-tw/src/pages/AchievementsPage.tsx`, served at route `/achievements`) SHALL extend its sub-tab navigation from the existing two options (`main` 主成就 / `subject` 科別精通) to three options:

- `main` 主成就 (unchanged)
- `subject` 科別精通 (unchanged)
- `stats` 統計 (NEW)

The default selected sub-tab on first mount SHALL remain `main`. The sub-tab control SHALL use React local state (no URL searchParam wiring required for this change). When `stats` is the active sub-tab, the existing three filter dropdowns (category / tier / status) SHALL be hidden and replaced with stats-specific controls (range chip + subject filter chip, defined below).

#### Scenario: Sub-tab selector renders three options

- **WHEN** the player loads `/achievements`
- **THEN** the sub-tab selector SHALL render three buttons in order: 主成就 / 科別精通 / 統計
- **AND** 主成就 SHALL be the default active sub-tab

#### Scenario: Activating 統計 hides achievement filters

- **WHEN** the player clicks 統計 sub-tab
- **THEN** the category / tier / status filter dropdowns SHALL NOT render
- **AND** the achievement list SHALL NOT render
- **AND** the stats panel (charts + range chip + subject filter) SHALL render

### Requirement: Stats sub-tab SHALL render two bar charts — daily study minutes and daily correct answers

The 統計 sub-tab SHALL display two independent vertical bar charts stacked vertically (study minutes on top, correct answers on bottom). Each chart SHALL:

- Have an X axis representing calendar days within the selected range (oldest on left, today on right)
- Have a Y axis auto-scaled to `max(values) × 1.1`, with at most two visible Y tick labels (max and mid)
- Render one bar per day in the range, including days with zero value (zero-height bar; X axis remains continuous)
- Use distinct fill colors per chart (study minutes ≠ correct answers); colors MAY follow the existing theme palette
- Be implemented as hand-written SVG (NO chart library dependency such as recharts / d3 / chart.js)
- Display a per-bar tooltip on hover/tap showing the exact date and value (e.g., via `<title>` SVG element or equivalent)

**Data source for study minutes chart**: rows from `dailyStudyLog` Dexie table (defined in `daily-study-log` capability). Each bar's height = `row.minutesAdded` for that date, or `0` if no row.

**Data source for correct answers chart**: rows from `questionHistory` Dexie table grouped by `startOfDay(lastAnsweredAt)` where `lastResult === 'correct'`. Each bar's height = count of qualifying rows for that date.

#### Scenario: Stats panel renders both charts on first mount

- **GIVEN** the player has `dailyStudyLog` with one row `{date:'2026-05-26', minutesAdded:30}` and `questionHistory` with three `lastResult='correct'` rows dated `2026-05-26`
- **WHEN** the player opens the 統計 sub-tab with default range 30d
- **THEN** the page SHALL render a SVG chart for study minutes with the bar at `2026-05-26` representing 30
- **AND** the page SHALL render a SVG chart for correct answers with the bar at `2026-05-26` representing 3
- **AND** all other days in the 30-day window SHALL render as zero-height bars (or visually absent but X axis continuous)

#### Scenario: Charts use SVG not a third-party library

- **WHEN** inspecting the rendered DOM of the stats panel
- **THEN** the chart containers SHALL be `<svg>` elements with `<rect>` children for bars
- **AND** the app bundle SHALL NOT include recharts / d3 / chart.js / victory / chartist or any chart library import attributable to this feature

### Requirement: Stats sub-tab SHALL provide a range chip with four options

The 統計 sub-tab SHALL render a chip-style single-select control above (or beside) the charts with exactly four options:

- 7 天 (7d)
- 30 天 (30d) — **default**
- 90 天 (90d)
- 全部 (all)

Selecting an option SHALL trigger re-aggregation of both charts to that window. Selection SHALL use React local state (no URL searchParam). On sub-tab unmount (player switches to 主成就 / 科別精通) the selection MAY be discarded.

The «全部» option SHALL aggregate from the earliest existing data point (oldest of `dailyStudyLog.date` and `min(questionHistory.lastAnsweredAt)`) to today. If `dailyStudyLog` is empty and no `questionHistory` rows exist, «全部» SHALL render an empty-state message.

#### Scenario: Default range is 30 days

- **WHEN** the player opens the 統計 sub-tab for the first time
- **THEN** the «30 天» chip SHALL appear as selected
- **AND** both charts SHALL render 30 bars (one per day for the last 30 days ending today)

#### Scenario: Switching to 7 天 reduces chart density

- **GIVEN** the 統計 sub-tab is active with «30 天» selected
- **WHEN** the player clicks «7 天»
- **THEN** the «7 天» chip SHALL become selected
- **AND** «30 天» SHALL deselect
- **AND** both charts SHALL re-render with 7 bars covering the last 7 days

#### Scenario: 全部 with no data shows empty state

- **GIVEN** a freshly-installed player with `dailyStudyLog = []` and `questionHistory = []`
- **WHEN** the player opens 統計 and clicks «全部»
- **THEN** an empty-state message SHALL be displayed (e.g., «還沒有資料 — 開始唸書後會在這裡顯示趨勢»)
- **AND** the chart areas SHALL NOT render zero-height bars stretching to infinity

### Requirement: Stats sub-tab SHALL provide a subject filter that affects the correct-answers chart only

The 統計 sub-tab SHALL reuse the existing `BookmarkFilterBar` component to render a multi-select subject chip filter (mirroring its use on the bookmarks page). The filter SHALL be configured as:

- `years = []` (year section hidden — stats sub-tab doesn't filter by year)
- `subjects = ALL_SUBJECT_IDS` (all 14 二階 subjects)
- `selectedSubjects` = controlled by stats sub-tab local state, default `all selected` (treated as no filter)

The subject filter SHALL affect only the correct-answers chart. The study-minutes chart SHALL NOT be affected by subject selection (study time is recorded globally, not per-subject). The visual separation MAY be communicated via a small caption like «分科 filter 僅影響下方圖表» near the filter bar.

#### Scenario: Filtering to one subject reduces correct-answers bars

- **GIVEN** the player has 5 correct 內科 answers on 2026-05-26 and 3 correct 外科 answers on the same date
- **WHEN** the player opens 統計, default range 30d, and deselects all subjects except 內科
- **THEN** the correct-answers chart bar for 2026-05-26 SHALL show height 5 (not 8)
- **AND** the study-minutes chart bar for 2026-05-26 SHALL remain unchanged (whatever `dailyStudyLog` row for that date contains)

#### Scenario: Empty subject selection treated as no-filter (show all)

- **WHEN** the player deselects all subjects (zero subjects checked)
- **THEN** the correct-answers chart SHALL fall back to showing all correct answers across all subjects (equivalent to all selected)
- **AND** a hint MAY display «未選擇任何科別 = 顯示全部»

### Requirement: Stats sub-tab SHALL surface a summary chip showing pre-upgrade residual minutes

Above (or near) the charts, the 統計 sub-tab SHALL display a small chip summarizing the gap between lifetime study minutes and the sum of dailyStudyLog rows visible in any range. The chip SHALL show:

```
升級前累積 {N} 分鐘 (無法分日顯示)
```

Where `N = max(0, monotonicCounters.totalStudyMinutes − sum(dailyStudyLog[*].minutesAdded))`. This chip exists to make the forward-only nature of `dailyStudyLog` transparent to players, especially those upgrading from v17 who had accumulated study minutes before this change shipped.

The chip MAY be hidden when `N === 0` (clean install — no pre-upgrade history exists).

#### Scenario: Existing player with prior accumulated minutes sees residual chip

- **GIVEN** a player with `monotonicCounters.totalStudyMinutes = 4320` and `dailyStudyLog = [{minutesAdded:30}, {minutesAdded:25}]` (total 55)
- **WHEN** the player opens the 統計 sub-tab
- **THEN** the summary chip SHALL display «升級前累積 4265 分鐘 (無法分日顯示)»

#### Scenario: Fresh install hides the residual chip

- **GIVEN** a new player with `monotonicCounters.totalStudyMinutes = 0` and `dailyStudyLog = []`
- **WHEN** the player opens the 統計 sub-tab
- **THEN** the summary chip SHALL NOT render (or render with N=0 hidden)
