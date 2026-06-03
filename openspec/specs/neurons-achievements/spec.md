# neurons-achievements Specification

## Purpose

7-category × 4-tier milestone recognition system for `apps/neurons-tw`. Borrowed pattern from 二階 `achievement-system` per `neurons-mode` Req 5 (independent capability spec; does not modify 二階 source). 30-entry catalog at `packages/content-neurons-tw/src/achievements.ts` spans `study | quiz | variant | synapse | mastery | fortune | hidden` categories with tiers `P1 鑽石 / P2 金 / P3 銀 / P4 銅`. Build-time validator enforces P1 composite-predicate metadata flag (anti-grind). Engine ships locally-declared types (`NeuronsAchievement` / `NeuronsAchievementCategory` / `NeuronsAchievementReward` / `NeuronsAchievementStats`) + 5-line re-impl of `checkAchievementUnlocks` diff function — `@study-rpg/core` published API untouched.

Reward channels = 2 (TypeScript-locked union): leaderboard implicit (via `badges_csv` on next push) + title persisted to `leaderboardProfile.unlockedTitles`. `cosmetic` / `equipment` / `ticket` / `currency` reward kinds are rejected at catalog declaration site.

Persistence = Dexie v5 `achievements` table (PK `id`, indexed `unlockedAt`); streak counter persisted in `meta` table as `currentQuizCorrectStreak` LWW + `maxQuizCorrectStreak` MAX-merge; both co-commit with `recordCorrectAnswer` / `recordIncorrectAnswer` Dexie transactions.

Three live trigger hook sites: `connectome.ts recordCorrectAnswer` / `connectome.ts recordIncorrectAnswer` / `variant-gacha.ts handleSlotUnlock`. App boot runs `backfillAchievementsFromCurrentStats()` once to silently populate predicates already satisfied (no toast / no reward dispatch / no modal). Same function shape ready for future `onPullComplete` cloud-sync hook.

UI: `/achievements` route with 2 sub-tabs + 2 filter dropdowns + strict hidden filtering (locked-hidden entries are invisible across all surfaces); `AchievementCard` + `BadgeSprite` (placeholder rendering with atlas swap deferred to follow-up); `AchievementToastHost` (P2-P4) + `AchievementUnlockModal` (P1 full-screen) both wrap `neurons-motion-library` primitives.

Leaderboard integration: `deriveAchievementSnapshot(unlocked)` produces max-tier-per-category CSV with hidden category excluded — fits existing Worker regex `^([a-z]+:P[1-4])(,[a-z]+:P[1-4]){0,5}$` (6 max entries). Uses `leaderboard_neurons.badges_csv` column reserved from day-one by `add-neurons-leaderboard` Req 11 — no D1 migration needed. `NicknameWithBadges` renders inline 20px badges on `LeaderboardPage`. `TitleSelector` in `LeaderboardSettingsControls` writes `leaderboardProfile.selectedTitle`.
## Requirements
### Requirement: Achievement catalog entry shape SHALL be a declarative record with predicate-based unlock condition

The neurons-achievements system SHALL define each achievement as a declarative record stored in `packages/content-neurons-tw/src/achievements.ts` and exported as `NEURONS_ACHIEVEMENTS: readonly Achievement[]`. Each entry MUST have these fields:

- `id`: globally unique kebab-case string (e.g., `variant-first-pull`, `mastery-five-p3`)
- `name`: short zh-TW display name (e.g., 「初次共振」)
- `description`: 1-2 sentence zh-TW explanation of the milestone
- `tier`: one of `'P1' | 'P2' | 'P3' | 'P4'`
- `category`: one of `'study' | 'quiz' | 'variant' | 'synapse' | 'mastery' | 'fortune' | 'hidden'`
- `hidden`: boolean — `true` excludes from all UI surfaces until unlocked
- `predicate`: `(player: PlayerSnapshot, stats: AchievementStats) => boolean` — returns `true` when the milestone is satisfied
- `reward`: `AchievementReward` discriminated union (see reward dispatcher requirement)
- `composite?`: optional `true` flag — REQUIRED when `tier === 'P1'` per the composite enforcement requirement

Adding a new achievement SHALL require only appending one entry to the catalog array; no engine code change is required.

#### Scenario: Catalog appends without engine code change

- **WHEN** a developer wants to add a new milestone「累積唸書 200 分鐘」
- **THEN** they SHALL only need to append one entry to `NEURONS_ACHIEVEMENTS` array
- **AND** no changes to `packages/core/src/lib/achievement.ts` or any service file in `apps/neurons-tw/src/lib/services/` SHALL be required

#### Scenario: Catalog ships ≥ 30 entries spanning all 7 categories at launch

- **WHEN** the system loads `NEURONS_ACHIEVEMENTS`
- **THEN** the catalog SHALL contain at least 30 entries
- **AND** every category in `{study, quiz, variant, synapse, mastery, fortune, hidden}` SHALL have at least 4 entries
- **AND** every tier in `{P1, P2, P3, P4}` SHALL have at least 5 entries across the catalog

### Requirement: Category enum SHALL contain exactly 7 neurons-specific string literals

