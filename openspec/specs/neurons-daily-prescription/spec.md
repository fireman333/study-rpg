# neurons-daily-prescription

## Purpose

每日「今日處方箋」——化解考前決策癱瘓的兩行每日任務（訂正錯題 N + 開發盲區 M，總量 ≤12、單一 CTA 導向下一未完成項，路由進既有錯題出征與 family fresh），完成則以 rolling 完成天數養成收藏神經元 NG-0717（4 階段 1/3/6/10，第 10 天完全體 + 永久 keepsake）。抗焦慮 pacing：只增不減、漏日中性無懲罰、cumulative「已固化 X 天」無分母、考試倒數僅氛圍不 gate、考後不 lockout。純 local-only `meta`、零 Dexie/R2/`SYNCED_META_KEYS` 改動；不發抽卡/貨幣/排行榜軸。
## Requirements
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

The 開發盲區 line SHALL target exactly one "盲區 family" chosen at plan-generation time (surfaced to the player under the calmer label **「開發新連結」**). Only families with at least one unseen (never-answered) question **within the effective year scope, excluding ✨ easyMarked questions,** SHALL be eligible. Among eligible families the system SHALL rank by a coverage-weighted `score = 0.75 · (unseenCount / totalQuestions) + 0.25 · min(1, (outstandingWrongCount / max(uniqueAttempted, 8)) · 3)`, where `unseenCount` and `totalQuestions` are counted **within the effective year scope**.

On top of the score, the system SHALL apply an **invisible NG-0717-imprint coverage bias** that steers the day's pick toward subjects not yet (or least-recently) covered, so dendritic buds spread methodically across all subjects over the sprint rather than clustering on a few high-score families. The bias SHALL be a two-tier preference applied among the eligible families: (1) families with **no lineage imprint yet** (never grown a bud) SHALL be preferred, ranked among themselves by the coverage `score`; (2) only when **every** eligible family already has an imprint SHALL the system fall back to the imprinted families, preferring the **oldest `lastTouchedDate`** (least-recently covered) and then the coverage `score`. This bias SHALL be derived at plan-generation time from the existing local-only `prescription:v1:ng0717:imprint:*` keys and SHALL NOT be surfaced to the player in any form (NO copy such as「輪替／因為你還沒碰 X／覆蓋率／還剩幾科」, NO map, NO denominator). When no imprint data exists (e.g. a brand-new player), the selection SHALL reduce to the pure coverage `score` (backward-compatible).

A family selected on each of the previous 2 consecutive days SHALL be skipped when another eligible family exists (this guard is applied before the imprint bias). Ties SHALL be broken deterministically by a hash of `date + familyId + localUserId`. The 開發盲區 CTA SHALL open that family's existing `fresh` (新題) quiz mode. For MVP, "少寫" SHALL mean unseen (never-answered) questions only.

#### Scenario: Never-imprinted eligible family is preferred over a higher-score imprinted one
- **WHEN** the plan is generated, family A has already grown a bud (imprinted) with a higher coverage score, and family B has no imprint yet with a lower coverage score, both eligible
- **THEN** family B (never-imprinted) SHALL be selected as the day's 開發新連結 family

#### Scenario: Highest-score never-imprinted family wins among never-imprinted families
- **WHEN** multiple eligible families are all never-imprinted
- **THEN** the one with the highest coverage-weighted score SHALL be selected (imprint bias does not reorder within the same tier)

#### Scenario: All eligible families imprinted → least-recently-covered rotates in
- **WHEN** the plan is generated and every eligible family already has an imprint
- **THEN** the family with the oldest `lastTouchedDate` SHALL be preferred (ties broken by score, then the deterministic hash)

#### Scenario: No imprint data falls back to pure coverage score
- **WHEN** the plan is generated and no lineage imprints exist yet
- **THEN** the selection SHALL reduce to the pure coverage-weighted score (unchanged legacy behavior)

#### Scenario: The imprint bias is never surfaced to the player
- **WHEN** the 開發新連結 line renders after an imprint-biased pick
- **THEN** it SHALL show only the selected family + persona, with NO copy attributing the pick to coverage/rotation/「還沒碰」and NO denominator or remaining-subject count

