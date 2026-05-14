# mini-boss Specification

## Purpose
TBD - created by archiving change real-mini-boss. Update Purpose after archive.
## Requirements
### Requirement: Mini-boss modal presents 30 questions with countdown timer

When the player clicks the mini-boss button, the engine SHALL open a dedicated `BossModal` containing exactly `MINI_BOSS_QUESTIONS` (30) questions sampled from the active subject's pool via `sampleMiniBoss`, with a countdown timer initialized to `MINI_BOSS_DURATION_MS` (30 minutes).

The player SHALL answer questions one at a time. The timer SHALL decrement continuously while the modal is open; when it reaches `0`, the run SHALL auto-finalize.

#### Scenario: Mini-boss opens with 30 random questions

- **WHEN** the player clicks the `⚔ 挑戰 mini-boss（藥理學）` button
- **THEN** a `BossModal` SHALL render
- **AND** it SHALL contain 30 questions filtered to subject `藥理學` (or whatever active subject is)
- **AND** a visible countdown timer SHALL display `30:00` initially
- **AND** the first question SHALL be visible immediately

#### Scenario: Timer counts down

- **WHEN** the BossModal is open and 5 seconds elapse
- **THEN** the visible countdown SHALL read approximately `29:55`
- **AND** the underlying state SHALL track `remainingMs` to ms precision

### Requirement: No explanations shown during boss run

Unlike QuizModal, BossModal SHALL NOT display the `explanation` field of any question during the run. After answering, the player SHALL see only a brief correct/wrong indicator (or none, if anti-cheat is desired) and proceed.

Rationale: boss runs are timed assessments; showing explanations during the run is study mode, not exam mode.

#### Scenario: Answer reveal is minimal

- **WHEN** the player clicks an MCQ option during a boss question
- **THEN** the explanation field SHALL NOT be rendered to the DOM
- **AND** a minimal feedback indicator (e.g. correct/wrong color flash) MAY appear briefly
- **AND** a "下一題" button (or auto-advance) SHALL move to the next question

### Requirement: Pass threshold is 60% and grants reward + badge

The run SHALL be considered passed if `correctQ / totalQ >= BOSS_PASS_THRESHOLD` (0.6). On pass:

- `Player.xp` SHALL increase by `REWARD.bossMiniPass.xp` (50)
- 3 loot rolls SHALL fire (sequential, ~200ms apart) with source `'boss-mini'`
- The badge `boss:<subject>:mini` (e.g. `boss:藥理學:mini`) SHALL be added to `Player.badges` if not already present
- Badge dedupe: re-passing the same subject's mini-boss SHALL NOT add a duplicate badge entry

On fail (or timer expiry mid-run):

- `Player.xp` SHALL increase by half (`Math.floor(REWARD.bossMiniPass.xp / 2)` = 25)
- 1 consolation loot roll SHALL fire with source `'boss-mini'`
- No badge SHALL be granted

#### Scenario: Pass at exactly 60%

- **WHEN** the player answers 18 of 30 questions correctly and submits (60.0%)
- **THEN** `passed({ correctQ: 18, totalQ: 30 })` SHALL return `true`
- **AND** the run SHALL grant the full reward + badge

#### Scenario: Just-failed at 59%

- **WHEN** the player answers 17 of 30 questions correctly (56.67%)
- **THEN** the run SHALL be marked failed
- **AND** consolation reward applies (half XP + 1 roll)
- **AND** no `boss:藥理學:mini` badge SHALL be added

#### Scenario: Badge dedupe on repeat pass

- **WHEN** the player has already earned `boss:藥理學:mini` and passes the mini-boss again
- **THEN** `Player.badges` array SHALL NOT contain the badge ID twice
- **AND** the XP + 3 rolls SHALL still be granted (per-attempt reward, not per-badge)

### Requirement: Run is persisted to db.bossRuns

Every boss run (pass or fail) SHALL append a `BossRun` record to `db.bossRuns` (existing schema) containing:

- `id`: unique
- `mode`: `'mini'`
- `subject`: active subject id (e.g. `'藥理學'`)
- `startTs`: ms when modal opened
- `endTs`: ms when run ended (or timer hit 0)
- `totalQ`: 30
- `correctQ`: number answered correctly when run ended
- `passed`: boolean from `passed()` helper

#### Scenario: Run record exists after boss completes