The system SHALL declare `NEURONS_ACHIEVEMENT_CATEGORIES` as a frozen tuple of exactly seven string literal values: `'study'`, `'quiz'`, `'variant'`, `'synapse'`, `'mastery'`, `'fortune'`, `'hidden'`. No medical / hospital / doctor terms (`'recruit'`, `'hospital'`, `'subject'`) SHALL appear in the neurons-tw category set.

TypeScript SHALL reject any catalog entry whose `category` field falls outside the 7 neurons literals.

#### Scenario: TypeScript rejects 'recruit' category

- **WHEN** a developer adds an entry with `category: 'recruit'` to `NEURONS_ACHIEVEMENTS`
- **THEN** the TypeScript compiler SHALL emit a type error indicating that `'recruit'` is not in the neurons category union

#### Scenario: All 7 neurons categories have at least one entry

- **WHEN** the catalog is built
- **THEN** for each value in `NEURONS_ACHIEVEMENT_CATEGORIES`, there SHALL exist at least one catalog entry with that `category`

### Requirement: 4-tier system SHALL use exactly P1 鑽石 / P2 金 / P3 銀 / P4 銅

The system SHALL classify achievements at exactly 4 tiers. Tier values `'P1' | 'P2' | 'P3' | 'P4'` are the only valid options for the `tier` field. zh-TW display labels SHALL be:

- `'P1'` → 鑽石 (highest)
- `'P2'` → 金
- `'P3'` → 銀
- `'P4'` → 銅 (entry tier)

`tierRank('P1') === 1`, `tierRank('P4') === 4` — lower rank number = higher merit (so `min(tierRank)` yields the best-tier-per-category for leaderboard csv derivation).

#### Scenario: TypeScript rejects tier 'P5'

- **WHEN** a developer attempts to assign `tier: 'P5'` to an entry
- **THEN** the TypeScript compiler SHALL emit a type error

#### Scenario: tierRank ascending merit semantics

- **WHEN** `tierRank('P1')` is called
- **THEN** the function SHALL return `1`
- **WHEN** `tierRank('P4')` is called
- **THEN** the function SHALL return `4`

### Requirement: P1 composite condition SHALL be enforced via metadata flag plus build-time validator

Every catalog entry where `tier === 'P1'` SHALL declare `composite: true`. The build-time validator at `packages/content-neurons-tw/src/validator.ts` SHALL inspect the catalog array and fail the build with a clear error message if any P1 entry is missing the `composite` flag.

The validator SHALL NOT parse predicate function source — it relies on the author-supplied `composite` metadata flag as a self-audit declaration. Catalog comments MUST name the two-or-more dimensions (量 / 質 / 持續 / 廣度) the predicate combines.

The validator SHALL also reject:

- P1 entries with `composite: false` or `composite` absent
- Non-P1 entries with `composite: true` (composite is meaningful only at P1)

#### Scenario: P1 without composite flag fails build

- **WHEN** a developer adds a P1 entry「答對 3000 題」without `composite: true`
- **THEN** the build of `@study-rpg/content-neurons-tw` SHALL fail
- **AND** the validator error message SHALL identify the offending entry by `id` and indicate "P1 entries must declare `composite: true`"

#### Scenario: P1 with composite flag accepted

- **WHEN** a developer adds a P1 entry「答對 3000 題 且 整體準確率 ≥ 80%」 with `composite: true`
- **AND** a header comment names「量 × 質」 dimensions
- **THEN** the build SHALL succeed and the entry SHALL appear in the catalog

#### Scenario: P4 entry with composite flag fails build

- **WHEN** a developer adds a P4 entry「累積唸書 10 hr」with `composite: true`
- **THEN** the validator SHALL fail the build with error「composite flag is only valid for P1 entries; P4 entry <id> declared composite」

### Requirement: Diff-based unlock detection SHALL identify newly-satisfied predicates only

The neurons-achievements system SHALL provide a `checkAchievementUnlocks(prev, prevStats, next, nextStats, catalog)` function with diff-based semantics: returns achievements whose predicate transitions from `false` (prev state) to `true` (next state); already-unlocked achievements MUST NOT be re-emitted.

Implementation MAY re-use the core `@study-rpg/core` function or be locally re-implemented in `apps/neurons-tw/src/lib/services/achievement.ts`. The neurons catalog uses `NeuronsAchievementStats` (a neurons-specific stats shape — see related requirement) which is structurally incompatible with the 二階 `AchievementStats` in core; consequently the apply phase RE-IMPLEMENTS the 5-line diff-checker locally rather than fighting type narrowing, in order to keep `@study-rpg/core` published API frozen and isolate neurons types from 二階 types per `neurons-mode` Req 4 (data isolation) and Req 5 (independent spec).

The neurons-side `services/achievement.ts` orchestrator SHALL build `PlayerSnapshot` + `NeuronsAchievementStats` from neurons Dexie tables (`familyAccrual` / `synapses` / `familyMastery` / `neuronVariants` / `meta`) and call this function on every trigger hook.

#### Scenario: Newly-crossed predicate returns unlock

- **WHEN** prev state has `variantCount = 4` and next state has `variantCount = 5`
- **AND** a P4 achievement requires `variantCount >= 5`
- **THEN** `checkAchievementUnlocks` SHALL return that achievement in its result array

#### Scenario: Already-unlocked predicate does not re-emit

