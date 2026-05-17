## REMOVED Requirements

### Requirement: Session SHALL auto-pause on visibility change and 90s idle

**Reason**: The 90-second idle auto-pause was inherited from 一階 reading-loop where the player scrolls through web articles. In 二階 hospital mode the「念書 session」is a pass-through Pomodoro-style timer expected to run while the player reads paper textbooks for 25–50 minutes without browser interaction. The idle-timeout actively punishes legitimate study by forcing a manual「繼續唸書」click every 90 seconds. Combined with the `reading-loop` rate cap (`MAX_ATTRIBUTE_PER_MINUTE = 1`), removing the idle threshold does not open new exploit windows.

**Migration**: Visibility-hidden auto-pause is preserved via the new `Session SHALL auto-pause on visibility hidden and auto-resume on visibility return` requirement below. The `idleTimeoutMs` option on `StudySessionControllerOptions` is removed (BREAKING for tests that passed it); the `'idle-timeout'` member of the `StudySessionPauseReason` union is removed (BREAKING for any caller that branched on this reason — none currently exist in the workspace).

## ADDED Requirements

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
