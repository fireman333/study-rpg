# Changelog

All notable changes to the engine API (`@study-rpg/core`) and the default
content/theme/app packages live in this file. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Engine published
to npm starting `0.1.0` (2026-05-16) under [`@study-rpg/core`](https://www.npmjs.com/package/@study-rpg/core).
Per `openspec/specs/core-npm-package/spec.md`, while major is `0`, additive
exports bump minor segment (e.g. 0.1.x → 0.2.0); any removed/renamed export
also bumps minor (no patch-level for breakage).

## [Unreleased]

## [0.2.0] - 2026-05-16

### Added — `@study-rpg/core`

- **Binary-review SRS API** (`packages/core/src/lib/srs.ts`):
  - `reviewCardBinary({ correct, prev, now })` — partial-reset SM-2 variant
    for binary correct/wrong UX (vs. the 4-grade `reviewCard`). On wrong:
    `interval *= 0.5` (min 1d), `easeFactor *= 0.85` (min 1.3). Standard
    initial intervals on correct: 1d → 6d → previous × easeFactor.
  - Returns `{ srs, isFirstReview, dueAt }`; designed for callers that want
    the `nextDueAt` ISO directly without re-deriving from `Date`.
- Exported constants for fork-tunability:
  - `WRONG_INTERVAL_MULTIPLIER = 0.5`, `WRONG_EASE_MULTIPLIER = 0.85`,
    `STANDARD_INITIAL_INTERVALS = [1, 6]`, `SRS_DAILY_CAP = 20`.
- Exported types: `BinaryReviewInput`, `BinaryReviewPrev`, `BinaryReviewResult`.

### Spec deltas merged

- `hospital-srs` capability added (8 reqs) — owned by m2 hospital fork
  (SM-2 binary review, banner due badge, daily cap 20, cross-day backlog,
  independent of mastery, no specialty bonus interaction).
- Engine API `@study-rpg/core` exports updated to surface the new symbols.

OpenSpec change archived at
`openspec/changes/archive/2026-05-16-wire-hospital-srs-queue/`.

## [0.1.0] - 2026-05-16

> Initial npm publish. CHANGELOG is incomplete for pre-publish history; see
> `openspec/changes/archive/` and `git log` before commit `93f5430` for full
> M1 / M2 / M_2nd / M5 detail. The section below covers the last pre-publish
> feature (daily streak) for continuity.

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