- **WHEN** both prev and next states satisfy a predicate (already unlocked at prev)
- **THEN** the achievement SHALL NOT appear in the returned array

### Requirement: Reward dispatcher SHALL support exactly 2 channels — leaderboard 勳章 and 稱號

The system SHALL define the `AchievementReward` discriminated union to allow exactly two reward kinds:

```typescript
type AchievementReward =
  | { kind: 'leaderboard' }                  // implicit — every unlock contributes to badges_csv
  | { kind: 'title'; title: string }          // explicit — grants a selectable display title
```

`'cosmetic'`, `'equipment'`, `'ticket'`, `'currency'`, and any other reward kind SHALL be a TypeScript compile error. Future cosmetic / equipment kinds MAY be proposed via a new OpenSpec change but SHALL NOT be added without spec.

The dispatcher (`services/achievement-reward.ts`) SHALL branch on `reward.kind`:

- `leaderboard` → no immediate action; `badges_csv` derivation runs on next leaderboard push (per `deriveAchievementSnapshot` requirement)
- `title` → append `reward.title` to `leaderboardProfile.unlockedTitles` (Dexie list); render in `LeaderboardSettingsControls` as selectable

#### Scenario: Title reward updates unlocked titles list

- **WHEN** an achievement with `reward: { kind: 'title', title: '神經元始祖' }` unlocks
- **THEN** the dispatcher SHALL append `'神經元始祖'` to the player's `leaderboardProfile.unlockedTitles` (creating the list if absent)
- **AND** the title SHALL appear in the `LeaderboardSettingsControls` selectable list

#### Scenario: Equipment reward kind rejected at build

- **WHEN** a developer attempts to add `reward: { kind: 'equipment', equipmentId: 'x' }` to an entry
- **THEN** the TypeScript compiler SHALL emit a type error indicating that `equipment` is not a valid reward kind

#### Scenario: Cosmetic reward kind rejected at build

- **WHEN** a developer attempts to add `reward: { kind: 'cosmetic', cosmeticId: 'x' }` to an entry
- **THEN** the TypeScript compiler SHALL emit a type error

### Requirement: Unlock toast (P2-P4) and full-screen modal (P1) SHALL source timing from neurons-motion-library

The system SHALL render the following UI on achievement unlock:

- **P2 / P3 / P4 unlock** → `AchievementUnlockToast` rendered via the existing `ConnectomeToastHost` (top-right vertical stack); 8s auto-dismiss using the imported `TOAST_AUTO_DISMISS_MS` constant from `'../lib/motion'`; entry animation uses Framer Motion variants with `useRespectsReducedMotion` honor
- **P1 unlock** → `AchievementUnlockModal` rendered as full-screen overlay, dismiss-required; uses neurons-motion-library entry variants degrading to opacity-only fade for reduced-motion users

Neither component SHALL declare local literal `8000` or animation timing — all timings MUST be imported from `'../lib/motion'`.

#### Scenario: P4 unlock renders toast that auto-dismisses

- **WHEN** a player unlocks a P4 銅 achievement
- **THEN** the system renders an `AchievementUnlockToast` on `ConnectomeToastHost`
- **AND** the toast SHALL auto-dismiss after `TOAST_AUTO_DISMISS_MS` (8 seconds)
- **AND** the toast SHALL NOT block input

#### Scenario: P1 unlock triggers full-screen modal

- **WHEN** a player unlocks a P1 鑽石 achievement
- **THEN** the system renders an `AchievementUnlockModal` covering the viewport
- **AND** the modal SHALL display the badge prominently centered + achievement name + reward
- **AND** the player MUST dismiss to continue

#### Scenario: Toast timing sourced from motion library not local literal

- **GIVEN** a developer audits `apps/neurons-tw/src/components/AchievementUnlockToast.tsx`
- **WHEN** the developer searches for the literal value `8000`
- **THEN** that literal SHALL NOT appear in the file
- **AND** the file SHALL import `TOAST_AUTO_DISMISS_MS` from `'../lib/motion'`

#### Scenario: Reduced-motion users get opacity-only modal entry

- **GIVEN** the OS preference `prefers-reduced-motion: reduce`
- **WHEN** an `AchievementUnlockModal` mounts
- **THEN** `useRespectsReducedMotion()` SHALL return `true`
- **AND** the modal entry animation SHALL use `initial={{ opacity: 0 }}` → `animate={{ opacity: 1 }}` (no scale or translate)

### Requirement: Hidden achievement SHALL be strictly filtered from all UI surfaces until unlocked

Achievements with `hidden: true` SHALL be excluded from all `/achievements` page renders until unlocked. They MUST NOT appear in tooltips, search results, locked-card silhouettes, count badges, filter dropdowns, or any other UI surface prior to unlock.

After unlock, hidden achievements SHALL render with full art / name / description / unlock date — same treatment as non-hidden achievements.

Hidden achievements SHALL also be excluded from the `badges_csv` payload sent to the leaderboard (per the deriveAchievementSnapshot requirement).

#### Scenario: Locked hidden achievement is invisible on AchievementsPage

- **WHEN** a hidden achievement is locked AND a player visits `/achievements`
- **THEN** there SHALL be no card, silhouette, count, or text reference to that achievement anywhere on the page
- **AND** locked-counter displays like「23 / 30 已解鎖」SHALL count hidden achievements in the denominator
- **AND** hidden-only filter SHALL toggle visibility of only **unlocked** hidden achievements (no preview of locked ones)

