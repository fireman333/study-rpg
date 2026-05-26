# hospital-events Specification

## Purpose

特殊事件 — 隨機觸發 7 種事件（4 modal + 3 toast），rate scaled by reputation（×0.5–×3.0 clamp）。Modal 事件等玩家解；toast 事件 tick 內直接 apply outcome。負面 reputation loss 1k–10k 隨機，組合 rate ≤ 5%。

## Requirements
### Requirement: Special events SHALL trigger probabilistically during active sessions with reputation-scaled rate

The system SHALL roll for a special event on each **non-reading interaction event** (quiz answer commit, or route change into a player-content page) rather than on a session-time tick. Two independent trigger hooks SHALL exist:

- **Hook A (quiz answer)**: After any quiz answer commit path writes its reward to Dexie, the system SHALL invoke `maybeRollNonReadingEvent('quiz')`. Sources include the main QuizModal, ER-consult answered question, mentor-daily answered question, and doctor-training answered question.
- **Hook B (page navigation)**: When `useLocation().pathname` changes to a path satisfying `isPlayerContentRoute(newPath) === true`, the system SHALL invoke `maybeRollNonReadingEvent('nav')`. Initial mount SHALL NOT count as a navigation event.

`maybeRollNonReadingEvent` SHALL evaluate three gates in order and skip the roll if any gate fails:

1. **Reading session gate** — if `gameCounters.currentSessionStartedAt !== null`, SKIP. Reading is sacred; no popup interruption during focus mode regardless of what page the player navigates to.
2. **Cooldown gate** — if `Date.now() - (gameCounters.lastInteractionEventAt ?? 0) < 180_000` (3 minutes wall-clock), SKIP.
3. **Mutex gate** — if `gameCounters.pendingEventId !== null || gameCounters.erConsultActive !== null`, SKIP.

Once all gates pass, the function SHALL roll **event first, then ER second**:

```
if (Math.random() < EVENT_ROLL_PROBABILITY)  → call existing rollEvent(...)
if (Math.random() < ER_ROLL_PROBABILITY)     → call existing maybeRollAndPersistERConsult()
                                                (its own internal mutex skips if event already landed)
```

`EVENT_ROLL_PROBABILITY` SHALL be `0.05` by default, defined in `packages/content-medexam2-tw/src/events.ts` for content-pack-level tuning. The reputation-scaled base-rate table and `reputationScaleFactor = clamp(reputation / 100_000, 0.5, 3.0)` cap remain unchanged inside `rollEvent`. Event categories (medical-malpractice, vip-patient, emergency-shift, audit-event, negative-news, peer-criticism, research-award), their tier gates, base rates, and ≤ 5% combined-negative-rep ceiling all remain unchanged.

At most one event SHALL be active at a time — enforced by the mutex gate above plus `rollEvent`'s internal `pendingEventId === null` check. Each event SHALL persist a row in `eventLog` with `triggeredAt`, `eventType`, `resolution`, `resolvedAt` (unchanged).

`isPlayerContentRoute(pathname)` SHALL exact-match the path (after stripping query string) against the whitelist `{/, /hospital, /roster, /fate-cards, /bookmarks, /leaderboard, /achievements}`. SHALL return `false` for any non-listed path including `/study`, `/training` (redirect-only), `/onboarding`, `/settings`, `/help`, and unknown paths. New player-content routes MUST be added to the whitelist explicitly (fail-safe: defaults off until added).

`/study` is **always excluded from the navigation hook**, regardless of `currentSessionStartedAt` state. Hook B (nav effect in App.tsx) SHALL NOT invoke `maybeRollNonReadingEvent('nav')` when `location.pathname === '/study'`. The reading-session gate inside `maybeRollNonReadingEvent` (`isInReadingSession()` checking `currentSessionStartedAt`) remains as defense-in-depth — guarding Hook A (quiz answers) and any future hook surface that might inadvertently trigger during reading.

Whenever an event resolves (any of the 4 modal handlers in `services/event.ts`: `resolveMalpractice` / `resolveVIP` / `resolveEmergency` / `resolveAudit`, plus auto-resolve in `event.ts` when applicable), the resolver SHALL write `gameCounters.lastInteractionEventAt = Date.now()` to seed the 3-minute cooldown.

