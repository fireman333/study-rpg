# Changelog

All notable changes to the engine API (`@study-rpg/core`) and the default
content/theme/app packages live in this file. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); this project
pre-dates a formal semver release line — engine version stays at `0.0.x`
until M3 (`@study-rpg/core` npm publish) is reached.

## [Unreleased]

### Added — `@study-rpg/core`

- **Daily streak helpers** (`packages/core/src/lib/streak.ts`):
  - `getTaipeiToday()`, `getTaipeiYesterday(today)` — UTC+8 calendar arithmetic.
  - `applyCheckIn(player, today)` — pure helper; returns a new `Player` with
    `currentStreak` / `longestStreak` / `lastCheckInDate` updated per the
    same-day / consecutive-day / gap matrix documented in
    `openspec/specs/engine-rewards/spec.md`.
  - `getStreakMultiplier(streak)` — `1 + 0.05 * min(max(streak, 0), 10)`.
    Multiplier caps at +50% on day 10.
  - `ensureTodayProgress` / `incrementReadingMinutes` /
    `incrementQuestionsAnswered` / `hasMetCheckInThreshold` — per-day counter
    helpers used to decide threshold crossing.
  - Exported constants: `STREAK_CHECK_IN_THRESHOLD = 5`,
    `STREAK_MULTIPLIER_CAP_DAYS = 10`.

### Changed — `@study-rpg/core` (BREAKING for forks)

- `Player` interface gains three required fields and one optional internal
  counter object. Forks consuming the `Player` type need to either consume
  `newPlayer()` (recommended — defaults handled for you) or initialize the
  new fields themselves when constructing players manually:
  - `currentStreak: number` (default `0`)
  - `longestStreak: number` (default `0`)
  - `lastCheckInDate?: string` (default `undefined`)
  - `todayProgress?: { date, readingMinutes, questionsAnswered }` (internal;
    forks need not surface it but should preserve it through any pass-through
    serialization).
- `newPlayer(id, name, initialStatNames)` now initializes the two numeric
  streak fields to `0` and leaves `lastCheckInDate` undefined. No signature
  change.

### Changed — `apps/medexam-tw` save file schema

- Export schema version bumps from `1` to `2`. Exported player objects now
  include the three streak fields.
- Import accepts both v1 and v2 files. V1 imports are silently forward-migrated
  in memory: `currentStreak` and `longestStreak` default to `0`,
  `lastCheckInDate` stays undefined. Existing v1 export files keep working.
- Import refusal message updated to `current: v2`.

### Added — `apps/medexam-tw`

- `StreakChip` in the app header (`🔥 N 天` or `🔥 從今天開始`).
- `StreakBreakToast` — soft `🌱 昨日斷簽 / 今天從頭開始累積` toast when the
  player opens the app on a day after a gap.
- Reading-tick reward (`REWARD.readPerMinute`) and quiz-correct reward
  (`REWARD.quizCorrect`) are multiplied by `getStreakMultiplier(currentStreak)`
  via `Math.floor`. `REWARD.quizWrong`, `REWARD.quizFastAnswer`,
  `REWARD.srsReviewCorrect`, `REWARD.bossMiniPass`, `REWARD.bossAnnualPass`
  and any `subjectXp` field are intentionally NOT multiplied.
- Break-day detection on hydration pre-emptively resets a stale `currentStreak`
  to `0` so the chip never displays a stale number after a gap.

### Spec deltas merged

- `engine-rewards`: 5 ADDED Requirements (streak fields, check-in threshold,
  `applyCheckIn` helper, multiplier scope, breaking-change discipline) + 1
  MODIFIED Requirement (`newPlayer` initial shape).
- `persistence`: 3 MODIFIED Requirements (export envelope, import migration,
  schema version declaration).

OpenSpec change archived at `openspec/changes/archive/2026-05-15-add-daily-streak/`.
