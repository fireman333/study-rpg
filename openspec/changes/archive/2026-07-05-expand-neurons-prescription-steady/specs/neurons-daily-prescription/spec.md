## MODIFIED Requirements

### Requirement: System SHALL generate a daily two-line prescription capped at 12 questions

The system SHALL generate, once per local-TZ day (keyed by `todayISO()`), a "今日處方箋" consisting of exactly **two lines** — 訂正錯題 (correct-errors) and 開發盲區 (explore-blind-spots) — whose combined question target SHALL NEVER exceed 12. The plan SHALL be generated on first access of the day and then **frozen** (subsequent reads the same day SHALL return the identical plan). The 訂正錯題 target N SHALL scale to the current **repair-pool** size, where the repair pool is `( questions with lastResult === 'wrong'  ∪  questions flagged 🤔 guessedMarked )  −  questions flagged ✨ easyMarked`, computed within the effective year scope (see the year-filter requirement; the scoped repair pool falls back to all years only when it is empty). N scaling: pool 0 → N = 0 (line auto-satisfied); 1–3 → N = pool size; 4–20 → N = 4; 21–80 → N = 5; > 80 → N = 6. When the player's recent-20-answer accuracy is < 50% the N cap SHALL be lowered to 3; when 50–65% the N cap SHALL be lowered to 4 (this reduction SHALL NEVER be surfaced with any accuracy-attribution or deficit copy). The 開發盲區 target M SHALL be set so total ≤ 12: N = 0 → M = 10; N = 1–4 → M = 8; N = 5 → M = 7; N = 6 → M = 6.

#### Scenario: Plan is generated once per day and frozen
- **WHEN** the player opens the homepage the first time on a given local-TZ day
- **THEN** a prescription plan for `todayISO()` SHALL be generated and persisted under `prescription:v1:plan:{date}`
- **AND** every subsequent read that same day SHALL return the identical frozen plan (targets and eligible question ids unchanged)

#### Scenario: Repair-pool includes guessed-correct and excludes too-easy
- **WHEN** the plan is generated and a question is `lastResult === 'correct'` but flagged 🤔 guessedMarked
- **THEN** that question SHALL be part of the repair pool that N scales to (a guessed-correct answer is a repairable connection)
- **AND** a question flagged ✨ easyMarked SHALL be excluded from the repair pool even if its `lastResult === 'wrong'`

#### Scenario: Wrong-line target scales to repair-pool size
- **WHEN** the plan is generated and the repair pool has 30 questions
- **THEN** the 訂正錯題 target N SHALL be 5
- **AND** the 開發盲區 target M SHALL be 7 (total = 12)

#### Scenario: Empty repair-pool auto-satisfies the wrong line
- **WHEN** the plan is generated and the repair pool is empty
- **THEN** N SHALL be 0, the 訂正錯題 line SHALL render as already-complete (「今日無待修補連結」), and M SHALL be 10

#### Scenario: Low recent accuracy lowers the wrong-line target without deficit copy
- **WHEN** the plan is generated, the repair pool has 50 questions, and the player's recent-20-answer accuracy is 42%
- **THEN** N SHALL be capped at 3 (not 5)
- **AND** no copy SHALL attribute the smaller target to the player's accuracy dropping

### Requirement: System SHALL select one blind-spot family by a coverage-weighted score

The 開發盲區 line SHALL target exactly one "盲區 family" chosen at plan-generation time (surfaced to the player under the calmer label **「開發新連結」**). Only families with at least one unseen (never-answered) question **within the effective year scope, excluding ✨ easyMarked questions,** SHALL be eligible. Among eligible families the system SHALL pick the highest `score = 0.75 · (unseenCount / totalQuestions) + 0.25 · min(1, (outstandingWrongCount / max(uniqueAttempted, 8)) · 3)`, where `unseenCount` and `totalQuestions` are counted **within the effective year scope**. A family selected on each of the previous 2 consecutive days SHALL be skipped when another eligible family exists. Ties SHALL be broken deterministically by a hash of `date + familyId + localUserId`. The 開發盲區 CTA SHALL open that family's existing `fresh` (新題) quiz mode. For MVP, "少寫" SHALL mean unseen (never-answered) questions only.

#### Scenario: Highest-score eligible family is chosen within the year scope
- **WHEN** the plan is generated and multiple families have unseen questions within the effective year scope
- **THEN** the family with the highest coverage-weighted score (computed within that scope) SHALL be selected as the day's 開發新連結 family

