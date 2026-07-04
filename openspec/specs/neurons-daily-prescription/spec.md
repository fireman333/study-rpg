# neurons-daily-prescription

## Purpose

每日「今日處方箋」——化解考前決策癱瘓的兩行每日任務（訂正錯題 N + 開發盲區 M，總量 ≤12、單一 CTA 導向下一未完成項，路由進既有錯題出征與 family fresh），完成則以 rolling 完成天數養成收藏神經元 NG-0717（4 階段 1/3/6/10，第 10 天完全體 + 永久 keepsake）。抗焦慮 pacing：只增不減、漏日中性無懲罰、cumulative「已固化 X 天」無分母、考試倒數僅氛圍不 gate、考後不 lockout。純 local-only `meta`、零 Dexie/R2/`SYNCED_META_KEYS` 改動；不發抽卡/貨幣/排行榜軸。

## Requirements

### Requirement: System SHALL generate a daily two-line prescription capped at 12 questions

The system SHALL generate, once per local-TZ day (keyed by `todayISO()`), a "今日處方箋" consisting of exactly **two lines** — 訂正錯題 (correct-errors) and 開發盲區 (explore-blind-spots) — whose combined question target SHALL NEVER exceed 12. The plan SHALL be generated on first access of the day and then **frozen** (subsequent reads the same day SHALL return the identical plan). The 訂正錯題 target N SHALL scale to the current wrong-pool size: pool 0 → N = 0 (line auto-satisfied); 1–3 → N = pool size; 4–20 → N = 4; 21–80 → N = 5; > 80 → N = 6. When the player's recent-20-answer accuracy is < 50% the N cap SHALL be lowered to 3; when 50–65% the N cap SHALL be lowered to 4. The 開發盲區 target M SHALL be set so total ≤ 12: N = 0 → M = 10; N = 1–4 → M = 8; N = 5 → M = 7; N = 6 → M = 6.

#### Scenario: Plan is generated once per day and frozen
- **WHEN** the player opens the homepage the first time on a given local-TZ day
- **THEN** a prescription plan for `todayISO()` SHALL be generated and persisted under `prescription:v1:plan:{date}`
- **AND** every subsequent read that same day SHALL return the identical frozen plan (targets and eligible question ids unchanged)

#### Scenario: Wrong-line target scales to wrong-pool size
- **WHEN** the plan is generated and the wrong-pool has 30 questions
- **THEN** the 訂正錯題 target N SHALL be 5
- **AND** the 開發盲區 target M SHALL be 7 (total = 12)

#### Scenario: Empty wrong-pool auto-satisfies the wrong line
- **WHEN** the plan is generated and the wrong-pool is empty
- **THEN** N SHALL be 0, the 訂正錯題 line SHALL render as already-complete (「今日無待訂正錯題」), and M SHALL be 10

#### Scenario: Low recent accuracy lowers the wrong-line target
- **WHEN** the plan is generated, the wrong-pool has 50 questions, and the player's recent-20-answer accuracy is 42%
- **THEN** N SHALL be capped at 3 (not 5)

### Requirement: System SHALL select one blind-spot family by a coverage-weighted score

The 開發盲區 line SHALL target exactly one "盲區 family" chosen at plan-generation time. Only families with at least one unseen (never-answered) question SHALL be eligible. Among eligible families the system SHALL pick the highest `score = 0.75 · (unseenCount / totalQuestions) + 0.25 · min(1, (outstandingWrongCount / max(uniqueAttempted, 8)) · 3)`. A family selected on each of the previous 2 consecutive days SHALL be skipped when another eligible family exists. Ties SHALL be broken deterministically by a hash of `date + familyId + localUserId`. The 開發盲區 CTA SHALL open that family's existing `fresh` (新題) quiz mode. For MVP, "少寫" SHALL mean unseen (never-answered) questions only.

#### Scenario: Highest-score eligible family is chosen
- **WHEN** the plan is generated and multiple families have unseen questions
- **THEN** the family with the highest coverage-weighted score SHALL be selected as the day's 盲區 family

#### Scenario: Recently-repeated family is skipped
- **WHEN** the top-scoring family was already the 盲區 family on both of the previous 2 days and another eligible family exists
- **THEN** that family SHALL be skipped and the next-best eligible family SHALL be selected

#### Scenario: Blind-spot CTA opens the family fresh mode
- **WHEN** the player triggers the 開發盲區 line
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

Each line's progress SHALL count each `questionId` at most once per day. A 訂正錯題 unit SHALL count only when a question that was in the plan's frozen `wrongEligibleQuestionIds` snapshot is answered **correctly** that day (so deliberately answering wrong then correcting does not inflate progress). A 開發盲區 unit SHALL count when a question in the 盲區 family is answered for the first time that day, **whether correct or wrong** (the goal is coverage and start-cost reduction). Progress SHALL persist as write-once per-question meta keys.

#### Scenario: Correcting a snapshot wrong question advances the wrong line
- **WHEN** the player correctly answers a question present in `prescription:v1:plan:{date}.wrongEligibleQuestionIds`
- **THEN** `prescription:v1:wrong:{date}:{questionId}` SHALL be set and the 訂正錯題 progress SHALL increment by 1 (at most once for that question that day)

#### Scenario: A newly wrong question outside the snapshot does not inflate the wrong line
- **WHEN** the player answers a question wrong that was NOT in the plan snapshot, then answers it correctly
- **THEN** it SHALL NOT count toward the 訂正錯題 target

#### Scenario: Blind-spot counts on first answer regardless of correctness
- **WHEN** the player answers an unseen question in the 盲區 family for the first time today, correct or wrong
- **THEN** `prescription:v1:breadth:{date}:{questionId}` SHALL be set and the 開發盲區 progress SHALL increment by 1

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

All prescription state SHALL live in the existing `meta` key-value table under the `prescription:v1:` namespace, keyed by `todayISO()`, and SHALL introduce NO Dexie `.version()` bump, NO R2 bundle `SCHEMA_VERSION` change, and NO new entry in `SYNCED_META_KEYS`. The plan key SHALL be frozen after first generation. Per-question progress keys and per-day completion keys SHALL be write-once (set to a truthy value, never deleted), so they are last-writer-wins safe and the derived `completedDayCount` is monotonic. No spendable or bidirectional counter SHALL be added (avoiding monotonic-MAX resurrection). The plan SHALL snapshot `wrongEligibleQuestionIds` and `breadthEligibleQuestionIds` at generation time.

#### Scenario: No schema or sync surface changes
- **WHEN** the feature is implemented
- **THEN** there SHALL be no Dexie `.version()` bump, no R2 `SCHEMA_VERSION` change, and no new `SYNCED_META_KEYS` entry

#### Scenario: Per-question and per-day keys are write-once and LWW-safe
- **WHEN** a per-question progress key or a per-day completion key is written
- **THEN** it SHALL only transition from absent to a truthy value and SHALL never be deleted, keeping cross-device last-writer-wins merges safe and `completedDayCount` monotonic

#### Scenario: Plan freezes its eligible-question snapshots
- **WHEN** the plan is first generated for a day
- **THEN** `wrongEligibleQuestionIds` and `breadthEligibleQuestionIds` SHALL be snapshotted into the plan and SHALL NOT change for the rest of that day
