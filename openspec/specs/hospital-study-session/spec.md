# hospital-study-session Specification

## Purpose

唸書 session surface — 玩家進入後 tick 才跑、退出立刻停。內建 anti-cheat：visibilitychange 自動 pause + 回來自動 resume（Pomodoro-style，無 idle threshold）。tick 全部寫進 monotonicCounters.totalStudyMinutes（永久累積，MAX-merge）。

## Requirements
### Requirement: Study session SHALL be the sole source of reputation and revenue accumulation

The system SHALL provide a study session mode where the player explicitly enters (`startStudySession()`) and exits (`stopStudySession()`). While the session is active, the tick loop SHALL accumulate revenue + reputation per minute per assigned doctor throughput. While no session is active, the tick loop SHALL NOT accumulate any revenue or reputation. The previous idle tick semantics (`runTick` firing on `setInterval(5000)` regardless of player activity) SHALL be removed.

#### Scenario: Session-off produces zero tick output

- **GIVEN** no study session is active (`studySession.state === 'idle'`)
- **WHEN** 60 seconds of wall-clock time pass
- **THEN** `gameCounters.revenue` SHALL remain unchanged
- **AND** `gameCounters.reputation` SHALL remain unchanged
- **AND** `gameCounters.totalStudyMinutes` SHALL remain unchanged

#### Scenario: Session-on accumulates per-minute tick

- **GIVEN** a study session has been active for 60 seconds with `totalThroughput = 40`
- **WHEN** the tick loop fires
- **THEN** `gameCounters.revenue` SHALL increase by approximately 40
- **AND** `gameCounters.reputation` SHALL increase by approximately 40
- **AND** `gameCounters.totalStudyMinutes` SHALL increase by approximately 1

### Requirement: Session SHALL auto-pause on visibility hidden and auto-resume on visibility return

The system SHALL pause the active study session when the tab visibility transitions to `'hidden'`. While paused, the tick loop SHALL NOT accumulate revenue / reputation / totalStudyMinutes. The controller SHALL track the most recent pause reason in a private `lastPauseReason` variable. When the tab visibility returns to `'visible'`, the system SHALL auto-resume the session IF AND ONLY IF the current state is `'paused'` AND the most recent pause reason was `'visibility-hidden'`. Sessions paused by other reasons (manual player action, or future reasons) SHALL remain paused on visibility-return and require an explicit 「繼續唸書」 click. The system SHALL NOT auto-pause for any inactivity-based threshold — once a session is `'active'`, only an explicit visibility transition or an explicit player click (`pause()` / `stop()`) SHALL change its state.

#### Scenario: Tab hidden pauses active session

- **GIVEN** a study session is active (`state === 'active'`)
- **WHEN** `document.visibilityState` transitions to `'hidden'`
- **THEN** `state` SHALL transition to `'paused'`
- **AND** the tick loop SHALL NOT increment counters until the session resumes
- **AND** the controller SHALL record `lastPauseReason = 'visibility-hidden'`

#### Scenario: Tab returns to visible after visibility-hidden pause auto-resumes

- **GIVEN** a study session was active and is now `'paused'` because of `'visibility-hidden'`
- **WHEN** `document.visibilityState` transitions back to `'visible'`
- **THEN** `state` SHALL transition to `'active'`
- **AND** the controller SHALL invoke `onResume('visibility-return')`
- **AND** the tick loop SHALL resume accumulating counters

#### Scenario: Manual pause survives tab visibility cycle

- **GIVEN** a study session was active and was paused by the player clicking 「暫停」 (`pause('manual')`)
- **AND** `lastPauseReason` is `'manual'`
- **WHEN** the player switches to another tab (`visibility → 'hidden'`) and switches back (`visibility → 'visible'`)
- **THEN** `state` SHALL remain `'paused'`
- **AND** the controller SHALL NOT invoke `onResume`
- **AND** the player SHALL be required to click 「繼續唸書」 to resume

#### Scenario: Session remains active indefinitely without keyboard / mouse input

- **GIVEN** a study session is active (`state === 'active'`)
- **AND** the tab remains visible
- **WHEN** 30 minutes elapse with no `mousemove` / `keydown` / `touchstart` / `scroll` events on `document`
- **THEN** `state` SHALL remain `'active'`
- **AND** the tick loop SHALL continue accumulating revenue / reputation / totalStudyMinutes throughout

#### Scenario: Auto-resume does not fire on legacy paused sessions after deploy

- **GIVEN** a session was paused under the prior implementation (no `lastPauseReason` persisted)
- **AND** after deploy the controller initializes with `lastPauseReason = null`
- **WHEN** the player loads the app and `document.visibilityState` transitions to `'visible'`
- **THEN** `state` SHALL remain `'paused'`
- **AND** the player SHALL click 「繼續唸書」 to resume manually

### Requirement: Study session SHALL render a 看診 scene with assigned doctor sprites

The `/study` route SHALL render a hospital scene background depicting medical consultation. Each room with `assignedDoctorId !== null` SHALL render its doctor sprite in the corresponding room area. The scene SHALL include at least 3 room-type variants (outpatient / surgery / ward) and animate doctor sprites with idle animation (e.g., subtle bob) while the session is active. While paused, sprites SHALL freeze with a translucent overlay indicating paused state.

#### Scenario: Scene renders one doctor per assigned room

- **GIVEN** the player has 3 assigned doctors across 5 rooms
- **WHEN** `/study` renders during an active session
- **THEN** exactly 3 doctor sprites SHALL be visible
- **AND** the remaining 2 rooms SHALL appear empty (no sprite)

#### Scenario: Paused state shows translucent overlay

- **GIVEN** a study session has been paused due to visibility hidden
- **WHEN** the player returns to the tab and `/study` re-renders
- **THEN** the scene SHALL display a `「session paused」` overlay
- **AND** doctor sprite animations SHALL be frozen

### Requirement: Study session metadata SHALL persist in gameCounters

The system SHALL persist study session state via:

- `gameCounters.totalStudyMinutes: number` — monotonically increasing minutes
- `gameCounters.currentSessionStartedAt: number | null` — Unix ms timestamp when current session began, or `null` if no active session
- `gameCounters.lastSessionEndedAt: number | null` — for telemetry / display

The fields SHALL persist across app reloads. On cold start, `currentSessionStartedAt` SHALL be cleared to `null` (crash-recovery — no implicit resume).

#### Scenario: totalStudyMinutes monotonic across sessions

- **GIVEN** `totalStudyMinutes = 120` and a new session runs for 30 minutes
- **WHEN** the session ends
- **THEN** `totalStudyMinutes` SHALL equal 150 (no decrement)

#### Scenario: Cold start clears active session

- **GIVEN** the player ended their browser tab during an active session (`currentSessionStartedAt = 1234567890000`)
- **WHEN** the app reloads
- **THEN** `currentSessionStartedAt` SHALL equal `null`
- **AND** `studySession.state` SHALL be `'idle'` until the player explicitly starts a new session
