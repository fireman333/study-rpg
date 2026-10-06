## MODIFIED Requirements

### Requirement: Hourly KV cache refresh SHALL pre-compute all five filter snapshots twice per hour

The leaderboard backend SHALL pre-compute the top-100 ranking for each of the **five** filter tabs **twice per hour** via the Worker scheduled cron trigger dedicated to neurons at minutes `:05` and `:35` — its own cron expression, offset from 二階 `hospital-leaderboard`'s `:00`/`:30`, so that each refresh runs in its own scheduled invocation (see `sync-worker-cpu-budget`). Client read requests SHALL fetch from the KV cache, NOT directly from D1. The system MAY serve a stale snapshot (older than 30 min) if the cron has not yet refreshed, but MUST surface a「上次更新：HH:MM」timestamp in the leaderboard UI.

#### Scenario: 30-min cron pre-computes all five neurons filters

- **WHEN** the neurons scheduled trigger fires at `:05` or `:35` of each hour
- **THEN** the system SHALL run five D1 queries (one per filter) on `leaderboard_neurons` table and write the resulting top-100 row arrays to five KV keys (`leaderboard:neurons:top100:composite | variants | ap | study | settles`), and SHALL log a single line entry for monitoring
- **AND** the system SHALL NOT compute or write a `leaderboard:neurons:top100:synapse` KV key
- **AND** the same invocation SHALL NOT compute any 二階 (`leaderboard:m2:*`) snapshot

#### Scenario: Client read serves KV cache

- **WHEN** a client GETs `/leaderboard/neurons/settles`
- **THEN** the Worker SHALL return the value from `leaderboard:neurons:top100:settles` KV key directly, without querying D1, and include a `last_updated_at` timestamp in the response

#### Scenario: Stale snapshot served on cron failure

- **WHEN** the Worker scheduled cron fails to run for two consecutive scheduled slots
- **THEN** the client SHALL still receive the most recent successful snapshot from KV; the UI SHALL surface the「上次更新：HH:MM」timestamp so the player can detect staleness