#### Scenario: Tier 1 clinic immune to events

- **GIVEN** tier `'診所'` and player on `/leaderboard`
- **WHEN** the player navigates to `/roster` (triggering `maybeRollNonReadingEvent('nav')`)
- **THEN** no event SHALL trigger (all event conditions require ≥ 區域醫院)
- **AND** `maybeRollNonReadingEvent` SHALL still consume the probability roll (no special clinic-tier skip) — the inner `rollEvent` honours tier gates and returns null

#### Scenario: Reputation scales event rate

- **GIVEN** tier `'醫學中心'`, reputation 500,000 (so `reputationScaleFactor = 3.0` capped)
- **WHEN** the outer `EVENT_ROLL_PROBABILITY = 5%` succeeds and `rollEvent` runs
- **THEN** the effective trigger rate of 醫療糾紛 within `rollEvent` SHALL equal `min(8% × 3.0, 30%) = 24%`
- **AND** the effective trigger rate of 學會獎項 SHALL equal `2% × 3.0 = 6%`

#### Scenario: Reading session blocks all rolls

- **GIVEN** `gameCounters.currentSessionStartedAt = 1716000000000` (non-null — reading session active)
- **WHEN** the player answers a quiz question (Hook A fires)
- **THEN** `maybeRollNonReadingEvent('quiz')` SHALL skip at the reading session gate
- **AND** no roll SHALL be attempted
- **AND** DEV-only `__events.skipReadingSession` counter SHALL increment

#### Scenario: Cooldown blocks immediate re-trigger

- **GIVEN** an event resolved 90 seconds ago (`lastInteractionEventAt = Date.now() - 90_000`)
- **WHEN** the player navigates to `/leaderboard`
- **THEN** `maybeRollNonReadingEvent('nav')` SHALL skip at the cooldown gate
- **AND** DEV-only `__events.skipCooldown` counter SHALL increment
- **AND** a navigation 4 minutes later SHALL pass the cooldown gate

#### Scenario: Single event at a time

- **GIVEN** an active 醫療糾紛 event awaiting resolution (`pendingEventId === 'medical-malpractice'`)
- **WHEN** the player navigates to `/achievements` (Hook B fires)
- **THEN** `maybeRollNonReadingEvent('nav')` SHALL skip at the mutex gate
- **AND** the existing 醫療糾紛 SHALL remain the only active event

#### Scenario: Quiz answer hook fires roll

- **GIVEN** player on `/quiz` (in player-content whitelist), no reading session active, no cooldown, no pending event
- **WHEN** the player commits an answer in `QuizModal` and reward is written
- **THEN** `maybeRollNonReadingEvent('quiz')` SHALL execute
- **AND** an event SHALL roll with `EVENT_ROLL_PROBABILITY = 5%` chance
- **AND** an ER consult SHALL roll with `ER_ROLL_PROBABILITY = 3.5%` chance (subject to mutex if event already fired)

#### Scenario: Navigation to /study never fires roll regardless of session state

- **GIVEN** the player is on `/leaderboard`
- **AND** `gameCounters.currentSessionStartedAt === null` (no reading session active)
- **WHEN** the player navigates to `/study`
- **THEN** Hook B's location effect SHALL detect `pathname === '/study'` (NOT in `isPlayerContentRoute` whitelist)
- **AND** `maybeRollNonReadingEvent('nav')` SHALL NOT be invoked
- **AND** no roll SHALL execute

(Same outcome regardless of whether session is active or not — `/study` is always excluded from Hook B. The reading-session inner gate inside `maybeRollNonReadingEvent` serves as defense-in-depth for Hook A and any future hook surface, not as the primary mechanism for `/study`.)

#### Scenario: Negative news deducts random reputation

- **GIVEN** non-reading interaction triggered a roll at tier `'區域醫院'`, reputation 100,000
- **WHEN** `rollEvent` selects 負面新聞 (auto-resolves immediately, no player choice)
- **THEN** reputation SHALL decrement by a uniform random value in `[1000, 10000]`
- **AND** the event SHALL be logged in `eventLog`
- **AND** `gameCounters.lastInteractionEventAt` SHALL be set to `Date.now()` (toast events also seed cooldown)

