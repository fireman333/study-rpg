## MODIFIED Requirements

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
