## ADDED Requirements

### Requirement: Reading timer pauses when tab is hidden

The app SHALL listen for `document.visibilitychange` events. Whenever `document.hidden === true` while `reading === true`, the app SHALL immediately set `reading = false` and record the pause reason as `'visibility'`.

#### Scenario: Switching tabs pauses the timer

- **WHEN** the player is in reading mode (`reading === true`) and switches to another browser tab
- **THEN** `reading` SHALL become `false` within one `visibilitychange` event tick
- **AND** the UI hint near the reading button SHALL display a message indicating the pause was automatic (e.g. `⏸ 自動暫停（離開分頁）`)
- **AND** `readMs` accumulated so far SHALL be preserved (the player has not lost their session)

#### Scenario: Resume requires manual click

- **WHEN** the player returns to the tab after a visibility-triggered pause
- **THEN** `reading` SHALL remain `false`
- **AND** the player SHALL click the start-reading button to resume
- **AND** no XP / stat SHALL be granted automatically during the away period

### Requirement: Reading timer pauses on idle

The app SHALL track user interaction events (`mousemove`, `keydown`, `touchstart`). If no such event fires for `READING_IDLE_TIMEOUT_MS` (default 90 000 ms = 90 seconds) while reading is active, the app SHALL set `reading = false` with pause reason `'idle'`.

#### Scenario: 90 seconds of no input triggers idle pause

- **WHEN** the player has been reading and has not produced any `mousemove`, `keydown`, or `touchstart` for 90 seconds
- **THEN** `reading` SHALL become `false`
- **AND** the hint SHALL display an idle-specific message (e.g. `⏸ 自動暫停（離桌太久）`)

#### Scenario: Any interaction resets the idle timer

- **WHEN** the player produces a `mousemove`, `keydown`, or `touchstart` event during reading mode
- **THEN** the idle countdown SHALL reset to 90 seconds from that moment
- **AND** no pause SHALL trigger as long as interactions arrive within 90 seconds of each other

### Requirement: Per-tick reward cap is enforced

The reading reward (`REWARD.readPerMinute`) SHALL be applied at most once per `READING_TICK_MS` (default 10 000 ms in demo mode, 60 000 ms in production mode), counted from the start of the current reading session.

#### Scenario: Reward fires once per tick interval

- **WHEN** the player reads continuously for 30 seconds in demo mode (`READING_TICK_MS = 10_000`)
- **THEN** the player SHALL receive exactly 3 ticks of reward (3 × `REWARD.readPerMinute`)
- **AND** `Player.xp` SHALL increase by exactly `3 × 5 = 15` XP from reading
- **AND** `Player.stats.stamina` SHALL increase by exactly `3`

#### Scenario: No reward double-fires within a tick

- **WHEN** the reading tick handler is called multiple times within a single 10 000 ms window (e.g. due to React effect re-run on unrelated state change)
- **THEN** reward SHALL be applied at most once per `READING_TICK_MS` boundary

### Requirement: Pause reason is observable in UI

When `reading === false` due to an automatic pause (visibility or idle), the UI SHALL display the reason so the player understands why their timer stopped.

#### Scenario: Visibility pause shows reason

- **WHEN** the player returns to the tab after a visibility pause
- **THEN** the hint area next to the reading button SHALL contain text indicating tab-away pause (Chinese acceptable, e.g. `⏸ 自動暫停（離開分頁）`)
- **AND** the message SHALL clear when the player clicks the start-reading button to resume

#### Scenario: Manual pause does not show automatic-pause reason

- **WHEN** the player clicks the reading button to pause manually
- **THEN** the hint SHALL NOT claim the pause was automatic
- **AND** the hint MAY remain blank or show a neutral "暫停" indicator

### Requirement: Timer state is not externally mutable

The `reading` boolean SHALL be controlled exclusively through React state (`setReading`). There SHALL NOT exist a global setter, window property, or query-string parameter that allows external code to set `reading = true` or to inject `readMs` increments outside the legitimate timer interval.

#### Scenario: No global setter exposed

- **WHEN** the app loads and runs
- **THEN** `window.setReading`, `window.readMs`, and similar identifiers SHALL be `undefined`
- **AND** the only path to mutate `reading` SHALL be React component event handlers (start button click, visibility listener, idle timeout)

#### Scenario: Modification of constants requires spec delta

- **WHEN** any PR changes `READING_TICK_MS`, `READING_IDLE_TIMEOUT_MS`, or the conditions in the visibility / idle listeners
- **THEN** the PR SHALL include a delta proposal modifying this capability
- **AND** the delta SHALL document the rationale for the new behavior
