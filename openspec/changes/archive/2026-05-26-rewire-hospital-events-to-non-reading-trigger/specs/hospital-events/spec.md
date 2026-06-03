## MODIFIED Requirements

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

## REMOVED Requirements

None — the core event mechanics (categories, rate scaling, single-event mutex, eventLog persistence, individual event resolution behavior) all remain unchanged. Only the **trigger mechanism** is rewired.