#### Scenario: Unlocked hidden achievement displays normally

- **WHEN** a hidden achievement is unlocked
- **THEN** it SHALL appear on `/achievements` with full art, name, description, and unlock date — same treatment as non-hidden achievements

### Requirement: Dexie SHALL bump to v5 introducing `achievements` table

The `apps/neurons-tw` Dexie schema SHALL upgrade from v4 to v5 by adding an `achievements` table keyed by achievement `id` with shape:

```typescript
interface AchievementRow {
  id: string                  // matches Achievement.id
  unlockedAt: number          // Date.now() at unlock
  notificationShown: boolean  // true if toast/modal already shown OR if backfilled silently
}
```

The Dexie v5 upgrade SHALL be additive — all existing v4 tables (`synapses` / `familyAccrual` / `meta` / `familyMastery` / `neuronVariants` / `leaderboardProfile`) SHALL remain intact and unchanged.

The schema SHALL include a secondary index on `unlockedAt` for chronological queries on the AchievementsPage.

#### Scenario: Fresh install initializes empty achievements table

- **WHEN** a new player loads neurons-tw for the first time after this change
- **THEN** Dexie SHALL boot at schema v5
- **AND** the `achievements` table SHALL exist and be empty; no errors emitted

#### Scenario: v4 → v5 upgrade preserves existing tables

- **WHEN** an existing player loads neurons-tw with v4 IndexedDB
- **THEN** Dexie SHALL execute the v4→v5 upgrade callback
- **AND** the `achievements` table SHALL be created empty
- **AND** all v4 tables SHALL remain intact with all rows preserved

### Requirement: Streak counter SHALL be persisted in meta table with LWW + MAX semantics

The system SHALL persist correct-answer streak counters in the existing Dexie `meta` table using two keys:

- `meta['currentQuizCorrectStreak']` — stringified number, LWW (last-write-wins)
  - Correct answer → `current = parse(meta) + 1`
  - Wrong answer → `current = 0`
  - Same-day no-change events (no quiz attempt) → no change
- `meta['maxQuizCorrectStreak']` — stringified number, MAX-merge (monotonic)
  - On every `current` update: `max = Math.max(parse(meta) ?? 0, current)`

These counters SHALL be updated atomically within the same Dexie transaction as `recordCorrectAnswer` / `recordIncorrectAnswer` AP writes (mirror `neuron-family-mastery` transaction co-commit pattern). Counter writes SHALL NOT occur outside these transactions.

#### Scenario: Correct answer increments current and possibly max

- **GIVEN** a player has `currentQuizCorrectStreak = 4`, `maxQuizCorrectStreak = 8`
- **WHEN** the player answers a quiz question correctly
- **THEN** `currentQuizCorrectStreak` SHALL become `5`
- **AND** `maxQuizCorrectStreak` SHALL remain `8` (current < max)

#### Scenario: New max triggers when current exceeds previous max

- **GIVEN** a player has `currentQuizCorrectStreak = 8`, `maxQuizCorrectStreak = 8`
- **WHEN** the player answers correctly
- **THEN** `currentQuizCorrectStreak` SHALL become `9`
- **AND** `maxQuizCorrectStreak` SHALL become `9`

#### Scenario: Wrong answer resets current but preserves max

- **GIVEN** a player has `currentQuizCorrectStreak = 15`, `maxQuizCorrectStreak = 20`
- **WHEN** the player answers wrong
- **THEN** `currentQuizCorrectStreak` SHALL become `0`
- **AND** `maxQuizCorrectStreak` SHALL remain `20`

#### Scenario: Streak persists across sessions

- **GIVEN** a player closes neurons-tw with `currentQuizCorrectStreak = 7`
- **WHEN** the player reopens neurons-tw later (same calendar day or next day)
- **THEN** `currentQuizCorrectStreak` SHALL remain `7` until the next correct or wrong answer
- **AND** session boundary alone SHALL NOT reset the counter

### Requirement: Trigger hooks SHALL fire at exactly 3 service call sites with future expansion to reading-timer

The system SHALL trigger achievement evaluation at exactly 3 service call sites in `apps/neurons-tw/src/lib/services/`:

1. `connectome.ts` `recordCorrectAnswer` collapse-point (after AP, mastery, streak, synapse all committed)
2. `connectome.ts` `recordIncorrectAnswer` collapse-point (after streak reset committed)
3. `variant-gacha.ts` subscriber collapse-point (after variant row persisted)

Each hook SHALL:

1. Build pre-mutation `prevStats` (the orchestrator captures these before the relevant Dexie write)
2. Build post-mutation `nextStats` (after the write completes)
3. Call `checkAchievementUnlocks(prevSnapshot, prevStats, nextSnapshot, nextStats, NEURONS_ACHIEVEMENTS)`
4. For each returned achievement: persist `AchievementRow` with `notificationShown: false`, call `dispatchReward`, push to toast queue (P2-P4) or trigger modal (P1)
5. Run inside a try/catch so achievement evaluation failure SHALL NOT break the originating game action