### Requirement: Medical malpractice event SHALL offer spend-revenue resolution

The 醫療糾紛 event SHALL present the player with two resolution choices:

- **(a) 私下和解 — spend revenue**: cost = `min(max(10_000, revenue × 10%), revenue)` — at least 10k or 10% whichever larger, but capped at current revenue (cannot drive negative). If `revenue < 10_000`, this option SHALL be disabled with a「營收不足」label and only path (b) is selectable.
- **(b) 接受懲處 — lose reputation**: no revenue cost. Reputation SHALL decrement by `MALPRACTICE_PENALTY_REP = 5,000`, floored at 0 (cannot go negative). The **eventLog row AND resolver return value SHALL report the ACTUAL reputation delta after the floor clamp**, not the intent constant. When player has rep ≥ 5,000, actual delta = -5,000; when player has rep 864, actual delta = -864.

The event SHALL auto-resolve to choice (b) if the player does not respond within 24 hours (wall-clock since `triggeredAt`). The auto-resolution SHALL follow the same actual-delta reporting rule: the `eventLog.reputationDelta` row written by the auto-resolve branch in `tick.ts` SHALL equal `newReputation - prevReputation` (negative, magnitude ≤ prevReputation), not `-MALPRACTICE_PENALTY_REP`.

The 接受懲處 button label SHALL surface the effective deduction. When `counters.reputation >= MALPRACTICE_PENALTY_REP`, the button SHALL display 「接受懲處（−{MALPRACTICE_PENALTY_REP} 聲望）」. When `counters.reputation < MALPRACTICE_PENALTY_REP`, the button SHALL append a 「將至 0」 parenthetical clarifier (e.g., 「接受懲處（−5,000 聲望（將至 0））」) so the player can see the realized floor consequence before clicking.

#### Scenario: Player chooses settlement

- **GIVEN** an active 醫療糾紛 and `revenue = 200,000`
- **WHEN** the player selects 私下和解
- **THEN** `revenue` SHALL equal `180,000` (10% deducted)
- **AND** the event SHALL transition to `resolution: 'settled'`
- **AND** `reputation` SHALL remain unchanged

#### Scenario: Settlement disabled when revenue below 10k

- **GIVEN** an active 醫療糾紛 and `revenue = 5,000`
- **WHEN** the modal renders
- **THEN** the 私下和解 button SHALL be disabled
- **AND** the modal SHALL display `「營收不足，無法和解」`
- **AND** only the 接受懲處 path SHALL be selectable

#### Scenario: Player accepts penalty with sufficient reputation

- **GIVEN** an active 醫療糾紛 and `reputation = 100,000`
- **WHEN** the player selects 接受懲處
- **THEN** `reputation` SHALL equal `95,000`
- **AND** `eventLog.reputationDelta` SHALL equal `-5,000`
- **AND** resolver return value `reputationDelta` SHALL equal `-5,000`

#### Scenario: Player accepts penalty with reputation below penalty amount

- **GIVEN** an active 醫療糾紛 and `reputation = 864`
- **WHEN** the player selects 接受懲處
- **THEN** `reputation` SHALL equal `0` (floored)
- **AND** `eventLog.reputationDelta` SHALL equal `-864` (actual delta, NOT intent -5,000)
- **AND** resolver return value `reputationDelta` SHALL equal `-864`
- **AND** the outcome modal SHALL display the actual deduction amount

#### Scenario: Timeout defaults to penalty with actual-delta reporting

- **GIVEN** an active 醫療糾紛 that triggered 25 hours ago without response and `reputation = 200`
- **WHEN** the next tick fires
- **THEN** the event SHALL auto-resolve as `resolution: 'penalized'`
- **AND** `reputation` SHALL equal `0`
- **AND** `eventLog.reputationDelta` SHALL equal `-200` (actual delta, NOT intent -5,000)

#### Scenario: Auto-resolve partial floor reports actual delta

