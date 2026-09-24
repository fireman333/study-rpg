> ⚠️ **Requirement 用詞為草稿**：由 agent 起草（2026-09-24 盤點後續第 2 輪），未經 owner 逐字確認。

## ADDED Requirements

### Requirement: Public snapshot rows carry a fixed field list and no account id, sync time, or retired axis

Every row the neurons leaderboard cron writes to a KV snapshot, and every row `GET /leaderboard/neurons/:filter` returns, SHALL carry exactly the following fields and no others: `player_key`, `nickname`, `variant_count`, `total_AP`, `total_study_min`, `total_settles`, `badges_csv`.

In particular, a public snapshot row SHALL NOT carry:

- the account id, under any field name (`user_id` or otherwise) — the player is identified by `player_key` instead, per `public-player-key`'s「Public surfaces identify players by a player key, not the account id」requirement. This field list states what a row carries outside `public-player-key`'s rollout compatibility window; during that window `user_id` MAY additionally appear alongside these fields, per that requirement, not this one
- `updated_at` (when the player's client last pushed) — publishing it on a login-free, 30-minute-refreshable snapshot discloses each nickname's daily activity pattern (same rationale as 二階's `drop-sync-time-from-public-leaderboard`)
- `synapse_strong` or `family_complete` — both already retired from ranking by「Five filter tabs SHALL provide composite ranking plus four single-dimension rankings」and「D1 schema SHALL include a reserved `badges_csv` column for future achievement integration」; this requirement additionally states neither SHALL be published, even though the underlying D1 columns still exist. `GET /leaderboard/neurons/me` still returns `family_complete` to the row's own owner; it does not select or return `synapse_strong` at all — that column has no reader anywhere in the Worker, public or authenticated
- `key_epoch` (the fingerprint of the secret a stored snapshot's `player_key`s were derived under) — internal bookkeeping used to decide whether a stored row needs re-keying on read, never intended to leave the Worker

A column added to the underlying D1 query in the future is published only once it is added to this list — not by virtue of the query selecting it. A listed field absent from a row stored before that field existed SHALL stay absent from the response (the client coalesces absence), never emitted as `null` or as the field key with an `undefined` value.

`GET /leaderboard/neurons/me` is exempt from this requirement: it is JWT-gated, is not a public snapshot, and continues to return the requesting player's own row in full (including fields this requirement excludes from the public snapshot), per `public-player-key`'s「A signed-in player obtains their own key from their authenticated read」requirement.

#### Scenario: The cron writes exactly the listed fields

- **WHEN** the neurons leaderboard cron writes its five KV snapshots
- **THEN** every row in every snapshot SHALL have exactly the keys `player_key`, `nickname`, `variant_count`, `total_AP`, `total_study_min`, `total_settles`, `badges_csv` — no more, no fewer

#### Scenario: The public read serves exactly the listed fields

- **WHEN** `GET /leaderboard/neurons/:filter` is served for any of the five filters, outside `public-player-key`'s rollout compatibility window
- **THEN** every row in the response SHALL have exactly the keys listed above
- **AND** the response SHALL NOT contain `updated_at`, `synapse_strong`, `family_complete`, `user_id`, or `key_epoch` under any field name

#### Scenario: During the rollout compatibility window, the response additionally carries the account id

- **WHEN** `GET /leaderboard/neurons/:filter` is served while `public-player-key`'s rollout compatibility window is open
- **THEN** every row in the response SHALL have exactly the keys listed above, plus `user_id`, per `public-player-key`'s「A rollout compatibility window lets the Worker deploy before the clients」requirement
- **AND** the response SHALL still NOT contain `updated_at`, `synapse_strong`, `family_complete`, or `key_epoch` under any field name

#### Scenario: A snapshot stored before this requirement is served without the excluded fields

- **GIVEN** a KV snapshot written before this requirement, whose rows still carry `synapse_strong` and `updated_at` alongside the fields this requirement lists
- **WHEN** that snapshot is served by `GET /leaderboard/neurons/:filter`
- **THEN** the response SHALL carry only the listed fields, with `synapse_strong` and `updated_at` stripped, without waiting for the next cron refresh

#### Scenario: The key epoch never reaches a public read

- **GIVEN** a stored snapshot payload that carries a top-level `key_epoch` (the secret fingerprint its rows were keyed under)
- **WHEN** that snapshot is served by `GET /leaderboard/neurons/:filter`
- **THEN** the response SHALL NOT contain a `key_epoch` field at any level

#### Scenario: A listed field missing from an old row stays absent, not null

- **GIVEN** a stored snapshot row written before `badges_csv` existed on the schema, so the row has no `badges_csv` key at all
- **WHEN** that row is served
- **THEN** the response row SHALL have no `badges_csv` key — not `badges_csv: null` and not `badges_csv: undefined`

#### Scenario: `GET /leaderboard/neurons/me` still returns the owner's own retired-axis fields

- **WHEN** a signed-in player calls `GET /leaderboard/neurons/me` and has a leaderboard row
- **THEN** the response's `row` SHALL still include fields this requirement excludes from the public snapshot (for example `user_id` and `family_complete`), because `/me` is not a public snapshot read
