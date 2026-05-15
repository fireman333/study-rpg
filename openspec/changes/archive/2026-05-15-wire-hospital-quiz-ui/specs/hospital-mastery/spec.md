## ADDED Requirements

### Requirement: Per-subject mastery counter SHALL persist correct and total counts

The system SHALL maintain a `mastery[subjectId]` record for each of the 14 二階國考 subjects in IndexedDB. Each record SHALL contain two non-negative integer fields: `correct` and `total`. The `correct` field SHALL be incremented by 1 when the player answers a question correctly in that subject. The `total` field SHALL be incremented by 1 when the player answers any question in that subject (correctly or incorrectly). Neither field SHALL ever decrement.

The mastery table SHALL be initialized at IndexedDB creation time with all 14 subject records present, each with `{correct: 0, total: 0}`. The mastery values for a subject SHALL be derivable in the UI as a percentage via `Math.floor(correct / total * 100)` when `total > 0`, or displayed as `「-」` placeholder when `total === 0`.

#### Scenario: Mastery initialized on new save

- **GIVEN** a new player save in `apps/medexam2-hospital-tw`
- **WHEN** IndexedDB is first read after `ensureSeed`
- **THEN** the `mastery` table SHALL contain exactly 14 records (one per subject)
- **AND** each record SHALL equal `{correct: 0, total: 0}`

#### Scenario: Correct answer increments both correct and total

- **GIVEN** `mastery[外科] = {correct: 3, total: 5}`
- **WHEN** the player answers an 外科 question correctly
- **THEN** `mastery[外科]` SHALL equal `{correct: 4, total: 6}`

#### Scenario: Wrong answer increments only total

- **GIVEN** `mastery[內科] = {correct: 8, total: 10}`
- **WHEN** the player answers an 內科 question incorrectly
- **THEN** `mastery[內科]` SHALL equal `{correct: 8, total: 11}`

#### Scenario: Counters never decrement

- **GIVEN** any `mastery[subjectId]` record
- **WHEN** any user action occurs (including session close, modal dismiss, app reload)
- **THEN** neither `correct` nor `total` SHALL be reduced from a higher value to a lower value

### Requirement: Per-question history table SHALL track attempts with SRS-reserved fields

The system SHALL maintain a `questionHistory` IndexedDB table keyed by `questionId`. Each row SHALL contain the following fields:

```typescript
interface QuestionHistoryRow {
  questionId: string             // corpus question id (e.g., "106-1-醫學三-內科-Q2")
  subjectId: string              // denormalized for index queries without corpus join
  attempts: number               // total answer attempts (correct + wrong combined)
  correctCount: number           // correct answer count
  lastAnsweredAt: number         // epoch ms of most recent answer
  lastResult: 'correct' | 'wrong'
  nextDueAt: number | null       // SRS-reserved; null means not yet scheduled (default)
  interval: number               // SRS-reserved; days, default 0
  easeFactor: number             // SRS-reserved; SM-2 ease, default 2.5
}
```

A new row SHALL be inserted on first answer for a given `questionId`. Subsequent answers for the same `questionId` SHALL upsert into the existing row. The `nextDueAt`, `interval`, and `easeFactor` fields SHALL be populated with defaults on insert and SHALL NOT be modified by this change — they are reserved for the upcoming `wire-hospital-srs-queue` change's SRS scheduler to read and update.

The table SHALL be indexed by `questionId` (primary key), `subjectId` (for per-subject queries), `lastAnsweredAt` (for recency queries), and `nextDueAt` (for SRS due queries by the upcoming scheduler).

#### Scenario: First answer creates new history row

- **GIVEN** `questionHistory` does not contain a row for `questionId = "106-1-醫學三-內科-Q2"`
- **WHEN** the player answers that question correctly
- **THEN** a new row SHALL be inserted with:
  - `questionId = "106-1-醫學三-內科-Q2"`
  - `subjectId = "內科"`
  - `attempts = 1`
  - `correctCount = 1`
  - `lastAnsweredAt = <current epoch ms>`
  - `lastResult = "correct"`
  - `nextDueAt = null`
  - `interval = 0`
  - `easeFactor = 2.5`

#### Scenario: Subsequent answer upserts existing history row

- **GIVEN** `questionHistory["Q_X"] = {attempts: 1, correctCount: 1, lastResult: "correct", lastAnsweredAt: T0, nextDueAt: null, interval: 0, easeFactor: 2.5, ...}`
- **WHEN** the player answers Q_X incorrectly at time T1 (T1 > T0)
- **THEN** the row SHALL become `{attempts: 2, correctCount: 1, lastResult: "wrong", lastAnsweredAt: T1, nextDueAt: null, interval: 0, easeFactor: 2.5, ...}`
- **AND** `subjectId` SHALL be unchanged

