## ADDED Requirements

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

### Requirement: Session SHALL auto-pause on visibility change and 90s idle

The system SHALL pause the active study session when (a) the tab visibility transitions to `'hidden'` OR (b) the player has been inactive (no mousemove / keypress / touchstart / scroll event) for ≥ 90 seconds. While paused, the tick loop SHALL NOT accumulate revenue / reputation / totalStudyMinutes. The system SHALL resume tick accumulation when the tab regains visibility AND a user interaction is detected within 5 seconds, OR explicitly when the player taps a 「繼續唸書」 button.

#### Scenario: Tab hidden pauses session

- **GIVEN** a study session is active
- **WHEN** `document.visibilityState` transitions to `'hidden'`
- **THEN** `studySession.state` SHALL transition to `'paused'`
- **AND** the tick loop SHALL NOT increment counters until the session resumes

#### Scenario: 90 seconds idle pauses session

- **GIVEN** a study session is active and the player has not produced any interaction event for 89 seconds
- **WHEN** 1 additional second elapses with no event
- **THEN** `studySession.state` SHALL transition to `'paused'`

#### Scenario: Mousemove on resume continues session

- **GIVEN** a study session is paused due to idle timeout
- **WHEN** the player produces a mousemove event AND clicks 「繼續唸書」
- **THEN** `studySession.state` SHALL transition back to `'active'`
- **AND** tick accumulation SHALL resume

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
