## ADDED Requirements

### Requirement: 考古清單 SHALL surface a positive, denominator-free coverage imprint from the player's own answer history

Each 考古 (recurrence-ranked concept) item SHALL derive a coverage state purely from `questionHistory`: an item is **covered** when at least one of its `sourceQuestionIds` has a history row whose latest result is correct (`lastResult === 'correct'`). A covered item SHALL render a single low-emphasis positive chip (「✓ 已固化過」); an uncovered item SHALL render nothing for coverage. The coverage indicator MUST be positive-only and MUST NOT display any denominator, count, percentage, ratio, remaining-gap placeholder, or gray "not-yet" slot. Coverage SHALL be a live-derived view (no new persisted field, no meta key, no write path) and MUST NOT introduce any prediction or guarantee language — it reflects only what the player has already answered correctly.

#### Scenario: Covered concept shows a positive chip
- **WHEN** a 考古 item has ≥1 `sourceQuestionId` whose `questionHistory` row has `lastResult === 'correct'`
- **THEN** the item SHALL render a single 「✓ 已固化過」 chip, with no percentage, count, denominator, or remaining-gap text

#### Scenario: Uncovered concept renders nothing
- **WHEN** a 考古 item has zero `sourceQuestionIds` currently answered correctly
- **THEN** the item SHALL render no coverage chip and no gray placeholder / gap slot

#### Scenario: Coverage is derived, not stored
- **WHEN** the coverage state is computed
- **THEN** it SHALL be derived live from the existing `questionHistory` (via the existing reactive subscription), introducing no new Dexie schema field, no meta key, and no new answer-time write path

## MODIFIED Requirements

### Requirement: 考前猜題 SHALL bridge into the game via a low-friction practice on-ramp, without gating or manipulation

The 押題 evidence drawer SHALL embed a low-friction primary CTA (「▶ 答 1 題看看」) that opens the existing quiz in **practice mode** over that concept's questions; each selected subject's panel SHALL offer exactly ONE section-level 「用本章高頻概念練幾題」 CTA (not a per-row CTA), positioned above the 考古清單. Practice mode SHALL NOT grant XP, gacha rolls, or game-streak progression; the sole deliberate exception is that answering credits the 今日處方箋 (daily prescription) 修煉 when the answered question is in today's frozen plan snapshot (per `wire-neurons-cram-prescription-bridge`), and practice SHALL record wrong answers to the 錯題本 (feeding the existing 出征 loop). To make that prescription-crediting payoff reliably reachable, when a cram practice pool is built the system SHALL prioritize questions that are in today's prescription snapshot (repair ∪ breadth eligible ids) to the front of the served order, without altering the snapshot, targets, or injecting any question; when today has no prescription plan yet, the pool SHALL fall back to its normal shuffled order (no behavior change). Answering SHALL require no sign-in; sign-in prompts MAY appear only at a save moment (persisting 錯題本 / 出征 / collection), framed as saving progress, never as unlocking content. The feature MUST NOT: require registration before reading sources or answering; hide cram highlights behind game progress; show hit-rate / guarantee language; push gacha / leaderboard before the user has engaged; use streak / countdown / rank pressure to create anxiety; attach a CTA to every highlight row; or shame wrong answers.

#### Scenario: One-tap practice from a 押題 concept
- **WHEN** the user taps 「▶ 答 1 題看看」 in a 押題 evidence drawer
- **THEN** the quiz SHALL open directly in practice mode on that concept's questions with a single-question probe, requiring no sign-in, no difficulty/count prompt, and no full-screen promo modal first

#### Scenario: Wrong answer bridges to 出征 without shaming
- **WHEN** the user answers a cram practice question incorrectly
- **THEN** the wrong question SHALL be recorded to the 錯題本 (per existing practice-mode behavior), and any post-answer prompt SHALL frame it as a repairable synapse to fix via 出征, shown only after the answer, never before

#### Scenario: Cram practice credits the daily prescription but grants no game progression
- **WHEN** the user answers a cram practice question that is in today's prescription plan snapshot
- **THEN** the answer SHALL credit the 今日處方箋 修煉 (surfacing the existing 「🩹 連結已固化 / 🔍 新連結已開發」 verdict note) AND SHALL NOT grant XP, gacha rolls, or game-streak progression

#### Scenario: Prescription-snapshot questions are served first, snapshot untouched
- **WHEN** a cram practice pool is built and today's prescription plan exists
- **THEN** questions that are in today's prescription snapshot (repair ∪ breadth eligible ids) SHALL be ordered before the rest of the pool, and the prescription snapshot, targets, and question set MUST NOT be modified or extended

#### Scenario: No plan yet falls back to normal order
- **WHEN** a cram practice pool is built and today has no prescription plan
- **THEN** the pool SHALL use its normal shuffled order with no prioritization and no behavior change

#### Scenario: No gate, no manipulation
- **WHEN** any cram → game on-ramp is presented
- **THEN** it MUST NOT gate reading or answering behind sign-in, MUST NOT use hit-rate / guarantee language, and MUST NOT inject streak / countdown / rank pressure