A **future** hook in a reading-timer service (when `add-neurons-reading-timer` or equivalent ships) SHALL also call the same orchestrator after study-minute increments. The catalog ships `study` category predicates today against `total_study_min` stat field; until reading-timer wires, those predicates SHALL evaluate to `false` (since the underlying counter is always 0) and `study` achievements SHALL remain locked.

The system SHALL NOT trigger achievement evaluation at any other call site (no UI button-click trigger, no manual evaluation API exposed to players).

#### Scenario: Correct quiz answer triggers achievement check

- **WHEN** `recordCorrectAnswer(familyId)` completes its Dexie transaction
- **THEN** the system SHALL call `checkAchievementUnlocks` with pre/post state
- **AND** any newly-unlocked achievements SHALL surface via toast (P2-P4) or modal (P1)

#### Scenario: Variant unlock triggers achievement check

- **WHEN** `variant-gacha.ts` subscriber persists a new `neuronVariants` row
- **THEN** the system SHALL call `checkAchievementUnlocks` with pre/post state
- **AND** variant / family-complete / fortune category predicates MAY unlock and surface UI

#### Scenario: Reading-timer absence — study achievements stay locked

- **GIVEN** the catalog ships `study` category achievements with predicates referencing `total_study_min >= N`
- **AND** the `total_study_min` accumulator field is hard-coded `0` (per `lib/services/neurons-leaderboard.ts` current state)
- **WHEN** any of the 3 trigger hooks fire
- **THEN** no `study` category achievement SHALL unlock (predicates evaluate `0 >= N → false`)
- **AND** the `study` category SHALL appear on AchievementsPage with all entries displayed as locked

#### Scenario: Achievement evaluation failure does not break game action

- **GIVEN** a runtime error occurs inside the achievement orchestrator (e.g., transient Dexie failure)
- **WHEN** `recordCorrectAnswer` calls the orchestrator
- **THEN** the error SHALL be caught and logged via `console.warn` with `[achievement]` channel prefix
- **AND** `recordCorrectAnswer` SHALL still return successfully — the quiz answer SHALL still register

### Requirement: Silent backfill SHALL run once on app boot

The system SHALL run `backfillAchievementsFromCurrentStats()` exactly once per app boot, after content pack loads and before the first user interaction. The backfill SHALL:

1. Build `PlayerSnapshot` + `AchievementStats` from current Dexie state
2. Call `listUnlockedAchievements(snapshot, stats, NEURONS_ACHIEVEMENTS)` to find all currently-satisfied predicates
3. Diff against `db.achievements.toArray()` to find IDs that should-be-unlocked but have no row
4. `bulkPut()` missing rows with `{ id, unlockedAt: Date.now(), notificationShown: true }`
5. SHALL NOT dispatch any reward (no `leaderboardProfile.unlockedTitles` append, no `badges_csv` push)
6. SHALL NOT push to the toast queue
7. SHALL NOT trigger the full-screen unlock modal
8. SHALL NOT block boot — fire-and-forget with try/catch logging via `[achievement-backfill]` channel

The backfill function SHALL be designed so a future `onPullComplete` sync hook (added by `add-neurons-deploy`) can call the **same function** without modification.

Backfill SHALL be guarded against StrictMode double-mount by `bulkPut` idempotency (same `id` overwrites with same content, no error). A `useState` guard MAY also prevent the second call from running (optional optimization, not required).

#### Scenario: First boot after this change ships backfills existing-state achievements

- **GIVEN** a player whose Dexie state shows `neuronVariants.count() === 8`, `familyMastery['藥理學'] = { correct: 12, total: 14 }`, `synapses.where('state').equals('strong').count() === 1`
- **AND** the `achievements` table is empty
- **WHEN** the app boots
- **THEN** the backfill SHALL identify all unlocked entries based on the current state
- **AND** SHALL `bulkPut()` rows for each with `notificationShown: true`
- **AND** SHALL NOT push any toast / modal / reward

#### Scenario: Backfill is idempotent on second boot

- **GIVEN** the backfill has already populated the table on a previous boot
- **AND** no new achievements have become eligible since
- **WHEN** the app boots again
- **THEN** the backfill SHALL compute `missing.length === 0`
- **AND** SHALL NOT call `bulkPut`

#### Scenario: Backfill error does not break boot

- **GIVEN** a transient Dexie failure during `buildAchievementStats()`
- **WHEN** backfill runs at boot
- **THEN** the error SHALL be caught and logged via `console.warn` with `[achievement-backfill]` channel
- **AND** the app boot SHALL continue normally
- **AND** subsequent triggers (correct answer, variant unlock) SHALL still evaluate and unlock achievements via the diff-based path

### Requirement: BadgeSprite component SHALL render category × tier badges from sprite atlas

The system SHALL ship a `<BadgeSprite category={c} tier={t} size={n} locked={b} />` component at `apps/neurons-tw/src/components/BadgeSprite.tsx` that renders category × tier badges from the sprite atlas at `apps/neurons-tw/src/assets/achievements/badge-atlas.png` (896×512 px = 7 columns × 4 rows × 128 px cells, 16-color GBA pixel-art palette, transparent background).

Column index maps to category (study=0, quiz=1, variant=2, synapse=3, mastery=4, fortune=5, hidden=6); row index maps to tier (P4=0, P3=1, P2=2, P1=3).