#### Scenario: Highest-score eligible family is chosen within the year scope
- **WHEN** the plan is generated and multiple families have unseen questions within the effective year scope
- **THEN** the family selected SHALL be one computed within that scope (the imprint bias operates only over year-scoped eligible families)

#### Scenario: Too-easy questions are excluded from the unseen pool
- **WHEN** a family's only remaining unseen questions are all flagged ✨ easyMarked
- **THEN** that family SHALL NOT be eligible on the basis of those questions (mastered questions are not re-served)

#### Scenario: Recently-repeated family is skipped
- **WHEN** the top-scoring family was already the 開發新連結 family on both of the previous 2 days and another eligible family exists
- **THEN** that family SHALL be skipped and the next-best eligible family SHALL be selected

#### Scenario: Blind-spot CTA opens the family fresh mode
- **WHEN** the player triggers the 開發新連結 line
- **THEN** the selected family's `fresh` (新題) quiz mode SHALL open (no new quiz mode is introduced)

### Requirement: System SHALL present a single CTA that routes to the next incomplete line

The prescription card SHALL expose exactly one primary CTA (「開始今日處方」) that routes the player to the next incomplete line — 訂正錯題 first, then 開發盲區 — so the player never has to choose a mode. When both lines are complete the CTA SHALL render a completed state rather than routing.

#### Scenario: CTA routes to the wrong line first
- **WHEN** the 訂正錯題 line is incomplete and the player taps 「開始今日處方」
- **THEN** the player SHALL be routed into the wrong-pool expedition flow

#### Scenario: CTA routes to the blind-spot line once errors are done
- **WHEN** the 訂正錯題 line is complete but 開發盲區 is not, and the player taps the CTA
- **THEN** the player SHALL be routed into the 盲區 family's `fresh` mode

#### Scenario: CTA shows completed state when both lines are done
- **WHEN** both lines are complete for the day
- **THEN** the CTA SHALL render a completed state and SHALL NOT route into a quiz

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

### Requirement: Daily reset SHALL be forgiving with partial progress preserved

The prescription SHALL reset at local midnight (a new plan for the new `todayISO()`). Partial progress SHALL be shown on the current-day card (e.g. `訂正錯題 2/4`, `開發盲區 5/8`). There SHALL be no make-up / back-fill for prior days, and re-opening after an incomplete day SHALL be framed non-punishingly (a fresh prescription, not a scolding).

#### Scenario: Partial progress is shown on the current-day card
- **WHEN** the player has done 2 of 4 error corrections and 5 of 8 blind-spot questions
- **THEN** the card SHALL show `訂正錯題 2/4` and `開發盲區 5/8`

#### Scenario: A new day opens a fresh prescription with no back-fill
- **WHEN** local midnight passes and the player opens the homepage
- **THEN** a new prescription for the new date SHALL be generated and prior-day incompletion SHALL NOT be carried over or penalized

### Requirement: Completing the daily prescription SHALL mature the NG-0717 collectible neuron by rolling completions

When both lines of the day's prescription are complete, the system SHALL mark the day complete (`prescription:v1:completed:{date}`) and advance the maturation of **NG-0717**, a collectible mascot neuron (an adult-born dentate granule cell). Maturation SHALL be driven ONLY by the rolling count of completed days (`completedDayCount`), NOT by the calendar. NG-0717 SHALL have four visible stages reached at completion milestones **1 / 3 / 6 / 10** (dogfood-tunable): stage 1 newborn stem cell → stage 2 migrating neuroblast → stage 3 immature wiring neuron → stage 4 mature integrated neuron (full form). Full maturity is stage 4 at 10 completed days. The current stage SHALL be **derived** from `completedDayCount` (never stored as its own mutable field). Reaching stage 4 SHALL unlock a permanent keepsake stamped with the exam-cycle date (`2026.07.17`). Reward claiming SHALL be idempotent per day (`prescription:v1:reward:{date}`), so completing on a second device the same day SHALL NOT double-advance.

