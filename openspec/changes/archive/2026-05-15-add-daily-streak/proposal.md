## Why

M2 roadmap explicitly lists **daily streak** as a remaining scope item, and the archived `wire-reflex-and-memory-rewards` proposal deferred multi-day streak to a future change ("B 在做"). With 10 subjects and 3291 questions live and 4 stats fully wired, daily streak is the last behavioral hook that converts one-shot engagement into a habit — without it M2 cannot close. Now is the right time because the underlying reward pipeline (`REWARD` table, `applyXp`, per-minute reading tick, quiz settle) is stable and locked, so a streak multiplier can sit cleanly on top instead of forcing churn in the reward primitives.

## What Changes

- Add three new fields to `Player`: `lastCheckInDate?: string` (ISO `YYYY-MM-DD` in UTC+8), `currentStreak: number`, `longestStreak: number`. `newPlayer()` initializes both numeric fields to `0` and leaves `lastCheckInDate` undefined.
- Add a check-in trigger: a day counts as "checked in" when the player either accumulates ≥ 5 reading-minute ticks **or** answers ≥ 5 questions on that UTC+8 calendar day. Same-day duplicate triggers do not double-count.
- Add a pure helper `applyCheckIn(player, today)` in `packages/core/src/lib/streak.ts` that returns a new `Player` with streak fields updated. Day-roll-over logic resets `currentStreak` to 0 if yesterday had no check-in; `longestStreak` is updated before any reset.
- Add a streak multiplier applied to **reading per-minute XP and quiz-correct XP** (not to mini-boss / annual-boss rewards, to avoid compounding gacha-tier swings): `multiplier = 1 + 0.05 * min(currentStreak, 10)`, capped at +50% on day 10. The multiplier is computed once per `applyReward` call from the player's `currentStreak` at that moment.
- Add UI surface on the home page (`apps/medexam-tw/src/routes/Home.tsx`): a `🔥 N 天` chip showing `currentStreak`. On the first load of a day where yesterday's streak just broke, show a soft toast `昨日斷簽，今天從 1 開始` via the existing toast queue (no shame copy, no red).
- Integrity guard: streak fields are not exposed via any user-editable form. The reading-timer `visibilitychange` + 90s idle pause already in `reading-loop` is reused — minutes consumed during a tab-hidden/idle window do not count toward the check-in threshold.
- **BREAKING**: `Player` shape gains 2 required numeric fields. `persistence` save-file `schemaVersion` bumps `1 → 2`; import of v1 files SHALL migrate by defaulting both streak counts to `0` and leaving `lastCheckInDate` undefined.

## Capabilities

### New Capabilities

(none — streak is an evolution of `engine-rewards`, not a new domain)

### Modified Capabilities

- `engine-rewards`: ADDED streak field on Player, ADDED `applyCheckIn` helper, ADDED `applyReward` streak-multiplier behavior, ADDED check-in trigger threshold rule, ADDED breaking-change discipline coverage for the streak multiplier constant.
- `persistence`: MODIFIED — `schemaVersion` bumps to `2`; import of v1 files SHALL migrate streak fields with defaults rather than reject.

## Impact

- **Code**:
  - `packages/core/src/types.ts` — Player gains 3 fields
  - `packages/core/src/lib/xp.ts` — `newPlayer` initializes streak fields
  - `packages/core/src/lib/streak.ts` (new) — `applyCheckIn`, `getStreakMultiplier`, check-in threshold constants
  - `packages/core/src/lib/applyReward.ts` (or equivalent reward-application site) — multiplier applied to reading + quiz-correct XP only
  - `packages/core/src/lib/db.ts` — Dexie schema version bump if Player table schema is versioned
  - `apps/medexam-tw/src/routes/Home.tsx` — `🔥 N 天` chip
  - `apps/medexam-tw/src/components/StreakChip.tsx` (new) — chip component
  - `apps/medexam-tw/src/components/Toast*.tsx` — break-day soft toast hookup
- **APIs**: third-party content/theme forks see new Player fields. Forks that build their own UI need to read the new fields if they want to surface streak; existing fork code that ignores them keeps working.
- **Save files**: import of v1 saves migrates with defaults; export now writes v2.
- **No new deps.** No theme-pack contract change. No content-pack contract change.
- **Roadmap**: after archive, M2's remaining checkbox flips ✓; formula fine-tune remains blocked on dogfood telemetry (not a code task).