#### Scenario: Too-easy questions are excluded from the unseen pool
- **WHEN** a family's only remaining unseen questions are all flagged ✨ easyMarked
- **THEN** that family SHALL NOT be eligible on the basis of those questions (mastered questions are not re-served)

#### Scenario: Recently-repeated family is skipped
- **WHEN** the top-scoring family was already the 開發新連結 family on both of the previous 2 days and another eligible family exists
- **THEN** that family SHALL be skipped and the next-best eligible family SHALL be selected

#### Scenario: Blind-spot CTA opens the family fresh mode
- **WHEN** the player triggers the 開發新連結 line
- **THEN** the selected family's `fresh` (新題) quiz mode SHALL open (no new quiz mode is introduced)

### Requirement: Progress counting SHALL be deduped per question and anti-cheat safe

Each line's progress SHALL count each `questionId` at most once per day. A 訂正錯題 unit SHALL count only when a question that was in the plan's frozen `wrongEligibleQuestionIds` snapshot (the repair pool: wrong ∪ guessed-correct, minus too-easy) is answered **correctly** that day (so deliberately answering wrong then correcting does not inflate progress). A 開發盲區 unit SHALL count when a question in the 開發新連結 family is answered for the first time that day, **whether correct or wrong** (the goal is coverage and start-cost reduction). Progress SHALL persist as write-once per-question meta keys.

#### Scenario: Correcting a snapshot repair question advances the wrong line
- **WHEN** the player correctly answers a question present in `prescription:v1:plan:{date}.wrongEligibleQuestionIds`
- **THEN** `prescription:v1:wrong:{date}:{questionId}` SHALL be set and the 訂正錯題 progress SHALL increment by 1 (at most once for that question that day)

#### Scenario: A guessed-correct snapshot question consolidates on a confident correct answer
- **WHEN** a question was in the repair snapshot because it was flagged 🤔 guessedMarked (its `lastResult` was already correct) and the player answers it correctly today
- **THEN** it SHALL count toward the 訂正錯題 target exactly like any other repair-pool question (framed as 「連結已固化」)

#### Scenario: A newly wrong question outside the snapshot does not inflate the wrong line
- **WHEN** the player answers a question wrong that was NOT in the plan snapshot, then answers it correctly
- **THEN** it SHALL NOT count toward the 訂正錯題 target

#### Scenario: Blind-spot counts on first answer regardless of correctness
- **WHEN** the player answers an unseen question in the 開發新連結 family for the first time today, correct or wrong
- **THEN** `prescription:v1:breadth:{date}:{questionId}` SHALL be set and the 開發新連結 progress SHALL increment by 1

#### Scenario: Re-answering the same question does not double-count
- **WHEN** the player answers a question already counted for a line earlier today
- **THEN** the progress SHALL NOT increment again

### Requirement: Prescription state SHALL persist in local-only meta keys with no schema or sync change

All prescription state SHALL live in the existing `meta` key-value table under the `prescription:v1:` namespace, keyed by `todayISO()`, and SHALL introduce NO Dexie `.version()` bump, NO R2 bundle `SCHEMA_VERSION` change, and NO new entry in `SYNCED_META_KEYS`. The plan key SHALL be frozen after first generation. Per-question progress keys and per-day completion keys SHALL be write-once (set to a truthy value, never deleted), so they are last-writer-wins safe and the derived `completedDayCount` is monotonic. No spendable or bidirectional counter SHALL be added (avoiding monotonic-MAX resurrection). The plan SHALL snapshot `wrongEligibleQuestionIds`, `breadthEligibleQuestionIds`, and the effective **`yearScope`** (the resolved exam-year set, or `null` when all years) at generation time. A plan missing `yearScope` (generated before this change) SHALL be treated as `null` (all years) — reader tolerance, no migration.

#### Scenario: No schema or sync surface changes
- **WHEN** the feature is implemented
- **THEN** there SHALL be no Dexie `.version()` bump, no R2 `SCHEMA_VERSION` change, and no new `SYNCED_META_KEYS` entry
- **AND** `questionFlags` and `quiz.yearFilter` SHALL be consumed read-only (no new persisted state introduced by the repair-pool or year-scope logic)

#### Scenario: Per-question and per-day keys are write-once and LWW-safe
- **WHEN** a per-question progress key or a per-day completion key is written
- **THEN** it SHALL only transition from absent to a truthy value and SHALL never be deleted, keeping cross-device last-writer-wins merges safe and `completedDayCount` monotonic

#### Scenario: Plan freezes its eligible-question snapshots and year scope
- **WHEN** the plan is first generated for a day
- **THEN** `wrongEligibleQuestionIds`, `breadthEligibleQuestionIds`, and `yearScope` SHALL be snapshotted into the plan and SHALL NOT change for the rest of that day