#### Scenario: Completing both lines advances NG-0717 by one completed day
- **WHEN** the player completes both the 訂正錯題 and 開發盲區 lines on a day
- **THEN** `prescription:v1:completed:{date}` SHALL be set and NG-0717's derived stage SHALL reflect the updated `completedDayCount`

#### Scenario: NG-0717 stage changes at milestone completions
- **WHEN** `completedDayCount` reaches 1, 3, 6, or 10
- **THEN** NG-0717 SHALL render the corresponding stage (newborn → neuroblast → wiring → mature), derived from `completedDayCount`

#### Scenario: Full maturity unlocks the date-stamped keepsake
- **WHEN** `completedDayCount` reaches 10
- **THEN** NG-0717 SHALL reach stage 4 and unlock a permanent keepsake stamped `2026.07.17`

#### Scenario: Reward is idempotent per day
- **WHEN** the same day's completion is processed more than once (e.g. a second device syncs the same day)
- **THEN** NG-0717 SHALL advance at most once for that date (no double-advance)

### Requirement: Progress SHALL be monotonic and a missed day SHALL never produce a negative state

A day without completion SHALL be neutral: NO streak-break, NO red / broken / "missed" / "behind" indicator, NO guilt copy, and NO consecutive-day requirement. `completedDayCount` and the derived NG-0717 stage SHALL be **monotonic** (they only increase on completion and NEVER decrease). Cumulative progress SHALL be surfaced as「已固化 X 天」WITHOUT a fixed denominator (no `X/14`-style ceiling that could read as unreachable when fewer than that many days remain). The exam countdown (「距考試還有 N 天」) SHALL be **ambient chrome only** and SHALL NOT gate maturation or render as a deficit. After the exam date passes, NG-0717 maturation SHALL continue (no lockout) and the countdown SHALL switch to a non-punishing post-exam state (e.g.「考試結束 · 繼續固化」).

#### Scenario: A missed day is neutral
- **WHEN** the player does not complete the prescription on a given day
- **THEN** no streak-break, red/broken state, "missed"/"behind" indicator, or guilt copy SHALL be shown, and progress SHALL simply not advance that day

#### Scenario: Progress never decreases
- **WHEN** any number of days pass without completion
- **THEN** `completedDayCount` and the NG-0717 stage SHALL remain at their prior value (monotonic, never decremented)

#### Scenario: Cumulative uses no fixed denominator and countdown is non-gating
- **WHEN** the card renders cumulative progress with fewer than 10 days remaining before the exam
- **THEN** it SHALL show「已固化 X 天」without a fixed `X/N` denominator
- **AND** the「距考試還有 N 天」countdown SHALL be ambient only and SHALL NOT block reaching stage 4

#### Scenario: Maturation continues after the exam with no lockout
- **WHEN** the exam date passes and `completedDayCount` is below 10
- **THEN** NG-0717 SHALL still be able to reach stage 4 by completing later prescriptions, and the countdown SHALL show a non-punishing post-exam state

### Requirement: The prescription SHALL NOT introduce any economy or leaderboard inflation

The prescription completion SHALL NOT grant DMN gacha draws, SHALL NOT introduce any new currency or spendable resource, and SHALL NOT add any leaderboard axis or otherwise let prescription activity inflate leaderboard stats. Any optional material reward SHALL route ONLY through the existing daily-capped conduction-energy faucet, granting `min(20, remaining daily cap)`; when the cap is already reached the completion SHALL play the animation only and grant nothing.

#### Scenario: No draws or currency are granted
- **WHEN** the player completes the daily prescription
- **THEN** no DMN draw, no new currency, and no leaderboard axis SHALL be created or incremented by the prescription

#### Scenario: Optional energy respects the existing daily cap
- **WHEN** completion grants the optional energy reward and the conduction-energy daily cap has remaining headroom R
- **THEN** the grant SHALL be `min(20, R)` through the existing faucet
- **AND** when R = 0 the completion SHALL play the animation only and grant no energy

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

### Requirement: Completing the daily prescription SHALL grow a per-subject NG-0717 lineage imprint for that day's 開發新連結 family

