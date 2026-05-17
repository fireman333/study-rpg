## MODIFIED Requirements

### Requirement: Tick loop SHALL accumulate revenue + reputation only during active study session

The system SHALL run a tick function every 5 seconds **only while a study session is active** (see `hospital-study-session` capability). When no session is active, the tick interval SHALL NOT be scheduled, and counters SHALL NOT change. Each session-active tick SHALL:

1. Read `gameCounters.singleton` (revenue, reputation, lastTickAt, totalStudyMinutes)
2. Compute `elapsedSec = max(0, min((now - lastTickAt) / 1000, MAX_OFFLINE_TICK_SEC))` where `MAX_OFFLINE_TICK_SEC = 300`
3. For each room with `assignedDoctorId !== null`, sum `throughput = baseRate × doctor.powerMultiplier × roomFacility × affinityBonus`, where `affinityBonus = getAffinityBonus(doctor.rarity, doctor.subjectId, room.type)` per the `hospital-reputation` capability
4. Compute `deltaRevenueGross = totalThroughput × elapsedSec / 60`
5. Compute `deltaSalary` per `hospital-finances` (ALL owned doctors × tier-staged salary rate: 0% / 70% / 100% / 100%)
6. Compute `deltaReputation = totalThroughput × elapsedSec / 60` (full throughput; idle 70%/per-Q 30% split removed since per-Q hook is removed)
7. Compute `deltaTotalStudyMinutes = elapsedSec / 60`
8. Write `revenue = max(0, revenue + deltaRevenueGross - deltaSalary)` (clamp at 0 floor), `reputation += deltaReputation`, `totalStudyMinutes += deltaTotalStudyMinutes`, `lastTickAt = now` in a single Dexie transaction

All counter mutations from tick SHALL go through this tick function. Direct writes to `revenue` / `reputation` / `totalStudyMinutes` from UI code SHALL NOT be permitted, except via the spend actions defined in `doctor-training` / `hospital-finances` / `hospital-events` / `hospital-fate-cards`.

#### Scenario: Tick accumulates only during active session

- **GIVEN** `gameCounters.lastTickAt` was 60 seconds ago, study session is `'active'`, `totalThroughput = 40`, no salary (all P5 in 診所 with 30% discount + zero rooms assigned baseline for simplicity)
- **WHEN** the next tick fires
- **THEN** `revenue` SHALL increase by approximately `40 - salaryDeducted`
- **AND** `reputation` SHALL increase by approximately `40`
- **AND** `totalStudyMinutes` SHALL increase by approximately `1`

#### Scenario: Tick zero when session idle

- **GIVEN** study session is `'idle'`
- **WHEN** 60 seconds pass
- **THEN** the tick interval SHALL NOT have been scheduled
- **AND** `revenue` / `reputation` / `totalStudyMinutes` SHALL all be unchanged

#### Scenario: Tick zero for empty rooms during active session

- **GIVEN** session active, all rooms have `assignedDoctorId = null`
- **WHEN** the tick fires
- **THEN** `revenue` SHALL remain unchanged
- **AND** `reputation` SHALL remain unchanged
- **AND** `totalStudyMinutes` SHALL still increment by the elapsed minutes (counts as "time studied" even with no doctors)

### Requirement: Tick loop SHALL cap session-active accumulation at 5 minutes (defense against clock skew)

The system SHALL enforce `MAX_OFFLINE_TICK_SEC = 300` even during active sessions to defend against system clock anomalies (e.g., suspend / hibernate during session). No single tick SHALL advance by more than 300 seconds of accumulated throughput.

The previous "offline accumulation" semantics (offline tick accruing when player returns) SHALL be removed — since tick only runs during active session, "offline" no longer applies. The UI SHALL display a notification only if a single tick exceeds the cap (rare: indicates suspend or clock skew).

#### Scenario: Suspend mid-session triggers cap notice

- **GIVEN** active session, `lastTickAt` was 30 minutes ago (player suspended laptop without ending session — see hospital-study-session auto-pause requirements)
- **WHEN** the tab regains focus and the next tick fires
- **THEN** `elapsedSec` SHALL be capped at `300`
- **AND** the UI SHALL display a notification mentioning clock-skew cap

### Requirement: Tick loop SHALL pause whenever study session is paused or idle

The system SHALL clear the tick `setInterval` whenever `studySession.state !== 'active'`. Specifically:

- `studySession.state` transitions to `'paused'` (visibility / idle / explicit) → clear interval
- `studySession.state` transitions to `'idle'` (explicit stop) → clear interval
- `studySession.state` transitions to `'active'` (start / resume) → schedule interval