Note: dimensions 896×512 = 7 × 128 cols by 4 × 128 rows. The original spec text in `add-neurons-achievements` mistakenly declared "7 rows × 4 columns" which is dimensionally inconsistent with the 896×512 size; this change corrects the row/column ordering to match dimensions.

The component SHALL use CSS `background-image` + `background-position` + `background-size` to slice the atlas. Vite asset pipeline (`import url from '../assets/achievements/badge-atlas.png'`) provides the asset URL with cache-busting hash.

The component MAY provide a defensive fallback rendering (e.g., neutral square) if the atlas asset fails to load, but the spec assumes the asset exists and is loadable.

`locked={true}` SHALL apply CSS `filter: grayscale(80%) opacity(0.6)` (or equivalent treatment) to dim the cell visual without changing the atlas slice.

Public API (`category` / `tier` / `size` / `locked` props) is unchanged from `add-neurons-achievements` ship.

#### Scenario: BadgeSprite renders correct cell for every (category, tier) pair

- **WHEN** any of the 7 × 4 = 28 valid (category, tier) prop combinations is rendered
- **THEN** the component SHALL render the corresponding atlas cell via CSS background-position
- **AND** the rendered output SHALL be visually distinguishable from other (category, tier) combinations

#### Scenario: BadgeSprite consumer files unchanged from add-neurons-achievements

- **GIVEN** atlas mode now ships
- **WHEN** any of these consumers render BadgeSprite: `AchievementCard.tsx`, `AchievementToastHost.tsx`, `AchievementUnlockModal.tsx`, `AchievementsPage.tsx`, `NicknameWithBadges` helper in `LeaderboardPage.tsx`
- **THEN** the consumer site SHALL NOT have changed shape (props passed remain `category` / `tier` / `size` / `locked` only)

#### Scenario: Locked prop applies dimming filter

- **WHEN** `<BadgeSprite category="variant" tier="P1" size={48} locked={true} />` is rendered
- **THEN** the rendered element SHALL have CSS `filter: grayscale(...)` (or equivalent) applied
- **AND** the underlying atlas slice SHALL remain at the same row/column position

### Requirement: FamilyMasteryBadgeSprite component SHALL ship with atlas + consumer site

The system SHALL ship a `<FamilyMasteryBadgeSprite familyId={f} masteryTier={t} size={n} />` component at `apps/neurons-tw/src/components/FamilyMasteryBadgeSprite.tsx` that renders per-family per-mastery-tier badges from the atlas at `apps/neurons-tw/src/assets/achievements/family-mastery-atlas.png` (1408×640 px, 11 columns × 5 rows × 128 px cells, 16-color GBA palette, transparent background).

Column index SHALL map to family id via the exported constant `FAMILY_INDEX_BY_ID: Record<string, number>` declared alongside the component, using alphabetical sort of the 11 family IDs: `公共衛生學`=0 / `免疫學`=1 / `寄生蟲學`=2 / `微生物學`=3 / `病理學`=4 / `生物化學`=5 / `生理學`=6 / `組織學`=7 / `胚胎學`=8 / `解剖學`=9 / `藥理學`=10.

