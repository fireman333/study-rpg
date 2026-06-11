## MODIFIED Requirements

### Requirement: neurons-tw SHALL provide a reading-timer that accrues study minutes and fuels maze energy

The `neurons-mode` umbrella SHALL ensure that the neurons-tw application provides a reading-timer service that:

1. Lets the user start / stop a reading session via a button reachable from a main route (overview page at minimum)
2. While reading is active, accrues elapsed time in-memory at a configurable tick interval
3. Each time accrued time crosses a 60-second (1 game-minute) boundary, fires the following minute side-effect:
   - Increment `meta['totalStudyMinutes']` (a synced LWW counter — already in `SYNCED_META_KEYS` per `add-neurons-dmn-fate-card`)

   The reading-timer SHALL NOT publish ticks to any DMN time-axis subscriber. DMN time-axis entitlement is owned entirely by `neurons-dmn-fate-cards` (expedition-completion path). Reading minutes still fuel the maze-energy faucet per `neurons-brain-maze` (separate code path, unaffected).
4. Auto-pauses when the browser tab becomes hidden (via `visibilitychange` event)
5. SHALL NOT auto-pause on input inactivity: the timer SHALL NOT listen for `mousemove` / `keydown` / `touchstart` (or any other input-activity events), and SHALL keep accruing through arbitrarily long no-input stretches while the tab stays visible — genuine reading produces no input events, so an input-idle pause penalizes real readers while barely deterring AFK farming. The anti-cheat surface is tab-visibility (point 4) plus the per-minute attribute cap (owned elsewhere; unchanged by this requirement)
6. Does NOT auto-resume on tab focus return — explicit user action SHALL restart reading
7. Exposes its state (status / accumulated seconds / current minute count / pause reason) to UI consumers via a React hook. The pause-reason domain SHALL be `'manual' | 'visibility' | null` — no `'idle'` pause reason exists. (The `'idle'` member of the separate `ReadingTimerStatus` union means "stopped / not reading" and is unaffected.)

The achievement-stats builder (`apps/neurons-tw/src/lib/services/achievement.ts buildAchievementStats`) SHALL read the current value of `meta['totalStudyMinutes']` so the 4 `study-*` achievements (`study-warmup` / `study-hours-5` / `study-hours-20` / `study-marathon`) can unlock when the user accumulates sufficient reading time.

This requirement supersedes the prior implicit state where `totalStudyMinutes` was hardcoded to 0 in achievement stats and the DMN time-axis was inactive. It also supersedes the earlier wording (pre-`realign-dmn-event-rewards-to-maze`) where the minute boundary called `dmnReadingTimerSubscriber.onMinutesAccrued(1)` — that path is removed; reading minutes are no longer a DMN entitlement source. It further supersedes the earlier 90-second input-idle auto-pause clause (pre-`remove-neurons-reading-timer-idle-pause`) — that auto-pause paused genuine reading and is removed.

#### Scenario: User starts reading and 60 seconds of accrued time increments totalStudyMinutes only

- **GIVEN** the user clicks 「📖 開始閱讀」 on the overview page
- **WHEN** 60 seconds of accrued reading time pass (with no tab-hidden pauses)
- **THEN** `meta['totalStudyMinutes']` SHALL be incremented by 1 (from N to N+1)
- **AND** no DMN draw SHALL be granted from this minute boundary regardless of cumulative reading minutes
- **AND** `dmnDrawsAvailable`, `dmnTimeAxisDrawsConsumedToday`, and `dmnTimeAxisMinutesAccrued` SHALL be unchanged by this minute boundary

#### Scenario: Reading accumulation does not affect DMN entitlement across thresholds

- **GIVEN** a user with `meta['totalStudyMinutes'] = 29` and `dmnDrawsAvailable = 0`
- **WHEN** the user accrues one more reading minute (`totalStudyMinutes` becomes 30, crossing the legacy 30-minute boundary)
- **THEN** `dmnDrawsAvailable` SHALL remain 0
- **AND** no toast or modal indicating a DMN draw grant SHALL fire from the reading-timer path

#### Scenario: Visibility change auto-pauses the timer

- **GIVEN** the timer is in reading state (accrued seconds > 0, not paused)
- **WHEN** the user switches to another browser tab or window (`document.hidden` becomes true; `visibilitychange` fires)
- **THEN** the timer state SHALL transition to `paused` with reason `'visibility'`
- **AND** no further tick increments SHALL occur until the user explicitly resumes

#### Scenario: Long no-input stretch does NOT pause the timer

- **GIVEN** the timer is in reading state and the tab remains visible (`document.hidden === false`)
- **WHEN** the user generates no `mousemove` / `keydown` / `touchstart` events for an extended stretch (e.g. 5 minutes — well past the former 90-second threshold)
- **THEN** the timer SHALL remain in `reading` state with `pauseReason === null`
- **AND** minute side-effects SHALL keep firing on every 60-second boundary throughout the stretch
- **AND** at no point SHALL the state expose a pause reason of `'idle'` (that pause reason no longer exists)

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