#### Scenario: SRS-reserved fields not modified by this change

- **GIVEN** any answer event (correct or wrong) handled by this change
- **WHEN** the history row is upserted
- **THEN** the `nextDueAt` / `interval` / `easeFactor` fields SHALL remain at their existing values
- **AND** if the row is being inserted for the first time, these fields SHALL be set to `null` / `0` / `2.5` respectively

### Requirement: Mastery percentage SHALL be surfaced on banner and roster card

The `RecruitmentBanner` component SHALL display the current `mastery[subjectId]` as a percentage label (e.g., `「掌握 60%」`). When `mastery[subjectId].total === 0`, the banner SHALL display `「掌握 -」` instead of a percentage. The display SHALL update reactively when the underlying counter changes (Dexie live query subscription).

The `DoctorRoster` page's doctor card SHALL display the cumulative `mastery[doctor.subjectId]` percentage of the doctor's own subject — i.e., `「<subject> 掌握 N%」` (showing the player's overall mastery in that subject, not per-doctor). When `total === 0`, the card SHALL display `「<subject> 掌握 -」`.

Mastery percentage calculation SHALL use `Math.floor(correct / total * 100)` to produce an integer percentage. Percentages SHALL be in the range `[0, 100]` inclusive.

#### Scenario: Banner shows mastery percentage when total > 0

- **GIVEN** `mastery[外科] = {correct: 7, total: 10}`
- **WHEN** the HomePage renders the 外科 banner
- **THEN** the banner SHALL display a label containing `「掌握 70%」`

#### Scenario: Banner shows dash when no attempts

- **GIVEN** `mastery[眼科] = {correct: 0, total: 0}`
- **WHEN** the HomePage renders the 眼科 banner
- **THEN** the banner SHALL display a label containing `「掌握 -」` (dash placeholder)

#### Scenario: Roster card shows subject mastery

- **GIVEN** the player has a doctor with `subjectId = "婦產科"` in the roster
- **AND** `mastery[婦產科] = {correct: 12, total: 30}`
- **WHEN** the DoctorRoster page renders that doctor's card
- **THEN** the card SHALL display a label containing `「婦產科 掌握 40%」`

#### Scenario: Mastery display updates reactively

- **GIVEN** the HomePage is open and the 內科 banner shows `「掌握 50%」`
- **AND** `mastery[內科] = {correct: 5, total: 10}`
- **WHEN** the player answers an 內科 question correctly (somewhere in the app)
- **THEN** the 內科 banner display SHALL update to show the new percentage `「掌握 54%」` (6/11 floor)
- **AND** no manual page refresh SHALL be required

### Requirement: Mastery and questionHistory tables SHALL survive Dexie schema upgrades

The Dexie database version SHALL be bumped to v4 to add the `mastery` and `questionHistory` tables. The `version(4).upgrade(...)` hook SHALL:

- Backfill `mastery` table with 14 default rows (`{correct: 0, total: 0}` for each subject) if not present
- NOT create rows in `questionHistory` (rows are created lazily on first answer)
- NOT modify existing `affinity` / `doctors` / `gachaStats` / `tickets` / `rooms` / `gameCounters` records (these tables are unchanged)
- Tolerate idempotent re-execution (if a row already exists with same subjectId, leave existing values)

Subsequent reads of `mastery` and `questionHistory` SHALL behave as documented in the requirements above for both fresh saves and migrated v3 → v4 saves.

#### Scenario: v3 → v4 migration preserves existing data

- **GIVEN** an existing v3 save with `affinity` / `doctors` / `rooms` / `gameCounters` populated
- **WHEN** the app boots and Dexie upgrades to v4
- **THEN** the existing `affinity` / `doctors` / `rooms` / `gameCounters` records SHALL be unchanged
- **AND** the `mastery` table SHALL contain 14 default `{correct: 0, total: 0}` rows
- **AND** the `questionHistory` table SHALL be empty

#### Scenario: Fresh v4 save initializes both tables

- **GIVEN** a fresh save created at v4 schema
- **WHEN** `ensureSeed` completes
- **THEN** the `mastery` table SHALL contain 14 default rows
- **AND** the `questionHistory` table SHALL be empty
- **AND** no migration error SHALL be logged