- **GIVEN** an active 醫療糾紛 that triggered 25 hours ago without response and `reputation = 1,500`
- **WHEN** the next tick fires
- **THEN** the event SHALL auto-resolve as `resolution: 'auto-resolved-penalty'`
- **AND** `reputation` SHALL equal `0` (floored, since 1,500 < 5,000 penalty)
- **AND** `eventLog.reputationDelta` SHALL equal `-1,500` (actual delta, NOT intent -5,000)
- **AND** telemetry sums over `eventLog.reputationDelta` SHALL match the realized counter movement to the rep, not the sum of intent constants

#### Scenario: Malpractice button label reflects effective deduction when rep low

- **GIVEN** an active 醫療糾紛 modal is showing and `counters.reputation = 3,000`
- **WHEN** the modal renders
- **THEN** the 接受懲處 button label SHALL include the 「將至 0」 parenthetical (e.g., 「接受懲處（−5,000 聲望（將至 0））」)
- **AND** the player SHALL be able to predict the floored outcome before clicking

#### Scenario: Malpractice button label omits 將至 0 hint when rep sufficient

- **GIVEN** an active 醫療糾紛 modal is showing and `counters.reputation = 12,000`
- **WHEN** the modal renders
- **THEN** the 接受懲處 button label SHALL display 「接受懲處（−5,000 聲望）」 with no parenthetical clarifier
- **AND** clicking the button SHALL deduct exactly 5,000 reputation

### Requirement: Medical audit event SHALL apply pass/fail reputation change with actual-delta reporting

The 醫療評鑑 (audit-event) SHALL roll a pass/fail outcome via `Math.random() < AUDIT_PASS_PROBABILITY` (default 70%):

- **Pass** (`AUDIT_PASS_PROBABILITY`): reputation += `AUDIT_PASS_REPUTATION` (no floor concern; addition only).
- **Fail** (1 - `AUDIT_PASS_PROBABILITY`): reputation deducted by `AUDIT_FAIL_REPUTATION_LOSS`, floored at 0.

The eventLog row + resolver return value SHALL report ACTUAL reputation delta after floor, identical to malpractice accept-penalty semantics. The outcome modal copy SHALL display the actual change amount.

#### Scenario: Audit pass increments reputation

- **GIVEN** an active 醫療評鑑, `AUDIT_PASS_REPUTATION = 5,000`, current `reputation = 10,000`
- **WHEN** the audit resolves as pass
- **THEN** `reputation` SHALL equal `15,000`
- **AND** `eventLog.reputationDelta` SHALL equal `+5,000`
- **AND** the outcome modal SHALL render the success branch

#### Scenario: Audit fail with sufficient reputation

- **GIVEN** an active 醫療評鑑, `AUDIT_FAIL_REPUTATION_LOSS = 3,000`, current `reputation = 10,000`
- **WHEN** the audit resolves as fail
- **THEN** `reputation` SHALL equal `7,000`
- **AND** `eventLog.reputationDelta` SHALL equal `-3,000`

#### Scenario: Audit fail with reputation below loss amount

- **GIVEN** an active 醫療評鑑, `AUDIT_FAIL_REPUTATION_LOSS = 3,000`, current `reputation = 500`
- **WHEN** the audit resolves as fail
- **THEN** `reputation` SHALL equal `0` (floored)
- **AND** `eventLog.reputationDelta` SHALL equal `-500` (actual delta, NOT intent -3,000)
- **AND** the outcome modal SHALL display the actual deduction amount

### Requirement: VIP patient event SHALL grant temporary throughput boost

The VIP 病人 event SHALL grant `throughputMultiplier = 2.0` for the next 10 minutes of active session time (paused on session-pause; resumes on session-resume). The boost SHALL apply to all rooms equally. When the boost expires, the event SHALL transition to `resolution: 'completed'`.

#### Scenario: VIP boost doubles throughput

- **GIVEN** an active session with `totalThroughput = 100/min` and a VIP event just triggered
- **WHEN** the next minute of session elapses
- **THEN** revenue SHALL increase by approximately `200` (2× normal rate)
- **AND** reputation SHALL increase by approximately `200`