Row index SHALL map to mastery tier: P5=0 / P4=1 / P3=2 / P2=3 / P1=4. When `masteryTier === 'none'`, the component SHALL return `null` (don't render anything — no atlas cell exists for the no-data state).

At least ONE consumer site SHALL render this component at initial ship — currently `apps/neurons-tw/src/routes/ConnectomePage.tsx` family cards rendering the badge alongside the existing `<MasteryChip>` text via the `<FamilyMasteryBadge>` wrapper component that subscribes to mastery events and derives the tier.

#### Scenario: FamilyMasteryBadgeSprite renders correct cell

- **WHEN** `<FamilyMasteryBadgeSprite familyId="藥理學" masteryTier="P3" size={48} />` is rendered
- **THEN** the component SHALL show the cell at column 10 (藥理學 alphabetical position), row 2 (P3 Proficient)

#### Scenario: FamilyMasteryBadgeSprite returns null for none-tier

- **WHEN** `<FamilyMasteryBadgeSprite familyId="藥理學" masteryTier="none" size={48} />` is rendered
- **THEN** the component SHALL return `null` (no DOM element emitted)

#### Scenario: ConnectomePage renders FamilyMasteryBadgeSprite per family card

- **WHEN** the player visits `/connectome`
- **THEN** each of the 11 family cards SHALL render `<FamilyMasteryBadgeSprite>` (via the `<FamilyMasteryBadge>` wrapper) for the family whose mastery tier is currently P5 or better (the badge appears next to the existing MasteryChip text)
- **AND** family cards whose mastery tier is `'none'` (insufficient attempts) SHALL NOT render the badge (per the null-return rule above)

#### Scenario: FAMILY_INDEX_BY_ID is alphabetical and complete

- **WHEN** a consumer imports `FAMILY_INDEX_BY_ID` from `FamilyMasteryBadgeSprite.tsx`
- **THEN** the record SHALL contain exactly 11 entries
- **AND** values SHALL be 0..10 with no gaps
- **AND** ordering SHALL match alphabetical sort of zh-TW family ids (公共衛生學 first, 藥理學 last)

### Requirement: Family-mastery atlas SHALL render per-family per-mastery-tier badges from an 11×5 grid

The system SHALL render per-family mastery badges from a separate atlas `apps/neurons-tw/src/assets/achievements/family-mastery-atlas.png` of dimensions 1408×640 px with 11 columns × 5 rows × 128×128 px cells. Column index maps to neuron family (alphabetical by familyId for deterministic ordering — apply phase locks the exact ordering); row index maps to mastery tier:

- Row 0: P5 Novice
- Row 1: P4 Familiar
- Row 2: P3 Proficient
- Row 3: P2 Expert
- Row 4: P1 Master

Each cell SHALL display a family-specific icon overlay shared with the family's existing sprite (per `wire-neurons-content-and-theme` Req 7) plus a tier-specific styling (border / glow / accent color).

The `<FamilyMasteryBadgeSprite familyId={f} masteryTier={t} size={n} />` component SHALL render the correct cell.

#### Scenario: Family mastery badge renders correct cell

- **WHEN** `<FamilyMasteryBadgeSprite familyId="藥理學" masteryTier="P3" size={48} />` is rendered
- **THEN** the component SHALL show the cell at column index for 藥理學, row 2 (P3 Proficient)

#### Scenario: Atlas covers all 11 families × 5 tiers

- **WHEN** the atlas is loaded
- **THEN** the grid SHALL contain exactly 11 × 5 = 55 distinct cells
- **AND** each cell SHALL be visually distinguishable at 24px / 48px / 64px rendered sizes (verified by side-by-side review during atlas generation)

### Requirement: Leaderboard `badges_csv` SHALL be derived as max-tier-per-category with hidden category excluded

The neurons-leaderboard adapter at `apps/neurons-tw/src/lib/services/neurons-leaderboard.ts` SHALL expose `deriveAchievementSnapshot(unlocked: Achievement[]): string` that:

1. Filters `unlocked` to entries with `category !== 'hidden'` (hidden achievements never appear on the public leaderboard)
2. Groups remaining entries by `category`
3. For each group, picks the entry with the lowest `tierRank` (i.e., best tier)
4. Sorts categories alphabetically for deterministic ordering
5. Formats as `"<category>:<tier>"` per entry
6. Joins with `,`

Maximum output size = 6 entries × ~12 chars = ~72 chars, comfortably within the Worker regex `^([a-z]+:P[1-4])(,[a-z]+:P[1-4]){0,5}$` (6 entries max, 60 chars max). Apply phase SHALL verify the maximum-length string passes the regex.

The derived snapshot SHALL be included in `buildLeaderboardPayload` output as the `badges_csv` field. Worker validates and persists; cron picks up via existing `SELECT *` (no Worker code change required).

#### Scenario: Snapshot excludes hidden category

- **GIVEN** a player has unlocked 2 entries: `{category: 'variant', tier: 'P1'}` and `{category: 'hidden', tier: 'P2'}`
- **WHEN** `deriveAchievementSnapshot` runs
- **THEN** the output SHALL equal `'variant:P1'` (hidden filtered out)

#### Scenario: Snapshot picks best tier per category

- **GIVEN** a player has unlocked `{category: 'quiz', tier: 'P3'}` and `{category: 'quiz', tier: 'P1'}`
- **WHEN** `deriveAchievementSnapshot` runs
- **THEN** the output SHALL equal `'quiz:P1'` (best tier wins; lower rank number = better)

#### Scenario: Categories sorted alphabetically

- **GIVEN** unlocked entries `[{c:'variant',t:'P2'},{c:'mastery',t:'P3'},{c:'quiz',t:'P1'}]`
- **WHEN** `deriveAchievementSnapshot` runs
- **THEN** the output SHALL equal `'mastery:P3,quiz:P1,variant:P2'` (alphabetical category order)

#### Scenario: Maximum 6-entry CSV passes Worker regex

- **GIVEN** a player has unlocked at least one entry in all 6 non-hidden categories with tier mix
- **WHEN** `deriveAchievementSnapshot` runs and Worker POST `/leaderboard/neurons/upsert` arrives with the CSV
- **THEN** the Worker SHALL pass the existing `^([a-z]+:P[1-4])(,[a-z]+:P[1-4]){0,5}$` regex check
- **AND** the D1 row SHALL persist with the CSV

#### Scenario: Empty CSV when no achievements unlocked

- **GIVEN** a player has zero unlocked achievements
- **WHEN** `deriveAchievementSnapshot` runs
- **THEN** the output SHALL equal `''` (empty string)
- **AND** the Worker `badges_csv` field SHALL persist as empty string (default value already)

### Requirement: AchievementsPage SHALL render at `/achievements` with sub-tabs + filters

The system SHALL register a new react-router route `/achievements` rendering `<AchievementsPage />`. The page SHALL support:

- **2 sub-tabs**: 「已解鎖」(unlocked-only) / 「全部」(full catalog, including locked non-hidden + unlocked hidden)
- **3 filter controls**:
  - Category filter: 7-option dropdown (or chip row) + 「全部」default
  - Tier filter: 4-option (P1-P4) + 「全部」default
  - Hidden filter: toggle 「僅顯示已解鎖隱藏成就」(strict — locked hidden never shown regardless)
- **Card grid**: `<AchievementCard>` per visible entry with `<BadgeSprite>` icon, name, description, tier badge, unlock date (if unlocked) or 「未解鎖」(locked)

Locked non-hidden achievements SHALL show as silhouette / greyscale with name + description visible (per 二階 mirror pattern).

#### Scenario: Page renders 30 cards in 「全部」tab with no filter

- **GIVEN** a fresh player with no unlocks
- **WHEN** they visit `/achievements` and switch to 「全部」 tab with no filters
- **THEN** the page SHALL render cards for all non-hidden catalog entries (locked silhouettes)
- **AND** SHALL NOT render any hidden achievement card

#### Scenario: Unlocked tab hides locked entries

- **GIVEN** a player has 3 unlocked achievements (1 hidden, 2 non-hidden)
- **WHEN** they visit `/achievements` 「已解鎖」 tab
- **THEN** exactly 3 cards SHALL render with full art / name / description / unlock date
- **AND** the locked catalog entries SHALL NOT appear

#### Scenario: Category filter narrows to one category

- **WHEN** a player selects 「變體」 from category filter in 「全部」 tab
- **THEN** only `category === 'variant'` entries SHALL render
- **AND** unlocked hidden entries with `category === 'variant'` SHALL also render

### Requirement: Capability SHALL borrow design pattern from 二階 achievement-system per neurons-mode Req 5

The `neurons-achievements` capability spec SHALL explicitly cite 二階 `achievement-system` as the borrowed source pattern. Semantic mappings SHALL be documented:

- doctor recruit → variant gacha (slot unlock)
- hospital tier upgrade → synapse state machine
- subject_mastery_count → distinct-variant collection count (`db.neuronVariants` row count); the retired `neurons-leaderboard.family_complete` signal is no longer used
- 14 科 → 11 family
- 7 category × 4 tier structure ✓ (re-used)
- Build-time composite validator ✓ (re-used, adapted to metadata flag)
- Diff-based unlock detection ✓ (re-used the published `@study-rpg/core` function)
- Silent backfill on pull complete ✓ (adapted: app boot pass instead of pull complete; same function shape for future sync hook)
- P1 modal + P2-P4 toast ✓ (re-used)
- Strict hidden filtering ✓ (re-used)

This capability SHALL NOT modify `openspec/specs/achievement-system/spec.md` or `openspec/specs/hospital-leaderboard/spec.md`.

This capability SHALL NOT introduce equipment, ticket, or new currency as reward channels.

#### Scenario: Source spec is not modified

- **WHEN** this change archives
- **THEN** `openspec/specs/achievement-system/spec.md` SHALL be byte-identical to its pre-change state
- **AND** `openspec/specs/hospital-leaderboard/spec.md` SHALL be byte-identical

#### Scenario: No equipment reward channel added

- **WHEN** a developer reads the `AchievementReward` type
- **THEN** the type union SHALL contain exactly 2 kinds: `'leaderboard'` and `'title'`
- **AND** `'equipment'`, `'ticket'`, `'cosmetic'`, `'currency'` SHALL NOT be valid kinds

### Requirement: Collection milestone achievements SHALL count distinct variants, not family completion

The achievement catalog SHALL express collection progress as **「收集 N 隻」 distinct-variant milestones**, evaluated against the total count of distinct collected variants (`db.neuronVariants` row count). The catalog SHALL NOT contain any 「科別全收集 / family-complete」 predicate, and the achievement stat SHALL NOT expose a `familyCompleteCount` field — it SHALL expose a total distinct-variant count (`variantCount`) instead. Lower-tier (P4–P2) milestones SHALL be an ascending single-dimension distinct-count ladder; the P1 鑽石 collection capstone SHALL remain a **genuine multi-dimension composite** (breadth × quality, e.g. a high distinct count AND natural-P1 apexes across multiple families) so it satisfies the existing P1 `composite` rule WITHOUT a validator change and WITHOUT a degenerate single-condition predicate. Counting SHALL be by distinct variant (not by `copies`). The reframe SHALL NOT change the `AchievementReward` channels (still exactly `leaderboard` + `title`).

#### Scenario: Catalog has no family-complete predicate

- **WHEN** the `NEURONS_ACHIEVEMENTS` catalog is inspected
- **THEN** no entry SHALL reference family completion or a `familyCompleteCount` stat
- **AND** collection-progress entries SHALL reference the total distinct-variant count

#### Scenario: Distinct-variant milestone unlocks at its threshold

- **GIVEN** a P2 milestone defined at 50 distinct variants
- **WHEN** the achievement check runs after a pull that crosses 50 distinct variants
- **THEN** that milestone SHALL unlock

#### Scenario: Milestone counts distinct variants, not copies

- **GIVEN** the player has 10 distinct variants, one of which has `copies = 5`
- **WHEN** the milestone stat is computed
- **THEN** the distinct-variant count SHALL be `10` (duplicates do NOT inflate the milestone count)

#### Scenario: P1 collection capstone is a genuine composite

- **WHEN** the P1 collection-capstone entry is inspected
- **THEN** its predicate SHALL combine ≥ 2 dimensions (e.g. distinct count AND natural-P1 family breadth) and SHALL declare `composite: true`
- **AND** the build-time validator SHALL pass without a collection-cap whitelist exception

