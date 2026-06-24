# Changelog — `@study-rpg/core`

All notable changes to the public API of `@study-rpg/core`. Follows [Semantic
Versioning](https://semver.org/). Breaking changes bump the MAJOR; additive opt-in
changes bump the MINOR; bug fixes bump the PATCH.

**Pre-1.0 policy (overrides the above while the MAJOR is `0`)**: per the
`core-npm-package` spec, an **additive** change (new exported symbol, new optional
field) bumps the **PATCH**, and a **breaking** change (removing/renaming a symbol,
adding a required field, changing a signature) bumps the **MINOR**. The `1.0.0`
boundary is reserved for declaring the engine API stable.

## [0.6.2] — 2026-06-24

### Added

- `ExplanationBlock` type (`{ type: 'prose'; text } | { type: 'table'; columns; rows; caption? }`)
  and an optional `Question.explanationBlocks?: ExplanationBlock[]` field. When present, host
  renderers SHOULD render the structured blocks (real tables) and use the flat `explanation`
  string only as a fallback. Additive + optional (no behavior change for existing consumers);
  introduced to repair PDF-flattened tables in 詳解 without altering `id` / `answer`.

## [0.6.1] — 2026-06-09

### Added

- `isContinuationQuestion(question)` — content-agnostic detector for 承上題
  (continuation) questions (stem begins with the literal `承上題`).
- `resolvePrecedingChain(question, byId)` — resolves a continuation question's
  ordered preceding chain (root-first … nearest-last) by walking back through the
  same `<year>-<sitting>-<book>-<subject>` id prefix; best-effort, never crosses
  papers. Both helpers are pure (`Question` data + a by-id map in, `Question[]` out).
- **Shoutout contract — first npm release.** These exports already existed in
  source but predated the published `0.6.0`; `0.6.1` is their first appearance on
  the registry: `validateShoutoutMessage`, `normalizeShoutoutText`,
  `shoutoutContentHash`, `isValidAvatar`, `isBlockedText`, `hasPII`, `graphemeLen`,
  `SHOUTOUT_BLOCKLIST_SEED`, `MESSAGE_MAX_GRAPHEMES`, `MESSAGE_MAX_LINES`,
  `ASSET_ID_PATTERN`, and types `ShoutoutAvatar` / `ShoutoutMessage` /
  `ShoutoutBoard` / `MessageValidation`. Released on the `latest` dist-tag.

### Notes

- Publishing is owner-driven; this entry is staged ahead of `npm publish 0.6.1`.
- (Pre-existing gap: `0.6.0` — the leaderboard exports — has no entry above; this
  changelog resumes at `0.6.1`.)

## [0.5.0] — 2026-05-25

### Added

- `reviewCardEasy(card, now?)` — 一階 「太簡單」 modifier: `ease *= 1.5`,
  `interval *= 3` (clamped to `MAX_INTERVAL_DAYS`)
- `reviewCardGuessed(card, now?)` — 一階 「我亂猜的」 modifier: `interval = 1`,
  `ease` / `lapses` unchanged
- `reviewCardBinaryEasy({ prev, now? })` — 二階 binary analogue of Easy modifier
- `reviewCardBinaryGuessed({ prev, now? })` — 二階 binary analogue of Guessed
  modifier
- `EASY_EASE_MULTIPLIER` = 1.5 (named export)
- `EASY_INTERVAL_MULTIPLIER` = 3 (named export)
- `GUESSED_RESET_INTERVAL` = 1 (named export)

### Changed

- `STANDARD_INITIAL_INTERVALS` value changed from `[1, 6]` to `[3, 7]`. First
  correct review now schedules 3 days out (was 1); second correct review
  schedules 7 days out (was 6). Constant identity unchanged — consumers reading
  the array see the new values automatically.
- `reviewCard` (一階) refactored to read `STANDARD_INITIAL_INTERVALS` instead
  of hardcoding `1` and `6`. Behavior now consistent with `reviewCardBinary`.

### Why

Players answering correctly were seeing the same question resurface ~1 day
later — "我答對為何又考". Combined with the shipped 「歷史曾錯」 tab providing
proactive wrong-answer review, the SRS due queue's job narrows to algorithmic
spaced cadence only. The new opt-in modifiers give players finer agency without
forcing per-question self-rating.

Companion change: `tune-srs-binary-modifiers-and-intervals` (2026-05-25).

### Migration

No code change required for consumers — additive API. Save files with
pre-existing `interval = 1` or `interval = 6` are not migrated; they age out
naturally on next review under the new constants.

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