When both lines of a day's prescription are complete (`dayComplete`), the system SHALL grow (first unlock) or advance (subsequent touch) an **NG-0717 lineage imprint** for **that day's 開發新連結 family** (the frozen plan's `breadthFamilyId`). The imprint is an auxiliary keepsake layer on top of the existing NG-0717 rolling-day maturation (which is unchanged): as the player methodically works subjects across the sprint, NG-0717 grows one subject-specific dendritic bud per covered subject. The imprint SHALL be grown ONLY from the 開發新連結 line's family; the 訂正錯題 (repair) line SHALL NOT grant any subject imprint (it continues to advance only NG-0717's rolling-day maturation, representing weakness convergence). When the day's `breadthFamilyId` is `null` (no eligible 開發新連結 family, e.g. scope exhausted), NO imprint SHALL be grown that day. Imprint growth SHALL be idempotent per (family, day): the same family completing on the same day SHALL NOT record more than one touch for that day. The imprint SHALL grant NO currency, NO gacha draw, NO neuron variant, and NO leaderboard axis — it is a cosmetic keepsake only.

#### Scenario: Day completion grows a sprout imprint for the breadth family
- **WHEN** both prescription lines are complete on a day whose plan `breadthFamilyId` is `藥理學`
- **THEN** an NG-0717 lineage imprint for `藥理學` SHALL be recorded (first unlock → `sprout`)

#### Scenario: Repeating a subject on a later day advances the same imprint, not a second one
- **WHEN** the player completes the prescription on a later day whose `breadthFamilyId` is again `藥理學`
- **THEN** the existing `藥理學` imprint SHALL advance one touch (its stage warming) and NO second `藥理學` imprint SHALL be created

#### Scenario: A completed day with no breadth family grows no imprint
- **WHEN** both lines are complete on a day whose plan `breadthFamilyId` is `null` (scope exhausted / no eligible new-connection family)
- **THEN** NO lineage imprint SHALL be grown that day

#### Scenario: Repair-line progress alone grows no subject imprint
- **WHEN** the player advances only the 訂正錯題 line (or completes it) without the day being fully complete
- **THEN** NO subject imprint SHALL be grown, and only NG-0717's existing rolling-day maturation SHALL be affected on full completion

#### Scenario: Imprints grant no economy or draws
- **WHEN** an imprint is grown or advanced
- **THEN** no currency, no DMN draw, no neuron variant, and no leaderboard axis SHALL be created or incremented

### Requirement: NG-0717 lineage imprint stage SHALL be derived qualitatively and monotonically from the touch count

Each imprint's visual stage SHALL be **derived** (never stored as a mutable stage field) from the number of distinct completion days on which that family was the 開發新連結 subject (`touches`): `absent` (no imprint, not rendered) → `sprout` (touches ≥ 1) → `warm` (touches ≥ 2) → `myelinated` (touches ≥ 3). The thresholds SHALL be dogfood-tunable constants. `myelinated` is a naturally-reached milestone, NOT a required goal. The derived stage SHALL be **monotonic** — it only advances as `touches` grows and SHALL NEVER downgrade.

#### Scenario: Stage is derived from touch count
- **WHEN** a family's imprint has `touches` of 1, then 2, then 3
- **THEN** its derived stage SHALL be `sprout`, then `warm`, then `myelinated` respectively

#### Scenario: Stage never downgrades
- **WHEN** any number of days pass without the family recurring as the 開發新連結 subject
- **THEN** the imprint's `touches` and derived stage SHALL remain at their prior value (monotonic, never decremented)

### Requirement: The lineage imprint UI SHALL render only grown branches and SHALL NEVER expose a denominator or gap

The imprint UI SHALL render **only families that have already grown an imprint**. A subject without an imprint SHALL NOT be rendered at all — no empty slot, no greyed placeholder, no "尚未解鎖" label, and nothing that occupies a position implying a gap. The UI SHALL NEVER display a fixed denominator or remaining-count in any form (no `X/11`, no `已解鎖 3/11`, no「還差 X 科」, no completion percentage, no progress bar toward a total). Grown imprints SHALL render as dendritic buds branching from the existing NG-0717 mascot inside `DailyPrescriptionCard`, with an optional expandable branch detail; NO separate collection page/tab SHALL be introduced. Each grown bud MAY carry a small **per-NT-branch accent motif** (a purely-decorative glyph derived from the subject's neurotransmitter branch — DA / 5-HT / GABA / Glu — layered over the tinted bud) to deepen the bud's visual identity; the accent SHALL be programmatic (no new sprite asset), SHALL render ONLY on already-grown buds, and SHALL NOT introduce any legend, key, per-branch tally, or otherwise imply a finite branch/subject set to be completed. Copy SHALL use accumulate-the-positive vocabulary (「長出」「留下印記」「今天固化」「新生分支」) and SHALL NOT use completion/deficit vocabulary (「收集完成」「解鎖全部」「尚缺」「還差 X 科」). This requirement governs user-facing copy/visuals only; the finite subject count MAY exist in backend state but SHALL NEVER be surfaced as a task or ceiling.

#### Scenario: Only grown branches render; ungrown subjects are absent
- **WHEN** the player has grown imprints for 3 subjects
- **THEN** exactly those 3 buds SHALL render, and the other 8 subjects SHALL NOT be shown in any form (no placeholder, grey slot, or gap)

#### Scenario: No denominator or remaining-count anywhere in the imprint UI
- **WHEN** the imprint UI (in-card buds and any expanded branch detail) renders
- **THEN** no `X/11`, no remaining-subject count, no completion percentage, and no progress-toward-total bar SHALL appear

#### Scenario: Copy stays accumulate-positive
- **WHEN** an imprint is grown or its detail is shown
- **THEN** the copy SHALL read as growth/keepsake (e.g.「新生分支：藥理學」) and SHALL NOT reference collection completion, unlock-all, or any「尚缺／還差」deficit

#### Scenario: Per-NT-branch accent is decorative and introduces no legend or tally
- **WHEN** a grown bud renders with its per-NT-branch accent motif
- **THEN** the accent SHALL be programmatic (no sprite asset), SHALL appear only on grown buds, and SHALL NOT add any legend, per-branch count, or implication of a complete branch/subject set to fill

### Requirement: Lineage imprint state SHALL persist as a cross-device write-once keepsake

All lineage-imprint state SHALL live in the existing `meta` key-value table under the `prescription:v1:ng0717:imprint:<subjectId>:<date>` namespace as **write-once** presence keys (set to a truthy value, never deleted). Imprint keys SHALL participate in cross-device sync as a **keepsake**: they join the synced meta set via a key **prefix** (`prescription:v1:ng0717:imprint:`) rather than an enumerated allowlist entry (the keys are dynamic — subject × date). Because the keys are write-once presence markers, their cross-device merge SHALL be **first-write-wins UNION** (the same convergence as the set-once `mazeSecondLapCelebrated:<family>` keys): a bud grown on either device ends up present on both, and a family's `touches` accumulates across devices as the UNION of its per-date keys. NO backfill post-pass and NO new R2 adapter SHALL be added. This SHALL be an **additive** R2 bundle `SCHEMA_VERSION` bump with reader tolerance (an older client reading a newer bundle SHALL silently drop the imprint keys it does not recognise; a newer client reading an older bundle without imprint keys SHALL preserve its local imprints — first-write-wins never deletes local keys absent from the incoming bundle). The prefix SHALL match ONLY imprint keys and SHALL NOT sync any other `prescription:v1:*` key (plan / wrong / breadth / completed / reward / lightsOut / localSeed remain local-only daily state). NO Dexie `.version()` bump SHALL be introduced (the keys already exist locally; only the meta sync filter widens). Imprints SHALL remain **monotonic**; no spendable or bidirectional counter SHALL be added.

#### Scenario: Imprint keys are write-once and sync via the prefix as a UNION keepsake
- **WHEN** a device grows an imprint key `prescription:v1:ng0717:imprint:藥理學:2026-07-05`
- **THEN** it SHALL be written once (truthy, never deleted) and SHALL be included in the device's synced meta snapshot by matching the imprint prefix
- **AND** on a second device the merge SHALL add that key if absent (first-write-wins UNION), so the bud appears on both devices and `touches` reflects the union of per-date keys

#### Scenario: Only imprint keys sync, not other prescription state
- **WHEN** the synced meta snapshot is built
- **THEN** keys under `prescription:v1:ng0717:imprint:` SHALL be included, and other `prescription:v1:*` keys (plan / wrong / breadth / completed / reward / lightsOut / localSeed) SHALL NOT be included

#### Scenario: Additive schema bump is reader-tolerant in both directions
- **WHEN** a client on the previous `SCHEMA_VERSION` reads a bundle containing imprint keys
- **THEN** it SHALL silently drop those keys (not in its allowlist/prefix), with no error
- **AND WHEN** a client on the new `SCHEMA_VERSION` reads an older bundle with no imprint keys
- **THEN** it SHALL preserve its local imprints (first-write-wins never deletes local keys absent from the incoming bundle)

#### Scenario: No Dexie bump and no bidirectional counter
- **WHEN** the keepsake sync is implemented
- **THEN** there SHALL be no Dexie `.version()` bump and no spendable/bidirectional counter — only the meta sync filter widens to include the imprint prefix and the R2 `SCHEMA_VERSION` bumps additively

### Requirement: Prescription progress SHALL be credited and surfaced from any answer entry point, including 考前猜題 practice

The system SHALL credit a frozen-snapshot repair or breadth question when it is answered from ANY quiz entry point — 答題 / 錯題出征 / 模考 / **考前猜題 practice mode** — not only via the 開始今日處方 CTA. Practice mode's "no progression" contract (grants no XP, gacha draw, or game streak) SHALL NOT suppress prescription crediting: correctly answering a repair-pool question consolidates that connection regardless of where it was answered — a **deliberate, documented exception scoped to prescription crediting only** ("answering correctly IS repairing the connection, regardless of entry point"). The answer verdict SHALL surface each credit at the moment it happens: a repair consolidation as 「連結已固化」, a first breadth-family answer as a 「新連結已開發」-class note, and the answer that completes both lines as a non-punishing 「今日處方箋完成」note. Crediting SHALL remain dedup / anti-cheat safe via the existing per-question write-once keys (no double-count, no target change, no snapshot mutation, no new question injection).

#### Scenario: Cram-practice answer to a repair-snapshot question consolidates and surfaces
- **WHEN** the player answers a question in today's `wrongEligibleQuestionIds` correctly from 考前猜題 practice mode
- **THEN** its repair key SHALL be set (at most once that day) and the verdict SHALL show the 「連結已固化」note, exactly as if answered from the 開始今日處方 flow

#### Scenario: First breadth answer surfaces a breadth note
- **WHEN** the player answers an in-`breadthFamilyId` snapshot question for the first time today from any entry point
- **THEN** its breadth key SHALL be set and the verdict SHALL surface a 「新連結已開發」-class note for that first credit

#### Scenario: The completing answer surfaces a non-punishing completion note
- **WHEN** an answer from any entry point makes both the repair and breadth lines reach their targets for the first time today
- **THEN** the verdict SHALL surface a 「今日處方箋完成」note, and the day-completion / reward / imprint keys SHALL be written exactly once (idempotent per day)

#### Scenario: Practice crediting grants no economy or game progression
- **WHEN** a prescription line is credited from practice mode
- **THEN** only the prescription line (and its existing completion path) SHALL advance — no XP, no DMN draw, no leaderboard axis, and no game streak SHALL be granted by the practice answer

### Requirement: The 處方箋 card SHALL offer a low-salience exit to 考前猜題

The 今日處方箋 card SHALL surface exactly one low-emphasis link to `/cram` (考前猜題), framed as an optional exam-eve resource (e.g. 「考前？看高頻考點 →」), placed so it does NOT compete with the primary 開始今日處方 CTA. The link SHALL NOT be styled as a task or a line, SHALL NOT carry a badge / count / countdown / streak, and SHALL NOT imply the daily two-line ritual is incomplete without it (the anti-anxiety contract is preserved).

#### Scenario: A low-salience cram link is present and secondary to the CTA
- **WHEN** the expanded 處方箋 card renders
- **THEN** a single low-emphasis link to `/cram` SHALL be shown, visually subordinate to the 開始今日處方 CTA

#### Scenario: The cram link carries no anxiety framing
- **WHEN** the cram link renders
- **THEN** it SHALL NOT show a badge, count, countdown, or any copy implying the daily ritual is incomplete without visiting 考前猜題

### Requirement: 今日處方箋 SHALL offer a dayComplete-gated 考前收斂 calm view that mirrors positive footprint without any deficit or prediction

When and only when today's prescription is complete (`dayComplete === true`), the homepage prescription card SHALL make available an expandable, passive 考前收斂 calm view from its existing 「考前？」 region (device-local expand state; the pre-existing 考前猜題 link remains reachable). The calm view SHALL be display-only — it MUST NOT contain any call-to-action, button, or navigation control within its calm content. It SHALL surface only positive, already-accumulated signals and MUST NOT display any percentage, denominator (X/Y), remaining/gap count, "not-yet"/"還差"/"剩下" wording, gray placeholder, or any guarantee/prediction language (保證 / 必中 / 100% / 今年一定考 / reverse-guarantee such as 「可放心略過」/「會派上用場」). The only dynamic value interpolated into any calm-view string SHALL be a bare non-negative integer; a denominator MUST be structurally impossible. Before `dayComplete`, the card SHALL behave exactly as today (no calm view, no empty-state placeholder — a zero-footprint user simply never reaches it).

The calm view SHALL show ONLY the content the card does not already surface — one coverage line plus one non-actional closing line, with these fixed literals (only the integer varies). It SHALL NOT restate `completedDayCount` or the NG-0717 buds (which the card already displays), so no second stack of numbers is created:
- 「你已答對過 {M} 個高頻考點的題目。」 where {M} = the number of distinct cram 考點 (push items across all subjects) for which ≥1 `sourceQuestionId` has a `questionHistory` row with `lastResult === 'correct'` (the copy MUST NOT use 覆蓋 / 覆蓋率 / 掌握 nor imply a total).
- (closing line) 「今晚可以停在這裡，讓連結慢慢固化。」

The coverage count SHALL be a live-derived view (no new persisted field, no meta key, no new write path) and its data source (`cram.json`) SHALL be loaded lazily only when the calm view is opened, so the homepage never pays the cram-data cost unless the user expands it. An automated copy guard (unit test over the calm-view copy constants) SHALL fail if any static calm-view copy string contains a banned token (連續 / 掌握 / 覆蓋 / 覆蓋率 / % / 還差 / 剩下 / 還沒讀 / 保證 / 必中 / 今年一定考 / 會派上用場).

#### Scenario: Calm view appears only after dayComplete
- **WHEN** today's prescription is not yet complete (`dayComplete === false`)
- **THEN** the card SHALL render no calm view and no calm-view placeholder, behaving exactly as before

#### Scenario: Calm view content and wording when complete
- **WHEN** today's prescription is complete and the user expands the calm view
- **THEN** it SHALL show exactly 「你已答對過 {M} 個高頻考點的題目。」 and the closing line 「今晚可以停在這裡，讓連結慢慢固化。」, with {M} a bare integer and no denominator, and SHALL NOT restate `completedDayCount` or the NG-0717 buds already shown by the card

#### Scenario: No deficit, no prediction, no CTA
- **WHEN** the calm view is rendered
- **THEN** it MUST NOT contain any percentage, denominator, remaining/gap count, gray placeholder, guarantee/prediction wording, or any button / link / call-to-action within its calm content

#### Scenario: Coverage count is derived, not stored
- **WHEN** {M} (the high-frequency 考點 coverage count) is computed
- **THEN** it SHALL be derived live from `cram.json` push items ∩ `questionHistory` (`lastResult === 'correct'`), introducing no new Dexie schema field, no meta key, and no new answer-time write path

#### Scenario: Copy guard fails on banned calm-view copy
- **WHEN** a static calm-view copy constant is authored to contain a banned token (e.g. 覆蓋率, 還差, 必中)
- **THEN** the automated copy-guard test SHALL fail

#### Scenario: Cram data loads only on expand
- **WHEN** the homepage renders and the calm view has not been expanded
- **THEN** `cram.json` SHALL NOT be fetched (the ~330KB cram dataset loads only after the user opens the calm view)

