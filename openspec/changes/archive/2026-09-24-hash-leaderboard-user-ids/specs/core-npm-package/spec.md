## ADDED Requirements

### Requirement: Leaderboard row and shoutout message carry an opaque player key

The published package SHALL describe the public identity fields the shared Worker sends since change `hash-leaderboard-user-ids`: `LeaderboardRow.player_key: string` and `ShoutoutMessage.playerKey: string`, documented as opaque per-app keys that a consumer compares against the key returned by its own authenticated `GET /leaderboard/me`. `LeaderboardRow.user_id` SHALL be optional and documented as deprecated (present only during the Worker's rollout compatibility window), and `LeaderboardRow.updated_at` SHALL be optional (the public snapshot no longer sends it). Because making read fields optional and adding required fields is breaking for existing consumers, the release SHALL bump the MINOR version under the pre-1.0 policy (`0.7.0`) with a CHANGELOG entry naming each field.

#### Scenario: Reading the account id off a public row is visibly deprecated

- **WHEN** a consumer reads `LeaderboardRow.user_id`
- **THEN** the type SHALL be `string | undefined` and the field SHALL carry a deprecation note pointing to `player_key`

#### Scenario: The version signals the break

- **WHEN** the package containing these fields is published
- **THEN** its version SHALL be `0.7.0` (a MINOR bump from `0.6.x`) and the CHANGELOG SHALL list `player_key`, `playerKey`, and the two fields made optional
