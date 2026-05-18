# Changelog — `@study-rpg/core`

All notable changes to the public API of `@study-rpg/core`. Follows [Semantic
Versioning](https://semver.org/). Breaking changes bump the MAJOR; additive opt-in
changes bump the MINOR; bug fixes bump the PATCH.

## [0.4.0] — 2026-05-19

### Added

- `QUIZ_BUG_TARGETS` (`readonly ['question', 'image', 'explanation', 'other']`)
  — inline quiz bug-report target keys; used by `QuizBugReportSheet` in both
  apps (一階 + 二階) to drive the 4-radio picker
- `QuizBugTarget` — derived union type
- `QUIZ_BUG_TARGET_TO_CATEGORY` — mapping from target keys to
  `BugReportCategory` values (`question → question-error`, `image → image-broken`,
  `explanation → explanation-error`, `other → other`)
- `BUG_REPORT_CATEGORIES` extended from 11 to 14 values; the 3 new values are
  `question-error`, `image-broken`, `explanation-error`

### Why

The `add-quiz-inline-bug-report` change adds a 🐞 entry in `QuizModal` for
both apps. The new const + types are shared between two app codebases so
target → category mapping stays consistent. All additions are additive
(non-breaking).

Companion change: `add-quiz-inline-bug-report` (2026-05-19).
Companion DB migration: `supabase/migrations/0007_bug_reports_question_id.sql`.

## [0.3.0] — 2026-05-17

### Added

- `ThemePack.scenes.tier4?: string` — opt-in 4th hospital tier scene PNG URL
- `ThemePack.doctorSlotPositions.tier4?: SlotPosition[]` — opt-in 4th hospital
  tier doctor slot layout

Both fields are **optional**. Theme packs shipping only 3 tiers continue to
typecheck without modification. Required for theme packs that wish to support
the `國家級教學醫院` tier introduced by the `redesign-hospital-economy` change.

### Why

The `redesign-hospital-economy` change extended `HospitalTier` (in content
packs) to include a 4th tier `國家級教學醫院`. Theme packs that want to ship matching
visuals need a contract surface to expose tier4 scenes + slot positions.

Companion change: `expand-doctor-roster-dei-and-tier4-scene` (2026-05-17).

## [0.2.0] — 2026-05-16

Initial published version. See `migrate-m2nd-to-published-core` archived change.