- **WHEN** any boss run ends (player finishes, retreats, or timer expires)
- **THEN** exactly one new record SHALL exist in `db.bossRuns`
- **AND** `record.mode === 'mini'`
- **AND** `record.endTs > record.startTs`

### Requirement: Boss run cannot pause; closing modal mid-run forfeits

The boss timer SHALL run continuously while the modal is mounted. Closing the modal mid-run (clicking `✕` or backdrop) SHALL count as ending the run with whatever `correctQ` count exists at that moment — typically a fail unless ≥ 60% were already answered correctly.

Reading-loop guards (visibility pause, idle pause) SHALL NOT apply to boss mode. Boss runs are timed assessments; the player is responsible for not getting distracted.

#### Scenario: Backdrop click ends run as fail

- **WHEN** the player has answered 5 questions (3 correct) and clicks the backdrop
- **THEN** the run SHALL finalize with `correctQ: 3, totalQ: 30, passed: false`
- **AND** the consolation reward (25 XP + 1 roll) SHALL fire
- **AND** the player CANNOT resume; opening boss again starts fresh

### Requirement: MVP unlock check is relaxed

In MVP, the engine SHALL NOT enforce the `MINI_BOSS_UNLOCK_SUBJECT_XP` (100 subject-XP) threshold. Any player at any subject level SHALL be allowed to attempt mini-boss for 藥理 (the only seeded subject).

This relaxation is documented as MVP-specific; the M2 `subject-progression` capability SHALL re-enforce the threshold via a modifying delta to this requirement.

#### Scenario: Lv 1 player with 0 subject XP can challenge mini-boss

- **WHEN** a fresh player (subject XP = 0) clicks the mini-boss button
- **THEN** the BossModal SHALL open without an unlock prompt
- **AND** no error SHALL surface

#### Scenario: M2 will enforce unlock

- **WHEN** the `subject-progression` capability is later added in M2
- **THEN** this requirement's MVP relaxation SHALL be revisited via a modifying delta proposal
- **AND** the player SHALL need `subjectLevels[subject].xp >= MINI_BOSS_UNLOCK_SUBJECT_XP` to challenge that subject's mini-boss

### Requirement: Image-placeholder banner on hasImage questions in boss mode

When the active boss question's `hasImage === true` and no actual image asset is available, the BossModal SHALL render a placeholder banner above the question stem informing the player that the original question had an accompanying image which is not yet imported.

The banner SHALL be visually distinct (consistent with the QuizModal banner palette) and SHALL appear in answering state. Since boss mode does not show explanations (per existing `No explanations shown during boss run` requirement), there is no reveal state to consider.

Future image support: when a future content-pack revision adds an `imageUrl` (or equivalent) field and the asset is reachable, the banner SHALL be replaced by the rendered image. The component encapsulates the decision logic.

#### Scenario: hasImage true shows banner during boss

- **WHEN** the BossModal renders a question with `hasImage === true` and no available image asset
- **THEN** a visually distinct banner SHALL appear above the question stem
- **AND** the banner SHALL communicate that the question originally had an image which is not yet imported
- **AND** the countdown timer SHALL continue running unaffected

#### Scenario: hasImage false shows no banner during boss

- **WHEN** the BossModal renders a question with `hasImage === false`
- **THEN** no placeholder banner SHALL appear

### Requirement: Boss mode SHALL NOT offer skip on hasImage questions

Unlike QuizModal, the BossModal SHALL NOT render a "跳過此題" action on the placeholder banner. The player MUST either answer the question or leave it unanswered (which counts against their pass threshold).

Rationale: boss runs are timed assessments with a fixed 30-question sample size and a 60% pass threshold. Allowing skip would break the sample-size and scoring contract — players could strategically skip uncertain questions to inflate their effective answer rate.

The player MAY still close the modal mid-run via backdrop click (existing behavior); this counts as run-end-with-current-correct-count, not skip.

#### Scenario: No skip button on boss hasImage banner

- **WHEN** the BossModal renders a hasImage question
- **THEN** the placeholder banner SHALL NOT contain a skip button or skip action
- **AND** the only ways to advance SHALL be answering an MCQ option or letting the timer expire

#### Scenario: Unanswered hasImage question counts as wrong at run end

- **WHEN** the timer expires while the player is viewing a hasImage question they have not answered
- **THEN** the run SHALL finalize with that question counted as not-correct (existing fail-path behavior)
- **AND** consolation reward SHALL apply if `correctQ / 30 < 0.6`

