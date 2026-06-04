## MODIFIED Requirements

### Requirement: Five filter tabs SHALL provide composite ranking plus four single-dimension rankings

The leaderboard UI SHALL provide **five** filter tabs that determine the ranking criterion. The default tab SHALL be「綜合排名」. Switching tabs SHALL update the displayed ranking without re-querying if the data is already cached client-side for the current half-hour.

| Tab order | Tab | Sort key |
|---|---|---|
| 1 | 綜合排名 | `variant_count DESC, total_study_min DESC` |
| 2 | 變體收集排名 | `variant_count DESC` |
| 3 | AP 排名 | `total_AP DESC` |
| 4 | 累積唸書時間排名 | `total_study_min DESC` |
| 5 | 探索進度排名 | `total_settles DESC` |

The「Synapse 強連結排名」axis (formerly tab 4, sorting by `synapse_strong DESC`) SHALL be removed — it was a weak competitive axis (a small integer that can decay) with no gameplay stake, and is dropped without replacement as part of demoting the synapse/connectome surface ahead of a later load-bearing redesign. The `composite` (綜合排名) ranking SHALL NOT weight `synapse_strong`; if the prior composite formula included a synapse term, it SHALL be recomputed from the remaining signals (`variant_count`, `total_study_min`).

The「探索進度排名」tab ranks players by `total_settles` — the cumulative count of maze settles across all four maze regions (each settle = one variant pull; the maze is the only pull path post-`promote-maze-to-home`). This axis reflects the central new progression that `variant_count` only partially proxies (dupe-fusion means duplicate pulls do not raise the distinct `variant_count`).

The `total_AP` axis (「AP 排名」) SHALL remain unchanged — it still maps to the visible per-family AP number on the FamilyPicker card. The `family_complete` field SHALL NOT participate in any ranking (the open-collection范式 retires the family-completion concept). `variant_count` remains the distinct-collection signal.

#### Scenario: Default tab is 綜合排名

- **WHEN** the player opens the leaderboard tab for the first time within a session
- **THEN** the「綜合排名」tab SHALL be selected by default and its rows displayed first

#### Scenario: Switching filter tabs updates the displayed ranking

- **WHEN** the player clicks the「AP 排名」tab
- **THEN** the displayed top-100 list SHALL re-order by `total_AP DESC` from the same half-hourly snapshot, and the player's own my-rank chip SHALL update to show their AP-only rank

#### Scenario: 探索進度 tab ranks by total settles

- **WHEN** the player clicks the「探索進度排名」tab
- **THEN** the displayed top-100 list SHALL re-order by `total_settles DESC` from the same half-hourly snapshot, and the player's my-rank chip SHALL update to show their settles-only rank

#### Scenario: Composite ranking tie-breaker order

- **WHEN** two players have identical `variant_count` in the 綜合排名 tab
- **THEN** the player with higher `total_study_min` SHALL rank above; if both tie, ordering MAY be arbitrary but MUST be stable within a single snapshot

#### Scenario: No synapse ranking tab is presented

- **WHEN** the player opens the leaderboard
- **THEN** the tab strip SHALL render exactly five tabs and SHALL NOT include a「Synapse 強連結排名」tab
- **AND** no client request SHALL be issued for a `synapse` filter snapshot

### Requirement: Hourly KV cache refresh SHALL pre-compute all five filter snapshots twice per hour

The leaderboard backend SHALL pre-compute the top-100 ranking for each of the **five** filter tabs **twice per hour** via the existing Worker scheduled cron trigger at minutes `:00` and `:30` (shared with 二階 `hospital-leaderboard` schedule, no additional cron expression). Client read requests SHALL fetch from the KV cache, NOT directly from D1. The system MAY serve a stale snapshot (older than 30 min) if the cron has not yet refreshed, but MUST surface a「上次更新：HH:MM」timestamp in the leaderboard UI.

#### Scenario: 30-min cron pre-computes all five neurons filters

- **WHEN** the Worker scheduled trigger fires at `:00` or `:30` of each hour
- **THEN** the system SHALL run five D1 queries (one per filter) on `leaderboard_neurons` table and write the resulting top-100 row arrays to five KV keys (`leaderboard:neurons:top100:composite | variants | ap | study | settles`), and SHALL log a single line entry for monitoring
- **AND** the system SHALL NOT compute or write a `leaderboard:neurons:top100:synapse` KV key

#### Scenario: Client read serves KV cache

- **WHEN** a client GETs `/leaderboard/neurons/settles`
- **THEN** the Worker SHALL return the value from `leaderboard:neurons:top100:settles` KV key directly, without querying D1, and include a `last_updated_at` timestamp in the response

#### Scenario: Stale snapshot served on cron failure

- **WHEN** the Worker scheduled cron fails to run for two consecutive scheduled slots
- **THEN** the client SHALL still receive the most recent successful snapshot from KV; the UI SHALL surface the「上次更新：HH:MM」timestamp so the player can detect staleness