Visibility transitions SHALL be handled via the study session pause logic (see `hospital-study-session`), NOT directly here. This removes the previous direct `visibilitychange` handler on the tick loop.

#### Scenario: Visibility hide pauses session, tick clears

- **GIVEN** active session and tick interval scheduled
- **WHEN** `document.visibilityState` transitions to `'hidden'`
- **THEN** `studySession.state` SHALL transition to `'paused'` (via hospital-study-session)
- **AND** the tick interval SHALL be cleared as a downstream effect

### Requirement: Game counters SHALL split LWW fields and monotonic fields into separate rows

The system SHALL persist game state across TWO rows in dedicated tables to support different cloud sync merge strategies:

1. **`gameCounters.singleton`** (LWW merge — last-write-wins):
   - `revenue: number`
   - `reputation: number`
   - `lastTickAt: number`
   - `tier: HospitalTier`
   - `hasUsedStarterPull: boolean`
   - `currentSessionStartedAt: number | null`
   - `lastSessionEndedAt: number | null`
   - `tutorial: { completedSteps: Record<string, true>, firstVisit: Record<string, true>, firedTips: Record<string, true> }`

2. **`monotonicCounters.singleton`** (MAX merge — strictly non-decreasing):
   - `totalStudyMinutes: number`
   - `fateCardBadLuckPity: { common: number, rare: number, epic: number }`

Each row SHALL be created on first read if missing (auto-seed both rows with default zero values + `tier = '診所'` / `hasUsedStarterPull = false`).

Existing saves (pre-redesign-hospital-economy v6) SHALL be patched by the v6 upgrade hook to:
- Create `monotonicCounters.singleton` with `totalStudyMinutes = 0` and `fateCardBadLuckPity = {common: 0, rare: 0, epic: 0}`
- Add `currentSessionStartedAt = null` / `lastSessionEndedAt = null` / `tutorial = { completedSteps: {}, firstVisit: {}, firedTips: {} }` to existing `gameCounters.singleton` if missing

This split SHALL allow cloud sync (per `add-cloud-sync` capability) to apply different merge strategies per row — `gameCounters` uses standard LWW, `monotonicCounters` uses field-wise max — without requiring per-field merge hook infrastructure in the sync engine.

#### Scenario: Fresh save initializes both rows

- **GIVEN** a new hospital save (no prior rows in either table)
- **WHEN** the app boots and ensureSeed runs
- **THEN** `gameCounters.singleton.tier` SHALL equal `'診所'`
- **AND** `monotonicCounters.singleton.totalStudyMinutes` SHALL equal `0`
- **AND** `monotonicCounters.singleton.fateCardBadLuckPity` SHALL equal `{common: 0, rare: 0, epic: 0}`

#### Scenario: Existing v5 save upgrades to v6 with new monotonic row

- **GIVEN** a v5 save with `gameCounters.singleton = { revenue: 100, reputation: 50, ... }` (no monotonicCounters row)
- **WHEN** the app upgrades to v6
- **THEN** `monotonicCounters.singleton.totalStudyMinutes` SHALL equal `0`
- **AND** `monotonicCounters.singleton.fateCardBadLuckPity` SHALL equal `{common: 0, rare: 0, epic: 0}`
- **AND** `gameCounters.singleton` LWW fields SHALL remain unchanged

#### Scenario: Cloud sync max-merge for monotonic counters

- **GIVEN** local `totalStudyMinutes = 100` and cloud `totalStudyMinutes = 80` (player studied 20 min offline on this device)
- **WHEN** the sync engine pulls
- **THEN** the local value SHALL remain `100` (max(local, cloud))
- **AND** the cloud value SHALL be pushed up to `100` on next push (LWW won't downgrade since this row uses max merge)

#### Scenario: Cloud sync LWW for gameCounters revenue

- **GIVEN** local `gameCounters.singleton.revenue = 5000` (updated 1 min ago) and cloud value `revenue = 8000` (updated 10 seconds ago, fresher)
- **WHEN** the sync engine pulls
- **THEN** the local value SHALL become `8000` (cloud fresher → LWW wins)

## REMOVED Requirements

### Requirement: Tick loop SHALL accumulate revenue + reputation per visible 5-second tick

**Reason**: Replaced by session-active-only tick (see new MODIFIED requirement above). The "always-on" idle accumulation contradicts the "study to progress" design intent of the redesign-hospital-economy change.

**Migration**: Existing saves continue to function — `lastTickAt` field is preserved and reused. The behavioral difference is that ticks no longer fire automatically when the app is open without an active study session. Players who relied on idle accumulation must explicitly start a study session.
