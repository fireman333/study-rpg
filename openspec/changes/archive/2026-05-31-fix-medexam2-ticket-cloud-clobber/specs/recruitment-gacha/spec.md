## ADDED Requirements

### Requirement: Daily ticket grant SHALL survive cloud-sync cold-start reconciliation

For an authenticated player, the daily +1 招募券 refresh SHALL NOT be net-lost by the sync engine's cold-start force-pull.

App boot grants the daily ticket locally (`refreshDailyTickets()`) before the engine's cold-start `pullAllNow({ force: true })` reconciles, and the force apply path overwrites the local `tickets` row (including `lastRefreshDay`) with the cloud snapshot. To prevent permanent loss, the system SHALL re-evaluate `refreshDailyTickets()` after every successful pull completes (sync engine `onPullComplete`).

The re-evaluation SHALL be idempotent on `tickets.lastRefreshDay`: it re-grants exactly `min(currentEpochDay − lastRefreshDay, 99 − available)` tickets when the post-pull `lastRefreshDay` is older than the current epoch day, and SHALL no-op (zero grant, no write) otherwise. The re-granted local write SHALL be marked dirty and pushed to cloud via the existing debounced push, so subsequent cold starts read the up-to-date `lastRefreshDay` and do not re-grant.

The App boot `refreshDailyTickets()` call SHALL be retained so anonymous (unauthenticated) players — who never pull — still receive the daily grant, and so authenticated players see the ticket immediately on first render.

#### Scenario: Cold-start force-pull rolls back daily grant, post-pull re-grant restores it

- **GIVEN** an authenticated player whose cloud `hospital_state` blob carries `tickets = { available: 0, lastRefreshDay: D−1 }`
- **AND** local boot `refreshDailyTickets()` has granted the daily +1 → local `tickets = { available: 1, lastRefreshDay: D }` (current epoch day = D)
- **WHEN** the cold-start `pullAllNow({ force: true })` applies the cloud blob and overwrites local `tickets` back to `{ available: 0, lastRefreshDay: D−1 }`
- **AND** the engine's `onPullComplete` fires and re-runs `refreshDailyTickets()`
- **THEN** the re-run SHALL observe `lastRefreshDay = D−1 < D` and re-grant → local `tickets = { available: 1, lastRefreshDay: D }`
- **AND** the re-grant SHALL be marked dirty and pushed to cloud so cloud converges on `lastRefreshDay = D`

#### Scenario: Post-pull re-evaluation is idempotent when already granted today

- **GIVEN** local `tickets.lastRefreshDay` already equals the current epoch day D (granted earlier this session or pulled from cloud already at D)
- **WHEN** `onPullComplete` re-runs `refreshDailyTickets()`
- **THEN** the computed delta SHALL be `≤ 0` and NO ticket SHALL be granted
- **AND** NO write to `tickets` SHALL occur (no spurious dirty marker / push)

#### Scenario: Anonymous player daily grant is unaffected

- **GIVEN** an unauthenticated player (no sync engine running, no pull)
- **WHEN** App boot runs `refreshDailyTickets()` with `lastRefreshDay` older than the current epoch day
- **THEN** the daily +1 SHALL be granted locally and persist (no force-pull to roll it back)
