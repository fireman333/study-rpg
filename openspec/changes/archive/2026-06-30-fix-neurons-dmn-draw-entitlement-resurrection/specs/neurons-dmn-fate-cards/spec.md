## MODIFIED Requirements

### Requirement: DMN daily counters SHALL merge across devices via documented monotonic semantics

The synced meta keys backing the daily entitlement model SHALL each declare an explicit cross-device merge strategy so that two devices crossing local-TZ midnight, or simultaneously earning and spending draws, can never silently swallow entitlement nor duplicate-grant draws beyond the per-day cap. The keys covered are:

- `dmnGrantsTotal` — lifetime monotonic count of draw entitlements granted (the new canonical entitlement counter)
- `dmnConsumesTotal` — lifetime monotonic count of draws spent; backed by the existing `dmnLifetimeDrawsConsumed` meta key (the two names refer to the same value)
- `dmnDrawsAvailable` — the **derived** unspent entitlement pool (a display value, NOT an independently merged field)
- `dmnTimeAxisDrawsConsumedToday` — expedition-axis consumed-today counter (legacy name; per the mixed-trigger requirement, the axis is expedition-completion-driven)
- `dmnBehaviorAxisDrawsConsumedToday` — behavior-axis consumed-today counter
- `dmnTimeAxisMinutesAccrued` — display / telemetry running total (legacy name; now stores cumulative expedition clears for the day)
- `dmnLastDailyResetDate` — the local-TZ date string (YYYY-MM-DD) for which the above per-day counters are valid

Merge semantics, by key:

1. `dmnLastDailyResetDate` SHALL merge by lexicographic MAX (a later YYYY-MM-DD always wins). Whichever device first crosses local midnight stamps the new date; the other device's stale date string is overwritten on next sync.
2. `dmnTimeAxisDrawsConsumedToday`, `dmnBehaviorAxisDrawsConsumedToday`, and `dmnTimeAxisMinutesAccrued` SHALL each merge as `(date, count)` pairs gated by `dmnLastDailyResetDate`: when the incoming bundle's `dmnLastDailyResetDate` is strictly greater than local's, the local counter SHALL be reset to 0 before the incoming counter is applied; when the dates match, the merge SHALL take the numeric MAX of local and incoming. This guarantees that a same-day cap can only be tightened (never reopened) and a midnight reset on either device propagates as a one-shot zero, not as a backward race.
3. `dmnGrantsTotal` and `dmnConsumesTotal` SHALL each merge by numeric monotonic MAX of local and incoming, independent of date. `dmnDrawsAvailable` SHALL NOT participate in cross-device merge as an independent value and SHALL NOT be written by a plain LWW or raw-MAX-of-available rule; it SHALL be **re-derived** after every merge as `max(mergedGrants − mergedConsumes, 0)`. The `(dmnGrantsTotal, dmnConsumesTotal)` projection IS the canonical source of truth; `dmnDrawsAvailable` is a derived display value persisted to the `meta` table only so existing UI readers require no change.

**Reader-tolerance seeding.** A bundle (local OR incoming) MAY predate `dmnGrantsTotal` (produced by a client at R2 `SCHEMA_VERSION < 23`). When `dmnGrantsTotal` is absent on a side, that side's grants total SHALL be seeded as `thatSide.dmnDrawsAvailable + thatSide.dmnConsumesTotal` (where `dmnConsumesTotal` falls back to `dmnLifetimeDrawsConsumed`). Treating an absent grants total as 0 is FORBIDDEN — it would derive a negative pool clamped to 0 and wipe the player's unspent draws.

**One-time local migration.** The first time a client at `SCHEMA_VERSION ≥ 23` observes local state lacking `dmnGrantsTotal`, it SHALL seed `dmnConsumesTotal := dmnLifetimeDrawsConsumed` and `dmnGrantsTotal := dmnDrawsAvailable + dmnLifetimeDrawsConsumed`, leaving the derived `dmnDrawsAvailable` numerically unchanged so the player observes no jump.

**Atomicity.** Every local grant SHALL, within a single transaction, increment `dmnGrantsTotal` and re-derive `dmnDrawsAvailable` together with its per-day cap counter. Every local consume SHALL, within a single transaction, increment `dmnConsumesTotal` (`dmnLifetimeDrawsConsumed`) and re-derive `dmnDrawsAvailable` together with the awarded entitlement (card/equipment + inventory). The pull-merge SHALL merge grants, merge consumes, and re-derive `dmnDrawsAvailable` within a single `meta` transaction.

**Accepted limitation.** The scalar-MAX projection has one accepted limitation: two devices that each spend a draw from the same base collapse to a single consume on merge (`MAX`), refunding one draw to the player. This is player-favoring (never an overdraft) and is the deliberate trade-off of NOT maintaining a per-client PN-counter or append-only consume op-log.

The lazy local-TZ midnight reset job SHALL run on next user interaction after `dmnLastDailyResetDate` differs from today and SHALL be idempotent. The reset SHALL NOT alter `dmnGrantsTotal`, `dmnConsumesTotal`, or the derived `dmnDrawsAvailable` (unused draws persist across days per the mixed-trigger requirement) — it SHALL only zero the per-axis consumed-today counters and the cumulative expedition-clears counter, and advance `dmnLastDailyResetDate`.

#### Scenario: Cross-midnight race on two devices does not reopen yesterday's cap