#### Scenario: A legacy plan without yearScope is treated as all-years
- **WHEN** a frozen plan generated before this change (no `yearScope` field) is read
- **THEN** it SHALL be treated as all-years (no year-range chip, no scoping) and SHALL continue to function unchanged

## ADDED Requirements

### Requirement: Prescription pools SHALL respect the exam-year filter with graceful fallbacks

The prescription's question pools SHALL respect the existing homepage exam-year filter (`meta.quiz.yearFilter`, resolved via `effectiveYearSet(getYearFilter())`; `null`/empty means all years). The 開發新連結 line SHALL be **fully year-scoped** (unseen/total computed only within the effective year set). The 訂正錯題 line SHALL be **scoped-first**: it SHALL draw its repair pool from within the effective year set, and SHALL fall back to all-years repair questions ONLY when the scoped repair pool is empty (older-year wrongs/guesses remain real weaknesses, but are not force-served when the player has narrowed to recent years). When the effective year set is narrower than all years, the card SHALL surface a low-salience range chip (e.g.「今日處方 · 範圍 113–114」or「範圍：依首頁年份選擇」) read from the plan's frozen `yearScope` snapshot; when all years are selected the chip SHALL NOT render (no-op). Narrow-scope copy SHALL frame it as a steady strategy (「依目前年份範圍穩定練習」), never as a shortcut (「只做近年」).

#### Scenario: Blind-spot line is fully year-scoped
- **WHEN** the player has selected only years 113–114 and the plan is generated
- **THEN** the 開發新連結 family selection and its unseen/total coverage SHALL be computed only over questions with `meta.year` in {113, 114}

#### Scenario: Repair line is scoped-first with all-years fallback
- **WHEN** the player has selected only year 114 and there are repair-pool questions within 114
- **THEN** the 訂正錯題 line SHALL draw only from year-114 repair questions
- **AND WHEN** there are no repair-pool questions within the selected years
- **THEN** the 訂正錯題 line SHALL fall back to repair questions across all years (rather than showing an empty line)

#### Scenario: Range chip reflects the frozen plan scope and hides when all years
- **WHEN** the plan's `yearScope` snapshot is a strict subset of all years
- **THEN** a low-salience range chip SHALL render showing that scope
- **AND WHEN** `yearScope` is all years (or `null`)
- **THEN** no range chip SHALL render

#### Scenario: Starvation never produces a dead state
- **WHEN** the scoped 開發新連結 pool is exhausted (all in-scope connections seen)
- **THEN** the card SHALL show a neutral message (e.g.「範圍內連結已巡過，今日改做修補中連結」) and redirect remaining quota to the repair line, never rendering a「沒題目可做」error/dead state
- **AND WHEN** both the scoped-then-all-years repair pool and the scoped unseen pool are empty
- **THEN** the card SHALL offer a neutral CTA (「放寬到全部年份」or「今日完成」) with no failure framing

### Requirement: Error correction SHALL be framed as connection repair, not failure

The system SHALL present error correction as repairing a connection rather than clearing a failure. A question in the day's repair pool (wrong or guessed-correct) SHALL be surfaced as a 「修補中」connection (a not-yet-stabilised synapse), and correcting it that day SHALL be surfaced as 「連結已固化」(a completed repair), NOT as「清除一題錯題債」. The raw size of the repair/wrong pool SHALL NOT be exposed as a running total (no anxiety-dashboard count). The UI SHALL NOT expose any「快照 / 鎖定 / 防作弊」framing for the frozen plan, and SHALL NOT render a missed-day calendar. This requirement governs user-facing copy/visuals only and introduces no persisted state (the 修補中/已固化 status is derived: in today's repair pool = 修補中; counted correct today = 已固化).

#### Scenario: A wrong or guessed question reads as a repairable connection
- **WHEN** a repair-pool question is presented for correction
- **THEN** it SHALL be framed as a 「修補中」connection, not a「錯誤/失敗」item

#### Scenario: Correcting reads as consolidation
- **WHEN** the player answers a repair-pool question correctly as part of the day's prescription
- **THEN** the feedback SHALL frame it as 「連結已固化」(completed repair), not「少一題錯題」

#### Scenario: No anxiety-dashboard count or anti-cheat/calendar framing is shown
- **WHEN** the prescription card and the correction flow render
- **THEN** the raw repair/wrong-pool total SHALL NOT be shown, no「快照/鎖定/防作弊」language SHALL appear, and no missed-day calendar SHALL be rendered
