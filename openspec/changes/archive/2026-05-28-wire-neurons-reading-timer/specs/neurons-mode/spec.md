## ADDED Requirements

### Requirement: neurons-tw SHALL provide a reading-timer that accrues study minutes and publishes ticks to the DMN time-axis subscriber

The `neurons-mode` umbrella SHALL ensure that the neurons-tw application provides a reading-timer service that:

1. Lets the user start / stop a reading session via a button reachable from a main route (overview page at minimum)
2. While reading is active, accrues elapsed time in-memory at a configurable tick interval
3. Each time accrued time crosses a 60-second (1 game-minute) boundary, fires BOTH of the following minute side-effects:
   - Increment `meta['totalStudyMinutes']` (a synced LWW counter — already in `SYNCED_META_KEYS` per `add-neurons-dmn-fate-card`)
   - Call `dmnReadingTimerSubscriber.onMinutesAccrued(1)` (the published interface at `dmn-trigger.ts:170` — activates DMN time-axis accrual per `neurons-dmn-fate-cards` Requirement)
4. Auto-pauses when the browser tab becomes hidden (via `visibilitychange` event)
5. Auto-pauses when the user has been idle for ≥ 90 seconds (no mousemove / keydown / touchstart events)
6. Does NOT auto-resume on tab focus return — explicit user action SHALL restart reading
7. Exposes its state (status / accumulated seconds / current minute count / pause reason) to UI consumers via a React hook

The achievement-stats builder (`apps/neurons-tw/src/lib/services/achievement.ts buildAchievementStats`) SHALL read the current value of `meta['totalStudyMinutes']` so the 4 `study-*` achievements (`study-warmup` / `study-hours-5` / `study-hours-20` / `study-marathon`) can unlock when the user accumulates sufficient reading time.

This requirement supersedes the prior implicit state where `totalStudyMinutes` was hardcoded to 0 in achievement stats and the DMN time-axis was inactive.

#### Scenario: User starts reading and 60 seconds of accrued time fires both minute side-effects

- **GIVEN** the user clicks 「📖 開始閱讀」 on the overview page
- **WHEN** 60 seconds of accrued reading time pass (with no idle pauses, no tab-hidden pauses)
- **THEN** `meta['totalStudyMinutes']` SHALL be incremented by 1 (from N to N+1)
- **AND** `accrueReadingMinutes(1)` SHALL be invoked, advancing the DMN time-axis accrual counter
- **AND** if DMN time-axis accrual crosses a 30-minute threshold, a +1 DMN draw SHALL be granted (per `neurons-dmn-fate-cards` Requirement)

#### Scenario: Visibility change auto-pauses the timer

- **GIVEN** the timer is in reading state (accrued seconds > 0, not paused)
- **WHEN** the user switches to another browser tab or window (`document.hidden` becomes true; `visibilitychange` fires)
- **THEN** the timer state SHALL transition to `paused` with reason `'visibility'`
- **AND** no further tick increments SHALL occur until the user explicitly resumes

#### Scenario: 90s idle auto-pauses the timer

- **GIVEN** the timer is in reading state and the user has not generated a `mousemove` / `keydown` / `touchstart` event for ≥ 90 seconds
- **WHEN** the 90-second idle threshold elapses
- **THEN** the timer state SHALL transition to `paused` with reason `'idle'`
- **AND** no further tick increments SHALL occur until the user explicitly resumes

#### Scenario: No auto-resume on tab focus return

- **GIVEN** the timer is in `paused` state with reason `'visibility'` (user switched to another tab)
- **WHEN** the user returns to the neurons-tw tab (`document.hidden` becomes false)
- **THEN** the timer SHALL remain in `paused` state
- **AND** the UI SHALL still show the pause indicator
- **AND** the user MUST explicitly click resume / restart to continue accruing

#### Scenario: Manual stop clears in-memory accumulated state but preserves persisted minute count

- **GIVEN** the timer has accrued 47 seconds of partial-minute time and 3 full minutes (3 prior side-effect fires already persisted to `meta['totalStudyMinutes']`)
- **WHEN** the user clicks 「⏹ 結束閱讀」
- **THEN** the timer state SHALL return to `idle`
- **AND** `accumulatedSeconds` SHALL reset to 0
- **AND** the 47 seconds of in-flight partial-minute progress SHALL be lost (NOT carried forward to next session — accepted trade-off)
- **AND** `meta['totalStudyMinutes']` SHALL retain the +3 from this session (the 3 minute side-effects already fired during the session)

#### Scenario: Study-category achievements unlock when totalStudyMinutes thresholds are crossed

- **GIVEN** the user has accumulated 9 reading minutes (totalStudyMinutes = 9)
- **WHEN** the user accrues 1 more minute (totalStudyMinutes becomes 10)
- **THEN** the `study-warmup` achievement (predicate: studyMin(10)) SHALL evaluate as unlocked on next achievement check
- **AND** the achievement-trigger chain MAY emit toast / modal per existing `achievement` capability behaviors
- **AND** the same pattern applies at 300 minutes (`study-hours-5`), 1200 minutes (`study-hours-20`), and 3000 minutes (`study-marathon`)