- **GIVEN** device A has `dmnTimeAxisDrawsConsumedToday = 2` for date 2026-06-08 (cap reached) and device B is offline with a stale snapshot showing `dmnTimeAxisDrawsConsumedToday = 0` for date 2026-06-08
- **WHEN** device A crosses local midnight to 2026-06-09 (lazy reset stamps `dmnLastDailyResetDate = 2026-06-09` and zeroes the counter) and pushes the bundle
- **AND** device B comes online and pulls the bundle while still local-TZ 2026-06-08
- **THEN** device B SHALL adopt `dmnLastDailyResetDate = 2026-06-09` and `dmnTimeAxisDrawsConsumedToday = 0`
- **AND** device B SHALL NOT grant a fresh expedition-axis draw on 2026-06-08 against the now-zeroed counter — a subsequent expedition completion on device B for the 2026-06-08 local session SHALL be evaluated as same-day with the newly current date 2026-06-09 cap

#### Scenario: A spent draw stays spent on a single device after a racing pull

- **GIVEN** local state `dmnGrantsTotal = 11`, `dmnConsumesTotal = 0`, derived `dmnDrawsAvailable = 11`, and the last-pushed cloud bundle still carries `dmnGrantsTotal = 11`, `dmnConsumesTotal = 0`
- **WHEN** the player draws one card (local `dmnConsumesTotal = 1`, re-derived available = 10) and a startup/focus pull reads the still-stale cloud bundle before the consume's debounced push lands
- **THEN** the merge SHALL take `dmnConsumesTotal = MAX(1, 0) = 1` and `dmnGrantsTotal = MAX(11, 11) = 11`, re-deriving `dmnDrawsAvailable = max(11 − 1, 0) = 10`
- **AND** the spent draw SHALL NOT be resurrected back to 11

#### Scenario: Pulling a pre-23 bundle without dmnGrantsTotal seeds grants from available + consumes

- **GIVEN** a fresh device with empty DMN meta pulls a `SCHEMA_VERSION 22` bundle carrying `dmnDrawsAvailable = 11`, `dmnLifetimeDrawsConsumed = 0`, and NO `dmnGrantsTotal`
- **WHEN** the pull-merge runs
- **THEN** the incoming grants total SHALL be seeded as `11 + 0 = 11` and merged consumes = `MAX(0, 0) = 0`
- **AND** the derived `dmnDrawsAvailable` SHALL be `max(11 − 0, 0) = 11` — the player's tickets are preserved, never wiped to 0

#### Scenario: A v23 bundle whose consumes advanced beats a stale higher displayed available

- **GIVEN** local is pre-migration showing `dmnDrawsAvailable = 11`, `dmnLifetimeDrawsConsumed = 0`, no `dmnGrantsTotal` (so local seeds grants = `11 + 0 = 11`, consumes = 0), and an incoming v23 bundle carries `dmnGrantsTotal = 11`, `dmnConsumesTotal = 11`
- **WHEN** the pull-merge runs
- **THEN** merged grants = `MAX(11, 11) = 11`, merged consumes = `MAX(0, 11) = 11`
- **AND** the derived `dmnDrawsAvailable` SHALL be `max(11 − 11, 0) = 0` — the other device's full spend propagates instead of the stale local display winning

#### Scenario: One-time local migration preserves the displayed pool

- **GIVEN** local state has `dmnDrawsAvailable = 11`, `dmnLifetimeDrawsConsumed = 4`, and no `dmnGrantsTotal`
- **WHEN** the v23 client runs its one-time local migration
- **THEN** `dmnConsumesTotal` SHALL become 4 and `dmnGrantsTotal` SHALL become `11 + 4 = 15`
- **AND** the derived `dmnDrawsAvailable` SHALL remain 11

#### Scenario: Simultaneous spends on two devices refund one draw (accepted limitation)

- **GIVEN** both devices show derived `dmnDrawsAvailable = 3` after a recent sync, with `dmnGrantsTotal = 5` and `dmnConsumesTotal = 2` on both
- **WHEN** device A draws once (locally `dmnConsumesTotal = 3`, derived = 2) and device B draws once (locally `dmnConsumesTotal = 3`, derived = 2) before either pushes
- **AND** both push and the bundles merge
- **THEN** the merged state SHALL have `dmnConsumesTotal = MAX(3, 3) = 3` and derived `dmnDrawsAvailable = max(5 − 3, 0) = 2`
- **AND** one of the two concurrent spends is refunded to the player — this is the documented scalar-MAX limitation, player-favoring and never an overdraft

#### Scenario: Daily reset date acts as the gate for counter zeroing

- **GIVEN** local state has `dmnLastDailyResetDate = 2026-06-07`, `dmnTimeAxisDrawsConsumedToday = 1`, `dmnGrantsTotal = 9`, `dmnConsumesTotal = 6`
- **WHEN** the user opens the app on local-TZ 2026-06-08 and any interaction triggers the lazy reset
- **THEN** `dmnLastDailyResetDate` SHALL become 2026-06-08
- **AND** `dmnTimeAxisDrawsConsumedToday` SHALL become 0
- **AND** `dmnBehaviorAxisDrawsConsumedToday` SHALL become 0
- **AND** `dmnTimeAxisMinutesAccrued` SHALL become 0
- **AND** `dmnGrantsTotal`, `dmnConsumesTotal`, and the derived `dmnDrawsAvailable` SHALL be unchanged