#### Scenario: VIP boost pauses with session

- **GIVEN** a VIP event has 7 minutes remaining and the session pauses
- **WHEN** the session resumes 10 minutes later
- **THEN** the VIP event SHALL still have 7 minutes remaining
- **AND** the boost SHALL re-apply

### Requirement: Event UI SHALL distinguish actionable (modal) from passive (toast) events

The system SHALL classify events into two UI categories:

**Actionable events** (modal required — player choice impacts outcome):
- 醫療糾紛 (revenue vs reputation choice)
- VIP 病人 (acknowledge to start boost)
- 急診加開 (acknowledge to start boost)
- 醫療評鑑 (mixed outcome with choice)

For these, the system SHALL display a modal at the top of the viewport with title / description / action buttons / countdown. The modal SHALL persist across page navigation until resolved or auto-resolved.

**Passive events** (toast notification — auto-resolve, no player input):
- 負面新聞 (auto-deduct rep)
- 學會質疑 (auto-deduct rep)
- 學會獎項 (auto-add rep)

For these, the system SHALL show a toast notification at the top-right corner with title / brief description / outcome (e.g., `「負面新聞：-3,520 聲望」`). The toast SHALL auto-dismiss after 5 seconds. The event SHALL be applied to counters immediately (no waiting for player acknowledgment) and SHALL still be logged in `eventLog`.

Passive toast events with `reputation-loss` outcomes SHALL clamp reputation at floor 0 (reputation cannot go negative). The **eventLog row AND the value passed to the toast UI SHALL report the ACTUAL reputation delta after the floor clamp**, not the intent magnitude — parity with the modal-event actual-delta contract enforced by `Medical malpractice event` and `Medical audit event` requirements. When the starting reputation exceeds the loss magnitude, actual = intent; when starting reputation is below the loss magnitude, the toast SHALL display the realized (smaller) magnitude and the `eventLog.reputationDelta` SHALL be the negative of the realized magnitude. `reputation-gain` outcomes SHALL pass through unchanged (no floor concern; realized = intent).

#### Scenario: Actionable event shows modal

- **GIVEN** a 醫療糾紛 event triggers
- **WHEN** the event UI renders
- **THEN** a modal SHALL appear with 私下和解 / 接受懲處 buttons
- **AND** the player SHALL be required to choose (or wait for 24-hour auto-resolution)

#### Scenario: Passive event shows toast and auto-applies

- **GIVEN** a 負面新聞 event triggers, current reputation 100,000
- **WHEN** the event resolves
- **THEN** a toast notification SHALL appear with the rep loss amount
- **AND** `reputation` SHALL decrement immediately (no player action required)
- **AND** the toast SHALL auto-dismiss after 5 seconds
- **AND** `eventLog` SHALL record the event with `resolution: 'auto-applied'`

#### Scenario: Modal persists across navigation

- **GIVEN** a 醫療糾紛 modal is showing on `/study`
- **WHEN** the player navigates to `/hospital`
- **THEN** the modal SHALL remain visible on `/hospital`
- **AND** the player SHALL still be able to resolve from any page

#### Scenario: Toast reputation-loss reports actual delta when floor clamps

- **GIVEN** the player's current reputation is `200`
- **AND** a 負面新聞 toast event rolls with intent loss magnitude `3,520`
- **WHEN** the tick scheduler applies the outcome
- **THEN** `reputation` SHALL equal `0` (floored, not `−3,320`)
- **AND** `eventLog.reputationDelta` SHALL equal `−200` (actual delta, NOT intent `−3,520`)
- **AND** the toast UI text SHALL display the loss as `−200 聲望` (actual, NOT intent `−3,520`)

#### Scenario: Toast reputation-gain reports intent unchanged (no floor)

- **GIVEN** the player's current reputation is `42,000`
- **AND** a 學會獎項 toast event rolls with intent gain magnitude `2,500`
- **WHEN** the tick scheduler applies the outcome
- **THEN** `reputation` SHALL equal `44,500`
- **AND** `eventLog.reputationDelta` SHALL equal `+2,500`
- **AND** the toast UI text SHALL display the gain as `+2,500 聲望`
