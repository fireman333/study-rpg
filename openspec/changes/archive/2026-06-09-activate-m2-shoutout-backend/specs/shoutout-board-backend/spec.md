## ADDED Requirements

### Requirement: m2 app activated on the shared backend

The shared sync Worker SHALL activate the 二階 (`m2`) app on the shoutout backend in
addition to `neurons`, using a per-app `shoutouts_m2` table, the `leaderboard_m2`
nickname / Top-100 join, the `leaderboard:m2:top100:composite` KV snapshot for the
top-N halo, and the `doctor` avatar type. The shared app-scoped `shoutout_audit` /
`shoutout_reports` / `shoutout_bans` tables SHALL be reused (scoped by `app_id`), not
duplicated. Activation SHALL be additive — no existing app's behavior or tables change.

#### Scenario: m2 board routes to its own table

- **WHEN** a request hits `/shoutouts/m2`
- **THEN** it reads/writes only `shoutouts_m2`, joins the display name from `leaderboard_m2`, and never touches another app's message table

#### Scenario: m2 avatar enum is doctor

- **WHEN** an m2 write supplies an avatar payload
- **THEN** `avatarType` SHALL be validated as `doctor`, and any other `avatarType` for m2 SHALL be rejected

#### Scenario: m2 top-N halo from the m2 composite snapshot

- **WHEN** the m2 board list is assembled
- **THEN** the top-N halo flag SHALL be derived from the `leaderboard:m2:top100:composite` KV snapshot (the m2 leaderboard's composite filter), not from any other app's snapshot

#### Scenario: m2 activation is additive

- **WHEN** the m2 migration is applied and the Worker is redeployed
- **THEN** only `shoutouts_m2` (and its visible index) is created, the shared audit / reports / bans tables are reused, and the `neurons` shoutout, leaderboard, cloud-sync, and presign endpoints respond exactly as before
