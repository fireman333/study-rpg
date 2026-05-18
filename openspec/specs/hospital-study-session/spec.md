# hospital-study-session Specification

## Purpose

唸書 session surface — 玩家進入後 tick 才跑、退出立刻停。內建 anti-cheat：visibilitychange 自動 pause + 回來自動 resume（Pomodoro-style，無 idle threshold）。tick 全部寫進 monotonicCounters.totalStudyMinutes（永久累積，MAX-merge）。

## Requirements
### Requirement: Study session SHALL be the sole source of reputation and revenue accumulation

The system SHALL provide a study session mode where the player explicitly enters (`startStudySession()`) and exits (`stopStudySession()`). While the session is active, the tick loop SHALL accumulate revenue + reputation per minute per assigned doctor throughput **with the `READING_SESSION_BUFF_MULTIPLIER` (1.5×) applied to throughput** (see `hospital-tycoon-engine` capability for tick formula). While no session is active, the tick loop SHALL NOT accumulate any revenue or reputation. The previous idle tick semantics (`runTick` firing on `setInterval(5000)` regardless of player activity) SHALL be removed.

**The reading-session buff SHALL apply ONLY to tick-loop idle income** (doctor patient throughput). The buff SHALL NOT apply to quiz answer rewards — quiz reward is independent of session state and is computed by the `applyQuizReward` service per `hospital-quiz` capability.

The mental model exposed to the player: "唸書 session = 我在診間旁邊讀書，醫師同時看患者，所以醫師看患者的營收/聲望會有 1.5× 加成。寫題答對的營收/聲望跟有沒有唸書 session 無關（只受診所階級和搭檔醫師專長影響）。"

#### Scenario: Session-off produces zero tick output

- **GIVEN** no study session is active (`studySession.state === 'idle'`)
- **WHEN** 60 seconds of wall-clock time pass
- **THEN** `gameCounters.revenue` SHALL remain unchanged
- **AND** `gameCounters.reputation` SHALL remain unchanged
- **AND** `gameCounters.totalStudyMinutes` SHALL remain unchanged

#### Scenario: Session-on accumulates per-minute tick with 1.5× buff

- **GIVEN** a study session has been active for 60 seconds with `totalThroughput = 40`
- **WHEN** the tick loop fires
- **THEN** `gameCounters.revenue` SHALL increase by approximately `40 × 1.5 = 60`
- **AND** `gameCounters.reputation` SHALL increase by approximately `60`
- **AND** `gameCounters.totalStudyMinutes` SHALL increase by approximately 1

#### Scenario: Quiz answered correctly during active session receives NO additional session buff

- **GIVEN** a study session is active and the player opens QuizModal
- **AND** the player has `gameCounters.tier === '診所'`, no doctor partner bound
- **WHEN** the player answers a question correctly
- **THEN** `gameCounters.revenue` SHALL increase by exactly `80` (base reward, no session buff applied)
- **AND** the tick-loop idle accrual SHALL still independently fire its own `1.5× throughput` reward on the next tick cycle

#### Scenario: Mental model copy displayed consistently across UI surfaces

- **GIVEN** the player has the app open
- **WHEN** the player views the StudySessionPage help banner, HelpMenu reading-session accordion section, OR V6Migration explainer dialog
- **THEN** all three surfaces SHALL describe the buff as "醫師看患者的營收/聲望會有 1.5× 加成" (or equivalent wording referencing doctor patient income)
- **AND** none of the three surfaces SHALL claim that quiz answer rewards receive the session buff

### Requirement: Session SHALL auto-pause on visibility hidden and auto-resume on visibility return

The system SHALL pause the active study session when the tab visibility transitions to `'hidden'`. While paused, the tick loop SHALL NOT accumulate revenue / reputation / totalStudyMinutes. The controller SHALL track the most recent pause reason in a private `lastPauseReason` variable. When the tab visibility returns to `'visible'`, the system SHALL auto-resume the session IF AND ONLY IF the current state is `'paused'` AND the most recent pause reason was `'visibility-hidden'`. Sessions paused by other reasons (manual player action, or future reasons) SHALL remain paused on visibility-return and require an explicit 「繼續唸書」 click. The system SHALL NOT auto-pause for any inactivity-based threshold — once a session is `'active'`, only an explicit visibility transition or an explicit player click (`pause()` / `stop()`) SHALL change its state.

The `/study` page banner copy displayed while `state === 'paused'` SHALL NOT make claims about auto-resume behavior that may not hold for the current pause reason. The banner SHALL display a short, reason-agnostic indicator (e.g., 「⏸ 已暫停」) and the differentiated explanation (auto-resume on visibility-return vs explicit click required for manual pause) SHALL be carried by the existing footer hint that already lives below the pause controls. This avoids exposing the controller's private `lastPauseReason` through the public API.

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

#### Scenario: Paused banner copy SHALL NOT claim auto-resume regardless of pause reason

- **GIVEN** a study session is paused (`state === 'paused'`) for any reason (manual or visibility-hidden)
- **WHEN** the `/study` page renders the paused state banner
- **THEN** the banner SHALL display a reason-agnostic short label (e.g., 「⏸ 已暫停」) and SHALL NOT contain the phrase 「離開分頁，回來會自動繼續」 or any equivalent claim that auto-resume always applies
- **AND** the footer hint immediately below the pause controls SHALL retain the differentiated explanation distinguishing visibility-return auto-resume from manual-pause explicit-click cases

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
