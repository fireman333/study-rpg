## MODIFIED Requirements

### Requirement: Recruitment ticket SHALL be the sole gating resource for rolls

The system SHALL maintain a `tickets.available` integer in IndexedDB. Each successful roll SHALL consume exactly 1 ticket. A roll SHALL fail and consume zero tickets if `tickets.available < 1` or if the target banner is locked.

The ticket counter SHALL initialize to `10` on new save creation. The ticket counter SHALL be capped at `99` (additional grant attempts SHALL be silently clamped).

The system SHALL grant +1 ticket per UTC-day-equivalent elapsed since `tickets.lastRefreshDay`. On app boot, the system SHALL compute `Math.floor(Date.now() / 86400000)` as the current day, compare to `lastRefreshDay`, and grant `min(daysDelta, 99 - available)` tickets, then update `lastRefreshDay` to the current day.

**UI affordance sub-clause (added by `clarify-daily-ticket-ux` 2026-05-19):**

The HomePage `app-header` ticket-counter element SHALL display the next-refresh time inline with the `🎟️ N / 99` figure so players can verify the daily-refresh mechanic is running. The format SHALL be `🎟️ N / 99 · <prefix> 08:00 +1` where `<prefix>` is `今日` if the current Taiwan-local time is before 08:00 OR `明日` if at-or-after 08:00. When `available === 99` (cap reached) the suffix SHALL read `· 已滿` instead of the countdown, because the daily refresh would silently clamp to 0 grant. The element SHALL carry a `title` attribute spelling out the full mechanic (`每日台灣早上 08:00 自動發放 +1 張免費招募券，持有上限 99 張`) for hover / long-press discovery.

The display logic SHALL reference Taiwan local time (`Asia/Taipei`, UTC+8) regardless of the user's actual browser timezone — the mechanic itself fires at UTC midnight which equals Taiwan 08:00, and current dogfood audience is 100% Taiwan-based. A future i18n pass MAY revisit this if/when international users arrive.

#### Scenario: Successful roll consumes one ticket

- **GIVEN** `tickets.available = 5` and target banner unlocked
- **WHEN** the player completes a roll
- **THEN** `tickets.available` SHALL be `4`
- **AND** a doctor SHALL be added to the roster

#### Scenario: Roll blocked when no tickets

- **GIVEN** `tickets.available = 0` and target banner unlocked
- **WHEN** the player attempts a roll
- **THEN** the roll SHALL be rejected
- **AND** the UI SHALL display a message indicating no tickets available
- **AND** `tickets.available` SHALL remain `0`
- **AND** no doctor SHALL be added

#### Scenario: New save initializes with 10 tickets

- **GIVEN** a new save in `apps/medexam2-hospital-tw`
- **WHEN** the tickets table is first read
- **THEN** `tickets.available` SHALL equal `10`
- **AND** `tickets.lastRefreshDay` SHALL equal `Math.floor(Date.now() / 86400000)`

#### Scenario: Daily refresh grants one ticket per elapsed day

- **GIVEN** `tickets.available = 7` and `tickets.lastRefreshDay` represents 3 days ago
- **WHEN** the app boots
- **THEN** `tickets.available` SHALL be `10`
- **AND** `tickets.lastRefreshDay` SHALL equal the current day

#### Scenario: Ticket grant clamps at cap

- **GIVEN** `tickets.available = 97` and 10 days have elapsed since `lastRefreshDay`
- **WHEN** the app boots
- **THEN** `tickets.available` SHALL equal `99` (clamped from 107)

#### Scenario: Ticket counter inline countdown shows before 08:00 Taiwan local

- **GIVEN** the current Taiwan-local time is 06:30 AND `tickets.available = 12`
- **WHEN** the player views the HomePage header
- **THEN** the `.ticket-counter` element SHALL display `🎟️ 12 / 99 · 今日 08:00 +1`
- **AND** the element SHALL carry a `title` attribute reading `每日台灣早上 08:00 自動發放 +1 張免費招募券，持有上限 99 張`

#### Scenario: Ticket counter inline countdown shows after 08:00 Taiwan local

- **GIVEN** the current Taiwan-local time is 14:00 AND `tickets.available = 12`
- **WHEN** the player views the HomePage header
- **THEN** the `.ticket-counter` element SHALL display `🎟️ 12 / 99 · 明日 08:00 +1`

#### Scenario: Ticket counter shows cap suffix when at 99

- **GIVEN** `tickets.available = 99`
- **WHEN** the player views the HomePage header
- **THEN** the `.ticket-counter` element SHALL display `🎟️ 99 / 99 · 已滿`
- **AND** the countdown suffix SHALL NOT appear (since the cap would clamp the grant to zero anyway)
